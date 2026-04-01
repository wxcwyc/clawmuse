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
}>()

type MountedLive2DModel = {
  width: number
  height: number
  x: number
  y: number
  anchor: { set: (x: number, y?: number) => void }
  scale: { set: (x: number, y?: number) => void }
  focus: (x: number, y: number) => void
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
const MODEL_FIT_FACTOR = 2.2
const MAX_STAGE_SCALE = 2.2
const MODEL_BOTTOM_PADDING = 8
const SILHOUETTE_WIDTH_FILL = 0.92
const SILHOUETTE_HEIGHT_FILL = 0.96
const SILHOUETTE_EDGE_MARGIN = 6
const SILHOUETTE_CLIP_SHRINK_RATIO = 0.92
const SILHOUETTE_ALPHA_THRESHOLD = 2

function resolveApp() {
  if (!props.app?.stage || !props.app.renderer) {
    return null
  }

  return props.app
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
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

function setViewportBounds(bounds: { width: number, height: number }) {
  viewportBounds.value = bounds
  emit('boundsChange', bounds)
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
  })
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

  const widthScale = ((app.renderer.width * 0.95) / naturalSize.width) * MODEL_FIT_FACTOR
  const heightScale = ((app.renderer.height * 0.95) / naturalSize.height) * MODEL_FIT_FACTOR
  const scale = Math.max(0.000001, Math.min(MAX_STAGE_SCALE, widthScale, heightScale))
  applyScaleAndPosition(scale)
}

async function updateViewportBounds(currentLoadVersion: number) {
  const app = resolveApp()
  if (!app) {
    return
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
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
      continue
    }

    const touchesTopEdge = silhouetteBounds.top <= SILHOUETTE_EDGE_MARGIN
    const touchesLeftEdge = silhouetteBounds.left <= SILHOUETTE_EDGE_MARGIN
    const touchesRightEdge = silhouetteBounds.right >= (app.renderer.width - SILHOUETTE_EDGE_MARGIN)

    if ((touchesTopEdge || touchesLeftEdge || touchesRightEdge) && currentStageScale.value && mountedModel.value) {
      applyScaleAndPosition(currentStageScale.value * SILHOUETTE_CLIP_SHRINK_RATIO)
      continue
    }

    const widthFitRatio = (app.renderer.width * SILHOUETTE_WIDTH_FILL) / silhouetteBounds.width
    const heightFitRatio = (app.renderer.height * SILHOUETTE_HEIGHT_FILL) / silhouetteBounds.height
    const adjustRatio = Math.min(1, widthFitRatio, heightFitRatio)

    if (adjustRatio < 0.995 && currentStageScale.value && mountedModel.value) {
      applyScaleAndPosition(currentStageScale.value * adjustRatio)
      continue
    }

    setViewportBounds({
      width: silhouetteBounds.width,
      height: silhouetteBounds.height,
    })
    return
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
  live2DModel.anchor.set(0.5, 1)
  mountedModel.value = live2DModel
  setScaleAndPosition()
  await updateViewportBounds(currentLoadVersion)
}

async function setMouthOpen(value: number) {
  getCoreModel()?.setParameterValueById('ParamMouthOpenY', clamp01(value))
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

  setScaleAndPosition()
  void updateViewportBounds(loadVersion)
})

defineExpose({
  dispose,
  getViewportBounds: () => viewportBounds.value,
  loadModel,
  playMotion,
  setFocusAt,
  setMouthOpen,
})
</script>

<template>
  <div class="clawmuse-live2d-model" :data-model-id="modelId" />
</template>
