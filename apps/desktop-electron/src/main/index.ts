export interface DesktopElectronWindowConfig {
  preloadPath: string
  rendererHtmlPath: string
  rendererUrl?: string
}

export interface DesktopElectronRuntimeParams {
  appRoot: string
  rendererUrl?: string
  openDevTools: boolean
  imeCompatMode: boolean
}

export interface DesktopElectronBrowserWindowOptions {
  width: number
  height: number
  minWidth: number
  minHeight: number
  resizable: boolean
  title: string
  backgroundColor: string
  autoHideMenuBar: boolean
  frame: boolean
  transparent: boolean
  hasShadow: boolean
  webPreferences: {
    preload: string
    contextIsolation: boolean
    nodeIntegration: boolean
    additionalArguments?: string[]
  }
}

export interface DesktopElectronBrowserWindowInstance {
  loadURL(url: string): Promise<void> | void
  loadFile(path: string): Promise<void> | void
  getBounds?(): {
    x: number
    y: number
    width: number
    height: number
  }
  setBounds?(bounds: {
    x?: number
    y?: number
    width: number
    height: number
  }): void
  webContents?: {
    openDevTools(): void
  }
}

export interface DesktopElectronMainOptions {
  platform?: string
  imeCompatMode?: boolean
  electron: {
    app: {
      commandLine?: {
        appendSwitch(name: string): void
      }
      whenReady(): Promise<void>
      on(event: string, listener: () => void): void
    }
    BrowserWindow:
      | (new (options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance)
      | ((options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance)
    Menu?: {
      setApplicationMenu(menu: null): void
    }
    ipcMain?: {
      on(
        channel: string,
        listener: (
          event: unknown,
          bounds: {
            width: number
            height: number
          },
        ) => void,
      ): void
    }
  }
  appRoot: string
  rendererUrl?: string
  openDevTools?: boolean
}

const AVATAR_WINDOW_MIN_WIDTH = 260
const AVATAR_WINDOW_MIN_HEIGHT = 360
const AVATAR_WINDOW_MAX_WIDTH = 620
const AVATAR_WINDOW_MAX_HEIGHT = 920
const AVATAR_WINDOW_HORIZONTAL_PADDING = 8
const AVATAR_WINDOW_VERTICAL_PADDING = 12

function joinPath(...segments: string[]) {
  return segments
    .filter(segment => segment.length > 0)
    .map((segment, index) => {
      if (index === 0) {
        return segment.replace(/\/+$/g, '')
      }

      return segment.replace(/^\/+/g, '').replace(/\/+$/g, '')
    })
    .join('/')
}

function createBrowserWindow(
  BrowserWindow: DesktopElectronMainOptions['electron']['BrowserWindow'],
  options: DesktopElectronBrowserWindowOptions,
): DesktopElectronBrowserWindowInstance {
  try {
    return Reflect.construct(BrowserWindow as new (options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance, [options])
  } catch {
    return (BrowserWindow as (options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance)(options)
  }
}

export function resolveDesktopElectronWindowConfig(params: {
  appRoot: string
  rendererUrl?: string
}): DesktopElectronWindowConfig {
  return {
    preloadPath: joinPath(params.appRoot, 'out', 'preload', 'index.cjs'),
    rendererHtmlPath: joinPath(params.appRoot, 'out', 'renderer', 'index.html'),
    rendererUrl: params.rendererUrl,
  }
}

export function shouldAutoStartDesktopElectronMain(params: {
  electronVersion?: string
  processArgv: string[]
}) {
  return Boolean(params.electronVersion && params.processArgv[1])
}

export function resolveDesktopElectronRuntimeParams(params: {
  cwd: string
  env: Record<string, string | undefined>
}): DesktopElectronRuntimeParams {
  const explicitCompat = params.env.ELECTRON_IME_COMPAT_MODE
  const enableCompatFromEnv = explicitCompat === '1' || explicitCompat === 'true'
  const disableCompatFromEnv = explicitCompat === '0' || explicitCompat === 'false'
  const platform = params.env.CLAWMUSE_PLATFORM ?? process.platform
  const imeCompatMode = disableCompatFromEnv
    ? false
    : (enableCompatFromEnv || platform === 'win32')

  return {
    appRoot: params.cwd,
    rendererUrl: params.env.ELECTRON_RENDERER_URL,
    openDevTools: params.env.OPEN_DEVTOOLS === '1',
    imeCompatMode,
  }
}

export function createDesktopElectronMain(options: DesktopElectronMainOptions) {
  async function launch() {
    const runtimePlatform = options.platform ?? process.platform
    if (runtimePlatform === 'linux') {
      // Linux transparent windows rely on these chromium switches.
      options.electron.app.commandLine?.appendSwitch('enable-transparent-visuals')
      options.electron.app.commandLine?.appendSwitch('ignore-gpu-blocklist')
      options.electron.app.commandLine?.appendSwitch('enable-unsafe-swiftshader')
    }

    await options.electron.app.whenReady()
    options.electron.Menu?.setApplicationMenu(null)

    const config = resolveDesktopElectronWindowConfig({
      appRoot: options.appRoot,
      rendererUrl: options.rendererUrl,
    })

    const windowOptions: DesktopElectronBrowserWindowOptions = {
      width: 620,
      height: 760,
      minWidth: AVATAR_WINDOW_MIN_WIDTH,
      minHeight: AVATAR_WINDOW_MIN_HEIGHT,
      resizable: false,
      title: 'ClawMuse',
      backgroundColor: options.imeCompatMode ? '#18120d' : 'rgba(0, 0, 0, 0)',
      autoHideMenuBar: true,
      frame: options.imeCompatMode ? true : false,
      transparent: options.imeCompatMode ? false : true,
      hasShadow: options.imeCompatMode ? true : false,
      webPreferences: {
        preload: config.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [
          `--clawmuse-host-platform=${runtimePlatform}`,
          `--clawmuse-ime-compat=${options.imeCompatMode ? '1' : '0'}`,
        ],
      },
    }

    const mainWindow = createBrowserWindow(options.electron.BrowserWindow, windowOptions)
    setupDesktopElectronWindowResizeIpc({
      ipcMain: options.electron.ipcMain,
      window: mainWindow,
    })

    if (config.rendererUrl) {
      await mainWindow.loadURL(config.rendererUrl)
    } else {
      await mainWindow.loadFile(config.rendererHtmlPath)
    }

    if (options.openDevTools) {
      mainWindow.webContents?.openDevTools()
    }

    return mainWindow
  }

  return {
    launch,
  }
}

export function setupDesktopElectronWindowResizeIpc(params: {
  ipcMain?: DesktopElectronMainOptions['electron']['ipcMain']
  window: DesktopElectronBrowserWindowInstance
}) {
  params.ipcMain?.on('clawmuse:resize-window-to-avatar', (_event, bounds) => {
    if (!params.window.setBounds) {
      return
    }

    const nextWidth = Math.max(
      AVATAR_WINDOW_MIN_WIDTH,
      Math.min(AVATAR_WINDOW_MAX_WIDTH, Math.ceil(bounds.width + AVATAR_WINDOW_HORIZONTAL_PADDING)),
    )
    const nextHeight = Math.max(
      AVATAR_WINDOW_MIN_HEIGHT,
      Math.min(AVATAR_WINDOW_MAX_HEIGHT, Math.ceil(bounds.height + AVATAR_WINDOW_VERTICAL_PADDING)),
    )
    const currentBounds = params.window.getBounds?.()

    if (!currentBounds) {
      params.window.setBounds({
        width: nextWidth,
        height: nextHeight,
      })
      return
    }

    if (currentBounds.width === nextWidth && currentBounds.height === nextHeight) {
      return
    }

    params.window.setBounds({
      x: currentBounds.x + Math.round((currentBounds.width - nextWidth) / 2),
      y: currentBounds.y + Math.round(currentBounds.height - nextHeight),
      width: nextWidth,
      height: nextHeight,
    })
  })
}

export async function startDesktopElectronMainRuntime(params: {
  appRoot: string
  rendererUrl?: string
  openDevTools?: boolean
  imeCompatMode?: boolean
}) {
  const { app, BrowserWindow, ipcMain, Menu } = await import('electron')

  return createDesktopElectronMain({
    electron: {
      app,
      BrowserWindow,
      Menu,
      ipcMain,
    },
    appRoot: params.appRoot,
    rendererUrl: params.rendererUrl,
    openDevTools: params.openDevTools,
    imeCompatMode: params.imeCompatMode,
  }).launch()
}

export const desktopElectronMainEntrypoint = {
  id: 'desktop-electron-main',
  createDesktopElectronMain,
  resolveDesktopElectronRuntimeParams,
  resolveDesktopElectronWindowConfig,
  startDesktopElectronMainRuntime,
  shouldAutoStartDesktopElectronMain,
}

if (shouldAutoStartDesktopElectronMain({
  electronVersion: process.versions.electron,
  processArgv: process.argv,
})) {
  const runtimeParams = resolveDesktopElectronRuntimeParams({
    cwd: process.cwd(),
    env: process.env,
  })

  void startDesktopElectronMainRuntime(runtimeParams)
}
