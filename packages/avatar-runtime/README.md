# avatar-runtime

Avatar presentation runtime for ClawMuse's Live2D-first shell.

## What It Does

- consumes normalized avatar-facing events
- routes emotion changes to a renderer driver
- routes motion playback requests with simple priority control
- applies lip sync values during speech playback

## How To Use It

Create an `AvatarRuntime` with a renderer driver implementation:

- `setEmotion`
- `playMotion`
- `setLipSync`

Then feed it normalized runtime events:

- `assistant.emotion`
- `assistant.motion`
- `avatar.lipsync`

## When To Use It

Use this package when:

- ClawMuse needs a presentation layer independent from OpenClaw
- the shell app already has normalized runtime events
- you want to swap renderer implementations without changing orchestration logic

## When Not To Use It

Do not use this package when:

- you need transcript parsing or sentence segmentation
- you need TTS synthesis or audio playback
- you need direct OpenClaw Gateway protocol handling
