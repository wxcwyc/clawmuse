# desktop-shell

Desktop application shell for ClawMuse.

## What It Does

- coordinates the normalized runtime pipeline
- sends user messages through `openclaw-adapter`
- routes assistant events into subtitle, speech, and avatar layers
- keeps shell-facing subtitle state for the UI layer

## How To Use It

Create a `DesktopShellRuntime` with:

- an adapter
- a session orchestrator
- a speech runtime
- an avatar runtime

Then:

- call `sendUserMessage(...)` for outgoing user input
- call `handleGatewayEvent(...)` for incoming OpenClaw Gateway events
- read `getSubtitleSegments()` for subtitle-facing UI state

For a minimal non-UI integration path, use:

- `DesktopShellSession` to assemble transport, profile, speech, and avatar runtime
- `HeadlessDemo` to connect to Gateway, send one message, and print subtitle-oriented logs

## When To Use It

Use this app layer when:

- you need the first end-to-end ClawMuse runtime path
- the UI shell should stay thin and react to normalized events
- you want diagnostics and state aggregation in one place

## When Not To Use It

Do not use this layer when:

- you only need isolated package tests
- you need renderer-specific avatar logic
- you need direct TTS or Gateway protocol handling without shell state
