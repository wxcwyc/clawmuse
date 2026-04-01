# Live2D Desktop Pet Roadmap

**Date:** 2026-04-01

## Goal

Make the Live2D role run on the Windows desktop as a real "pet":

- can roam around the whole screen
- can be dragged with mouse
- can play expressions/motions during interaction
- can chat without blocking normal typing in other apps

## Definition of Done

- Character keeps moving when no interaction is happening.
- Drag interaction is stable and does not break movement state.
- Motion/expression buttons can trigger visible changes.
- Chat input is a separate UI that appears only when needed.
- Assistant reply is shown sentence-by-sentence in character bubble.
- OpenClaw connection state can be reused across restarts (30 days).
- On Windows native launch, Chinese IME works in chat input.

## Milestone 1: Window Architecture (Desktop Pet First)

### Scope

- Split into two windows:
  - `pet window`: full-screen transparent overlay for Live2D only
  - `chat window`: compact input panel, opened on demand
- Keep `Chat` as primary action entry.
- Keep `Logs` and motion-test actions under collapsed menu by default.

### Acceptance

- Pet window does not steal focus during normal desktop usage.
- Chat window opens/focuses only after connect is ready.
- Closing chat window returns control to desktop immediately.

## Milestone 2: Movement + Drag System

### Scope

- Add movement state machine:
  - `idle`
  - `roaming`
  - `dragging`
  - `interacting`
- Implement roaming path logic:
  - random walk with speed range
  - edge detect + turn/reflect
  - cooldown after drag release
- Ensure drag priority over auto movement.

### Acceptance

- Character can roam for long periods without freezing/jitter.
- Dragging is smooth and release continues with natural movement.
- Repositioning never clips model out of visible screen bounds.

## Milestone 3: Motion / Expression Pipeline

### Scope

- Build a model capability registry:
  - detect available motions
  - detect available expressions
- Map UI test buttons to real capability keys.
- Add interaction-driven animation mapping:
  - click/tap -> short reaction motion
  - thinking -> thinking/idle variant
  - speaking -> talk-like loop

### Acceptance

- Clicking test buttons always produces visible state change.
- No duplicate trigger for the same sentence/event.
- If a model lacks capability, show clear log fallback.

## Milestone 4: Chat Loop + Bubble Rendering

### Scope

- Keep minimal chat input (Enter send, Shift+Enter newline).
- Render assistant output as styled comic bubble near avatar mouth.
- Show one sentence at a time, then switch to next sentence.
- Remove blocking "waiting for assistant stream" box.
- Keep full raw stream in Logs for debugging.

### Acceptance

- No duplicated sentence playback.
- Bubble sentence segmentation is stable (Chinese punctuation aware).
- UI remains draggable and unobstructed during stream.

## Milestone 5: OpenClaw Session Robustness

### Scope

- Keep session adapter event model:
  - `connected`, `disconnected`, `status`
  - `message:assistant:delta`, `message:assistant:final`
- Persist connection info for 30 days and restore on startup.
- Add clear logs for:
  - connect params
  - auth/pairing/scope errors
  - send/subscribe states

### Acceptance

- Message send + reply receive loop works without manual reconnect.
- Failures expose explicit reason in logs.
- Reopen app and continue chatting without re-entering settings (within TTL).

## Platform Note

- For production behavior (desktop focus + IME), use native Windows Electron build.
- WSL/Linux process can run core logic but is not reliable for Windows IME switching behavior.

## Execution Order

1. Milestone 1
2. Milestone 2
3. Milestone 3
4. Milestone 4
5. Milestone 5
