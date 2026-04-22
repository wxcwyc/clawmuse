import type {
  ClawMuseAdapterEvent,
  ClawMuseAssistantHintFields,
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

function parseNumber(value: unknown): number | undefined {
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized || undefined
}

function extractAssistantHints(payload: OpenClawChatPayload): ClawMuseAssistantHintFields {
  const message = asObject(payload.message)
  if (!message) {
    return {}
  }

  const metadata = asObject(message.metadata)
  const actionObject = asObject(message.action)
  const metadataActionObject = asObject(metadata?.action)
  const sources = [message, metadata].filter((source): source is Record<string, unknown> => Boolean(source))

  let emotion: string | undefined
  let emotionIntensity: number | undefined
  let emotionReason: string | undefined

  for (const source of sources) {
    if (!emotion && typeof source.emotion === 'string' && source.emotion.trim()) {
      emotion = source.emotion.trim()
    }
    if (emotionIntensity == null) {
      emotionIntensity = parseNumber(source.emotionIntensity ?? source.intensity)
    }
    if (!emotionReason && typeof source.emotionReason === 'string' && source.emotionReason.trim()) {
      emotionReason = source.emotionReason.trim()
    }
    if (!emotionReason && typeof source.reason === 'string' && source.reason.trim()) {
      emotionReason = source.reason.trim()
    }
  }

  const action = (
    asNonEmptyString(message.action)
    ?? asNonEmptyString(message.motion)
    ?? asNonEmptyString(actionObject?.motion)
    ?? asNonEmptyString(metadata?.action)
    ?? asNonEmptyString(metadata?.motion)
    ?? asNonEmptyString(metadataActionObject?.motion)
  )

  const actionPriority = (
    parseNumber(message.actionPriority)
    ?? parseNumber(message.priority)
    ?? parseNumber(actionObject?.priority)
    ?? parseNumber(metadata?.actionPriority)
    ?? parseNumber(metadata?.priority)
    ?? parseNumber(metadataActionObject?.priority)
  )

  const actionDurationMs = (
    parseNumber(message.actionDurationMs)
    ?? parseNumber(message.durationMs)
    ?? parseNumber(actionObject?.durationMs)
    ?? parseNumber(metadata?.actionDurationMs)
    ?? parseNumber(metadata?.durationMs)
    ?? parseNumber(metadataActionObject?.durationMs)
  )

  return {
    emotion,
    emotionIntensity,
    emotionReason,
    action,
    actionPriority,
    actionDurationMs,
  }
}

function mergeAssistantHints(
  previous: ClawMuseAssistantHintFields | undefined,
  incoming: ClawMuseAssistantHintFields,
): ClawMuseAssistantHintFields {
  return {
    emotion: incoming.emotion ?? previous?.emotion,
    emotionIntensity: incoming.emotionIntensity ?? previous?.emotionIntensity,
    emotionReason: incoming.emotionReason ?? previous?.emotionReason,
    action: incoming.action ?? previous?.action,
    actionPriority: incoming.actionPriority ?? previous?.actionPriority,
    actionDurationMs: incoming.actionDurationMs ?? previous?.actionDurationMs,
  }
}

function normalizeHintFields(hints: ClawMuseAssistantHintFields): ClawMuseAssistantHintFields {
  const normalized: ClawMuseAssistantHintFields = {}
  if (hints.emotion) {
    normalized.emotion = hints.emotion
  }
  if (hints.emotionIntensity != null) {
    normalized.emotionIntensity = hints.emotionIntensity
  }
  if (hints.emotionReason) {
    normalized.emotionReason = hints.emotionReason
  }
  if (hints.action) {
    normalized.action = hints.action
  }
  if (hints.actionPriority != null) {
    normalized.actionPriority = hints.actionPriority
  }
  if (hints.actionDurationMs != null) {
    normalized.actionDurationMs = hints.actionDurationMs
  }
  return normalized
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
  private hintsByRun = new Map<string, ClawMuseAssistantHintFields>()

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
        const mergedHints = mergeAssistantHints(
          this.hintsByRun.get(payload.runId),
          extractAssistantHints(payload),
        )

        this.accumulatedByRun.set(payload.runId, nextAccumulated)
        if (
          mergedHints.emotion
          || mergedHints.emotionIntensity != null
          || mergedHints.emotionReason
          || mergedHints.action
          || mergedHints.actionPriority != null
          || mergedHints.actionDurationMs != null
        ) {
          this.hintsByRun.set(payload.runId, mergedHints)
        }

        if (!deltaText) {
          return []
        }

        return [{
          type: 'assistant.delta',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          text: deltaText,
          accumulatedText: nextAccumulated,
          ...normalizeHintFields(mergedHints),
          ts,
        }]
      }

      case 'final': {
        const finalText = extractAssistantText(payload) || this.accumulatedByRun.get(payload.runId) || ''
        const mergedHints = mergeAssistantHints(
          this.hintsByRun.get(payload.runId),
          extractAssistantHints(payload),
        )
        this.accumulatedByRun.delete(payload.runId)
        this.hintsByRun.delete(payload.runId)

        return [{
          type: 'assistant.completed',
          sessionKey: payload.sessionKey,
          runId: payload.runId,
          finalText,
          ...normalizeHintFields(mergedHints),
          ts,
        }]
      }

      case 'error': {
        this.accumulatedByRun.delete(payload.runId)
        this.hintsByRun.delete(payload.runId)

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
        this.hintsByRun.delete(payload.runId)

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
