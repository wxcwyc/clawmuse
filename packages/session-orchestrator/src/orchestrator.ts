import type {
  AssistantEmotionEvent,
  AssistantMotionEvent,
  AssistantSegmentEvent,
  SessionOrchestratorInputEvent,
  SessionOrchestratorOutputEvent,
  TtsChunkEvent,
} from './types'

export interface SessionOrchestratorOptions {
  voiceId: string
  segmentFallbackChars?: number
}

interface RunState {
  accumulatedText: string
  pendingText: string
  segmentCount: number
}

type EmotionDescriptor = Pick<AssistantEmotionEvent, 'emotion' | 'intensity' | 'reason'>
type MotionDescriptor = Pick<AssistantMotionEvent, 'motion' | 'priority' | 'durationMs'>

const sentenceBoundaryPattern = /[.!?。！？；;…\n]/

function normalizeSegmentText(text: string): string {
  return text.trim()
}

function classifyEmotion(text: string): EmotionDescriptor {
  const normalized = text.toLowerCase()

  if (/let me think|hmm|我想想|让我想想|想一想/.test(normalized)) {
    return { emotion: 'thinking', intensity: 0.6, reason: 'thinking-marker' }
  }

  if (/miss you|missed you|love you|想你|喜欢你|爱你|抱抱|亲爱的/.test(normalized)) {
    return { emotion: 'shy', intensity: 0.72, reason: 'affection' }
  }

  if (/sorry|遗憾|难过|伤心/.test(normalized)) {
    return { emotion: 'sad', intensity: 0.68, reason: 'sadness-marker' }
  }

  if (/!|太好了|great|amazing|yay/.test(normalized)) {
    return { emotion: 'excited', intensity: 0.78, reason: 'excited-marker' }
  }

  if (/^hello\b|^hi\b|你好|早安|晚安|欢迎/.test(normalized)) {
    return { emotion: 'happy', intensity: 0.55, reason: 'greeting' }
  }

  return { emotion: 'neutral', intensity: 0.4, reason: 'default' }
}

function resolveMotion(emotion: EmotionDescriptor): MotionDescriptor {
  switch (emotion.emotion) {
    case 'happy':
      return { motion: 'warm-wave', priority: 1, durationMs: 1800 }
    case 'shy':
      return { motion: 'shy-smile', priority: 1, durationMs: 1800 }
    case 'thinking':
      return { motion: 'thinking-idle', priority: 1, durationMs: 1800 }
    case 'excited':
      return { motion: 'bright-bounce', priority: 1, durationMs: 1600 }
    case 'sad':
      return { motion: 'soft-down', priority: 1, durationMs: 1800 }
    case 'neutral':
    default:
      return { motion: 'idle', priority: 0, durationMs: 1200 }
  }
}

function findFallbackBoundary(text: string, threshold: number): number | null {
  if (text.length < threshold) {
    return null
  }

  const candidate = text.slice(0, threshold)
  const lastWhitespace = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'))
  if (lastWhitespace > 0) {
    return lastWhitespace
  }

  return threshold
}

export class SessionOrchestrator {
  private readonly voiceId: string
  private readonly segmentFallbackChars: number
  private readonly runs = new Map<string, RunState>()

  constructor(options: SessionOrchestratorOptions) {
    this.voiceId = options.voiceId
    this.segmentFallbackChars = options.segmentFallbackChars ?? 32
  }

  consume(event: SessionOrchestratorInputEvent): SessionOrchestratorOutputEvent[] {
    switch (event.type) {
      case 'session.started':
        this.runs.set(event.runId, { accumulatedText: '', pendingText: '', segmentCount: 0 })
        return []

      case 'assistant.error':
        this.runs.delete(event.runId)
        return []

      case 'assistant.delta':
        return this.consumeText(event.runId, event.sessionKey, event.text, event.ts, false)

      case 'assistant.completed': {
        const output = this.consumeText(event.runId, event.sessionKey, '', event.ts, true, event.finalText)
        this.runs.delete(event.runId)
        return output
      }
    }
  }

  private ensureRun(runId: string): RunState {
    const existing = this.runs.get(runId)
    if (existing) {
      return existing
    }

    const next = { accumulatedText: '', pendingText: '', segmentCount: 0 }
    this.runs.set(runId, next)
    return next
  }

  private consumeText(
    runId: string,
    sessionKey: string,
    text: string,
    ts: number,
    flushFinal: boolean,
    finalText?: string,
  ): SessionOrchestratorOutputEvent[] {
    const state = this.ensureRun(runId)

    if (flushFinal && finalText) {
      if (finalText.startsWith(state.accumulatedText)) {
        const trailingText = finalText.slice(state.accumulatedText.length)
        state.pendingText += trailingText
      } else {
        state.pendingText = finalText
      }

      state.accumulatedText = finalText
    } else {
      state.pendingText += text
      state.accumulatedText += text
    }

    const output: SessionOrchestratorOutputEvent[] = []

    while (state.pendingText) {
      const punctuationMatch = state.pendingText.match(sentenceBoundaryPattern)
      let boundaryIndex: number | null = null
      let finalInSentence = false

      if (punctuationMatch && punctuationMatch.index != null) {
        boundaryIndex = punctuationMatch.index + 1
        finalInSentence = true
      } else {
        boundaryIndex = findFallbackBoundary(state.pendingText, this.segmentFallbackChars)
      }

      if (boundaryIndex == null) {
        break
      }

      const rawSegment = state.pendingText.slice(0, boundaryIndex)
      state.pendingText = state.pendingText.slice(boundaryIndex)

      const segmentText = normalizeSegmentText(rawSegment)
      if (!segmentText) {
        continue
      }

      output.push(...this.createSegmentBundle({
        runId,
        sessionKey,
        text: segmentText,
        finalInSentence,
        ts,
        state,
      }))
    }

    if (flushFinal) {
      const remaining = normalizeSegmentText(state.pendingText)
      state.pendingText = ''

      if (remaining) {
        output.push(...this.createSegmentBundle({
          runId,
          sessionKey,
          text: remaining,
          finalInSentence: true,
          ts,
          state,
        }))
      }
    }

    return output
  }

  private createSegmentBundle(params: {
    runId: string
    sessionKey: string
    text: string
    finalInSentence: boolean
    ts: number
    state: RunState
  }): [AssistantSegmentEvent, AssistantEmotionEvent, AssistantMotionEvent, TtsChunkEvent] {
    params.state.segmentCount += 1
    const segmentId = `${params.runId}:${params.state.segmentCount}`
    const emotion = classifyEmotion(params.text)
    const motion = resolveMotion(emotion)

    return [
      {
        type: 'assistant.segment',
        sessionKey: params.sessionKey,
        runId: params.runId,
        segmentId,
        text: params.text,
        finalInSentence: params.finalInSentence,
        ts: params.ts,
      },
      {
        type: 'assistant.emotion',
        sessionKey: params.sessionKey,
        runId: params.runId,
        emotion: emotion.emotion,
        intensity: emotion.intensity,
        reason: emotion.reason,
        ts: params.ts,
      },
      {
        type: 'assistant.motion',
        sessionKey: params.sessionKey,
        runId: params.runId,
        motion: motion.motion,
        priority: motion.priority,
        durationMs: motion.durationMs,
        ts: params.ts,
      },
      {
        type: 'tts.chunk',
        sessionKey: params.sessionKey,
        runId: params.runId,
        segmentId,
        text: params.text,
        voiceId: this.voiceId,
        ts: params.ts,
      },
    ]
  }
}
