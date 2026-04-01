interface Window {
  Live2DCubismCore?: object
  clawmuse?: {
    platform: 'desktop-electron'
    version: string
    hostPlatform: string
    imeCompatMode: boolean
    resizeWindowToAvatar(bounds: {
      width: number
      height: number
    }): void
  }
}
