<script setup lang="ts">
import type { Application } from '@pixi/app'

import { ref, watch } from 'vue'

import { resolveLive2DModelSource } from '../asset-resolver'
import type { Live2DFocusPoint, Live2DLoadModelInput, Live2DModelController } from '../types'
import { measureCanvasSilhouetteBounds } from './live2d-silhouette'

const props = defineProps<{
  app?: Application | {
    stage?: {
      addChild: (child: unknown) => void
      removeChild: (child: unknown) => void
    }
    renderer?: {
      width: number
      height: number
    }
    view?: HTMLCanvasElement
    render?: () => void
  }
  modelSource: string
  modelId?: string
}>()
const emit = defineEmits<{
  boundsChange: [bounds: { width: number, height: number }]
  debug: [line: string]
}>()

type MountedLive2DModel = {
  width: number
  height: number
  x: number
  y: number
  anchor: { set: (x: number, y?: number) => void }
  scale: { set: (x: number, y?: number) => void }
  focus: (x: number, y: number) => void
  expression?: (name?: string) => Promise<unknown> | unknown
  motion: (group: string, index?: number, priority?: number) => Promise<unknown> | unknown
  destroy: () => void
  internalModel: {
    coreModel: {
      setParameterValueById: (id: string, value: number) => void
    }
    motionManager?: {
      definitions?: Record<string, unknown>
    }
  }
}

const mountedModel = ref<MountedLive2DModel>()
const pendingLoad = ref<Live2DLoadModelInput>()
const naturalModelSize = ref<{ width: number, height: number }>()
const viewportBounds = ref<{ width: number, height: number }>()
const currentStageScale = ref<number>()
let loadVersion = 0
const MODEL_INITIAL_COVER_RATIO = 0.9
// Keep initial overscale neutral to avoid "first large, then smaller after switches" regression.
// See docs/notes/2026-04-10-live2d-display-regression-guardrails.md
const MODEL_INITIAL_OVERSCALE = 1.0
const MODEL_MAX_SCALE = 2.2
const MODEL_BOTTOM_PADDING = 8
const SILHOUETTE_EDGE_MARGIN = 6
const SILHOUETTE_BOTTOM_EDGE_MARGIN = 1
const SILHOUETTE_ALPHA_THRESHOLD = 2
const SILHOUETTE_MAX_RETRY = 14
const SILHOUETTE_BOUNDS_ROUNDING_STEP = 1
const SILHOUETTE_MIN_WIDTH_RATIO = 0.28
const SILHOUETTE_MIN_HEIGHT_RATIO = 0.28
const SILHOUETTE_MIN_AREA_RATIO = 0.18
const SILHOUETTE_SUSPICIOUS_NARROW_WIDTH_RATIO = 0.5
const SILHOUETTE_SUSPICIOUS_NARROW_HEIGHT_RATIO = 0.72

const emotionExpressionAlias: Record<string, string | undefined> = {
  neutral: undefined,
  happy: 'F01',
  shy: 'F02',
  sad: 'F03',
  excited: 'F01',
  thinking: 'F04',
}

const emotionParameterProfiles = {
  neutral: {
    mouthForm: 0,
    eyeSmile: 0,
    browY: 0,
    eyeOpen: 1,
    angleX: 0,
    angleY: 0,
  },
  happy: {
    mouthForm: 0.5,
    eyeSmile: 0.55,
    browY: 0.18,
    eyeOpen: 0.92,
    angleX: 0.04,
    angleY: 0.02,
  },
  shy: {
    mouthForm: 0.26,
    eyeSmile: 0.38,
    browY: 0.12,
    eyeOpen: 0.86,
    angleX: -0.08,
    angleY: -0.03,
  },
  sad: {
    mouthForm: -0.34,
    eyeSmile: 0.08,
    browY: -0.22,
    eyeOpen: 0.8,
    angleX: -0.05,
    angleY: -0.08,
  },
  excited: {
    mouthForm: 0.66,
    eyeSmile: 0.44,
    browY: 0.23,
    eyeOpen: 0.95,
    angleX: 0.09,
    angleY: 0.05,
  },
  thinking: {
    mouthForm: -0.08,
    eyeSmile: 0.1,
    browY: -0.06,
    eyeOpen: 0.88,
    angleX: -0.12,
    angleY: -0.03,
  },
} as const

function resolveApp() {
  if (!props.app?.stage || !props.app.renderer) {
    return null
  }

  return props.app
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function clampSigned(value: number) {
  return Math.min(1, Math.max(-1, value))
}

function getCoreModel() {
  return mountedModel.value?.internalModel.coreModel
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0)
      return
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function resolveCanvasElement() {
  const view = resolveApp()?.view
  if (view instanceof HTMLCanvasElement) {
    return view
  }

  return undefined
}

function setViewportBounds(bounds: { width: number, height: number }, options?: { emit?: boolean }) {
  viewportBounds.value = bounds
  if (options?.emit === false) {
    return
  }
  emit('boundsChange', bounds)
}

function emitDebug(line: string) {
  const modelTag = props.modelId?.trim() || 'unknown'
  emit('debug', `model=${modelTag} ${line}`)
}

function applyScaleAndPosition(scale: number) {
  const app = resolveApp()
  const model = mountedModel.value
  const naturalSize = naturalModelSize.value
  if (!app || !model || !naturalSize) {
    return
  }

  currentStageScale.value = scale
  model.scale.set(scale, scale)
  model.x = app.renderer.width / 2
  model.y = app.renderer.height - MODEL_BOTTOM_PADDING
  setViewportBounds({
    width: naturalSize.width * scale,
    height: naturalSize.height * scale,
  }, {
    emit: false,
  })
  emitDebug(
    `apply scale=${scale.toFixed(4)} natural=${naturalSize.width.toFixed(1)}x${naturalSize.height.toFixed(1)} stage=${app.renderer.width}x${app.renderer.height}`,
  )
}

function normalizeMotionName(value: string) {
  return value
    .split(/[_-\s]+/g)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join('')
}

const motionAliasMap: Record<string, string> = {
  idle: 'Idle',
  'thinking-idle': 'Idle',
  'soft-down': 'Idle',
  'warm-wave': 'TapBody',
  'shy-smile': 'TapBody',
  'bright-bounce': 'TapBody',
}

function resolveMotionGroupName(input: string) {
  const definitions = mountedModel.value?.internalModel.motionManager?.definitions
  if (!definitions) {
    return input
  }

  const alias = motionAliasMap[input]
  if (alias && alias in definitions) {
    return alias
  }

  if (input in definitions) {
    return input
  }

  const normalizedInput = normalizeMotionName(input)
  const matched = Object.keys(definitions).find(group => (
    group === normalizedInput || group.toLowerCase() === input.toLowerCase()
  ))

  return matched ?? input
}

function resolveMotionSelection(input: string): { group: string, index?: number } {
  const trimmedInput = input.trim()
  const selectionMatch = trimmedInput.match(/^(.*?)[#@:](\d+)$/)
  if (!selectionMatch) {
    return {
      group: resolveMotionGroupName(trimmedInput),
    }
  }

  const [, rawGroup, rawIndex] = selectionMatch
  return {
    group: resolveMotionGroupName(rawGroup.trim()),
    index: Number.parseInt(rawIndex, 10),
  }
}

function setScaleAndPosition() {
  const app = resolveApp()
  const model = mountedModel.value
  const naturalSize = naturalModelSize.value
  if (!app || !model || !naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0) {
    return
  }

  const widthScale = (app.renderer.width * MODEL_INITIAL_COVER_RATIO) / naturalSize.width
  const heightScale = (app.renderer.height * MODEL_INITIAL_COVER_RATIO) / naturalSize.height
  const containScale = Math.max(0.000001, Math.min(widthScale, heightScale))
  const scale = Math.min(MODEL_MAX_SCALE, containScale * MODEL_INITIAL_OVERSCALE)
  applyScaleAndPosition(scale)
}

function roundSilhouetteSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }
  return Math.max(1, Math.round(value / SILHOUETTE_BOUNDS_ROUNDING_STEP) * SILHOUETTE_BOUNDS_ROUNDING_STEP)
}

async function updateViewportBounds(currentLoadVersion: number) {
  const app = resolveApp()
  const naturalSize = naturalModelSize.value
  if (!app) {
    return
  }
  let bestFallbackSilhouette: { width: number, height: number } | null = null

  for (let attempt = 0; attempt < SILHOUETTE_MAX_RETRY; attempt += 1) {
    app.render?.()
    await waitForNextPaint()

    if (currentLoadVersion !== loadVersion) {
      return
    }

    const canvas = resolveCanvasElement()
    if (!canvas) {
      return
    }

    const silhouetteBounds = measureCanvasSilhouetteBounds(canvas, SILHOUETTE_ALPHA_THRESHOLD)
    if (!silhouetteBounds) {
      emitDebug(`fit attempt=${attempt + 1} silhouette=none`)
      continue
    }

    const expectedWidth = naturalSize && currentStageScale.value
      ? naturalSize.width * currentStageScale.value
      : silhouetteBounds.width
    const expectedHeight = naturalSize && currentStageScale.value
      ? naturalSize.height * currentStageScale.value
      : silhouetteBounds.height
    const widthRatio = expectedWidth > 0 ? silhouetteBounds.width / expectedWidth : 1
    const heightRatio = expectedHeight > 0 ? silhouetteBounds.height / expectedHeight : 1
    const areaRatio = widthRatio * heightRatio
    const suspiciousNarrowShape = (
      heightRatio >= SILHOUETTE_SUSPICIOUS_NARROW_HEIGHT_RATIO
      && widthRatio < SILHOUETTE_SUSPICIOUS_NARROW_WIDTH_RATIO
    )
    const looksIncomplete = (
      widthRatio < SILHOUETTE_MIN_WIDTH_RATIO
      || heightRatio < SILHOUETTE_MIN_HEIGHT_RATIO
      || areaRatio < SILHOUETTE_MIN_AREA_RATIO
      || suspiciousNarrowShape
    )
    if (looksIncomplete) {
      if (
        !bestFallbackSilhouette
        || (silhouetteBounds.width * silhouetteBounds.height) > (bestFallbackSilhouette.width * bestFallbackSilhouette.height)
      ) {
        bestFallbackSilhouette = {
          width: roundSilhouetteSize(silhouetteBounds.width),
          height: roundSilhouetteSize(silhouetteBounds.height),
        }
      }
      emitDebug(
        `fit attempt=${attempt + 1} incomplete sil=${silhouetteBounds.width}x${silhouetteBounds.height} exp=${expectedWidth.toFixed(1)}x${expectedHeight.toFixed(1)} ratio=${widthRatio.toFixed(3)}x${heightRatio.toFixed(3)} area=${areaRatio.toFixed(3)} narrow=${suspiciousNarrowShape ? '1' : '0'}`,
      )
      continue
    }

    const touchesTopEdge = silhouetteBounds.top <= SILHOUETTE_EDGE_MARGIN
    const touchesLeftEdge = silhouetteBounds.left <= SILHOUETTE_EDGE_MARGIN
    const touchesRightEdge = silhouetteBounds.right >= (app.renderer.width - SILHOUETTE_EDGE_MARGIN)
    const touchesBottomEdge = silhouetteBounds.bottom >= (app.renderer.height - SILHOUETTE_BOTTOM_EDGE_MARGIN)
    // Do not shrink on bottom-only edge contact; this previously caused repeated downscaling loops.
    const shouldShrinkByEdge = (touchesTopEdge || touchesLeftEdge || touchesRightEdge)
    if (shouldShrinkByEdge && currentStageScale.value && mountedModel.value) {
      const widthRatio = silhouetteBounds.width > 0
        ? (app.renderer.width - (SILHOUETTE_EDGE_MARGIN * 2)) / silhouetteBounds.width
        : 0.92
      const heightRatio = silhouetteBounds.height > 0
        ? (app.renderer.height - (SILHOUETTE_EDGE_MARGIN * 2)) / silhouetteBounds.height
        : 0.92
      const edgeFitRatio = Math.max(0.42, Math.min(0.98, widthRatio, heightRatio))
      emitDebug(
        `fit attempt=${attempt + 1} edge top=${touchesTopEdge ? 1 : 0} left=${touchesLeftEdge ? 1 : 0} right=${touchesRightEdge ? 1 : 0} bottom=${touchesBottomEdge ? 1 : 0} sil=${silhouetteBounds.width}x${silhouetteBounds.height} edgeFit=${edgeFitRatio.toFixed(4)} scale=${currentStageScale.value.toFixed(4)}`,
      )
      applyScaleAndPosition(currentStageScale.value * edgeFitRatio)
      continue
    }

    setViewportBounds({
      width: roundSilhouetteSize(silhouetteBounds.width),
      height: roundSilhouetteSize(silhouetteBounds.height),
    })
    emitDebug(
      `fit accepted attempt=${attempt + 1} sil=${silhouetteBounds.width}x${silhouetteBounds.height} viewport=${roundSilhouetteSize(silhouetteBounds.width)}x${roundSilhouetteSize(silhouetteBounds.height)}`,
    )
    return
  }

  if (naturalSize && currentStageScale.value) {
    if (bestFallbackSilhouette) {
      setViewportBounds(bestFallbackSilhouette)
      emitDebug(
        `fit fallback silhouette viewport=${bestFallbackSilhouette.width}x${bestFallbackSilhouette.height} expected=${(naturalSize.width * currentStageScale.value).toFixed(1)}x${(naturalSize.height * currentStageScale.value).toFixed(1)}`,
      )
      return
    }
    // Fallback when silhouette sampling never stabilized (e.g. model textures still streaming):
    // keep a sane size derived from the model's natural bounds instead of shrinking to a bad sample.
    setViewportBounds({
      width: roundSilhouetteSize(naturalSize.width * currentStageScale.value),
      height: roundSilhouetteSize(naturalSize.height * currentStageScale.value),
    })
    emitDebug(
      `fit fallback viewport=${roundSilhouetteSize(naturalSize.width * currentStageScale.value)}x${roundSilhouetteSize(naturalSize.height * currentStageScale.value)} expected=${(naturalSize.width * currentStageScale.value).toFixed(1)}x${(naturalSize.height * currentStageScale.value).toFixed(1)}`,
    )
  }
}

async function dispose(params: { invalidateLoad?: boolean } = {}) {
  if (params.invalidateLoad ?? true) {
    loadVersion += 1
  }

  const app = resolveApp()
  if (mountedModel.value && app?.stage) {
    app.stage.removeChild(mountedModel.value)
    mountedModel.value.destroy()
  }

  mountedModel.value = undefined
  naturalModelSize.value = undefined
  viewportBounds.value = undefined
  currentStageScale.value = undefined
}

async function loadModel(input: Live2DLoadModelInput) {
  pendingLoad.value = input
  const currentLoadVersion = ++loadVersion

  const app = resolveApp()
  if (!app || !input.modelSource) {
    return
  }

  const resolvedModelSource = resolveLive2DModelSource(input.modelSource)

  if (!window.Live2DCubismCore) {
    console.warn('[Live2D] Cubism runtime is missing. Skipping model load.')
    return
  }

  await dispose({
    invalidateLoad: false,
  })

  const { Live2DFactory, Live2DModel } = await import('pixi-live2d-display/cubism4')
  const live2DModel = new Live2DModel() as MountedLive2DModel
  await Live2DFactory.setupLive2DModel(
    live2DModel,
    resolvedModelSource,
    { autoInteract: false },
  )

  const currentApp = resolveApp()
  if (currentLoadVersion !== loadVersion || !currentApp?.stage) {
    live2DModel.destroy()
    return
  }

  currentApp.stage.addChild(live2DModel)
  naturalModelSize.value = {
    width: live2DModel.width,
    height: live2DModel.height,
  }
  emitDebug(
    `load natural=${live2DModel.width.toFixed(1)}x${live2DModel.height.toFixed(1)} source=${resolvedModelSource}`,
  )
  live2DModel.anchor.set(0.5, 1)
  mountedModel.value = live2DModel
  setScaleAndPosition()
  await updateViewportBounds(currentLoadVersion)
}

async function setMouthOpen(value: number) {
  getCoreModel()?.setParameterValueById('ParamMouthOpenY', clamp01(value))
}

function setCoreParameter(id: string, value: number) {
  const coreModel = getCoreModel()
  if (!coreModel) {
    return
  }

  try {
    coreModel.setParameterValueById(id, value)
  }
  catch {
    // Some models do not expose every parameter. Ignore missing-parameter writes.
  }
}

async function setEmotion(input: Parameters<Live2DModelController['setEmotion']>[0]) {
  const model = mountedModel.value
  const normalizedEmotion = input.emotion in emotionParameterProfiles
    ? input.emotion
    : 'neutral'
  const profile = emotionParameterProfiles[normalizedEmotion]
  const intensity = clamp01(input.intensity)

  if (model?.expression && typeof model.expression === 'function') {
    const expressionAlias = emotionExpressionAlias[normalizedEmotion]
    try {
      await model.expression(expressionAlias)
    }
    catch {
      // Fall back to direct parameter blending when expression assets are unavailable.
    }
  }

  setCoreParameter('ParamMouthForm', clampSigned(profile.mouthForm * intensity))
  setCoreParameter('ParamEyeSmile', clamp01(profile.eyeSmile * intensity))
  setCoreParameter('ParamBrowLY', clampSigned(profile.browY * intensity))
  setCoreParameter('ParamBrowRY', clampSigned(profile.browY * intensity))

  const eyeOpen = clamp01(1 - ((1 - profile.eyeOpen) * intensity))
  setCoreParameter('ParamEyeLOpen', eyeOpen)
  setCoreParameter('ParamEyeROpen', eyeOpen)

  setCoreParameter('ParamAngleX', clampSigned(profile.angleX * intensity))
  setCoreParameter('ParamAngleY', clampSigned(profile.angleY * intensity))
}

async function setExpression(name?: string) {
  const model = mountedModel.value
  if (!model?.expression || typeof model.expression !== 'function') {
    return
  }

  const normalized = typeof name === 'string' ? name.trim() : ''
  await model.expression(normalized || undefined)
}

async function setFocusAt(point: Live2DFocusPoint) {
  mountedModel.value?.focus(point.x, point.y)
}

async function playMotion(input: Parameters<Live2DModelController['playMotion']>[0]) {
  if (!mountedModel.value) {
    return
  }

  const { MotionPriority } = await import('pixi-live2d-display/cubism4')
  const selection = resolveMotionSelection(input.motion)
  await mountedModel.value.motion(selection.group, selection.index, MotionPriority.FORCE)
}

watch(() => props.app, async () => {
  if (!pendingLoad.value) {
    return
  }

  await loadModel(pendingLoad.value)
})

watch(() => [
  props.app?.renderer?.width,
  props.app?.renderer?.height,
] as const, ([width, height], [previousWidth, previousHeight]) => {
  if (!mountedModel.value || !width || !height) {
    return
  }

  if (width === previousWidth && height === previousHeight) {
    return
  }

  if (typeof currentStageScale.value === 'number' && currentStageScale.value > 0) {
    applyScaleAndPosition(currentStageScale.value)
  }
  else {
    setScaleAndPosition()
  }
  void updateViewportBounds(loadVersion)
})

defineExpose({
  dispose,
  getViewportBounds: () => viewportBounds.value,
  loadModel,
  setExpression,
  setEmotion,
  playMotion,
  setFocusAt,
  setMouthOpen,
})
</script>

<template>
  <div class="clawmuse-live2d-model" :data-model-id="modelId" />
</template>
