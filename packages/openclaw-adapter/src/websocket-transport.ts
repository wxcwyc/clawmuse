import type {
  OpenClawChatPayload,
  OpenClawGatewayEventEnvelope,
  OpenClawGatewayRequestMap,
  OpenClawGatewayResponseMap,
  OpenClawGatewayTransport,
  OpenClawGatewayTransportLifecycle,
} from './types'

interface WebSocketMessageLike {
  data?: unknown
}

interface WebSocketCloseLike {
  code?: number
  reason?: string
}

interface WebSocketLike {
  readyState: number
  addEventListener(type: string, listener: (event: unknown) => void): void
  removeEventListener?(type: string, listener: (event: unknown) => void): void
  send(data: string): void
  close(code?: number, reason?: string): void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type TransportProtocol = 'rpc' | 'airi'

interface AiriRuntimeState {
  runId: string
  seq: number
}

interface DeviceIdentityRecord {
  version: 1
  deviceId: string
  publicKey: string
  privateKeyJwk: JsonWebKey
}

interface DeviceIdentityMaterial {
  deviceId: string
  publicKey: string
  privateKey: CryptoKey
}

const ALLOWED_GATEWAY_CLIENT_IDS = new Set([
  'webchat-ui',
  'openclaw-control-ui',
  'openclaw-tui',
  'webchat',
  'cli',
  'gateway-client',
  'openclaw-macos',
  'openclaw-ios',
  'openclaw-android',
  'node-host',
  'test',
  'fingerprint',
  'openclaw-probe',
])

const ALLOWED_GATEWAY_CLIENT_MODES = new Set([
  'webchat',
  'cli',
  'ui',
  'backend',
  'node',
  'probe',
  'test',
])

const DEVICE_IDENTITY_STORAGE_KEY = 'clawmuse.openclaw.deviceIdentity.v1'
let memoryDeviceIdentityRecord: DeviceIdentityRecord | null = null

export interface OpenClawGatewayWebSocketTransportOptions {
  url: string
  token?: string
  password?: string
  protocolVersion?: number
  client?: {
    id?: string
    displayName?: string
    version?: string
    platform?: string
    mode?: string
    instanceId?: string
  }
  makeWebSocket?: (url: string) => WebSocketLike
}

function createDeferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

function createRequestId(): string {
  return crypto.randomUUID()
}

function resolveGatewayClientId(raw: string | undefined): string {
  const normalized = raw?.trim().toLowerCase()
  if (normalized && ALLOWED_GATEWAY_CLIENT_IDS.has(normalized)) {
    return normalized
  }
  return 'openclaw-control-ui'
}

function resolveGatewayClientMode(raw: string | undefined): string {
  const normalized = raw?.trim().toLowerCase()
  if (normalized && ALLOWED_GATEWAY_CLIENT_MODES.has(normalized)) {
    return normalized
  }
  return 'ui'
}

function getSubtleCrypto(): SubtleCrypto | null {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    return null
  }
  return globalThis.crypto.subtle
}

function getTextEncoder(): TextEncoder {
  return new TextEncoder()
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as typeof globalThis & {
    Buffer?: {
      from(input: Uint8Array): { toString(encoding: 'base64'): string }
    }
  }).Buffer
  if (maybeBuffer) {
    return maybeBuffer
      .from(bytes)
      .toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '')
  }

  let binary = ''
  for (const value of bytes) {
    binary += String.fromCharCode(value)
  }

  const encoded = btoa(binary)
  return encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function hexOfBytes(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

function getStorageRecord(): DeviceIdentityRecord | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) {
      return memoryDeviceIdentityRecord
    }

    const raw = storage.getItem(DEVICE_IDENTITY_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<DeviceIdentityRecord>
    if (
      parsed.version !== 1
      || typeof parsed.deviceId !== 'string'
      || typeof parsed.publicKey !== 'string'
      || !parsed.privateKeyJwk
      || typeof parsed.privateKeyJwk !== 'object'
    ) {
      return null
    }

    return {
      version: 1,
      deviceId: parsed.deviceId,
      publicKey: parsed.publicKey,
      privateKeyJwk: parsed.privateKeyJwk,
    }
  }
  catch {
    return memoryDeviceIdentityRecord
  }
}

function setStorageRecord(record: DeviceIdentityRecord) {
  memoryDeviceIdentityRecord = record

  try {
    const storage = globalThis.localStorage
    if (!storage) {
      return
    }
    storage.setItem(DEVICE_IDENTITY_STORAGE_KEY, JSON.stringify(record))
  }
  catch {
    // ignore persistence failures and keep in-memory fallback
  }
}

async function importPrivateKey(subtle: SubtleCrypto, jwk: JsonWebKey): Promise<CryptoKey | null> {
  try {
    return await subtle.importKey(
      'jwk',
      jwk,
      'Ed25519',
      false,
      ['sign'],
    )
  }
  catch {
    return null
  }
}

async function generateDeviceIdentity(subtle: SubtleCrypto): Promise<DeviceIdentityMaterial | null> {
  try {
    const generated = await subtle.generateKey(
      'Ed25519',
      true,
      ['sign', 'verify'],
    ) as CryptoKeyPair

    const publicKeyRaw = await subtle.exportKey('raw', generated.publicKey)
    const privateKeyJwk = await subtle.exportKey('jwk', generated.privateKey)
    const digest = await subtle.digest('SHA-256', publicKeyRaw)

    const publicKey = bytesToBase64Url(new Uint8Array(publicKeyRaw))
    const deviceId = hexOfBytes(new Uint8Array(digest))

    const record: DeviceIdentityRecord = {
      version: 1,
      deviceId,
      publicKey,
      privateKeyJwk,
    }
    setStorageRecord(record)

    return {
      deviceId,
      publicKey,
      privateKey: generated.privateKey,
    }
  }
  catch {
    return null
  }
}

async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentityMaterial | null> {
  const subtle = getSubtleCrypto()
  if (!subtle) {
    return null
  }

  const stored = getStorageRecord()
  if (stored) {
    const imported = await importPrivateKey(subtle, stored.privateKeyJwk)
    if (imported) {
      return {
        deviceId: stored.deviceId,
        publicKey: stored.publicKey,
        privateKey: imported,
      }
    }
  }

  return await generateDeviceIdentity(subtle)
}

function stringifyGatewayError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown error'
  }

  const candidate = error as {
    code?: unknown
    message?: unknown
    details?: unknown
  }

  const parts: string[] = []
  if (typeof candidate.code === 'string' && candidate.code.trim().length > 0) {
    parts.push(candidate.code.trim())
  }
  if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
    parts.push(candidate.message.trim())
  }

  if (
    candidate.details
    && typeof candidate.details === 'object'
    && !Array.isArray(candidate.details)
  ) {
    const details = candidate.details as {
      code?: unknown
      recommendedNextStep?: unknown
      requestId?: unknown
      reason?: unknown
    }
    if (typeof details.code === 'string' && details.code.trim().length > 0) {
      parts.push(`details.code=${details.code.trim()}`)
    }
    if (typeof details.requestId === 'string' && details.requestId.trim().length > 0) {
      parts.push(`requestId=${details.requestId.trim()}`)
    }
    if (typeof details.reason === 'string' && details.reason.trim().length > 0) {
      parts.push(`reason=${details.reason.trim()}`)
    }
    if (typeof details.recommendedNextStep === 'string' && details.recommendedNextStep.trim().length > 0) {
      parts.push(`next=${details.recommendedNextStep.trim()}`)
    }
  }

  if (parts.length === 0) {
    return 'unknown error'
  }

  return parts.join(': ')
}

function unwrapSuperJsonEnvelope(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const candidate = payload as { json?: unknown }
  if (candidate.json && typeof candidate.json === 'object') {
    return candidate.json
  }

  return payload
}

function extractMessageData(event: unknown): string | null {
  if (typeof event === 'string') {
    return event
  }

  if (event && typeof event === 'object' && 'data' in event) {
    const candidate = (event as WebSocketMessageLike).data
    return typeof candidate === 'string' ? candidate : null
  }

  return null
}

function extractCloseReason(event: unknown): string {
  if (event && typeof event === 'object') {
    const candidate = event as WebSocketCloseLike
    const code = typeof candidate.code === 'number' ? candidate.code : 'unknown'
    const reason = typeof candidate.reason === 'string' ? candidate.reason : 'closed'
    return `gateway closed (${code}): ${reason}`
  }

  return 'gateway closed'
}

function extractAiriSessionKey(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'main'
  }

  const candidate = payload as {
    overrides?: {
      sessionId?: unknown
    }
  }

  if (candidate.overrides && typeof candidate.overrides.sessionId === 'string' && candidate.overrides.sessionId.trim().length > 0) {
    return candidate.overrides.sessionId.trim()
  }

  return 'main'
}

function extractAiriAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const candidate = payload as {
    message?: unknown
  }
  const message = candidate.message

  if (typeof message === 'string') {
    return message
  }

  if (!message || typeof message !== 'object') {
    return ''
  }

  const typedMessage = message as {
    content?: unknown
    slices?: unknown
  }

  if (typeof typedMessage.content === 'string') {
    return typedMessage.content
  }

  if (Array.isArray(typedMessage.content)) {
    return typedMessage.content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object') {
          const textPart = part as { type?: unknown, text?: unknown }
          if (textPart.type === 'text' && typeof textPart.text === 'string') {
            return textPart.text
          }
        }

        return ''
      })
      .join('')
  }

  if (Array.isArray(typedMessage.slices)) {
    return typedMessage.slices
      .map((slice) => {
        if (!slice || typeof slice !== 'object') {
          return ''
        }

        const textSlice = slice as { type?: unknown, text?: unknown }
        if (textSlice.type === 'text' && typeof textSlice.text === 'string') {
          return textSlice.text
        }

        return ''
      })
      .join('')
  }

  return ''
}

export class OpenClawGatewayWebSocketTransport
  implements OpenClawGatewayTransport, OpenClawGatewayTransportLifecycle {
  private readonly listeners = new Set<(event: OpenClawGatewayEventEnvelope) => void>()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly makeWebSocket: (url: string) => WebSocketLike
  private readonly airiRuntimeBySession = new Map<string, AiriRuntimeState>()

  private socket: WebSocketLike | null = null
  private ready = false
  private readyDeferred = createDeferred()
  private connectRequestId: string | null = null
  private protocol: TransportProtocol | null = null
  private airiAnnounced = false
  private airiHeartbeatTimer: ReturnType<typeof setInterval> | null = null
  private airiAuthProbeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: OpenClawGatewayWebSocketTransportOptions) {
    this.makeWebSocket = options.makeWebSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike)
  }

  start(): void {
    if (this.socket) {
      return
    }

    this.ready = false
    this.readyDeferred = createDeferred()
    this.connectRequestId = null
    this.protocol = null
    this.airiAnnounced = false
    this.airiRuntimeBySession.clear()
    this.clearAiriHeartbeatTimer()
    this.clearAiriAuthProbeTimer()

    const socket = this.makeWebSocket(this.options.url)
    this.socket = socket

    socket.addEventListener('open', () => this.handleOpen())
    socket.addEventListener('message', event => this.handleMessage(event))
    socket.addEventListener('close', event => this.handleClose(event))
    socket.addEventListener('error', event => this.handleError(event))
  }

  stop(): void {
    const socket = this.socket
    this.socket = null
    this.ready = false
    this.protocol = null
    this.airiAnnounced = false
    this.airiRuntimeBySession.clear()
    this.clearAiriHeartbeatTimer()
    this.clearAiriAuthProbeTimer()

    if (socket) {
      socket.close()
    }

    this.flushPendingErrors(new Error('gateway transport stopped'))
  }

  waitForReady(): Promise<void> {
    return this.readyDeferred.promise
  }

  onEvent(listener: (event: OpenClawGatewayEventEnvelope) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async request<TMethod extends keyof OpenClawGatewayRequestMap>(
    method: TMethod,
    payload: OpenClawGatewayRequestMap[TMethod],
  ): Promise<OpenClawGatewayResponseMap[TMethod]> {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error('gateway not connected')
    }

    if (!this.ready) {
      throw new Error('gateway not ready')
    }

    if (this.protocol === 'airi') {
      return await this.sendAiriRequest(method, payload)
    }

    return await this.sendRequest(method, payload)
  }

  private async sendRequest<T = unknown>(method: string, params: unknown): Promise<T> {
    const socket = this.socket
    if (!socket || socket.readyState !== 1) {
      throw new Error('gateway not connected')
    }

    const id = createRequestId()
    socket.send(JSON.stringify({
      type: 'req',
      id,
      method,
      params,
    }))

    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
    })
  }

  private async sendAiriRequest<TMethod extends keyof OpenClawGatewayRequestMap>(
    method: TMethod,
    payload: OpenClawGatewayRequestMap[TMethod],
  ): Promise<OpenClawGatewayResponseMap[TMethod]> {
    if (method !== 'chat.send') {
      throw new Error(`gateway request method is not supported in AIRI mode: ${String(method)}`)
    }

    const chatPayload = payload as OpenClawGatewayRequestMap['chat.send']
    const sessionKey = chatPayload.sessionKey.trim() || 'main'
    const runId = chatPayload.idempotencyKey?.trim() || createRequestId()

    this.airiRuntimeBySession.set(sessionKey, {
      runId,
      seq: 0,
    })

    this.sendAiriEvent('input:text', {
      text: chatPayload.message,
      overrides: {
        sessionId: sessionKey,
      },
    })

    return {
      ok: true,
      runId,
      status: 'accepted',
    } as OpenClawGatewayResponseMap[TMethod]
  }

  private handleOpen() {
    this.clearAiriAuthProbeTimer()
    this.airiAuthProbeTimer = setTimeout(() => {
      if (this.protocol || this.ready) {
        return
      }

      const token = this.options.token?.trim() || this.options.password?.trim()
      if (!token) {
        return
      }

      this.sendAiriEvent('module:authenticate', {
        token,
      })
    }, 500)
  }

  private handleMessage(event: unknown) {
    const raw = extractMessageData(event)
    if (!raw) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    parsed = unwrapSuperJsonEnvelope(parsed)
    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const rpcFrame = parsed as {
      type?: unknown
      id?: unknown
      ok?: unknown
      payload?: unknown
      error?: unknown
      event?: unknown
      seq?: unknown
    }

    if (rpcFrame.type === 'evt' || rpcFrame.type === 'event') {
      this.protocol = 'rpc'
      this.clearAiriAuthProbeTimer()
      const eventName = typeof rpcFrame.event === 'string' ? rpcFrame.event : null
      if (!eventName) {
        return
      }

      if (eventName === 'connect.challenge') {
        const nonce = this.extractNonce(rpcFrame.payload)
        if (!nonce) {
          this.readyDeferred.reject(new Error('gateway connect challenge missing nonce'))
          return
        }

        void this.sendConnect(nonce)
        return
      }

      const envelope: OpenClawGatewayEventEnvelope = {
        event: eventName,
        payload: rpcFrame.payload,
        seq: typeof rpcFrame.seq === 'number' ? rpcFrame.seq : undefined,
      }
      this.emitEnvelope(envelope)
      return
    }

    if (rpcFrame.type === 'res' && typeof rpcFrame.id === 'string') {
      this.protocol = 'rpc'
      this.clearAiriAuthProbeTimer()
      const pending = this.pending.get(rpcFrame.id)
      if (!pending) {
        return
      }

      this.pending.delete(rpcFrame.id)

      if (rpcFrame.ok) {
        if (rpcFrame.id === this.connectRequestId) {
          this.ready = true
          this.readyDeferred.resolve()
        }
        pending.resolve(rpcFrame.payload)
        return
      }

      const message = stringifyGatewayError(rpcFrame.error)
      const error = new Error(message)
      if (rpcFrame.id === this.connectRequestId) {
        this.readyDeferred.reject(error)
      }
      pending.reject(error)
      return
    }

    const airiFrame = parsed as {
      type?: unknown
      data?: unknown
      metadata?: unknown
    }

    if (typeof airiFrame.type === 'string') {
      this.handleAiriFrame({
        type: airiFrame.type,
        data: airiFrame.data,
        metadata: airiFrame.metadata,
      })
    }
  }

  private handleAiriFrame(frame: {
    type: string
    data?: unknown
    metadata?: unknown
  }) {
    if (!this.protocol) {
      this.protocol = 'airi'
    }
    this.clearAiriAuthProbeTimer()

    if (frame.type === 'module:authenticated') {
      const authenticated = this.extractAiriAuthenticated(frame.data)
      if (!authenticated) {
        return
      }

      this.ready = true
      this.readyDeferred.resolve()
      this.sendAiriModuleAnnounce()
      this.startAiriHeartbeat()
      return
    }

    if (frame.type === 'transport:connection:heartbeat') {
      const heartbeatKind = this.extractAiriHeartbeatKind(frame.data)
      if (heartbeatKind === 'ping') {
        this.sendAiriHeartbeat('pong')
      }
      return
    }

    if (frame.type === 'output:gen-ai:chat:message' || frame.type === 'output:gen-ai:chat:complete') {
      const payload = this.mapAiriOutputToChatPayload(frame.type, frame.data, frame.metadata)
      if (!payload) {
        return
      }

      this.emitEnvelope({
        event: 'chat',
        payload,
      })
      return
    }

    this.emitEnvelope({
      event: frame.type,
      payload: frame.data,
    })
  }

  private emitEnvelope(envelope: OpenClawGatewayEventEnvelope) {
    for (const listener of this.listeners) {
      listener(envelope)
    }
  }

  private createAiriIdentity() {
    return {
      kind: 'plugin',
      plugin: {
        id: this.options.client?.id ?? 'clawmuse-desktop-shell',
        version: this.options.client?.version ?? '0.1.0-dev',
      },
      id: this.options.client?.instanceId ?? `clawmuse-${createRequestId()}`,
    } as const
  }

  private sendAiriEvent(type: string, data: unknown) {
    const socket = this.socket
    if (!socket || socket.readyState !== 1) {
      return
    }

    socket.send(JSON.stringify({
      type,
      data,
      metadata: {
        source: this.createAiriIdentity(),
        event: {
          id: createRequestId(),
        },
      },
    }))
  }

  private sendAiriModuleAnnounce() {
    if (this.airiAnnounced) {
      return
    }

    this.airiAnnounced = true
    this.sendAiriEvent('module:announce', {
      name: this.options.client?.displayName ?? 'clawmuse-desktop-shell',
      identity: this.createAiriIdentity(),
      possibleEvents: [
        'error',
        'input:text',
        'output:gen-ai:chat:message',
        'output:gen-ai:chat:complete',
        'transport:connection:heartbeat',
      ],
    })
  }

  private startAiriHeartbeat() {
    this.clearAiriHeartbeatTimer()
    this.airiHeartbeatTimer = setInterval(() => {
      this.sendAiriHeartbeat('ping')
    }, 30_000)
  }

  private sendAiriHeartbeat(kind: 'ping' | 'pong') {
    this.sendAiriEvent('transport:connection:heartbeat', {
      kind,
      message: kind,
      at: Date.now(),
    })
  }

  private extractAiriAuthenticated(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
      return false
    }

    const candidate = payload as { authenticated?: unknown }
    return candidate.authenticated === true
  }

  private extractAiriHeartbeatKind(payload: unknown): 'ping' | 'pong' | null {
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const candidate = payload as { kind?: unknown }
    if (candidate.kind === 'ping' || candidate.kind === 'pong') {
      return candidate.kind
    }

    return null
  }

  private mapAiriOutputToChatPayload(
    eventType: 'output:gen-ai:chat:message' | 'output:gen-ai:chat:complete',
    data: unknown,
    metadata: unknown,
  ): OpenClawChatPayload | null {
    const sessionKey = extractAiriSessionKey(data)
    const runtime = this.resolveAiriRuntimeState(sessionKey, metadata)
    runtime.seq += 1

    const text = extractAiriAssistantText(data)
    const payload: OpenClawChatPayload = {
      runId: runtime.runId,
      sessionKey,
      seq: runtime.seq,
      state: eventType === 'output:gen-ai:chat:message' ? 'delta' : 'final',
      message: text
        ? {
            role: 'assistant',
            content: [{
              type: 'text',
              text,
            }],
          }
        : undefined,
    }

    if (payload.state === 'final') {
      this.airiRuntimeBySession.delete(sessionKey)
    }

    if (payload.state === 'delta' && !text) {
      return null
    }

    return payload
  }

  private resolveAiriRuntimeState(sessionKey: string, metadata: unknown): AiriRuntimeState {
    const existing = this.airiRuntimeBySession.get(sessionKey)
    if (existing) {
      return existing
    }

    const state: AiriRuntimeState = {
      runId: this.resolveAiriRunIdFromMetadata(metadata) ?? createRequestId(),
      seq: 0,
    }
    this.airiRuntimeBySession.set(sessionKey, state)
    return state
  }

  private resolveAiriRunIdFromMetadata(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object') {
      return null
    }

    const candidate = metadata as {
      event?: {
        id?: unknown
        parentId?: unknown
      }
    }

    if (candidate.event && typeof candidate.event.parentId === 'string' && candidate.event.parentId.trim().length > 0) {
      return candidate.event.parentId.trim()
    }

    if (candidate.event && typeof candidate.event.id === 'string' && candidate.event.id.trim().length > 0) {
      return candidate.event.id.trim()
    }

    return null
  }

  private async sendConnect(nonce: string) {
    const requestId = createRequestId()
    this.connectRequestId = requestId

    const socket = this.socket
    if (!socket || socket.readyState !== 1) {
      throw new Error('gateway not connected')
    }

    const role = 'operator'
    const scopes = ['operator.read', 'operator.write']
    const clientId = resolveGatewayClientId(this.options.client?.id)
    const clientMode = resolveGatewayClientMode(this.options.client?.mode)
    const platform = this.options.client?.platform ?? 'node'
    const signedAt = Date.now()

    const device = await (async () => {
      const identity = await loadOrCreateDeviceIdentity()
      if (!identity) {
        return undefined
      }

      const subtle = getSubtleCrypto()
      if (!subtle) {
        return undefined
      }

      try {
        const signatureToken = this.options.token?.trim() || ''
        const payload = [
          'v3',
          identity.deviceId,
          clientId,
          clientMode,
          role,
          scopes.join(','),
          String(signedAt),
          signatureToken,
          nonce,
          platform,
          '',
        ].join('|')

        const signatureRaw = await subtle.sign(
          'Ed25519',
          identity.privateKey,
          getTextEncoder().encode(payload),
        )

        return {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature: bytesToBase64Url(new Uint8Array(signatureRaw)),
          signedAt,
          nonce,
        }
      }
      catch {
        return undefined
      }
    })()

    socket.send(JSON.stringify({
      type: 'req',
      id: requestId,
      method: 'connect',
      params: {
        minProtocol: this.options.protocolVersion ?? 3,
        maxProtocol: this.options.protocolVersion ?? 3,
        client: {
          id: clientId,
          displayName: this.options.client?.displayName ?? 'clawmuse-desktop-shell',
          version: this.options.client?.version ?? '0.1.0-dev',
          platform,
          mode: clientMode,
          instanceId: this.options.client?.instanceId,
        },
        auth: this.options.token || this.options.password
          ? {
              token: this.options.token,
              password: this.options.password,
            }
          : undefined,
        role,
        scopes,
        caps: [],
        commands: [],
        device,
      },
    }))

    this.pending.set(requestId, {
      resolve: () => {},
      reject: () => {},
    })
  }

  private extractNonce(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object') {
      return null
    }

    const candidate = payload as { nonce?: unknown }
    return typeof candidate.nonce === 'string' && candidate.nonce.trim().length > 0
      ? candidate.nonce.trim()
      : null
  }

  private handleClose(event: unknown) {
    this.ready = false
    this.socket = null
    this.protocol = null
    this.airiAnnounced = false
    this.airiRuntimeBySession.clear()
    this.clearAiriHeartbeatTimer()
    this.clearAiriAuthProbeTimer()
    const error = new Error(extractCloseReason(event))
    this.readyDeferred.reject(error)
    this.flushPendingErrors(error)
  }

  private handleError(event: unknown) {
    this.clearAiriAuthProbeTimer()
    const error = event instanceof Error ? event : new Error('gateway transport error')
    this.readyDeferred.reject(error)
  }

  private flushPendingErrors(error: Error) {
    for (const [, pending] of this.pending) {
      pending.reject(error)
    }
    this.pending.clear()
  }

  private clearAiriHeartbeatTimer() {
    if (this.airiHeartbeatTimer) {
      clearInterval(this.airiHeartbeatTimer)
      this.airiHeartbeatTimer = null
    }
  }

  private clearAiriAuthProbeTimer() {
    if (this.airiAuthProbeTimer) {
      clearTimeout(this.airiAuthProbeTimer)
      this.airiAuthProbeTimer = null
    }
  }
}
