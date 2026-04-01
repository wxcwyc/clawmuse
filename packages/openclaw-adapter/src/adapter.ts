import type {
  ClawMuseAdapterEvent,
  ClawMuseAssistantCompletedEvent,
  ClawMuseAssistantDeltaEvent,
  ClawMuseAssistantErrorEvent,
  OpenClawChatPayload,
  OpenClawGatewayEventEnvelope,
  OpenClawGatewayTransport,
} from './types'

import { createSessionStartedEvent, OpenClawChatEventNormalizer } from './normalizer'

function isOpenClawChatPayload(payload: unknown): payload is OpenClawChatPayload {
  if (!payload || typeof payload !== 'object') {
    return false
  }

  const candidate = payload as Partial<OpenClawChatPayload>
  return typeof candidate.runId === 'string'
    && typeof candidate.sessionKey === 'string'
    && typeof candidate.seq === 'number'
    && (
      candidate.state === 'delta'
      || candidate.state === 'final'
      || candidate.state === 'aborted'
      || candidate.state === 'error'
    )
}

export class OpenClawGatewayChatAdapter {
  private readonly normalizer: OpenClawChatEventNormalizer
  private readonly runEventSourceByRun = new Map<string, 'chat' | 'agent'>()
  private readonly fallbackAccumulatedByRun = new Map<string, string>()

  constructor(
    private readonly transport: OpenClawGatewayTransport,
    normalizer?: OpenClawChatEventNormalizer,
  ) {
    this.normalizer = normalizer ?? new OpenClawChatEventNormalizer()
  }

  handleGatewayEvent(event: OpenClawGatewayEventEnvelope): ClawMuseAdapterEvent[] {
    if (event.event === 'chat' && isOpenClawChatPayload(event.payload)) {
      const source = this.runEventSourceByRun.get(event.payload.runId)
      if (source && source !== 'chat') {
        return []
      }

      this.runEventSourceByRun.set(event.payload.runId, 'chat')
      const normalized = this.normalizer.normalize(event.payload)
      if (
        event.payload.state === 'final'
        || event.payload.state === 'error'
        || event.payload.state === 'aborted'
      ) {
        this.runEventSourceByRun.delete(event.payload.runId)
        this.fallbackAccumulatedByRun.delete(event.payload.runId)
      }
      return normalized
    }

    if (event.event === 'agent') {
      return this.handleAgentFallbackEvent(event.payload)
    }

    return []
  }

  subscribe(listener: (event: ClawMuseAdapterEvent) => void): () => void {
    return this.transport.onEvent((event) => {
      for (const normalized of this.handleGatewayEvent(event)) {
        listener(normalized)
      }
    })
  }

  async sendMessage(params: {
    sessionKey: string
    message: string
    thinking?: string
    deliver?: boolean
    timeoutMs?: number
    runId: string
  }): Promise<ClawMuseAdapterEvent[]> {
    await this.transport.request('chat.send', {
      sessionKey: params.sessionKey,
      message: params.message,
      thinking: params.thinking,
      deliver: params.deliver,
      timeoutMs: params.timeoutMs,
      idempotencyKey: params.runId,
    })

    return [
      createSessionStartedEvent({
        sessionKey: params.sessionKey,
        runId: params.runId,
      }),
    ]
  }

  private handleAgentFallbackEvent(payload: unknown): ClawMuseAdapterEvent[] {
    if (!payload || typeof payload !== 'object') {
      return []
    }

    const candidate = payload as {
      runId?: unknown
      sessionKey?: unknown
      stream?: unknown
      data?: unknown
      ts?: unknown
    }

    const runId = typeof candidate.runId === 'string' ? candidate.runId : null
    if (!runId) {
      return []
    }

    const source = this.runEventSourceByRun.get(runId)
    if (source && source !== 'agent') {
      return []
    }
    this.runEventSourceByRun.set(runId, 'agent')

    const sessionKey = typeof candidate.sessionKey === 'string' ? candidate.sessionKey : 'main'
    const ts = typeof candidate.ts === 'number' ? candidate.ts : Date.now()
    const stream = typeof candidate.stream === 'string' ? candidate.stream : ''
    const data = candidate.data && typeof candidate.data === 'object'
      ? candidate.data as {
          text?: unknown
          delta?: unknown
          phase?: unknown
          error?: unknown
        }
      : {}

    if (stream === 'assistant') {
      const previous = this.fallbackAccumulatedByRun.get(runId) ?? ''
      const rawText = typeof data.text === 'string' ? data.text : ''
      const rawDelta = typeof data.delta === 'string' ? data.delta : ''

      let nextAccumulated = previous
      if (rawText) {
        if (!previous || rawText.startsWith(previous)) {
          nextAccumulated = rawText
        }
        else {
          nextAccumulated = previous + rawText
        }
      }
      else if (rawDelta) {
        nextAccumulated = previous + rawDelta
      }

      if (!nextAccumulated || nextAccumulated === previous) {
        return []
      }

      const deltaText = nextAccumulated.startsWith(previous)
        ? nextAccumulated.slice(previous.length)
        : nextAccumulated

      this.fallbackAccumulatedByRun.set(runId, nextAccumulated)

      const event: ClawMuseAssistantDeltaEvent = {
        type: 'assistant.delta',
        sessionKey,
        runId,
        text: deltaText,
        accumulatedText: nextAccumulated,
        ts,
      }
      return [event]
    }

    if (stream === 'lifecycle') {
      const phase = typeof data.phase === 'string' ? data.phase : ''
      if (phase === 'end') {
        const finalText = this.fallbackAccumulatedByRun.get(runId) ?? ''
        this.fallbackAccumulatedByRun.delete(runId)
        this.runEventSourceByRun.delete(runId)
        const event: ClawMuseAssistantCompletedEvent = {
          type: 'assistant.completed',
          sessionKey,
          runId,
          finalText,
          ts,
        }
        return [event]
      }

      if (phase === 'error') {
        this.fallbackAccumulatedByRun.delete(runId)
        this.runEventSourceByRun.delete(runId)
        const error = typeof data.error === 'string'
          ? data.error
          : 'OpenClaw agent lifecycle error'
        const event: ClawMuseAssistantErrorEvent = {
          type: 'assistant.error',
          sessionKey,
          runId,
          error,
          recoverable: true,
          ts,
        }
        return [event]
      }
    }

    return []
  }
}
