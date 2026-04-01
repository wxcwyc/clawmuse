import { contextBridge, ipcRenderer } from 'electron'

export interface DesktopElectronRendererBridge {
  platform: 'desktop-electron'
  version: string
  hostPlatform: string
  imeCompatMode: boolean
  resizeWindowToAvatar(bounds: {
    width: number
    height: number
  }): void
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
    resizeWindowToAvatar(bounds) {
      ipcRenderer.send('clawmuse:resize-window-to-avatar', bounds)
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
