import type {
  AssistantMotionEvent,
  AvatarRuntimeInputEvent,
  AvatarRuntimeOptions,
} from './types'

interface ActiveMotionState {
  priority: number
  until: number
}

export class AvatarRuntime {
  private readonly driver: AvatarRuntimeOptions['driver']
  private readonly now: () => number
  private activeMotion: ActiveMotionState | null = null

  constructor(options: AvatarRuntimeOptions) {
    this.driver = options.driver
    this.now = options.now ?? (() => Date.now())
  }

  async consume(event: AvatarRuntimeInputEvent): Promise<void> {
    switch (event.type) {
      case 'assistant.emotion':
        await this.driver.setEmotion({
          emotion: event.emotion,
          intensity: event.intensity,
          reason: event.reason,
          sessionKey: event.sessionKey,
          runId: event.runId,
          ts: event.ts,
        })
        return

      case 'assistant.motion':
        await this.consumeMotion(event)
        return

      case 'avatar.lipsync':
        await this.driver.setLipSync({
          value: event.value,
          sessionKey: event.sessionKey,
          runId: event.runId,
          ts: event.ts,
        })
        return
    }
  }

  private async consumeMotion(event: AssistantMotionEvent): Promise<void> {
    const nextPriority = event.priority ?? 0
    const activeMotion = this.activeMotion
    const currentTime = this.now()

    if (
      activeMotion !== null
      && activeMotion.until > currentTime
      && activeMotion.priority > nextPriority
    ) {
      return
    }

    await this.driver.playMotion({
      motion: event.motion,
      priority: event.priority,
      durationMs: event.durationMs,
      sessionKey: event.sessionKey,
      runId: event.runId,
      ts: event.ts,
    })

    this.activeMotion = {
      priority: nextPriority,
      until: currentTime + (event.durationMs ?? 0),
    }
  }
}
