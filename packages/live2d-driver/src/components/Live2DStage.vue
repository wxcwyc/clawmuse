<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import type { Live2DFocusPoint, Live2DLoadModelInput, Live2DModelController } from '../types'

import Live2DCanvas from './Live2DCanvas.vue'
import Live2DModel from './Live2DModel.vue'

interface Live2DStageDriver {
  bindController(controller: Live2DModelController): void
  unbindController(): void
  loadModel(input: Live2DLoadModelInput): Promise<void> | void
  setLipSync(input: {
    value: number
    sessionKey: string
    runId: string
    ts: number
  }): Promise<void> | void
  setFocusAt(point: Live2DFocusPoint): Promise<void> | void
  dispose(): Promise<void> | void
}

const props = defineProps<{
  driver: Live2DStageDriver
  modelSource: string
  modelId?: string
  focusAt?: Live2DFocusPoint
  mouthOpenSize?: number
}>()
const emit = defineEmits<{
  modelBoundsChange: [bounds: { width: number, height: number }]
}>()

const modelRef = ref<InstanceType<typeof Live2DModel>>()
const isStageReady = ref(false)

const controller: Live2DModelController = {
  async loadModel(input) {
    await modelRef.value?.loadModel(input)
  },
  async setEmotion() {},
  async playMotion(input) {
    await modelRef.value?.playMotion(input)
  },
  async setMouthOpen(value) {
    await modelRef.value?.setMouthOpen(value)
  },
  async setFocusAt(point) {
    await modelRef.value?.setFocusAt(point)
  },
  async dispose() {
    await modelRef.value?.dispose()
  },
}

async function syncModel() {
  if (!props.modelSource) {
    return
  }

  await props.driver.loadModel({
    modelSource: props.modelSource,
    modelId: props.modelId,
  })

}

async function syncFocus(point?: Live2DFocusPoint) {
  if (!point) {
    return
  }

  await props.driver.setFocusAt(point)
}

async function syncMouth(value?: number) {
  if (typeof value !== 'number') {
    return
  }

  await props.driver.setLipSync({
    value,
    sessionKey: 'stage',
    runId: 'stage-mouth',
    ts: 0,
  })
}

watch(() => [props.modelSource, props.modelId] as const, () => {
  if (!isStageReady.value) {
    return
  }

  void syncModel()
})

watch(() => props.focusAt, (point) => {
  if (!isStageReady.value) {
    return
  }

  void syncFocus(point)
}, { deep: true })

watch(() => props.mouthOpenSize, (value) => {
  if (!isStageReady.value) {
    return
  }

  void syncMouth(value)
})

watch(modelRef, (model) => {
  if (!isStageReady.value || !model) {
    return
  }

  void syncModel()
  void syncFocus(props.focusAt)
  void syncMouth(props.mouthOpenSize)
})

onMounted(() => {
  props.driver.bindController(controller)
  isStageReady.value = true

  void syncModel()
  void syncFocus(props.focusAt)
  void syncMouth(props.mouthOpenSize)
})

onUnmounted(() => {
  isStageReady.value = false
  void props.driver.dispose()
  props.driver.unbindController()
})
</script>

<template>
  <div class="clawmuse-live2d-stage">
    <Live2DCanvas v-slot="{ app }">
      <Live2DModel
        ref="modelRef"
        :app="app"
        :model-source="modelSource"
        :model-id="modelId"
        @bounds-change="emit('modelBoundsChange', $event)"
      />
    </Live2DCanvas>
    <div class="clawmuse-live2d-stage__overlay">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.clawmuse-live2d-stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.clawmuse-live2d-stage__overlay {
  position: absolute;
  inset: 0;
}
</style>
