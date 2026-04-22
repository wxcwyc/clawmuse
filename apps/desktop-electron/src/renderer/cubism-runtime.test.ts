// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { ensureCubismRuntimeScript } from './cubism-runtime'

describe('ensureCubismRuntimeScript', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('appends the cubism runtime script when it is missing', async () => {
    const promise = ensureCubismRuntimeScript()
    const script = document.querySelector('script[src="./live2d-core/live2dcubismcore.min.js"]') as HTMLScriptElement | null

    expect(script).toBeTruthy()

    script?.dispatchEvent(new Event('load'))

    await expect(promise).resolves.toBe(true)
  })

  it('reuses the existing script tag instead of appending duplicates', async () => {
    const existing = document.createElement('script')
    existing.src = './live2d-core/live2dcubismcore.min.js'
    document.head.appendChild(existing)

    const promise = ensureCubismRuntimeScript()

    existing.dispatchEvent(new Event('load'))

    await expect(promise).resolves.toBe(true)
    expect(document.querySelectorAll('script[src="./live2d-core/live2dcubismcore.min.js"]')).toHaveLength(1)
  })
})
