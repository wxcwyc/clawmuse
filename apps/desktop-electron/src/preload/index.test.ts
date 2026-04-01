import { describe, expect, it, vi } from 'vitest'

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
  },
}))

describe('desktop-electron preload bootstrap', () => {
  it('creates the renderer bridge payload', () => {
    expect(createDesktopElectronRendererBridge()).toEqual({
      platform: 'desktop-electron',
      version: '0.1.0',
      hostPlatform: expect.any(String),
      imeCompatMode: expect.any(Boolean),
      resizeWindowToAvatar: expect.any(Function),
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
      resizeWindowToAvatar: expect.any(Function),
    })
  })

  it('sends avatar resize requests to the main process', async () => {
    const { ipcRenderer } = await import('electron')
    const bridge = createDesktopElectronRendererBridge()

    bridge.resizeWindowToAvatar({
      width: 412,
      height: 688,
    })

    expect(ipcRenderer.send).toHaveBeenCalledWith('clawmuse:resize-window-to-avatar', {
      width: 412,
      height: 688,
    })
  })
})
