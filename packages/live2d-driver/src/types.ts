import type {
  AvatarDriver,
  AvatarEmotionInput,
  AvatarMotionInput,
} from '../../avatar-driver/src/index'

export interface Live2DLoadModelInput {
  modelSource: string
  modelId?: string
}

export interface Live2DFocusPoint {
  x: number
  y: number
}

export interface Live2DModelController {
  loadModel(input: Live2DLoadModelInput): Promise<void> | void
  setEmotion(input: Pick<AvatarEmotionInput, 'emotion' | 'intensity'>): Promise<void> | void
  setExpression?(name?: string): Promise<void> | void
  playMotion(input: Pick<AvatarMotionInput, 'motion' | 'priority' | 'durationMs'>): Promise<void> | void
  setMouthOpen(value: number): Promise<void> | void
  setFocusAt(point: Live2DFocusPoint): Promise<void> | void
  dispose(): Promise<void> | void
}

export interface Live2DDriverOptions {
  createController?: () => Live2DModelController
}

export interface Live2DDriverContract extends AvatarDriver {
  loadModel(input: Live2DLoadModelInput): Promise<void>
  setFocusAt(point: Live2DFocusPoint): Promise<void>
  dispose(): Promise<void>
}
