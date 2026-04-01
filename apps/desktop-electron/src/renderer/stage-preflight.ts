import { resolveLive2DModelSource } from '../../../../packages/live2d-driver/src/asset-resolver'

export interface InspectLive2DStageOptions {
  modelSource: string
  hasCubismCore?: () => boolean
  fetchImpl?: typeof fetch
}

export async function inspectLive2DStage(options: InspectLive2DStageOptions) {
  const warnings: string[] = []
  const hasCubismCore = options.hasCubismCore ?? (() => typeof window !== 'undefined' && !!window.Live2DCubismCore)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch

  if (!hasCubismCore()) {
    warnings.push('[stage] missing Live2D Cubism Core at /live2d-core/live2dcubismcore.min.js')
  }

  if (!options.modelSource.startsWith('assets://')) {
    return warnings
  }

  const resolvedModelSource = resolveLive2DModelSource(options.modelSource)

  if (!fetchImpl) {
    warnings.push(`[stage] missing Live2D model asset at ${resolvedModelSource}`)
    return warnings
  }

  try {
    const response = await fetchImpl(resolvedModelSource, { method: 'HEAD' })
    if (!response.ok) {
      warnings.push(`[stage] missing Live2D model asset at ${resolvedModelSource}`)
    }
  }
  catch {
    warnings.push(`[stage] missing Live2D model asset at ${resolvedModelSource}`)
  }

  return warnings
}
