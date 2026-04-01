import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import config from './electron.vite.config'

describe('desktop-electron electron-vite config', () => {
  it('declares a renderer rollup input and ships an index.html entry file', () => {
    const renderer = config.renderer as {
      root?: string
      build?: {
        rollupOptions?: {
          input?: unknown
        }
      }
    }

    expect(renderer.root).toBe(resolve('/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer'))
    expect(renderer.build?.rollupOptions?.input).toBeTruthy()
    expect(existsSync(resolve('/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/index.html'))).toBe(true)
  })
})
