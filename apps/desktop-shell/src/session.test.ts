import { describe, expect, it, vi } from 'vitest'

import { createCharacterProfile } from '../../../packages/character-profile/src/profile'

import { DesktopShellSession } from './session'

function createProfile() {
  return createCharacterProfile({
    id: 'hiyori',
    displayName: 'Hiyori',
    renderer: {
      kind: 'live2d',
      modelSource: 'assets://hiyori.model3.json',
    },
    voice: {
      defaultVoiceId: 'voice-hiyori',
    },
  })
}

describe('DesktopShellSession', () => {
  it('starts the transport and routes inbound gateway events into subtitle state', async () => {
    const listeners = new Set<(event: { event: string, payload?: unknown, seq?: number }) => void>()
    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn((listener: (event: { event: string, payload?: unknown, seq?: number }) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      request: vi.fn(async () => ({ ok: true })),
    }

    const session = new DesktopShellSession({
      transport,
      profile: createProfile(),
      synthesizer: {
        synthesize: async () => ({
          audioBuffer: new ArrayBuffer(4),
          durationMs: 250,
        }),
      },
      player: {
        play: async ({ onAmplitude }) => {
          onAmplitude?.(0.2)
          onAmplitude?.(0)
        },
      },
      avatarDriver: {
        setEmotion: vi.fn(async () => {}),
        playMotion: vi.fn(async () => {}),
        setLipSync: vi.fn(async () => {}),
      },
    })

    await session.start()

    expect(transport.start).toHaveBeenCalledTimes(1)
    expect(transport.waitForReady).toHaveBeenCalledTimes(1)

    for (const listener of listeners) {
      await listener({
        event: 'chat',
        payload: {
          runId: 'run-1',
          sessionKey: 'main',
          seq: 1,
          state: 'delta',
          message: {
            role: 'assistant',
            timestamp: 100,
            content: [{ type: 'text', text: 'Hello there.' }],
          },
        },
      })
    }

    expect(session.getSubtitleSegments()).toEqual([
      expect.objectContaining({
        type: 'assistant.segment',
        runId: 'run-1',
        text: 'Hello there.',
      }),
    ])
  })

  it('sends user messages through the transport-backed runtime and cleans up on stop', async () => {
    const listeners = new Set<(event: { event: string, payload?: unknown, seq?: number }) => void>()
    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn((listener: (event: { event: string, payload?: unknown, seq?: number }) => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }),
      request: vi.fn(async () => ({ ok: true, status: 'accepted' })),
    }

    const session = new DesktopShellSession({
      transport,
      profile: createProfile(),
      synthesizer: {
        synthesize: async () => ({
          audioBuffer: new ArrayBuffer(4),
          durationMs: 250,
        }),
      },
      player: {
        play: async () => {},
      },
      avatarDriver: {
        setEmotion: vi.fn(async () => {}),
        playMotion: vi.fn(async () => {}),
        setLipSync: vi.fn(async () => {}),
      },
    })

    await session.start()

    const events = await session.sendUserMessage({
      sessionKey: 'main',
      runId: 'run-2',
      message: 'Hi there',
    })

    expect(transport.request).toHaveBeenCalledWith('chat.send', {
      sessionKey: 'main',
      message: 'Hi there',
      thinking: undefined,
      deliver: undefined,
      timeoutMs: undefined,
      idempotencyKey: 'run-2',
    })
    expect(events[0]).toMatchObject({
      type: 'session.started',
      runId: 'run-2',
    })

    session.stop()

    expect(transport.stop).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})
