import { describe, expect, it, vi } from 'vitest'

import {
  createDesktopElectronMain,
  resolveDesktopElectronRuntimeParams,
  resolveDesktopElectronWindowConfig,
  setupDesktopElectronLive2DCatalogIpc,
  setupDesktopElectronNodeWebSocketBridgeIpc,
  setupDesktopElectronVoiceServiceIpc,
  setupDesktopElectronWindowResizeIpc,
  shouldAutoStartDesktopElectronMain,
} from './index'

describe('desktop-electron main bootstrap', () => {
  it('resolves preload and renderer paths for the BrowserWindow config', () => {
    const config = resolveDesktopElectronWindowConfig({
      appRoot: '/app',
      rendererUrl: 'http://127.0.0.1:5174',
    })

    expect(config.preloadPath).toBe('/app/out/preload/index.cjs')
    expect(config.rendererUrl).toBe('http://127.0.0.1:5174')
    expect(config.rendererHtmlPath).toBe('/app/out/renderer/index.html')
  })

  it('creates a BrowserWindow boot path without starting the full Electron runtime', async () => {
    const loadURL = vi.fn(async () => {})
    const loadFile = vi.fn(async () => {})
    const browserWindow = vi.fn(function BrowserWindowMock() {
      return {
        loadURL,
        loadFile,
        webContents: {
          openDevTools: vi.fn(),
        },
      }
    })
    const whenReady = vi.fn(async () => {})
    const on = vi.fn()
    const appendSwitch = vi.fn()
    const setApplicationMenu = vi.fn()

    const main = createDesktopElectronMain({
      platform: 'linux',
      electron: {
        app: {
          commandLine: {
            appendSwitch,
          },
          whenReady,
          on,
        },
        BrowserWindow: browserWindow,
        Menu: {
          setApplicationMenu,
        },
        ipcMain: {
          on: vi.fn(),
        },
      },
      appRoot: '/app',
      rendererUrl: 'http://127.0.0.1:5174',
    })

    await main.launch()

    expect(appendSwitch).toHaveBeenCalledWith('enable-transparent-visuals')
    expect(appendSwitch).toHaveBeenCalledWith('ignore-gpu-blocklist')
    expect(appendSwitch).toHaveBeenCalledWith('enable-unsafe-swiftshader')
    expect(setApplicationMenu).toHaveBeenCalledWith(null)
    expect(whenReady).toHaveBeenCalledTimes(1)
    expect(browserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 920,
      height: 1180,
      minWidth: 320,
      minHeight: 420,
      resizable: false,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      frame: false,
      transparent: true,
      hasShadow: false,
      webPreferences: expect.objectContaining({
        preload: '/app/out/preload/index.cjs',
        contextIsolation: true,
        nodeIntegration: false,
      }),
    }))
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:5174')
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('uses app.getAppPath() after ready when resolving packaged preload/html paths', async () => {
    const loadURL = vi.fn(async () => {})
    const loadFile = vi.fn(async () => {})
    const browserWindow = vi.fn(function BrowserWindowMock() {
      return {
        loadURL,
        loadFile,
      }
    })
    const whenReady = vi.fn(async () => {})
    const getAppPath = vi.fn(() => 'C:/Program Files/ClawMuse/resources/app.asar')

    const main = createDesktopElectronMain({
      platform: 'win32',
      electron: {
        app: {
          whenReady,
          on: vi.fn(),
          getAppPath,
        },
        BrowserWindow: browserWindow,
      },
      appRoot: '/fallback',
    })

    await main.launch()

    expect(browserWindow).toHaveBeenCalledWith(expect.objectContaining({
      webPreferences: expect.objectContaining({
        preload: 'C:/Program Files/ClawMuse/resources/app.asar/out/preload/index.cjs',
      }),
    }))
    expect(loadFile).toHaveBeenCalledWith('C:/Program Files/ClawMuse/resources/app.asar/out/renderer/index.html')
  })

  it('does not apply linux transparent-window switches on non-linux platforms', async () => {
    const loadURL = vi.fn(async () => {})
    const browserWindow = vi.fn(function BrowserWindowMock() {
      return {
        loadURL,
        loadFile: vi.fn(async () => {}),
      }
    })
    const whenReady = vi.fn(async () => {})
    const appendSwitch = vi.fn()

    const main = createDesktopElectronMain({
      platform: 'win32',
      electron: {
        app: {
          commandLine: {
            appendSwitch,
          },
          whenReady,
          on: vi.fn(),
        },
        BrowserWindow: browserWindow,
        ipcMain: {
          on: vi.fn(),
        },
      },
      appRoot: '/app',
      rendererUrl: 'http://127.0.0.1:5174',
    })

    await main.launch()

    expect(appendSwitch).not.toHaveBeenCalled()
  })

  it('wires tray context menu actions for top-most/click-through and panel shortcuts', async () => {
    const loadURL = vi.fn(async () => {})
    const webContents = {
      openDevTools: vi.fn(),
      send: vi.fn(),
    }
    const setAlwaysOnTop = vi.fn()
    const setIgnoreMouseEvents = vi.fn()
    const show = vi.fn()
    const focus = vi.fn()
    const browserWindow = vi.fn(function BrowserWindowMock() {
      return {
        loadURL,
        loadFile: vi.fn(async () => {}),
        webContents,
        setAlwaysOnTop,
        setIgnoreMouseEvents,
        show,
        focus,
      }
    })
    const whenReady = vi.fn(async () => {})
    const trayInstance = {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      destroy: vi.fn(),
    }
    const Tray = vi.fn(function TrayMock() {
      return trayInstance
    })
    const menuTemplates: unknown[] = []
    const Menu = {
      setApplicationMenu: vi.fn(),
      buildFromTemplate: vi.fn((template: unknown) => {
        menuTemplates.push(template)
        return template
      }),
    }
    const appOn = vi.fn()

    const main = createDesktopElectronMain({
      platform: 'win32',
      electron: {
        app: {
          whenReady,
          on: appOn,
          quit: vi.fn(),
        },
        BrowserWindow: browserWindow,
        Menu,
        Tray: Tray as unknown as NonNullable<Parameters<typeof createDesktopElectronMain>[0]['electron']['Tray']>,
        nativeImage: {
          createFromPath: vi.fn(() => ({})),
          createEmpty: vi.fn(() => ({})),
        },
        ipcMain: {
          on: vi.fn(),
        },
      },
      appRoot: '/app',
      rendererUrl: 'http://127.0.0.1:5174',
    })

    await main.launch()

    expect(Tray).toHaveBeenCalledTimes(1)
    expect(trayInstance.setContextMenu).toHaveBeenCalled()

    const template = menuTemplates[0] as Array<{
      label?: string
      submenu?: Array<{
        label?: string
        click?: (item: { checked?: boolean }) => void
      }>
      click?: (item: { checked?: boolean }) => void
    }>
    const pinItem = template.find(item => item.label === '窗口置顶')
    const clickThroughItem = template.find(item => item.label === '鼠标穿透')
    const openChatItem = template.find(item => item.label === '打开聊天')
    const openConnectionItem = template.find(item => item.label === '连接设置')
    const motionMenuItem = template.find(item => item.label === '测试表情动作')
    expect(pinItem).toBeTruthy()
    expect(clickThroughItem).toBeTruthy()
    expect(openChatItem).toBeTruthy()
    expect(openConnectionItem).toBeTruthy()
    expect(motionMenuItem?.submenu?.length).toBeGreaterThan(0)

    pinItem?.click?.({ checked: true })
    clickThroughItem?.click?.({ checked: true })
    openChatItem?.click?.({})
    openConnectionItem?.click?.({})
    motionMenuItem?.submenu?.[0]?.click?.({})

    expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
    expect(setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
    expect(show).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
    expect(webContents.send).toHaveBeenCalledWith('clawmuse:shell-command', {
      type: 'window.always-on-top',
      enabled: true,
    })
    expect(webContents.send).toHaveBeenCalledWith('clawmuse:shell-command', {
      type: 'window.click-through',
      enabled: true,
    })
    expect(webContents.send).toHaveBeenCalledWith('clawmuse:shell-command', {
      type: 'open-panel',
      panel: 'chat',
    })
    expect(webContents.send).toHaveBeenCalledWith('clawmuse:shell-command', {
      type: 'open-panel',
      panel: 'connection',
    })
    expect(webContents.send).toHaveBeenCalledWith('clawmuse:shell-command', {
      type: 'avatar.manual-motion',
      motion: 'TapBody#0',
    })
  })

  it('detects when the module should autostart as the real electron main entry', () => {
    expect(shouldAutoStartDesktopElectronMain({
      electronVersion: '40.8.0',
      processArgv: ['/usr/bin/electron', '/app/out/main/index.js'],
    })).toBe(true)

    expect(shouldAutoStartDesktopElectronMain({
      electronVersion: '40.8.0',
      processArgv: ['C:\\Program Files\\ClawMuse\\ClawMuse.exe'],
    })).toBe(true)

    expect(shouldAutoStartDesktopElectronMain({
      electronVersion: undefined,
      processArgv: ['/usr/bin/node', '/app/out/main/index.js'],
    })).toBe(false)
  })

  it('resolves runtime params for electron-vite dev and build entry execution', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      env: {
        ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173',
        CLAWMUSE_PLATFORM: 'linux',
      },
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: 'http://127.0.0.1:5173',
      openDevTools: false,
      imeCompatMode: false,
      forceVisibleDebug: false,
    })
  })

  it('prefers detected appPath for packaged runtime root', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      appPath: 'C:/Program Files/ClawMuse/resources/app.asar',
      env: {
        CLAWMUSE_PLATFORM: 'win32',
      },
    })).toEqual({
      appRoot: 'C:/Program Files/ClawMuse/resources/app.asar',
      rendererUrl: undefined,
      openDevTools: false,
      imeCompatMode: false,
      forceVisibleDebug: false,
    })
  })

  it('keeps IME compat mode off by default on win32', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      env: {
        CLAWMUSE_PLATFORM: 'win32',
      },
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: undefined,
      openDevTools: false,
      imeCompatMode: false,
      forceVisibleDebug: false,
    })
  })

  it('can explicitly enable IME compat mode from env', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      env: {
        CLAWMUSE_PLATFORM: 'win32',
        ELECTRON_IME_COMPAT_MODE: '1',
      },
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: undefined,
      openDevTools: false,
      imeCompatMode: true,
      forceVisibleDebug: false,
    })
  })

  it('can enable force-visible debug mode from env', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      env: {
        CLAWMUSE_FORCE_VISIBLE: '1',
      },
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: undefined,
      openDevTools: false,
      imeCompatMode: false,
      forceVisibleDebug: true,
    })
  })

  it('can enable force-visible + devtools from argv flags', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      processArgv: ['/app/out/main/index.js', '--force-visible', '--open-devtools'],
      env: {},
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: undefined,
      openDevTools: true,
      imeCompatMode: false,
      forceVisibleDebug: true,
    })
  })

  it('resizes the transparent shell to the reported avatar bounds', () => {
    let resizeListener: ((event: unknown, bounds: { width: number, height: number }) => void) | undefined
    const on = vi.fn((channel, listener) => {
      if (channel === 'clawmuse:resize-window-to-avatar') {
        resizeListener = listener
      }
    })
    const setBounds = vi.fn()
    const getBounds = vi.fn(() => ({
      x: 100,
      y: 200,
      width: 620,
      height: 760,
    }))

    setupDesktopElectronWindowResizeIpc({
      ipcMain: { on },
      window: {
        loadURL: vi.fn(),
        loadFile: vi.fn(),
        getBounds,
        setBounds,
      },
    })

    resizeListener?.({}, { width: 468, height: 732 })

    expect(setBounds).toHaveBeenCalledWith({
      x: 172,
      y: 216,
      width: 476,
      height: 744,
    })
  })

  it('decodes Blob websocket messages in the main-process bridge', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener)
      }),
    }
    const sender = {
      send: vi.fn(),
    }

    type WsListener = (event: unknown) => void
    class FakeWebSocket {
      readyState = 1
      binaryType = 'blob'
      private readonly listeners = new Map<string, Set<WsListener>>()

      addEventListener(type: string, listener: WsListener) {
        const set = this.listeners.get(type) ?? new Set<WsListener>()
        set.add(listener)
        this.listeners.set(type, set)
      }

      emit(type: string, event: unknown) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event)
        }
      }

      send() {}

      close() {}
    }

    const sockets: FakeWebSocket[] = []
    const previousWebSocket = globalThis.WebSocket
    ;(globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
      constructor() {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket
      }
    } as unknown

    try {
      setupDesktopElectronNodeWebSocketBridgeIpc({
        ipcMain,
      })

      const create = handlers.get('clawmuse:ws-create')
      expect(create).toBeTypeOf('function')
      const socketId = create?.({ sender }, 'ws://127.0.0.1:18789') as number

      const socket = sockets[0]
      expect(socketId).toBeGreaterThan(0)
      expect(socket.binaryType).toBe('arraybuffer')

      const payload = JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'blob-nonce' },
      })
      socket.emit('message', {
        data: new Blob([payload], { type: 'application/json' }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(sender.send).toHaveBeenCalledWith('clawmuse:ws-event', {
        socketId,
        type: 'message',
        data: payload,
      })
    }
    finally {
      ;(globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = previousWebSocket
    }
  })

  it('registers voice service ipc handlers and forwards to controller', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener)
      }),
    }
    const controller = {
      start: vi.fn(async () => ({ state: 'running' })),
      stop: vi.fn(async () => ({ state: 'stopped' })),
      getStatus: vi.fn(() => ({ state: 'running' })),
      listSpeakers: vi.fn(async () => ({ speakers: ['中文女'] })),
    }

    setupDesktopElectronVoiceServiceIpc({
      ipcMain,
      controller: controller as unknown as Parameters<typeof setupDesktopElectronVoiceServiceIpc>[0]['controller'],
    })

    const startHandler = handlers.get('clawmuse:voice-service-start')
    const stopHandler = handlers.get('clawmuse:voice-service-stop')
    const statusHandler = handlers.get('clawmuse:voice-service-status')
    const speakersHandler = handlers.get('clawmuse:voice-service-speakers')

    expect(startHandler).toBeTypeOf('function')
    expect(stopHandler).toBeTypeOf('function')
    expect(statusHandler).toBeTypeOf('function')
    expect(speakersHandler).toBeTypeOf('function')

    await startHandler?.({})
    await stopHandler?.({})
    statusHandler?.({})
    await speakersHandler?.({}, { provider: 'cosyvoice', baseUrl: 'http://127.0.0.1:50000' })

    expect(controller.start).toHaveBeenCalledTimes(1)
    expect(controller.stop).toHaveBeenCalledTimes(1)
    expect(controller.getStatus).toHaveBeenCalledTimes(1)
    expect(controller.listSpeakers).toHaveBeenCalledTimes(1)
  })

  it('registers live2d catalog ipc handler and returns model entries', () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener)
      }),
    }

    setupDesktopElectronLive2DCatalogIpc({
      ipcMain,
      appRoot: '/app',
    })

    const scanHandler = handlers.get('clawmuse:scan-live2d-models')
    expect(scanHandler).toBeTypeOf('function')
    const result = scanHandler?.({})
    expect(Array.isArray(result)).toBe(true)
  })
})
