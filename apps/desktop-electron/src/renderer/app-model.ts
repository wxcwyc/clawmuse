import type { DesktopShellRuntimeEvent } from '../../../desktop-shell/src/types'
import { reactive } from 'vue'
import { inspectLive2DStage } from './stage-preflight'

export interface DesktopRendererChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  session: string
  createdAt: number
  source?: string
  final?: boolean
}

export interface DesktopElectronSession {
  start(): Promise<void>
  stop(): void
  sendUserMessage(params: {
    sessionKey: string
    runId: string
    message: string
  }): Promise<unknown>
}

export interface DesktopRendererModelOptions {
  createSession(params: {
    url: string
    token: string
    password: string
    sessionKey: string
    onEvent?: (event: DesktopShellRuntimeEvent) => void
  }): DesktopElectronSession
  inspectStage?(params: {
    modelSource: string
  }): Promise<string[]>
}

export interface DesktopRendererState {
  connection: {
    url: string
    token: string
    password: string
    sessionKey: string
  }
  connected: boolean
  connectionStatus: 'idle' | 'connecting' | 'thinking' | 'speaking' | 'error'
  draftMessage: string
  subtitles: string[]
  liveAssistantText: string
  messages: DesktopRendererChatMessage[]
  logs: string[]
  stageMounted: boolean
  stageWarnings: string[]
}

type ConnectionField = keyof DesktopRendererState['connection']

function stringifyError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  return 'unknown error'
}

function normalizeGatewayUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return {
      url: trimmed,
      changed: false,
    }
  }

  try {
    const parsed = new URL(trimmed)
    let changed = false

    if (parsed.protocol === 'http:') {
      parsed.protocol = 'ws:'
      changed = true
    }
    else if (parsed.protocol === 'https:') {
      parsed.protocol = 'wss:'
      changed = true
    }

    if (parsed.pathname.endsWith('/chat')) {
      parsed.pathname = parsed.pathname.slice(0, -'/chat'.length) || '/'
      changed = true
    }

    if (parsed.searchParams.has('session')) {
      parsed.searchParams.delete('session')
      changed = true
    }

    return {
      url: parsed.toString(),
      changed,
    }
  }
  catch {
    return {
      url: trimmed,
      changed: false,
    }
  }
}

export function createDesktopRendererModel(options: DesktopRendererModelOptions) {
  const state = reactive<DesktopRendererState>({
    connection: {
      url: 'ws://127.0.0.1:18789',
      token: '',
      password: '',
      sessionKey: 'main',
    },
    connected: false,
    connectionStatus: 'idle',
    draftMessage: '',
    subtitles: [],
    liveAssistantText: '',
    messages: [],
    logs: [],
    stageMounted: false,
    stageWarnings: [],
  })

  let session: DesktopElectronSession | null = null
  let liveRunId: string | null = null
  const segmentCountByRun = new Map<string, number>()
  const committedAssistantRuns = new Set<string>()
  const completedRuns = new Set<string>()
  const consumedSegmentIds = new Set<string>()

  function appendLog(line: string) {
    state.logs.push(line)
  }

  function appendMessage(message: DesktopRendererChatMessage) {
    state.messages.push(message)
    if (state.messages.length > 300) {
      state.messages.splice(0, state.messages.length - 300)
    }
  }

  async function runStageInspection(params?: { modelSource?: string }) {
    state.stageWarnings = []

    if (!params?.modelSource) {
      return
    }

    const warnings = await (options.inspectStage?.({
      modelSource: params.modelSource,
    }) ?? inspectLive2DStage({
      modelSource: params.modelSource,
    }))

    state.stageWarnings = warnings
    for (const warning of warnings) {
      appendLog(warning)
    }
  }

  return {
    state,
    setConnectionField(field: ConnectionField, value: string) {
      state.connection[field] = value

      if (session) {
        session.stop()
        session = null
        appendLog('[session] connection settings changed, previous session reset')
      }
      state.connected = false
      state.connectionStatus = 'idle'
      state.liveAssistantText = ''
      liveRunId = null
      consumedSegmentIds.clear()
      completedRuns.clear()
    },
    setDraftMessage(value: string) {
      state.draftMessage = value
    },
    async mountStage(params?: { modelSource?: string }) {
      state.stageMounted = true
      await runStageInspection(params)
    },
    async refreshStageWarnings(params?: { modelSource?: string }) {
      await runStageInspection(params)
    },
    async connect() {
      const normalized = normalizeGatewayUrl(state.connection.url)
      if (normalized.changed && normalized.url !== state.connection.url) {
        appendLog(`[session] normalized gateway URL: ${state.connection.url} -> ${normalized.url}`)
        state.connection.url = normalized.url
      }

      if (!session) {
        session = options.createSession({
          url: state.connection.url,
          token: state.connection.token,
          password: state.connection.password,
          sessionKey: state.connection.sessionKey,
          onEvent: (event) => {
            this.handleRuntimeEvent(event)
          },
        })
      }

      appendLog(`[session] connecting to ${state.connection.url} (session=${state.connection.sessionKey})`)
      state.connectionStatus = 'connecting'

      try {
        await session.start()
      }
      catch (error) {
        const reason = stringifyError(error)
        appendLog(`[session] connect failed: ${reason}`)
        state.connected = false
        state.connectionStatus = 'error'
        session.stop()
        session = null
        throw error
      }

      appendLog('[session] connected')
      state.connected = true
      state.connectionStatus = 'idle'
    },
    async sendMessage(params: { runId: string }) {
      if (!session) {
        appendLog('[session] send aborted: session is not connected')
        state.connected = false
        state.connectionStatus = 'error'
        throw new Error('Session is not connected')
      }

      const message = state.draftMessage.trim()
      if (!message) {
        return
      }

      appendLog(`[session] sending message (run=${params.runId}, session=${state.connection.sessionKey})`)
      state.connectionStatus = 'thinking'
      try {
        await session.sendUserMessage({
          sessionKey: state.connection.sessionKey,
          runId: params.runId,
          message,
        })
      }
      catch (error) {
        appendLog(`[session] send failed: ${stringifyError(error)}`)
        state.connectionStatus = 'error'
        throw error
      }
      appendLog(`[user] ${message}`)
      appendMessage({
        id: `${params.runId}:user`,
        role: 'user',
        text: message,
        session: state.connection.sessionKey,
        createdAt: Date.now(),
        source: 'clawmuse-desktop-shell',
        final: true,
      })
      state.draftMessage = ''
    },
    handleRuntimeEvent(event: DesktopShellRuntimeEvent) {
      if (event.type === 'session.started') {
        completedRuns.delete(event.runId)
        appendLog(`[session] run started: ${event.runId}`)
        return
      }

      if (event.type === 'assistant.delta') {
        state.connectionStatus = 'speaking'
        state.liveAssistantText = event.accumulatedText || event.text
        liveRunId = event.runId
        appendLog(`[assistant:delta] run=${event.runId} chars=${state.liveAssistantText.length}`)
        return
      }

      if (event.type === 'assistant.segment') {
        if (completedRuns.has(event.runId)) {
          appendLog(`[subtitle] ignored segment after completion (run=${event.runId}, segment=${event.segmentId})`)
          return
        }

        if (consumedSegmentIds.has(event.segmentId)) {
          appendLog(`[subtitle] ignored duplicate segment (run=${event.runId}, segment=${event.segmentId})`)
          return
        }

        consumedSegmentIds.add(event.segmentId)
        if (consumedSegmentIds.size > 2048) {
          const oldest = consumedSegmentIds.values().next().value as string | undefined
          if (oldest) {
            consumedSegmentIds.delete(oldest)
          }
        }

        segmentCountByRun.set(event.runId, (segmentCountByRun.get(event.runId) ?? 0) + 1)
        state.subtitles.push(event.text)
        appendLog(`[subtitle] ${event.text}`)
        return
      }

      if (event.type === 'assistant.completed') {
        if (completedRuns.has(event.runId)) {
          appendLog(`[assistant:final] duplicate completion ignored (run=${event.runId})`)
          return
        }

        completedRuns.add(event.runId)
        if (completedRuns.size > 512) {
          const oldest = completedRuns.values().next().value as string | undefined
          if (oldest) {
            completedRuns.delete(oldest)
          }
        }

        state.connectionStatus = 'idle'
        state.liveAssistantText = event.finalText || state.liveAssistantText
        appendLog(`[assistant:final] run=${event.runId} chars=${event.finalText.length}`)

        const segmentCount = segmentCountByRun.get(event.runId) ?? 0
        if (segmentCount === 0 && event.finalText.trim().length > 0) {
          state.subtitles.push(event.finalText)
          appendLog(`[subtitle] ${event.finalText}`)
        }

        if (!committedAssistantRuns.has(event.runId) && event.finalText.trim().length > 0) {
          committedAssistantRuns.add(event.runId)
          appendMessage({
            id: `${event.runId}:assistant`,
            role: 'assistant',
            text: event.finalText,
            session: event.sessionKey,
            createdAt: event.ts,
            source: 'openclaw',
            final: true,
          })
        }

        segmentCountByRun.delete(event.runId)
        if (liveRunId === event.runId) {
          liveRunId = null
        }
        return
      }

      if (event.type === 'assistant.error') {
        state.connectionStatus = 'error'
        if (liveRunId === event.runId) {
          liveRunId = null
          state.liveAssistantText = ''
        }
        segmentCountByRun.delete(event.runId)
        appendLog(`[assistant:error] ${event.error}`)
      }
    },
  }
}
