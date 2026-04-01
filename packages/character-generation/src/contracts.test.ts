import { describe, expect, it } from 'vitest'

import {
  createGenerationRequest,
  createGenerationResult,
} from './index'

describe('character-generation contracts', () => {
  it('supports live2d and vrm generation targets with explicit tasks', () => {
    const live2dRequest = createGenerationRequest({
      targetKind: 'live2d',
      tasks: ['expression-pack', 'motion-pack'],
      sourceImages: ['file://portrait-a.png'],
      styleHints: ['anime', 'soft blush'],
    })
    const vrmRequest = createGenerationRequest({
      targetKind: 'vrm',
      tasks: ['full-character-upgrade'],
      sourceImages: ['file://portrait-b.png'],
    })

    expect(live2dRequest.targetKind).toBe('live2d')
    expect(live2dRequest.tasks).toEqual(['expression-pack', 'motion-pack'])
    expect(vrmRequest.targetKind).toBe('vrm')
    expect(vrmRequest.tasks).toEqual(['full-character-upgrade'])
  })

  it('returns manifest patches and generated file descriptors', () => {
    const result = createGenerationResult({
      jobId: 'job-1',
      status: 'completed',
      assetManifestPatch: {
        renderer: {
          kind: 'live2d',
          modelSource: 'generated://model.model3.json',
        },
        generatedExpressions: ['happy', 'shy'],
      },
      generatedFiles: [
        {
          path: 'generated/model.model3.json',
          mediaType: 'application/json',
        },
        {
          path: 'generated/expressions/happy.exp3.json',
          mediaType: 'application/json',
        },
      ],
      warnings: ['mouth motion needs review'],
    })

    expect(result).toEqual({
      jobId: 'job-1',
      status: 'completed',
      assetManifestPatch: {
        renderer: {
          kind: 'live2d',
          modelSource: 'generated://model.model3.json',
        },
        generatedExpressions: ['happy', 'shy'],
      },
      generatedFiles: [
        {
          path: 'generated/model.model3.json',
          mediaType: 'application/json',
        },
        {
          path: 'generated/expressions/happy.exp3.json',
          mediaType: 'application/json',
        },
      ],
      warnings: ['mouth motion needs review'],
    })
  })
})
