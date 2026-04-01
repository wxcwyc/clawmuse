import { describe, expect, it } from 'vitest'

import { resolveLive2DModelSource } from './asset-resolver'

describe('resolveLive2DModelSource', () => {
  it('maps builtin assets protocol paths into renderer-served live2d asset URLs', () => {
    expect(resolveLive2DModelSource('assets://builtin-hiyori/Hiyori.model3.json')).toBe('/live2d/builtin-hiyori/Hiyori.model3.json')
  })

  it('leaves already-resolved non-assets sources unchanged', () => {
    expect(resolveLive2DModelSource('https://example.com/model.model3.json')).toBe('https://example.com/model.model3.json')
    expect(resolveLive2DModelSource('generated://model.model3.json')).toBe('generated://model.model3.json')
  })
})
