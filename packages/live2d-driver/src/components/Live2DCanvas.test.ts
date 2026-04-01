// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Live2DCanvas from './Live2DCanvas.vue'

const { appDestroy, appHasTicker, extensionsAdd, registerTicker, tickerAdd, tickerRemove } = vi.hoisted(() => ({
  appDestroy: vi.fn(),
  appHasTicker: { value: true },
  extensionsAdd: vi.fn(),
  registerTicker: vi.fn(),
  tickerAdd: vi.fn(),
  tickerRemove: vi.fn(),
}))
const rendererResize = vi.fn()
let resizeObserverCallback: ResizeObserverCallback | undefined

vi.mock('@pixi/app', () => {
  return {
    Application: class MockApplication {
      view = document.createElement('canvas')
      stage = {
        scale: {
          set: vi.fn(),
        },
      }
      renderer = {
        resize: rendererResize,
      }
      ticker = appHasTicker.value ? {
        add: tickerAdd,
        remove: tickerRemove,
        maxFPS: 0,
        stop: vi.fn(),
      } : undefined
      render = vi.fn()

      destroy = appDestroy
    },
  }
})

vi.mock('@pixi/extensions', () => ({
  extensions: {
    add: extensionsAdd,
  },
}))

vi.mock('@pixi/ticker', () => ({
  Ticker: class MockTicker {},
  TickerPlugin: Symbol('TickerPlugin'),
}))

vi.mock('pixi-live2d-display/cubism4', () => ({
  Live2DModel: {
    registerTicker,
  },
}))

describe('Live2DCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    appHasTicker.value = true
    resizeObserverCallback = undefined
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback
      }

      observe() {}
      disconnect() {}
    })
  })

  it('creates a pixi application and mounts its canvas into the stage container', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DCanvas)

    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(registerTicker).toHaveBeenCalledTimes(1)
    expect(extensionsAdd).toHaveBeenCalledTimes(1)
    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(rendererResize).toHaveBeenCalled()

    wrapper.unmount()

    expect(appDestroy).toHaveBeenCalledTimes(1)
  })

  it('does not crash when the pixi application has no ticker instance', async () => {
    appHasTicker.value = false
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DCanvas)

    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(wrapper.find('canvas').exists()).toBe(true)
    expect(tickerRemove).not.toHaveBeenCalled()
    expect(tickerAdd).not.toHaveBeenCalled()

    wrapper.unmount()

    expect(appDestroy).toHaveBeenCalled()
  })

  it('resizes the pixi renderer when the stage container changes size', async () => {
    ;(window as typeof window & { Live2DCubismCore?: object }).Live2DCubismCore = {}

    const wrapper = mount(Live2DCanvas)
    const container = wrapper.get('.clawmuse-live2d-canvas').element as HTMLDivElement
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 480 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 720 })

    resizeObserverCallback?.([], {} as ResizeObserver)

    expect(rendererResize).toHaveBeenLastCalledWith(480, 720)
  })
})
