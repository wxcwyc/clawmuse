import type {
  ClawMuseAdapterEvent,
  ClawMuseAssistantCompletedEvent,
  ClawMuseAssistantDeltaEvent,
  ClawMuseAssistantErrorEvent,
  ClawMuseAssistantHintFields,
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
  private readonly fallbackHintsByRun = new Map<string, ClawMuseAssistantHintFields>()

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
        this.fallbackHintsByRun.delete(event.payload.runId)
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
      const mergedHints = this.mergeFallbackHints(runId, data)

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
        ...mergedHints,
        ts,
      }
      return [event]
    }

    if (stream === 'lifecycle') {
      const phase = typeof data.phase === 'string' ? data.phase : ''
      if (phase === 'end') {
        const finalText = this.fallbackAccumulatedByRun.get(runId) ?? ''
        const finalHints = this.fallbackHintsByRun.get(runId) ?? {}
        this.fallbackAccumulatedByRun.delete(runId)
        this.fallbackHintsByRun.delete(runId)
        this.runEventSourceByRun.delete(runId)
        const event: ClawMuseAssistantCompletedEvent = {
          type: 'assistant.completed',
          sessionKey,
          runId,
          finalText,
          ...finalHints,
          ts,
        }
        return [event]
      }

      if (phase === 'error') {
        this.fallbackAccumulatedByRun.delete(runId)
        this.fallbackHintsByRun.delete(runId)
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

  private mergeFallbackHints(runId: string, data: {
    text?: unknown
    delta?: unknown
    phase?: unknown
    error?: unknown
    emotion?: unknown
    emotionIntensity?: unknown
    intensity?: unknown
    emotionReason?: unknown
    reason?: unknown
    action?: unknown
    motion?: unknown
    actionPriority?: unknown
    priority?: unknown
    actionDurationMs?: unknown
    durationMs?: unknown
  }): ClawMuseAssistantHintFields {
    const previous = this.fallbackHintsByRun.get(runId) ?? {}
    const actionObject = data.action && typeof data.action === 'object'
      ? data.action as { motion?: unknown, priority?: unknown, durationMs?: unknown }
      : null

    const parseNumber = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number.parseFloat(value)
        if (Number.isFinite(parsed)) {
          return parsed
        }
      }
      return undefined
    }

    const next: ClawMuseAssistantHintFields = {
      emotion: (
        (typeof data.emotion === 'string' && data.emotion.trim())
        || previous.emotion
      ) as string | undefined,
      emotionIntensity: parseNumber(data.emotionIntensity ?? data.intensity) ?? previous.emotionIntensity,
      emotionReason: (
        (typeof data.emotionReason === 'string' && data.emotionReason.trim())
        || (typeof data.reason === 'string' && data.reason.trim())
        || previous.emotionReason
      ) as string | undefined,
      action: (
        (typeof data.action === 'string' && data.action.trim())
        || (typeof data.motion === 'string' && data.motion.trim())
        || (typeof actionObject?.motion === 'string' && actionObject.motion.trim())
        || previous.action
      ) as string | undefined,
      actionPriority: parseNumber(data.actionPriority ?? data.priority ?? actionObject?.priority) ?? previous.actionPriority,
      actionDurationMs: parseNumber(data.actionDurationMs ?? data.durationMs ?? actionObject?.durationMs) ?? previous.actionDurationMs,
    }

    if (
      next.emotion
      || next.emotionIntensity != null
      || next.emotionReason
      || next.action
      || next.actionPriority != null
      || next.actionDurationMs != null
    ) {
      this.fallbackHintsByRun.set(runId, next)
      return next
    }

    return {}
  }
}
