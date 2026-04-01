import type {
  ClawMuseAdapterEvent,
  ClawMuseSessionStartedEvent,
  OpenClawChatPayload,
} from './types'

function joinTextParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (typeof part === 'string') {
        return part
      }

      if (!part || typeof part !== 'object') {
        return ''
      }

      const textPart = part as { text?: unknown, value?: unknown }
      if (typeof textPart.text === 'string') {
        return textPart.text
      }
      if (typeof textPart.value === 'string') {
        return textPart.value
      }
      return ''
    })
    .join('')
}

function extractAssistantText(payload: OpenClawChatPayload): string {
  const message = payload.message
  if (typeof message === 'string') {
    return message
  }

  if (!message || typeof message !== 'object') {
    return ''
  }

  const candidate = message as {
    text?: unknown
    content?: unknown
    slices?: unknown
  }

  if (typeof candidate.text === 'string') {
    return candidate.text
  }

  if (typeof candidate.content === 'string') {
    return candidate.content
  }

  if (Array.isArray(candidate.content)) {
    return joinTextParts(candidate.content)
  }

  if (Array.isArray(candidate.slices)) {
    return joinTextParts(candidate.slices)
  }

  return ''
}

function resolveDeltaText(previousText: string, nextText: string): string {
  if (!previousText) {
    return nextText
  }

  if (nextText === previousText) {
    return ''
  }

  if (nextText.startsWith(previousText)) {
    return nextText.slice(previousText.length)
  }

  return nextText
}

export function createSessionStartedEvent(params: {
  sessionKey: string
  runId: string
  ts?: number
}): ClawMuseSessionStartedEvent {
  return {
    type: 'session.started',
    sessionKey: params.sessionKey,
    runId: params.runId,
    ts: params.ts ?? Date.now(),
  }
}

export class OpenClawChatEventNormalizer {
  private accumulatedByRun = new Map<string, string>()

  normalize(payload: OpenClawChatPayload): ClawMuseAdapterEvent[] {
    const ts = (
      payload.message
      && typeof payload.message === 'object'
      && 'timestamp' in payload.message
      && typeof (payload.message as { timestamp?: unknown }).timestamp === 'number'
    )
      ? (payload.message as { timestamp: number }).timestamp
      : Date.now()

    switch (payload.state) {
      case 'delta': {
        const nextAccumulated = extractAssistantText(payload)
        const previousAccumulated = this.accumulatedByRun.get(payload.runId) ?? ''
        const deltaText = resolveDeltaText(previousAccumulated, nextAccumulated)

        this.accumulatedByRun.set(payload.runId, nextAccumulated)

        if (!deltaText) {
          return []
        }

        return [{
          type: 'assistant.delta',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          text: deltaText,
          accumulatedText: nextAccumulated,
          ts,
        }]
      }

      case 'final': {
        const finalText = extractAssistantText(payload) || this.accumulatedByRun.get(payload.runId) || ''
        this.accumulatedByRun.delete(payload.runId)

        return [{
          type: 'assistant.completed',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          finalText,
          ts,
        }]
      }

      case 'error': {
        this.accumulatedByRun.delete(payload.runId)

        return [{
          type: 'assistant.error',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          error: payload.errorMessage || 'OpenClaw chat run failed',
          recoverable: true,
          ts,
        }]
      }

      case 'aborted': {
        this.accumulatedByRun.delete(payload.runId)

        return [{
          type: 'assistant.error',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          error: payload.errorMessage || 'OpenClaw chat run aborted',
          recoverable: true,
          ts,
        }]
      }
    }
  }
}
