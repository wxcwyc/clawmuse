import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('clawmuse package manifest', () => {
  it('declares the built electron main entry for electron-vite', () => {
    const packageJson = JSON.parse(readFileSync('/home/dministrator/projects/clawmuse/package.json', 'utf8')) as {
      main?: string
    }

    expect(packageJson.main).toBe('out/main/index.js')
  })
})
