import { describe, expect, it, vi } from 'vitest'

import { OpenClawGatewayChatAdapter } from '../../../packages/openclaw-adapter/src/adapter'
import type { OpenClawGatewayTransport } from '../../../packages/openclaw-adapter/src/types'
import { SessionOrchestrator } from '../../../packages/session-orchestrator/src/orchestrator'

import { DesktopShellRuntime } from './runtime'

describe('DesktopShellRuntime', () => {
  function createTransport(): OpenClawGatewayTransport {
    return {
      request: vi.fn(async () => ({ ok: true })),
      onEvent: vi.fn(() => () => {}),
    }
  }

  it('sends user messages through the adapter and emits session.started', async () => {
    const transport = createTransport()
    const adapter = new OpenClawGatewayChatAdapter(transport)
    const onEvent = vi.fn()
    const runtime = new DesktopShellRuntime({
      adapter,
      orchestrator: new SessionOrchestrator({ voiceId: 'voice-1' }),
      speechRuntime: {
        enqueue: vi.fn(async () => []),
      },
      avatarRuntime: {
        consume: vi.fn(async () => {}),
      },
      onEvent,
    })

    const events = await runtime.sendUserMessage({
      sessionKey: 'main',
      runId: 'run-1',
      message: 'Hello?',
    })

    expect(transport.request).toHaveBeenCalledWith('chat.send', {
      sessionKey: 'main',
      message: 'Hello?',
      thinking: undefined,
      deliver: undefined,
      timeoutMs: undefined,
      idempotencyKey: 'run-1',
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'session.started',
        sessionKey: 'main',
        runId: 'run-1',
      }),
    ])
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.started',
      runId: 'run-1',
    }))
  })

  it('routes gateway chat events through subtitles, speech, and avatar runtimes', async () => {
    const transport = createTransport()
    const adapter = new OpenClawGatewayChatAdapter(transport)
    const speechRuntime = {
      enqueue: vi.fn(async (chunk: { sessionKey: string, runId: string, segmentId: string, ts: number }) => ([
        {
          type: 'tts.audio' as const,
          sessionKey: chunk.sessionKey,
          runId: chunk.runId,
          segmentId: chunk.segmentId,
          audioBuffer: new ArrayBuffer(8),
          durationMs: 500,
          ts: chunk.ts,
        },
        {
          type: 'avatar.lipsync' as const,
          sessionKey: chunk.sessionKey,
          runId: chunk.runId,
          value: 0.42,
          ts: chunk.ts,
        },
      ])),
    }
    const avatarRuntime = {
      consume: vi.fn(async () => {}),
    }
    const eventLog: string[] = []
    const runtime = new DesktopShellRuntime({
      adapter,
      orchestrator: new SessionOrchestrator({ voiceId: 'voice-1' }),
      speechRuntime,
      avatarRuntime,
      onEvent: event => eventLog.push(event.type),
    })

    await runtime.sendUserMessage({
      sessionKey: 'main',
      runId: 'run-2',
      message: 'Hi',
    })

    const deltaEvents = await runtime.handleGatewayEvent({
      event: 'chat',
      payload: {
        runId: 'run-2',
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

    const finalEvents = await runtime.handleGatewayEvent({
      event: 'chat',
      payload: {
        runId: 'run-2',
        sessionKey: 'main',
        seq: 2,
        state: 'final',
        message: {
          role: 'assistant',
          timestamp: 101,
          content: [{ type: 'text', text: 'Hello there.' }],
        },
      },
    })

    expect(runtime.getSubtitleSegments()).toEqual([
      expect.objectContaining({
        type: 'assistant.segment',
        runId: 'run-2',
        text: 'Hello there.',
      }),
    ])
    expect(speechRuntime.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      type: 'tts.chunk',
      runId: 'run-2',
      text: 'Hello there.',
    }))
    expect(avatarRuntime.consume).toHaveBeenCalledTimes(3)
    expect(avatarRuntime.consume).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'assistant.emotion',
      emotion: 'happy',
    }))
    expect(avatarRuntime.consume).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'assistant.motion',
      motion: 'warm-wave',
    }))
    expect(avatarRuntime.consume).toHaveBeenNthCalledWith(3, expect.objectContaining({
      type: 'avatar.lipsync',
      value: 0.42,
    }))
    expect(deltaEvents.map(event => event.type)).toEqual([
      'assistant.delta',
      'assistant.segment',
      'assistant.emotion',
      'assistant.motion',
      'tts.chunk',
      'tts.audio',
      'avatar.lipsync',
    ])
    expect(finalEvents.map(event => event.type)).toEqual([
      'assistant.completed',
    ])
    expect(eventLog).toEqual([
      'session.started',
      'assistant.delta',
      'assistant.segment',
      'assistant.emotion',
      'assistant.motion',
      'tts.chunk',
      'tts.audio',
      'avatar.lipsync',
      'assistant.completed',
    ])
  })
})
