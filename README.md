# ClawMuse

ClawMuse is a companion-avatar runtime for OpenClaw.

OpenClaw remains the conversation brain and session system. ClawMuse is the shell that turns OpenClaw replies into:

- real-time subtitle rendering
- voice playback
- lip sync
- avatar expressions
- avatar motions

The first target is a Live2D-first desktop experience optimized for AI companion / girlfriend interaction. VRM remains a later expansion path.

## Scope

ClawMuse is intentionally separated from both OpenClaw and AIRI:

- it does not embed OpenClaw UI
- it does not modify AIRI directly
- it consumes OpenClaw Gateway events through an adapter
- it owns avatar runtime, speech runtime, and companion presentation logic

## Planned Structure

- `apps/desktop-shell`
  Desktop application shell for chat, stage, settings, and runtime diagnostics.
- `packages/openclaw-adapter`
  OpenClaw Gateway integration and event normalization.
- `packages/session-orchestrator`
  Converts text stream events into subtitle, speech, emotion, and motion events.
- `packages/speech-runtime`
  Sentence chunking, TTS queueing, playback, and lip sync output.
- `packages/avatar-runtime`
  Live2D / VRM rendering, emotion playback, motions, and look-at behaviors.
- `packages/character-profile`
  Character asset manifests, voice defaults, motion mappings, and presentation rules.
- `docs`
  Architecture, protocol, roadmap, and commercial notes.

## Documents

- `docs/engineering-plan.md`
- `docs/message-protocol.md`
- `docs/commercial-notes.md`

## Product Direction

The first milestone is a minimal but convincing loop:

1. Send a message to OpenClaw.
2. Receive streaming reply text from OpenClaw Gateway.
3. Render subtitles immediately.
4. Split text into spoken segments.
5. Generate and play speech.
6. Drive mouth movement, emotion, and simple motions from runtime events.

## Current Status

The project now has a working headless runtime chain and a first Electron shell bootstrap:

- `apps/desktop-shell`
  Headless runtime session, demo CLI, and Gateway session orchestration.
- `apps/desktop-electron`
  Main-process window bootstrap, preload bridge stub, renderer model, builtin character wiring, and a first real Live2D stage render chain.
- `packages/live2d-driver`
  First ClawMuse-owned Live2D driver contract and stage component boundary.
- `packages/character-registry`
  Builtin/imported/generated character source registry.
- `packages/character-generation`
  Future AI asset generation contracts for Live2D/VRM expressions, motions, and upgrades.

## Local Run Path

The Electron shell is now wired enough to define the local run path, but it still requires project-local dependencies to be installed inside `clawmuse`.

1. Install dependencies in `/home/dministrator/projects/clawmuse`
2. Start the Electron shell with:

```bash
pnpm dev:desktop-electron
```

Current constraints:

- the renderer UI is minimal and focused on connection, chat, subtitles, and logs
- the builtin character registry contains a single Live2D placeholder character
- the stage now mounts a real Pixi/Live2D render chain, but motion/blink behavior is still deferred
- local runtime still requires a licensed Cubism core file at `apps/desktop-electron/src/renderer/public/live2d-core/live2dcubismcore.min.js`
- local builtin model loading still requires project-local Live2D assets under `apps/desktop-electron/src/renderer/public/live2d/`
