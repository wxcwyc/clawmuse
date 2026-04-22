// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Live2DModel from './Live2DModel.vue'

const {
  setupLive2DModel,
  addChild,
  removeChild,
  focus,
  destroy,
  setParameterValueById,
  anchorSet,
  measureCanvasSilhouetteBounds,
} = vi.hoisted(() => ({
  setupLive2DModel: vi.fn(async () => {}),
  addChild: vi.fn(),
  removeChild: vi.fn(),
  focus: vi.fn(),
  destroy: vi.fn(),
  setParameterValueById: vi.fn(),
  anchorSet: vi.fn(),
  measureCanvasSilhouetteBounds: vi.fn(() => null),
}))
const motion = vi.fn(async () => {})
const lastScaleSet = vi.fn()

vi.mock('./live2d-silhouette', () => ({
  measureCanvasSilhouetteBounds,
}))

vi.mock('pixi-live2d-display/cubism4', () => {
  class MockLive2DModel {
    width = 400
    height = 800
    x = 0
    y = 0
    anchor = { set: anchorSet }
    scale = { set: lastScaleSet }
    internalModel = {
      coreModel: {
        setParameterValueById,
      },
      motionManager: {
        definitions: {
          Idle: [{}],
          TapBody: [{}],
        },
      },
    }

    focus = focus
    destroy = destroy
    motion = motion
  }

  return {
    Live2DFactory: {
      setupLive2DModel,
    },
    Live2DModel: MockLive2DModel,
    MotionPriority: {
      FORCE: 3,
    },
  }
})

describe('Live2DModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    measureCanvasSilhouetteBounds.mockReturnValue(null)
  })

  it('loads, updates, and disposes a pixi live2d model through the exposed controller surface', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'https://example.com/hiyori/model.model3.json',
      modelId: 'hiyori',
    })

    expect(setupLive2DModel).toHaveBeenCalledTimes(1)
    expect(addChild).toHaveBeenCalledTimes(1)

    await wrapper.vm.setMouthOpen(0.4)
    await wrapper.vm.setFocusAt({ x: 0.2, y: -0.1 })

    expect(setParameterValueById).toHaveBeenCalledWith('ParamMouthOpenY', 0.4)
    expect(focus).toHaveBeenCalledWith(0.2, -0.1)

    await wrapper.vm.dispose()

    expect(removeChild).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('caps model upscale to the shell maximum while using the widget-style fit factor', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 2000,
            height: 2000,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'https://example.com/hiyori/model.model3.json',
      modelId: 'hiyori',
    })

    expect(lastScaleSet).toHaveBeenCalledWith(2.2, 2.2)
  })

  it('bottom-aligns the avatar and shrinks it when the measured silhouette would clip the stage', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}
    measureCanvasSilhouetteBounds
      .mockReturnValueOnce({
        top: 0,
        left: 0,
        right: 479,
        bottom: 979,
        width: 480,
        height: 980,
      })
      .mockReturnValueOnce({
        top: 0,
        left: 0,
        right: 359,
        bottom: 709,
        width: 360,
        height: 710,
      })
      .mockReturnValueOnce({
        top: 18,
        left: 24,
        right: 383,
        bottom: 727,
        width: 360,
        height: 710,
      })

    const render = vi.fn()
    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 620,
            height: 760,
          },
          render,
          view: document.createElement('canvas'),
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'https://example.com/hiyori/model.model3.json',
      modelId: 'hiyori',
    })

    expect(anchorSet).toHaveBeenCalledWith(0.5, 1)
    expect(lastScaleSet.mock.calls).toHaveLength(3)
    const initialScaleCall = lastScaleSet.mock.calls[0]
    const lastScaleCall = lastScaleSet.mock.calls.at(-1)
    expect(lastScaleCall?.[0]).toBeLessThan(initialScaleCall?.[0] as number)
    expect(lastScaleCall?.[1]).toBeLessThan(initialScaleCall?.[1] as number)
    expect(render).toHaveBeenCalled()
    expect(measureCanvasSilhouetteBounds).toHaveBeenCalledWith(
      expect.any(HTMLCanvasElement),
      2,
    )
    expect(wrapper.vm.getViewportBounds()).toEqual({
      width: 360,
      height: 710,
    })
  })

  it('keeps shrinking when the measured silhouette is already clipped against the top edge', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}
    measureCanvasSilhouetteBounds
      .mockReturnValueOnce({
        top: 0,
        left: 48,
        right: 412,
        bottom: 759,
        width: 365,
        height: 760,
      })
      .mockReturnValueOnce({
        top: 18,
        left: 62,
        right: 402,
        bottom: 748,
        width: 341,
        height: 731,
      })

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 620,
            height: 760,
          },
          render: vi.fn(),
          view: document.createElement('canvas'),
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'https://example.com/hiyori/model.model3.json',
      modelId: 'hiyori',
    })

    expect(lastScaleSet).toHaveBeenCalledTimes(2)
    const initialScaleCall = lastScaleSet.mock.calls[0]
    const clippedScaleCall = lastScaleSet.mock.calls[1]
    expect(clippedScaleCall?.[0]).toBeLessThan(initialScaleCall?.[0] as number)
    expect(clippedScaleCall?.[1]).toBeLessThan(initialScaleCall?.[1] as number)
    expect(wrapper.vm.getViewportBounds()).toEqual({
      width: 341,
      height: 731,
    })
  })

  it('resolves builtin assets protocol model paths before handing them to the live2d factory', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    expect(setupLive2DModel).toHaveBeenLastCalledWith(
      expect.anything(),
      './live2d/builtin-hiyori/Hiyori.model3.json',
      { autoInteract: false },
    )
  })

  it('plays a resolved live2d motion group through the mounted model', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    await wrapper.vm.playMotion({
      motion: 'tap_body',
      priority: 2,
      durationMs: 800,
    })

    expect(motion).toHaveBeenCalledWith('TapBody', undefined, 3)
  })

  it('applies emotion changes to live2d expression/parameter channels', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    await wrapper.vm.setEmotion({
      emotion: 'happy',
      intensity: 0.75,
    })

    expect(setParameterValueById).toHaveBeenCalledWith('ParamMouthForm', expect.any(Number))
    expect(setParameterValueById).toHaveBeenCalledWith('ParamEyeSmile', expect.any(Number))
  })

  it('maps runtime semantic motion names onto available hiyori motion groups', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    await wrapper.vm.playMotion({
      motion: 'warm-wave',
      priority: 1,
      durationMs: 1800,
    })

    expect(motion).toHaveBeenCalledWith('TapBody', undefined, 3)
  })

  it('supports explicit motion selection syntax with group and index', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    await wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    await wrapper.vm.playMotion({
      motion: 'tap_body#0',
      priority: 1,
      durationMs: 1000,
    })

    expect(motion).toHaveBeenCalledWith('TapBody', 0, 3)
  })

  it('drops stale async model loads when the pixi app disappears before setup completes', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    let resolveSetup: (() => void) | undefined
    setupLive2DModel.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveSetup = resolve
    }))

    const wrapper = mount(Live2DModel, {
      props: {
        modelSource: '',
        modelId: 'builtin-hiyori',
        app: {
          stage: {
            addChild,
            removeChild,
          },
          renderer: {
            width: 1280,
            height: 720,
          },
        },
      },
    })

    const loadPromise = wrapper.vm.loadModel({
      modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      modelId: 'builtin-hiyori',
    })

    await new Promise(resolve => setTimeout(resolve, 0))

    await wrapper.setProps({
      app: undefined,
    })

    expect(resolveSetup).toBeTypeOf('function')
    resolveSetup?.()
    await loadPromise

    expect(addChild).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})
