import { describe, expect, it, vi } from 'vitest'

import { createCharacterProfile } from '../../../packages/character-profile/src/profile'

import { HeadlessDemo } from './headless-demo'

function createProfile() {
  return createCharacterProfile({
    id: 'demo',
    displayName: 'ClawMuse Demo',
    renderer: {
      kind: 'live2d',
      modelSource: 'assets://demo.model3.json',
    },
    voice: {
      defaultVoiceId: 'voice-demo',
    },
  })
}

describe('HeadlessDemo', () => {
  it('starts, sends a message, logs subtitle events, and resolves on assistant completion', async () => {
    const listeners = new Set<(event: { event: string, payload?: unknown, seq?: number }) => void>()
    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn((listener: (event: { event: string, payload?: unknown, seq?: number }) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      request: vi.fn(async (method: string, payload: { idempotencyKey?: string, sessionKey?: string }) => {
        if (method === 'chat.send') {
          queueMicrotask(() => {
            for (const listener of listeners) {
              listener({
                event: 'chat',
                payload: {
                  runId: payload.idempotencyKey,
                  sessionKey: payload.sessionKey,
                  seq: 1,
                  state: 'delta',
                  message: {
                    role: 'assistant',
                    timestamp: 100,
                    content: [{ type: 'text', text: 'Hello there.' }],
                  },
                },
              })
              listener({
                event: 'chat',
                payload: {
                  runId: payload.idempotencyKey,
                  sessionKey: payload.sessionKey,
                  seq: 2,
                  state: 'final',
                  message: {
                    role: 'assistant',
                    timestamp: 101,
                    content: [{ type: 'text', text: 'Hello there.' }],
                  },
                },
              })
            }
          })
        }

        return { ok: true, status: 'accepted' }
      }),
    }
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    const demo = new HeadlessDemo({
      transport,
      profile: createProfile(),
      logger,
    })

    await demo.start()
    const result = await demo.sendMessageAndWait({
      sessionKey: 'main',
      runId: 'run-1',
      message: 'Hi',
    })
    demo.stop()

    expect(transport.start).toHaveBeenCalledTimes(1)
    expect(transport.stop).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      type: 'assistant.completed',
      runId: 'run-1',
      finalText: 'Hello there.',
    })
    expect(logger.info).toHaveBeenCalledWith('[session] connected')
    expect(logger.info).toHaveBeenCalledWith('[subtitle] Hello there.')
    expect(logger.info).toHaveBeenCalledWith('[assistant] completed run-1')
    expect(demo.getSubtitleSegments()).toEqual([
      expect.objectContaining({
        text: 'Hello there.',
      }),
    ])
  })

  it('rejects when the assistant emits an error event', async () => {
    const listeners = new Set<(event: { event: string, payload?: unknown, seq?: number }) => void>()
    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn((listener: (event: { event: string, payload?: unknown, seq?: number }) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      request: vi.fn(async (method: string, payload: { idempotencyKey?: string, sessionKey?: string }) => {
        if (method === 'chat.send') {
          queueMicrotask(() => {
            for (const listener of listeners) {
              listener({
                event: 'chat',
                payload: {
                  runId: payload.idempotencyKey,
                  sessionKey: payload.sessionKey,
                  seq: 1,
                  state: 'error',
                  errorMessage: 'provider unavailable',
                },
              })
            }
          })
        }

        return { ok: true, status: 'accepted' }
      }),
    }
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    const demo = new HeadlessDemo({
      transport,
      profile: createProfile(),
      logger,
    })

    await demo.start()

    await expect(demo.sendMessageAndWait({
      sessionKey: 'main',
      runId: 'run-err',
      message: 'Hi',
    })).rejects.toThrow('provider unavailable')

    expect(logger.error).toHaveBeenCalledWith('[assistant] error run-err: provider unavailable')
  })
})
