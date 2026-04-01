import { describe, expect, it, vi } from 'vitest'

import type { AvatarDriver } from '../../avatar-driver/src/index'
import { AvatarRuntime } from './runtime'

describe('AvatarRuntime', () => {
  it('routes emotion and lip sync events to the driver', async () => {
    const driver: AvatarDriver = {
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setLipSync: vi.fn(async () => {}),
    }

    const runtime = new AvatarRuntime({ driver })

    await runtime.consume({
      type: 'assistant.emotion',
      sessionKey: 'main',
      runId: 'run-1',
      emotion: 'happy',
      intensity: 0.55,
      reason: 'greeting',
      ts: 100,
    })

    await runtime.consume({
      type: 'avatar.lipsync',
      sessionKey: 'main',
      runId: 'run-1',
      value: 0.8,
      ts: 101,
    })

    expect(driver.setEmotion).toHaveBeenCalledWith({
      emotion: 'happy',
      intensity: 0.55,
      reason: 'greeting',
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })
    expect(driver.setLipSync).toHaveBeenCalledWith({
      value: 0.8,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 101,
    })
    expect(driver.playMotion).not.toHaveBeenCalled()
  })

  it('suppresses a lower-priority motion while a stronger motion is active', async () => {
    let now = 100
    const driver: AvatarDriver = {
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setLipSync: vi.fn(async () => {}),
    }

    const runtime = new AvatarRuntime({
      driver,
      now: () => now,
    })

    await runtime.consume({
      type: 'assistant.motion',
      sessionKey: 'main',
      runId: 'run-2',
      motion: 'bright-bounce',
      priority: 2,
      durationMs: 1000,
      ts: 100,
    })

    now = 400

    await runtime.consume({
      type: 'assistant.motion',
      sessionKey: 'main',
      runId: 'run-2',
      motion: 'warm-wave',
      priority: 1,
      durationMs: 900,
      ts: 400,
    })

    expect(driver.playMotion).toHaveBeenCalledTimes(1)
    expect(driver.playMotion).toHaveBeenCalledWith({
      motion: 'bright-bounce',
      priority: 2,
      durationMs: 1000,
      sessionKey: 'main',
      runId: 'run-2',
      ts: 100,
    })
  })

  it('allows a higher-priority motion to interrupt the current one', async () => {
    let now = 100
    const driver: AvatarDriver = {
      setEmotion: vi.fn(async () => {}),
      playMotion: vi.fn(async () => {}),
      setLipSync: vi.fn(async () => {}),
    }

    const runtime = new AvatarRuntime({
      driver,
      now: () => now,
    })

    await runtime.consume({
      type: 'assistant.motion',
      sessionKey: 'main',
      runId: 'run-3',
      motion: 'idle',
      priority: 0,
      durationMs: 2000,
      ts: 100,
    })

    now = 350

    await runtime.consume({
      type: 'assistant.motion',
      sessionKey: 'main',
      runId: 'run-3',
      motion: 'shy-smile',
      priority: 2,
      durationMs: 1200,
      ts: 350,
    })

    expect(driver.playMotion).toHaveBeenCalledTimes(2)
    expect(driver.playMotion).toHaveBeenNthCalledWith(2, {
      motion: 'shy-smile',
      priority: 2,
      durationMs: 1200,
      sessionKey: 'main',
      runId: 'run-3',
      ts: 350,
    })
  })
})
