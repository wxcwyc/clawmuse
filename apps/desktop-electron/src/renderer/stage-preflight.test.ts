import { describe, expect, it, vi } from 'vitest'

import { inspectLive2DStage } from './stage-preflight'

describe('inspectLive2DStage', () => {
  it('reports missing cubism core and missing builtin model assets for assets protocol sources', async () => {
    const warnings = await inspectLive2DStage({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      hasCubismCore: () => false,
      fetchImpl: vi.fn(async () => ({
        ok: false,
      })) as unknown as typeof fetch,
    })

    expect(warnings).toEqual([
      '[stage] missing Live2D Cubism Core at ./live2d-core/live2dcubismcore.min.js',
      '[stage] missing Live2D model asset at ./live2d/builtin-hiyori/Hiyori.model3.json',
    ])
  })

  it('returns no warnings when cubism core exists and the builtin model asset is reachable', async () => {
    const warnings = await inspectLive2DStage({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      hasCubismCore: () => true,
      fetchImpl: vi.fn(async () => ({
        ok: true,
      })) as unknown as typeof fetch,
    })

    expect(warnings).toEqual([])
  })
})
