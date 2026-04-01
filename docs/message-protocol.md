# ClawMuse Message Protocol

## 1. Goal

ClawMuse should not bind its runtime directly to raw OpenClaw Gateway payloads.

Instead, the project uses a normalized internal event protocol that:

- preserves streaming behavior
- supports avatar presentation
- supports TTS and lip sync
- isolates upstream changes inside `openclaw-adapter`

## 2. Core Event Model

```ts
type ClawMuseEvent =
  | {
      type: 'session.started'
      sessionKey: string
      runId: string
      ts: number
    }
  | {
      type: 'assistant.delta'
      sessionKey: string
      runId: string
      text: string
      accumulatedText: string
      ts: number
    }
  | {
      type: 'assistant.segment'
      sessionKey: string
      runId: string
      segmentId: string
      text: string
      finalInSentence: boolean
      ts: number
    }
  | {
      type: 'assistant.emotion'
      sessionKey: string
      runId: string
      emotion: 'neutral' | 'happy' | 'shy' | 'sad' | 'excited' | 'thinking'
      intensity: number
      reason?: string
      ts: number
    }
  | {
      type: 'assistant.motion'
      sessionKey: string
      runId: string
      motion: string
      priority?: number
      durationMs?: number
      ts: number
    }
  | {
      type: 'tts.chunk'
      sessionKey: string
      runId: string
      segmentId: string
      text: string
      voiceId: string
      ts: number
    }
  | {
      type: 'tts.audio'
      sessionKey: string
      runId: string
      segmentId: string
      audioUrl?: string
      audioBuffer?: ArrayBuffer
      durationMs?: number
      ts: number
    }
  | {
      type: 'avatar.lipsync'
      sessionKey: string
      runId: string
      value: number
      ts: number
    }
  | {
      type: 'assistant.completed'
      sessionKey: string
      runId: string
      finalText: string
      ts: number
    }
  | {
      type: 'assistant.error'
      sessionKey: string
      runId: string
      error: string
      recoverable: boolean
      ts: number
    }
```

## 3. Ownership by Module

### openclaw-adapter emits

- `session.started`
- `assistant.delta`
- `assistant.completed`
- `assistant.error`

### session-orchestrator emits

- `assistant.segment`
- `assistant.emotion`
- `assistant.motion`
- `tts.chunk`

### speech-runtime emits

- `tts.audio`
- `avatar.lipsync`

### avatar-runtime consumes

- `assistant.emotion`
- `assistant.motion`
- `avatar.lipsync`

### shell-app consumes

- subtitle-facing events
- connection-facing events
- error-facing events

## 4. Mapping Rules

### From OpenClaw to ClawMuse

OpenClaw adapter responsibilities:

- attach `sessionKey`
- attach `runId`
- accumulate text so downstream consumers receive both delta text and stable accumulated text
- normalize upstream failures to `assistant.error`

### From Delta to Segment

`session-orchestrator` should:

- append incoming deltas to the current accumulated assistant buffer
- split on sentence-like boundaries first
- fall back to length thresholds if punctuation is absent
- emit segments only once

Recommended first-pass segment rules:

- sentence punctuation: `.`, `!`, `?`, `。`, `！`, `？`
- line break boundary
- fallback length threshold: 20 to 40 characters

## 5. Emotion Rules

First version should be deterministic and local.

Examples:

- greeting phrases -> `happy`
- blush / affection language -> `shy`
- exclamation-heavy upbeat language -> `excited`
- reflection markers like `let me think`, `hmm`, `我想想` -> `thinking`
- no clear signal -> `neutral`

This keeps runtime predictable and avoids introducing a second model dependency in the first milestone.

## 6. Motion Rules

First version should map emotion categories to a small, safe motion set:

- `neutral` -> idle
- `happy` -> smile / warm motion
- `shy` -> shy / glance-away motion
- `thinking` -> think motion
- `excited` -> bright motion
- `sad` -> soft-down motion

Priority guidance:

- lip sync always stays continuous
- short expressions can interrupt idle
- high-priority motions should not stack freely

## 7. Error Handling

Required behavior:

- adapter errors become `assistant.error`
- TTS generation failures do not cancel subtitle display
- avatar motion failures do not block speech playback
- speech queue failures do not erase completed text

The protocol should support partial degradation:

- text-only mode
- subtitle + avatar mode without speech
- subtitle + speech mode without motion

## 8. Diagnostics

Every runtime event should include enough context for logs:

- `sessionKey`
- `runId`
- timestamp
- module source in log metadata

This is necessary for correlating:

- OpenClaw stream timing
- TTS latency
- playback timing
- avatar reaction timing
