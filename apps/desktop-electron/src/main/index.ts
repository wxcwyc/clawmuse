import {
  createDesktopElectronVoiceServiceController,
  type DesktopElectronVoiceServiceController,
  type DesktopElectronVoiceServiceEvent,
} from './voice-service'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

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
  forceVisibleDebug: boolean
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
  skipTaskbar?: boolean
  show?: boolean
  center?: boolean
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
  show?(): void
  focus?(): void
  setAlwaysOnTop?(flag: boolean): void
  setIgnoreMouseEvents?(ignore: boolean, options?: { forward?: boolean }): void
  webContents?: {
    openDevTools(): void
    send?(channel: string, payload: unknown): void
  }
}

type DesktopElectronMenuTemplateItem = {
  label?: string
  type?: 'normal' | 'separator' | 'checkbox'
  checked?: boolean
  submenu?: DesktopElectronMenuTemplateItem[]
  click?: (item: { checked?: boolean }) => void
}

interface DesktopElectronTrayInstance {
  setToolTip?(toolTip: string): void
  setContextMenu?(menu: unknown): void
  destroy?(): void
}

export interface DesktopElectronMainOptions {
  platform?: string
  imeCompatMode?: boolean
  forceVisibleDebug?: boolean
  electron: {
    app: {
      commandLine?: {
        appendSwitch(name: string): void
      }
      whenReady(): Promise<void>
      on(event: string, listener: () => void): void
      quit?(): void
      getAppPath?(): string
    }
    BrowserWindow:
      | (new (options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance)
      | ((options: DesktopElectronBrowserWindowOptions) => DesktopElectronBrowserWindowInstance)
    Menu?: {
      setApplicationMenu(menu: null): void
      buildFromTemplate?(template: DesktopElectronMenuTemplateItem[]): unknown
    }
    Tray?: new (image: unknown) => DesktopElectronTrayInstance
    nativeImage?: {
      createFromPath(path: string): unknown
      createFromDataURL?(dataUrl: string): unknown
      createFromBuffer?(buffer: Buffer): unknown
      createEmpty?(): unknown
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
      handle?(
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>,
      ): void
    }
  }
  appRoot: string
  rendererUrl?: string
  openDevTools?: boolean
}

const AVATAR_WINDOW_MIN_WIDTH = 320
const AVATAR_WINDOW_MIN_HEIGHT = 420
const AVATAR_WINDOW_MAX_WIDTH = 2200
const AVATAR_WINDOW_MAX_HEIGHT = 3200
const AVATAR_WINDOW_HORIZONTAL_PADDING = 8
const AVATAR_WINDOW_VERTICAL_PADDING = 12
let retainedMainWindow: DesktopElectronBrowserWindowInstance | null = null
let retainedTray: DesktopElectronTrayInstance | null = null
let nextBridgeSocketId = 1
let trayAlwaysOnTop = false
let trayClickThrough = true
let trayInteractiveRegionActive = false
const voiceServiceController = createDesktopElectronVoiceServiceController({
  emitEvent: (event: DesktopElectronVoiceServiceEvent) => {
    retainedMainWindow?.webContents?.send?.('clawmuse:voice-service-event', event)
  },
})
const bridgeSockets = new Map<number, {
  sender: {
    send(channel: string, payload: unknown): void
  }
  socket: {
    readyState: number
    send(data: string): void
    close(code?: number, reason?: string): void
  }
}>()

type DesktopElectronShellCommand =
  | { type: 'open-panel', panel: 'chat' | 'logs' | 'connection' }
  | { type: 'window.always-on-top', enabled: boolean }
  | { type: 'window.click-through', enabled: boolean }
  | { type: 'avatar.manual-motion', motion: string }
  | { type: 'avatar.switch-model', modelId: string }

export type DesktopElectronLive2DModelCatalogEntry = {
  id: string
  label: string
  source: string
  absolutePath: string
}

function emitShellCommand(command: DesktopElectronShellCommand) {
  retainedMainWindow?.webContents?.send?.('clawmuse:shell-command', command)
}

function applyWindowAlwaysOnTop(enabled: boolean) {
  trayAlwaysOnTop = enabled
  retainedMainWindow?.setAlwaysOnTop?.(enabled)
  emitShellCommand({
    type: 'window.always-on-top',
    enabled,
  })
}

function syncWindowMouseIgnoreState() {
  if (!retainedMainWindow?.setIgnoreMouseEvents) {
    return
  }
  const shouldIgnore = trayClickThrough ? !trayInteractiveRegionActive : false
  retainedMainWindow.setIgnoreMouseEvents(shouldIgnore, {
    forward: true,
  })
}

function applyWindowClickThrough(enabled: boolean) {
  trayClickThrough = enabled
  syncWindowMouseIgnoreState()
  emitShellCommand({
    type: 'window.click-through',
    enabled,
  })
}

function applyWindowInteractiveRegionActive(enabled: boolean) {
  trayInteractiveRegionActive = enabled
  if (!trayClickThrough) {
    return
  }
  syncWindowMouseIgnoreState()
}

function createTrayFallbackBmpIconBuffer(size = 24) {
  const width = Math.max(16, size)
  const height = Math.max(16, size)
  const headerBytes = 14 + 40
  const pixelBytes = width * height * 4
  const totalBytes = headerBytes + pixelBytes
  const buffer = Buffer.alloc(totalBytes)

  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(totalBytes, 2)
  buffer.writeUInt32LE(0, 6)
  buffer.writeUInt32LE(headerBytes, 10)
  buffer.writeUInt32LE(40, 14)
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  buffer.writeUInt16LE(1, 26)
  buffer.writeUInt16LE(32, 28)
  buffer.writeUInt32LE(0, 30)
  buffer.writeUInt32LE(pixelBytes, 34)
  buffer.writeInt32LE(2835, 38)
  buffer.writeInt32LE(2835, 42)
  buffer.writeUInt32LE(0, 46)
  buffer.writeUInt32LE(0, 50)

  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2
  const outerRadius = Math.min(width, height) * 0.46
  const innerRadius = outerRadius * 0.76

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt((dx * dx) + (dy * dy))
      const row = height - 1 - y
      const pixelOffset = headerBytes + ((row * width + x) * 4)

      if (distance > outerRadius) {
        buffer[pixelOffset + 3] = 0
        continue
      }

      if (distance > innerRadius) {
        buffer[pixelOffset] = 0x1e // B
        buffer[pixelOffset + 1] = 0x6a // G
        buffer[pixelOffset + 2] = 0xd9 // R
        buffer[pixelOffset + 3] = 0xff // A
        continue
      }

      buffer[pixelOffset] = 0x22 // B
      buffer[pixelOffset + 1] = 0x9c // G
      buffer[pixelOffset + 2] = 0xff // R
      buffer[pixelOffset + 3] = 0xff // A
    }
  }

  return buffer
}

function resolveTrayIcon(options: DesktopElectronMainOptions['electron']) {
  const nativeImage = options.nativeImage
  if (!nativeImage) {
    return undefined
  }

  if (typeof nativeImage.createFromBuffer === 'function') {
    try {
      const fallbackFromBuffer = nativeImage.createFromBuffer(createTrayFallbackBmpIconBuffer())
      if (fallbackFromBuffer) {
        return fallbackFromBuffer
      }
    }
    catch {
      // ignore fallback bitmap failures and continue with other resolvers
    }
  }

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    '<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">',
    '<stop offset="0%" stop-color="#f4a54a"/><stop offset="100%" stop-color="#8b4d16"/>',
    '</linearGradient></defs>',
    '<rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>',
    '<path d="M20 38c0-9 6-14 13-14 5 0 9 2 12 5l-4 4c-2-2-4-3-7-3-4 0-8 3-8 8s3 8 8 8c3 0 5-1 7-3l4 4c-3 3-7 5-12 5-8 0-13-5-13-14z" fill="#fff7ed"/>',
    '</svg>',
  ].join('')
  const fallbackDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  if (typeof nativeImage.createFromDataURL === 'function') {
    try {
      const fromDataUrl = nativeImage.createFromDataURL(fallbackDataUrl)
      if (fromDataUrl) {
        return fromDataUrl
      }
    }
    catch {
      // ignore data-url icon failures and fallback below
    }
  }

  const fromExecPath = nativeImage.createFromPath(process.execPath)
  if (fromExecPath) {
    return fromExecPath
  }
  return nativeImage.createEmpty?.()
}

function resolveModelMenuDedupKey(input: string): string {
  const direct = input.toLowerCase()
  if (direct.includes('builtin-hiyori') || direct.includes('hiyori')) {
    return 'builtin-hiyori'
  }
  if (direct.includes('openclaw-shizuku') || direct.includes('shizuku')) {
    return 'openclaw-shizuku'
  }
  if (
    direct.includes('openclaw-mao-pro')
    || direct.includes('mao_pro')
    || direct.includes('mao pro')
    || /\bmao\b/.test(direct)
  ) {
    return 'openclaw-mao-pro'
  }

  const fileLike = direct.match(/([a-z0-9_-]+)\.model(?:3)?\.json/)
  if (fileLike?.[1]) {
    return `model:${fileLike[1]}`
  }
  return direct.trim()
}

function setupDesktopElectronTray(options: DesktopElectronMainOptions, runtimeAppRoot: string) {
  if (!options.electron.Tray || !options.electron.Menu?.buildFromTemplate) {
    return
  }

  const trayIcon = resolveTrayIcon(options.electron)
  if (!trayIcon) {
    return
  }

  const tray = new options.electron.Tray(trayIcon)
  retainedTray = tray
  tray.setToolTip?.('ClawMuse')

  const showMainWindow = () => {
    retainedMainWindow?.show?.()
    retainedMainWindow?.focus?.()
  }

  const updateMenu = () => {
    const discoveredModels: DesktopElectronMenuTemplateItem[] = []
    const seenModelKeys = new Set<string>([
      'builtin-hiyori',
      'openclaw-shizuku',
      'openclaw-mao-pro',
    ])
    for (const entry of discoverLive2DModelCatalog(runtimeAppRoot).slice(0, 32)) {
      const dedupKey = resolveModelMenuDedupKey(`${entry.label} ${entry.source}`)
      if (seenModelKeys.has(dedupKey)) {
        continue
      }
      seenModelKeys.add(dedupKey)
      discoveredModels.push({
        label: entry.label,
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'avatar.switch-model',
            modelId: entry.id,
          })
        },
      })
    }

    const modelMenu: DesktopElectronMenuTemplateItem[] = [
      {
        label: 'Hiyori (Built-in)',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'avatar.switch-model',
            modelId: 'builtin-hiyori',
          })
        },
      },
      {
        label: 'Shizuku (Open-LLM-VTuber)',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'avatar.switch-model',
            modelId: 'openclaw-shizuku',
          })
        },
      },
      {
        label: 'Mao_pro (Open-LLM-VTuber)',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'avatar.switch-model',
            modelId: 'openclaw-mao-pro',
          })
        },
      },
    ]
    if (discoveredModels.length > 0) {
      modelMenu.push({
        type: 'separator',
      })
      modelMenu.push(...discoveredModels)
    }

    const template: DesktopElectronMenuTemplateItem[] = [
      {
        label: '打开聊天',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'open-panel',
            panel: 'chat',
          })
        },
      },
      {
        label: '查看日志',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'open-panel',
            panel: 'logs',
          })
        },
      },
      {
        label: '连接设置',
        click: () => {
          showMainWindow()
          emitShellCommand({
            type: 'open-panel',
            panel: 'connection',
          })
        },
      },
      {
        type: 'separator',
      },
      {
        label: '切换模型',
        submenu: modelMenu,
      },
      {
        type: 'separator',
      },
      {
        label: '测试表情动作',
        submenu: [
          {
            label: 'TapBody#0',
            click: () => {
              showMainWindow()
              emitShellCommand({
                type: 'avatar.manual-motion',
                motion: 'TapBody#0',
              })
            },
          },
          {
            label: 'Idle#0',
            click: () => {
              showMainWindow()
              emitShellCommand({
                type: 'avatar.manual-motion',
                motion: 'Idle#0',
              })
            },
          },
          {
            label: 'Idle#1',
            click: () => {
              showMainWindow()
              emitShellCommand({
                type: 'avatar.manual-motion',
                motion: 'Idle#1',
              })
            },
          },
        ],
      },
      {
        type: 'separator',
      },
      {
        label: '窗口置顶',
        type: 'checkbox',
        checked: trayAlwaysOnTop,
        click: (item) => {
          applyWindowAlwaysOnTop(Boolean(item.checked))
          updateMenu()
        },
      },
      {
        label: '鼠标穿透',
        type: 'checkbox',
        checked: trayClickThrough,
        click: (item) => {
          applyWindowClickThrough(Boolean(item.checked))
          updateMenu()
        },
      },
      {
        type: 'separator',
      },
      {
        label: '显示主窗口',
        click: () => {
          showMainWindow()
        },
      },
      {
        label: '退出',
        click: () => {
          options.electron.app.quit?.()
        },
      },
    ]
    tray.setContextMenu?.(options.electron.Menu?.buildFromTemplate?.(template))
  }

  updateMenu()
  options.electron.app.on('before-quit', () => {
    retainedTray?.destroy?.()
    retainedTray = null
  })
}

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

function hashStableText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isModelJsonPath(filename: string) {
  const lower = filename.toLowerCase()
  return lower.endsWith('.model3.json') || lower.endsWith('.model.json')
}

function collectLive2DModelJsonFiles(rootPath: string, depthLimit = 8, maxResults = 96) {
  if (!existsSync(rootPath)) {
    return [] as string[]
  }

  const normalizedRoot = resolve(rootPath)
  const queue: Array<{ dir: string, depth: number }> = [{ dir: normalizedRoot, depth: 0 }]
  const files: string[] = []

  while (queue.length > 0 && files.length < maxResults) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    let entries: Array<{ name: string, isDirectory: () => boolean, isFile: () => boolean, isSymbolicLink: () => boolean }>
    try {
      entries = readdirSync(current.dir, {
        withFileTypes: true,
      })
    }
    catch {
      continue
    }

    for (const entry of entries) {
      if (files.length >= maxResults) {
        break
      }
      if (entry.isSymbolicLink()) {
        continue
      }

      const nextPath = join(current.dir, entry.name)
      if (entry.isFile() && isModelJsonPath(entry.name)) {
        files.push(nextPath)
        continue
      }
      if (entry.isDirectory() && current.depth < depthLimit) {
        queue.push({
          dir: nextPath,
          depth: current.depth + 1,
        })
      }
    }
  }

  return files
}

function resolveLive2DCatalogRoots(appRoot: string) {
  const runtimeAppRoot = resolve(appRoot)
  const cwd = resolve(process.cwd())
  const home = resolve(homedir())
  const appRootDir = dirname(runtimeAppRoot)
  const execDir = dirname(resolve(process.execPath))

  return [
    { label: '内置资源', dir: join(runtimeAppRoot, 'out', 'renderer', 'live2d') },
    { label: '打包内置资源', dir: join(appRootDir, 'app.asar.unpacked', 'out', 'renderer', 'live2d') },
    { label: '本地后端模型', dir: join(execDir, 'voice-backend', 'Open-LLM-VTuber', 'live2d-models') },
    { label: '工作目录后端模型', dir: join(cwd, 'voice-backend', 'Open-LLM-VTuber', 'live2d-models') },
    { label: '源码 public/live2d', dir: join(cwd, 'apps', 'desktop-electron', 'src', 'renderer', 'public', 'live2d') },
    { label: 'Open-LLM-VTuber 参考模型', dir: join(home, 'projects', 'sst&tts', 'Open-LLM-VTuber', 'live2d-models') },
    {
      label: 'TEN 参考模型',
      dir: join(home, 'projects', 'sst&tts', 'ten-framework', 'ai_agents', 'agents', 'examples', 'voice-assistant-companion', 'frontend', 'public', 'models'),
    },
    { label: 'AIGirlFriend 项目', dir: join(home, 'projects', 'AIGirlFriend') },
  ]
}

function discoverLive2DModelCatalog(appRoot: string): DesktopElectronLive2DModelCatalogEntry[] {
  const roots = resolveLive2DCatalogRoots(appRoot)
  const rootSeen = new Set<string>()
  const fileSeen = new Set<string>()
  const catalog: DesktopElectronLive2DModelCatalogEntry[] = []

  for (const root of roots) {
    const normalizedRoot = resolve(root.dir)
    if (rootSeen.has(normalizedRoot)) {
      continue
    }
    rootSeen.add(normalizedRoot)

    const files = collectLive2DModelJsonFiles(normalizedRoot)
    for (const filePath of files) {
      const normalizedFile = resolve(filePath)
      if (fileSeen.has(normalizedFile)) {
        continue
      }
      fileSeen.add(normalizedFile)

      const modelName = basename(normalizedFile).replace(/\.model3?\.json$/i, '')
      const id = `scan:${hashStableText(normalizedFile.toLowerCase())}`
      const source = pathToFileURL(normalizedFile).toString()
      catalog.push({
        id,
        label: `${modelName} (${root.label})`,
        source,
        absolutePath: normalizedFile,
      })
    }
  }

  return catalog.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
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
  return Boolean(params.electronVersion)
}

export function resolveDesktopElectronRuntimeParams(params: {
  cwd: string
  appPath?: string
  processArgv?: string[]
  env: Record<string, string | undefined>
}): DesktopElectronRuntimeParams {
  const argv = params.processArgv ?? []
  const explicitCompat = params.env.ELECTRON_IME_COMPAT_MODE
  const enableCompatFromEnv = explicitCompat === '1' || explicitCompat === 'true'
  const disableCompatFromEnv = explicitCompat === '0' || explicitCompat === 'false'
  const imeCompatMode = disableCompatFromEnv
    ? false
    : enableCompatFromEnv

  const appRoot = params.appPath && params.appPath.trim().length > 0
    ? params.appPath
    : params.cwd

  const forceVisibleDebug = params.env.CLAWMUSE_FORCE_VISIBLE === '1'
    || params.env.CLAWMUSE_FORCE_VISIBLE === 'true'
    || argv.includes('--force-visible')
  const openDevTools = params.env.OPEN_DEVTOOLS === '1'
    || argv.includes('--open-devtools')

  return {
    appRoot,
    rendererUrl: params.env.ELECTRON_RENDERER_URL,
    openDevTools,
    imeCompatMode,
    forceVisibleDebug,
  }
}

export function createDesktopElectronMain(options: DesktopElectronMainOptions) {
  async function launch() {
    const runtimePlatform = options.platform ?? process.platform
    const forceVisibleDebug = options.forceVisibleDebug ?? false
    if (runtimePlatform === 'linux') {
      // Linux transparent windows rely on these chromium switches.
      options.electron.app.commandLine?.appendSwitch('enable-transparent-visuals')
      options.electron.app.commandLine?.appendSwitch('ignore-gpu-blocklist')
      options.electron.app.commandLine?.appendSwitch('enable-unsafe-swiftshader')
    }

    await options.electron.app.whenReady()
    options.electron.Menu?.setApplicationMenu(null)

    const runtimeAppRoot = (() => {
      try {
        const detected = options.electron.app.getAppPath?.()
        if (detected && detected.trim().length > 0) {
          return detected
        }
      }
      catch {
        // fallback below
      }
      return options.appRoot
    })()

    const config = resolveDesktopElectronWindowConfig({
      appRoot: runtimeAppRoot,
      rendererUrl: options.rendererUrl,
    })

    const windowOptions: DesktopElectronBrowserWindowOptions = {
      width: forceVisibleDebug ? 1120 : 920,
      height: forceVisibleDebug ? 820 : 1180,
      minWidth: AVATAR_WINDOW_MIN_WIDTH,
      minHeight: AVATAR_WINDOW_MIN_HEIGHT,
      resizable: forceVisibleDebug ? true : false,
      title: 'ClawMuse',
      backgroundColor: forceVisibleDebug
        ? '#10131a'
        : (options.imeCompatMode ? '#18120d' : 'rgba(0, 0, 0, 0)'),
      autoHideMenuBar: forceVisibleDebug ? false : true,
      skipTaskbar: forceVisibleDebug ? false : true,
      frame: forceVisibleDebug ? true : (options.imeCompatMode ? true : false),
      transparent: forceVisibleDebug ? false : (options.imeCompatMode ? false : true),
      hasShadow: forceVisibleDebug ? true : (options.imeCompatMode ? true : false),
      show: true,
      center: true,
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
    retainedMainWindow = mainWindow
    applyWindowAlwaysOnTop(trayAlwaysOnTop)
    applyWindowClickThrough(trayClickThrough)
    if (forceVisibleDebug) {
      mainWindow.setAlwaysOnTop?.(false)
      mainWindow.show?.()
      mainWindow.focus?.()
    }
    setupDesktopElectronTray(options, runtimeAppRoot)
    setupDesktopElectronWindowResizeIpc({
      ipcMain: options.electron.ipcMain,
      window: mainWindow,
    })
    setupDesktopElectronNodeWebSocketBridgeIpc({
      ipcMain: options.electron.ipcMain,
    })
    setupDesktopElectronVoiceServiceIpc({
      ipcMain: options.electron.ipcMain,
      controller: voiceServiceController,
    })
    setupDesktopElectronLive2DCatalogIpc({
      ipcMain: options.electron.ipcMain,
      appRoot: runtimeAppRoot,
    })

    try {
      if (config.rendererUrl) {
        await mainWindow.loadURL(config.rendererUrl)
      } else {
        await mainWindow.loadFile(config.rendererHtmlPath)
      }
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const fallbackHtml = [
        '<html><body style="background:#0f1116;color:#f4f7ff;font-family:Segoe UI,Arial,sans-serif;padding:16px;">',
        '<h3>ClawMuse Renderer Load Failed</h3>',
        `<p>reason: ${reason}</p>`,
        `<p>appRoot: ${runtimeAppRoot}</p>`,
        `<p>rendererHtmlPath: ${config.rendererHtmlPath}</p>`,
        `<p>rendererUrl: ${config.rendererUrl ?? '(none)'}</p>`,
        `<p>forceVisibleDebug: ${forceVisibleDebug ? '1' : '0'}</p>`,
        '</body></html>',
      ].join('')
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`
      await mainWindow.loadURL(dataUrl)
      mainWindow.show?.()
      mainWindow.focus?.()
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

  params.ipcMain?.handle?.('clawmuse:set-window-interactive-region-active', (_event, rawEnabled) => {
    applyWindowInteractiveRegionActive(Boolean(rawEnabled))
    return true
  })

  params.ipcMain?.handle?.('clawmuse:drag-window-by', (_event, rawDx, rawDy) => {
    if (!params.window.setBounds || !params.window.getBounds) {
      return false
    }
    const dx = Number(rawDx)
    const dy = Number(rawDy)
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return false
    }
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return true
    }

    const currentBounds = params.window.getBounds()
    params.window.setBounds({
      x: Math.round(currentBounds.x + dx),
      y: Math.round(currentBounds.y + dy),
      width: currentBounds.width,
      height: currentBounds.height,
    })
    return true
  })
}

async function parseWebSocketMessageData(data: unknown): Promise<string> {
  if (data && typeof data === 'object' && 'data' in data) {
    return await parseWebSocketMessageData((data as { data?: unknown }).data)
  }
  if (typeof data === 'string') {
    return data
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buffer = await data.arrayBuffer()
    return Buffer.from(buffer).toString('utf8')
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  return String(data ?? '')
}

export function setupDesktopElectronNodeWebSocketBridgeIpc(params: {
  ipcMain?: DesktopElectronMainOptions['electron']['ipcMain']
}) {
  const ipcMain = params.ipcMain
  if (!ipcMain?.handle) {
    return
  }

  ipcMain.handle('clawmuse:ws-create', (event, rawUrl) => {
    if (typeof rawUrl !== 'string' || !/^wss?:\/\//i.test(rawUrl)) {
      throw new Error('invalid websocket url')
    }

    const sender = (event as { sender?: { send(channel: string, payload: unknown): void } }).sender
    if (!sender || typeof sender.send !== 'function') {
      throw new Error('ipc sender unavailable')
    }

    const socketId = nextBridgeSocketId++
    const socket = new WebSocket(rawUrl) as unknown as {
      readyState: number
      binaryType?: string
      send(data: string): void
      close(code?: number, reason?: string): void
      addEventListener(type: string, listener: (event: unknown) => void): void
    }
    try {
      socket.binaryType = 'arraybuffer'
    }
    catch {
      // ignore runtimes that do not expose binaryType
    }
    bridgeSockets.set(socketId, {
      sender,
      socket,
    })

    socket.addEventListener('open', () => {
      sender.send('clawmuse:ws-event', {
        socketId,
        type: 'open',
      })
    })
    socket.addEventListener('message', (event) => {
      void (async () => {
        const parsed = await parseWebSocketMessageData(event)
        sender.send('clawmuse:ws-event', {
          socketId,
          type: 'message',
          data: parsed,
        })
      })()
    })
    socket.addEventListener('error', (errorEvent) => {
      sender.send('clawmuse:ws-event', {
        socketId,
        type: 'error',
        message: errorEvent instanceof Error ? errorEvent.message : 'node websocket error',
      })
    })
    socket.addEventListener('close', (closeEvent) => {
      const typedCloseEvent = closeEvent as {
        code?: unknown
        reason?: unknown
      }
      sender.send('clawmuse:ws-event', {
        socketId,
        type: 'close',
        code: typeof typedCloseEvent.code === 'number' ? typedCloseEvent.code : 1000,
        reason: typeof typedCloseEvent.reason === 'string' ? typedCloseEvent.reason : '',
      })
      bridgeSockets.delete(socketId)
    })

    return socketId
  })

  ipcMain.handle('clawmuse:ws-ready-state', (_event, rawSocketId) => {
    const socketId = typeof rawSocketId === 'number' ? rawSocketId : Number(rawSocketId)
    const entry = bridgeSockets.get(socketId)
    return entry ? entry.socket.readyState : 3
  })

  ipcMain.handle('clawmuse:ws-send', (_event, rawSocketId, rawPayload) => {
    const socketId = typeof rawSocketId === 'number' ? rawSocketId : Number(rawSocketId)
    const entry = bridgeSockets.get(socketId)
    if (!entry) {
      return false
    }
    if (typeof rawPayload !== 'string') {
      throw new Error('invalid websocket payload')
    }
    entry.socket.send(rawPayload)
    return true
  })

  ipcMain.handle('clawmuse:ws-close', (_event, rawSocketId, rawCode, rawReason) => {
    const socketId = typeof rawSocketId === 'number' ? rawSocketId : Number(rawSocketId)
    const entry = bridgeSockets.get(socketId)
    if (!entry) {
      return false
    }
    const code = typeof rawCode === 'number' ? rawCode : undefined
    const reason = typeof rawReason === 'string' ? rawReason : undefined
    entry.socket.close(code, reason)
    bridgeSockets.delete(socketId)
    return true
  })
}

export function setupDesktopElectronVoiceServiceIpc(params: {
  ipcMain?: DesktopElectronMainOptions['electron']['ipcMain']
  controller?: DesktopElectronVoiceServiceController
}) {
  const ipcMain = params.ipcMain
  if (!ipcMain?.handle) {
    return
  }

  const controller = params.controller ?? voiceServiceController

  ipcMain.handle('clawmuse:voice-service-start', async () => {
    return await controller.start()
  })

  ipcMain.handle('clawmuse:voice-service-stop', async () => {
    return await controller.stop()
  })

  ipcMain.handle('clawmuse:voice-service-status', () => {
    return controller.getStatus()
  })

  ipcMain.handle('clawmuse:voice-service-speakers', async (_event, request) => {
    const normalizedRequest = (
      request && typeof request === 'object'
        ? request as Parameters<DesktopElectronVoiceServiceController['listSpeakers']>[0]
        : undefined
    )
    return await controller.listSpeakers(normalizedRequest)
  })
}

export function setupDesktopElectronLive2DCatalogIpc(params: {
  ipcMain?: DesktopElectronMainOptions['electron']['ipcMain']
  appRoot: string
}) {
  const ipcMain = params.ipcMain
  if (!ipcMain?.handle) {
    return
  }

  ipcMain.handle('clawmuse:scan-live2d-models', () => {
    return discoverLive2DModelCatalog(params.appRoot)
  })
}

export async function startDesktopElectronMainRuntime(params: {
  appRoot: string
  rendererUrl?: string
  openDevTools?: boolean
  imeCompatMode?: boolean
  forceVisibleDebug?: boolean
}) {
  const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = await import('electron')

  return createDesktopElectronMain({
    electron: {
      app,
      BrowserWindow,
      Menu,
      Tray,
      nativeImage,
      ipcMain,
    },
    appRoot: params.appRoot,
    rendererUrl: params.rendererUrl,
    openDevTools: params.openDevTools,
    imeCompatMode: params.imeCompatMode,
    forceVisibleDebug: params.forceVisibleDebug,
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
  void (async () => {
    let detectedAppPath: string | undefined
    try {
      const { app } = await import('electron')
      const appPath = app.getAppPath?.()
      if (appPath && appPath.trim().length > 0) {
        detectedAppPath = appPath
      }
    }
    catch {
      // fallback to cwd when app path cannot be detected
    }

    const runtimeParams = resolveDesktopElectronRuntimeParams({
      cwd: process.cwd(),
      appPath: detectedAppPath,
      processArgv: process.argv,
      env: process.env,
    })

    void startDesktopElectronMainRuntime(runtimeParams)
  })()
}
