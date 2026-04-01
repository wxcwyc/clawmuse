import { describe, expect, it, vi } from 'vitest'

import {
  createDesktopElectronMain,
  resolveDesktopElectronRuntimeParams,
  resolveDesktopElectronWindowConfig,
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
      width: 620,
      height: 760,
      minWidth: 260,
      minHeight: 360,
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

  it('detects when the module should autostart as the real electron main entry', () => {
    expect(shouldAutoStartDesktopElectronMain({
      electronVersion: '40.8.0',
      processArgv: ['/usr/bin/electron', '/app/out/main/index.js'],
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
    })
  })

  it('enables IME compat mode by default on win32', () => {
    expect(resolveDesktopElectronRuntimeParams({
      cwd: '/workspace/clawmuse',
      env: {
        CLAWMUSE_PLATFORM: 'win32',
      },
    })).toEqual({
      appRoot: '/workspace/clawmuse',
      rendererUrl: undefined,
      openDevTools: false,
      imeCompatMode: true,
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
})
