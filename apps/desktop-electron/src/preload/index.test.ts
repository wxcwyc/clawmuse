import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createDesktopElectronRendererBridge,
  exposeDesktopElectronRendererBridge,
} from './index'

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    send: vi.fn(),
    invoke: vi.fn(async () => 1),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

describe('desktop-electron preload bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the renderer bridge payload', () => {
    expect(createDesktopElectronRendererBridge()).toEqual({
      platform: 'desktop-electron',
      version: '0.1.0',
      hostPlatform: expect.any(String),
      imeCompatMode: expect.any(Boolean),
      setWindowInteractiveRegionActive: expect.any(Function),
      dragWindowBy: expect.any(Function),
      resizeWindowToAvatar: expect.any(Function),
      createNodeWebSocket: expect.any(Function),
      getNodeWebSocketReadyState: expect.any(Function),
      sendNodeWebSocket: expect.any(Function),
      closeNodeWebSocket: expect.any(Function),
      onNodeWebSocketEvent: expect.any(Function),
      startVoiceService: expect.any(Function),
      stopVoiceService: expect.any(Function),
      getVoiceServiceStatus: expect.any(Function),
      getVoiceServiceSpeakers: expect.any(Function),
      scanLive2DModels: expect.any(Function),
      onVoiceServiceEvent: expect.any(Function),
      onShellCommand: expect.any(Function),
    })
  })

  it('exposes the renderer bridge to the window', async () => {
    const { contextBridge } = await import('electron')

    exposeDesktopElectronRendererBridge()

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('clawmuse', {
      platform: 'desktop-electron',
      version: '0.1.0',
      hostPlatform: expect.any(String),
      imeCompatMode: expect.any(Boolean),
      setWindowInteractiveRegionActive: expect.any(Function),
      dragWindowBy: expect.any(Function),
      resizeWindowToAvatar: expect.any(Function),
      createNodeWebSocket: expect.any(Function),
      getNodeWebSocketReadyState: expect.any(Function),
      sendNodeWebSocket: expect.any(Function),
      closeNodeWebSocket: expect.any(Function),
      onNodeWebSocketEvent: expect.any(Function),
      startVoiceService: expect.any(Function),
      stopVoiceService: expect.any(Function),
      getVoiceServiceStatus: expect.any(Function),
      getVoiceServiceSpeakers: expect.any(Function),
      scanLive2DModels: expect.any(Function),
      onVoiceServiceEvent: expect.any(Function),
      onShellCommand: expect.any(Function),
    })
  })

  it('sends avatar resize requests to the main process', async () => {
    const { ipcRenderer } = await import('electron')
    const bridge = createDesktopElectronRendererBridge()

    await bridge.dragWindowBy({
      x: 12,
      y: -8,
    })
    bridge.resizeWindowToAvatar({
      width: 412,
      height: 688,
    })

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'clawmuse:drag-window-by', 12, -8)
    expect(ipcRenderer.send).toHaveBeenCalledWith('clawmuse:resize-window-to-avatar', {
      width: 412,
      height: 688,
    })
  })

  it('proxies node websocket bridge calls over ipcRenderer.invoke', async () => {
    const { ipcRenderer } = await import('electron')
    const bridge = createDesktopElectronRendererBridge()

    await bridge.createNodeWebSocket('ws://127.0.0.1:18789')
    await bridge.getNodeWebSocketReadyState(1)
    await bridge.sendNodeWebSocket(1, 'hello')
    await bridge.closeNodeWebSocket(1, 1000, 'bye')

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'clawmuse:ws-create', 'ws://127.0.0.1:18789')
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'clawmuse:ws-ready-state', 1)
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, 'clawmuse:ws-send', 1, 'hello')
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, 'clawmuse:ws-close', 1, 1000, 'bye')
  })

  it('proxies voice service control calls over ipcRenderer.invoke', async () => {
    const { ipcRenderer } = await import('electron')
    const bridge = createDesktopElectronRendererBridge()

    await bridge.startVoiceService()
    await bridge.getVoiceServiceStatus()
    await bridge.getVoiceServiceSpeakers({
      provider: 'cosyvoice',
      baseUrl: 'http://127.0.0.1:50000',
    })
    await bridge.scanLive2DModels()
    await bridge.stopVoiceService()

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, 'clawmuse:voice-service-start')
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, 'clawmuse:voice-service-status')
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, 'clawmuse:voice-service-speakers', {
      provider: 'cosyvoice',
      baseUrl: 'http://127.0.0.1:50000',
    })
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(4, 'clawmuse:scan-live2d-models')
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(5, 'clawmuse:voice-service-stop')
  })

  it('subscribes shell-command events and supports unsubscribe', async () => {
    const { ipcRenderer } = await import('electron')
    const bridge = createDesktopElectronRendererBridge()
    const listener = vi.fn()

    const unsubscribe = bridge.onShellCommand(listener)

    const subscribeCall = (ipcRenderer.on as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0] === 'clawmuse:shell-command',
    )
    expect(subscribeCall).toBeTruthy()
    const handler = subscribeCall?.[1] as ((event: unknown, payload: unknown) => void)
    handler({}, {
      type: 'open-panel',
      panel: 'chat',
    })

    expect(listener).toHaveBeenCalledWith({
      type: 'open-panel',
      panel: 'chat',
    })

    unsubscribe()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('clawmuse:shell-command', handler)
  })
})
