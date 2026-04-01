import type {
  AvatarEmotionInput,
  AvatarLipSyncInput,
  AvatarMotionInput,
} from '../../avatar-driver/src/index'

import type {
  Live2DDriverContract,
  Live2DDriverOptions,
  Live2DFocusPoint,
  Live2DLoadModelInput,
  Live2DModelController,
} from './types'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function createNoopLive2DModelController(): Live2DModelController {
  return {
    async loadModel() {},
    async setEmotion() {},
    async playMotion() {},
    async setMouthOpen() {},
    async setFocusAt() {},
    async dispose() {},
  }
}

export class Live2DDriver implements Live2DDriverContract {
  private controller: Live2DModelController

  constructor(options: Live2DDriverOptions = {}) {
    this.controller = options.createController?.() ?? createNoopLive2DModelController()
  }

  bindController(controller: Live2DModelController) {
    this.controller = controller
  }

  unbindController() {
    this.controller = createNoopLive2DModelController()
  }

  async loadModel(input: Live2DLoadModelInput): Promise<void> {
    await this.controller.loadModel(input)
  }

  async setEmotion(input: AvatarEmotionInput): Promise<void> {
    await this.controller.setEmotion({
      emotion: input.emotion,
      intensity: input.intensity,
    })
  }

  async playMotion(input: AvatarMotionInput): Promise<void> {
    await this.controller.playMotion({
      motion: input.motion,
      priority: input.priority,
      durationMs: input.durationMs,
    })
  }

  async setLipSync(input: AvatarLipSyncInput): Promise<void> {
    await this.controller.setMouthOpen(clamp01(input.value))
  }

  async setFocusAt(point: Live2DFocusPoint): Promise<void> {
    await this.controller.setFocusAt(point)
  }

  async dispose(): Promise<void> {
    await this.controller.dispose()
  }
}
