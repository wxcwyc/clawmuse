import { describe, expect, it, vi } from 'vitest'

import { Live2DDriver } from './driver'

describe('Live2DDriver', () => {
  it('supports binding and unbinding a controller after driver creation', async () => {
    const controller = {
      loadModel: vi.fn(async () => {}),
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setMouthOpen: vi.fn(async () => {}),
      setFocusAt: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    }

    const driver = new Live2DDriver()

    await expect(driver.loadModel({
      modelSource: 'assets://noop/model.model3.json',
      modelId: 'noop',
    })).resolves.toBeUndefined()

    driver.bindController(controller)

    await driver.loadModel({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
    await driver.setLipSync({
      value: 0.4,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })
    await driver.setFocusAt({ x: 12, y: 34 })

    expect(controller.loadModel).toHaveBeenCalledWith({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
    expect(controller.setMouthOpen).toHaveBeenCalledWith(0.4)
    expect(controller.setFocusAt).toHaveBeenCalledWith({ x: 12, y: 34 })

    driver.unbindController()

    await expect(driver.dispose()).resolves.toBeUndefined()
    expect(controller.dispose).not.toHaveBeenCalled()
  })

  it('loads one builtin model through the live2d model controller', async () => {
    const controller = {
      loadModel: vi.fn(async () => {}),
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setMouthOpen: vi.fn(async () => {}),
      setFocusAt: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    }

    const driver = new Live2DDriver({
      createController: () => controller,
    })

    await driver.loadModel({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })

    expect(controller.loadModel).toHaveBeenCalledWith({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
  })

  it('maps lip sync, emotion, and motion into the migrated model controller', async () => {
    const controller = {
      loadModel: vi.fn(async () => {}),
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setMouthOpen: vi.fn(async () => {}),
      setFocusAt: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    }

    const driver = new Live2DDriver({
      createController: () => controller,
    })

    await driver.loadModel({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
    await driver.setLipSync({
      value: 1.5,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })
    await driver.setEmotion({
      emotion: 'shy',
      intensity: 0.7,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 101,
    })
    await driver.playMotion({
      motion: 'warm-wave',
      priority: 2,
      durationMs: 1800,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 102,
    })

    expect(controller.setMouthOpen).toHaveBeenCalledWith(1)
    expect(controller.setEmotion).toHaveBeenCalledWith({
      emotion: 'shy',
      intensity: 0.7,
    })
    expect(controller.playMotion).toHaveBeenCalledWith({
      motion: 'warm-wave',
      priority: 2,
      durationMs: 1800,
    })
  })

  it('supports pointer focus updates and disposal', async () => {
    const controller = {
      loadModel: vi.fn(async () => {}),
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setMouthOpen: vi.fn(async () => {}),
      setFocusAt: vi.fn(async () => {}),
      dispose: vi.fn(async () => {}),
    }

    const driver = new Live2DDriver({
      createController: () => controller,
    })

    await driver.loadModel({
      modelSource: 'assets://hiyori/model.model3.json',
      modelId: 'hiyori',
    })
    await driver.setFocusAt({ x: 120, y: 340 })
    await driver.dispose()

    expect(controller.setFocusAt).toHaveBeenCalledWith({ x: 120, y: 340 })
    expect(controller.dispose).toHaveBeenCalledTimes(1)
  })
})
