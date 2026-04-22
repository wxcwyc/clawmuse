import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopElectronNodeWebSocketBridgeEvent {
  socketId: number
  type: 'open' | 'message' | 'close' | 'error'
  data?: string
  code?: number
  reason?: string
  message?: string
}

export interface DesktopElectronVoiceServiceEvent {
  level: 'info' | 'warn' | 'error'
  line: string
  ts: number
}

export type DesktopElectronShellCommand =
  | { type: 'open-panel', panel: 'chat' | 'logs' | 'connection' }
  | { type: 'window.always-on-top', enabled: boolean }
  | { type: 'window.click-through', enabled: boolean }
  | { type: 'avatar.manual-motion', motion: string }
  | { type: 'avatar.switch-model', modelId: string }

export interface DesktopElectronVoiceServiceStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  adapter: {
    sttEndpoint: string
    ttsEndpoint: string
    sttMode: 'owned' | 'external' | 'failed'
    ttsMode: 'owned' | 'external' | 'failed'
  }
  upstream: {
    baseUrl: string
    healthy: boolean
    autoLaunch: boolean
    launchCommand: string
    launchCwd: string
    launchAttempted: boolean
    pid?: number
  }
  cosyvoice: {
    baseUrl: string
    healthy: boolean
    autoLaunch: boolean
    launchCommand: string
    launchCwd: string
    launchAttempted: boolean
    pid?: number
  }
  lastError: string
}

export interface DesktopElectronVoiceSpeakerListRequest {
  provider?: 'cosyvoice' | 'openllm'
  baseUrl?: string
}

export interface DesktopElectronVoiceSpeakerListResult {
  provider: 'cosyvoice' | 'openllm'
  baseUrl: string
  speakers: string[]
  source: 'endpoint' | 'fallback' | 'none'
  endpoint?: string
  reason?: string
}

export interface DesktopElectronLive2DModelCatalogEntry {
  id: string
  label: string
  source: string
  absolutePath: string
}

export interface DesktopElectronRendererBridge {
  platform: 'desktop-electron'
  version: string
  hostPlatform: string
  imeCompatMode: boolean
  setWindowInteractiveRegionActive(active: boolean): Promise<boolean>
  dragWindowBy(delta: { x: number, y: number }): Promise<boolean>
  resizeWindowToAvatar(bounds: {
    width: number
    height: number
  }): void
  createNodeWebSocket(url: string): Promise<number>
  getNodeWebSocketReadyState(socketId: number): Promise<number>
  sendNodeWebSocket(socketId: number, payload: string): Promise<boolean>
  closeNodeWebSocket(socketId: number, code?: number, reason?: string): Promise<boolean>
  onNodeWebSocketEvent(
    listener: (event: DesktopElectronNodeWebSocketBridgeEvent) => void,
  ): () => void
  startVoiceService(): Promise<DesktopElectronVoiceServiceStatus>
  stopVoiceService(): Promise<DesktopElectronVoiceServiceStatus>
  getVoiceServiceStatus(): Promise<DesktopElectronVoiceServiceStatus>
  getVoiceServiceSpeakers(
    request?: DesktopElectronVoiceSpeakerListRequest,
  ): Promise<DesktopElectronVoiceSpeakerListResult>
  onVoiceServiceEvent(
    listener: (event: DesktopElectronVoiceServiceEvent) => void,
  ): () => void
  scanLive2DModels(): Promise<DesktopElectronLive2DModelCatalogEntry[]>
  onShellCommand(
    listener: (event: DesktopElectronShellCommand) => void,
  ): () => void
}

function readAdditionalArgument(prefix: string): string | null {
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length)
    }
  }

  return null
}

export function createDesktopElectronRendererBridge(): DesktopElectronRendererBridge {
  const hostPlatform = readAdditionalArgument('--clawmuse-host-platform=') ?? process.platform
  const imeCompatArg = readAdditionalArgument('--clawmuse-ime-compat=')
  const imeCompatMode = imeCompatArg == null
    ? false
    : imeCompatArg === '1' || imeCompatArg === 'true'

  return {
    platform: 'desktop-electron',
    version: '0.1.0',
    hostPlatform,
    imeCompatMode,
    async setWindowInteractiveRegionActive(active) {
      return await ipcRenderer.invoke('clawmuse:set-window-interactive-region-active', active) as boolean
    },
    async dragWindowBy(delta) {
      return await ipcRenderer.invoke('clawmuse:drag-window-by', delta.x, delta.y) as boolean
    },
    resizeWindowToAvatar(bounds) {
      ipcRenderer.send('clawmuse:resize-window-to-avatar', bounds)
    },
    async createNodeWebSocket(url) {
      return await ipcRenderer.invoke('clawmuse:ws-create', url) as number
    },
    async getNodeWebSocketReadyState(socketId) {
      return await ipcRenderer.invoke('clawmuse:ws-ready-state', socketId) as number
    },
    async sendNodeWebSocket(socketId, payload) {
      return await ipcRenderer.invoke('clawmuse:ws-send', socketId, payload) as boolean
    },
    async closeNodeWebSocket(socketId, code, reason) {
      return await ipcRenderer.invoke('clawmuse:ws-close', socketId, code, reason) as boolean
    },
    onNodeWebSocketEvent(listener) {
      const handler = (_event: unknown, payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
          return
        }
        listener(payload as DesktopElectronNodeWebSocketBridgeEvent)
      }
      ipcRenderer.on('clawmuse:ws-event', handler)
      return () => {
        ipcRenderer.removeListener('clawmuse:ws-event', handler)
      }
    },
    async startVoiceService() {
      return await ipcRenderer.invoke('clawmuse:voice-service-start') as DesktopElectronVoiceServiceStatus
    },
    async stopVoiceService() {
      return await ipcRenderer.invoke('clawmuse:voice-service-stop') as DesktopElectronVoiceServiceStatus
    },
    async getVoiceServiceStatus() {
      return await ipcRenderer.invoke('clawmuse:voice-service-status') as DesktopElectronVoiceServiceStatus
    },
    async getVoiceServiceSpeakers(request) {
      return await ipcRenderer.invoke('clawmuse:voice-service-speakers', request) as DesktopElectronVoiceSpeakerListResult
    },
    async scanLive2DModels() {
      return await ipcRenderer.invoke('clawmuse:scan-live2d-models') as DesktopElectronLive2DModelCatalogEntry[]
    },
    onVoiceServiceEvent(listener) {
      const handler = (_event: unknown, payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
          return
        }
        listener(payload as DesktopElectronVoiceServiceEvent)
      }
      ipcRenderer.on('clawmuse:voice-service-event', handler)
      return () => {
        ipcRenderer.removeListener('clawmuse:voice-service-event', handler)
      }
    },
    onShellCommand(listener) {
      const handler = (_event: unknown, payload: unknown) => {
        if (!payload || typeof payload !== 'object') {
          return
        }
        listener(payload as DesktopElectronShellCommand)
      }
      ipcRenderer.on('clawmuse:shell-command', handler)
      return () => {
        ipcRenderer.removeListener('clawmuse:shell-command', handler)
      }
    },
  }
}

export function exposeDesktopElectronRendererBridge() {
  const bridge = createDesktopElectronRendererBridge()

  contextBridge.exposeInMainWorld('clawmuse', bridge)
  return bridge
}

export const desktopElectronPreloadEntrypoint = {
  id: 'desktop-electron-preload',
  createDesktopElectronRendererBridge,
  exposeDesktopElectronRendererBridge,
}

if (typeof process !== 'undefined' && Boolean(process.versions.electron)) {
  exposeDesktopElectronRendererBridge()
}
