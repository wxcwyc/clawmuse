// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'

vi.mock('./Live2DCanvas.vue', () => ({
  default: {
    template: '<div class="canvas-stub"><slot :app="{}" /></div>',
  },
}))

vi.mock('./Live2DModel.vue', () => ({
  default: {
    template: '<div class="model-stub" />',
  },
}))

import Live2DStage from './Live2DStage.vue'

describe('Live2DStage', () => {
  it('orchestrates model load, focus, mouth updates, and teardown through the shared driver', async () => {
    const driver = {
      bindController: vi.fn(),
      unbindController: vi.fn(),
      loadModel: vi.fn(async () => {}),
      setLipSync: vi.fn(async () => {}),
      setFocusAt: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    }

    const wrapper = shallowMount(Live2DStage, {
      props: {
        driver,
        modelSource: 'assets://hiyori/model.model3.json',
        modelId: 'hiyori',
        focusAt: { x: 10, y: 20 },
        mouthOpenSize: 0.25,
      },
      slots: {
        default: '<div class="overlay">overlay</div>',
      },
    })

    expect(driver.bindController).toHaveBeenCalledTimes(1)
    expect(driver.loadModel).toHaveBeenCalledWith({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
    expect(driver.setFocusAt).toHaveBeenCalledWith({ x: 10, y: 20 })
    expect(driver.setLipSync).toHaveBeenCalledWith({
      value: 0.25,
      sessionKey: 'stage',
      runId: 'stage-mouth',
      ts: 0,
    })

    await wrapper.setProps({
      focusAt: { x: 30, y: 40 },
      mouthOpenSize: 0.6,
    })

    expect(driver.setFocusAt).toHaveBeenLastCalledWith({ x: 30, y: 40 })
    expect(driver.setLipSync).toHaveBeenLastCalledWith({
      value: 0.6,
      sessionKey: 'stage',
      runId: 'stage-mouth',
      ts: 0,
    })

    await wrapper.unmount()

    expect(driver.dispose).toHaveBeenCalledTimes(1)
    expect(driver.unbindController).toHaveBeenCalledTimes(1)
  })
})
