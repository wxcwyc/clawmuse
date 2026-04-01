import { describe, expect, it } from 'vitest'

import { createNoopAvatarDriver } from './index'

describe('avatar-driver', () => {
  it('exposes a shared noop driver contract for runtime consumers', async () => {
    const driver = createNoopAvatarDriver()

    await expect(driver.setEmotion({
      emotion: 'happy',
      intensity: 0.5,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })).resolves.toBeUndefined()

    await expect(driver.playMotion({
      motion: 'wave',
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })).resolves.toBeUndefined()

    await expect(driver.setLipSync({
      value: 0.6,
      sessionKey: 'main',
      runId: 'run-1',
      ts: 100,
    })).resolves.toBeUndefined()
  })
})
