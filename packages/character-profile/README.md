# character-profile

Character manifest and asset profile package for ClawMuse.

## What It Does

- defines per-character metadata
- binds avatar assets to renderer kind and model source
- stores default voice selection
- provides emotion-to-motion overrides on top of runtime defaults

## How To Use It

Create a profile with `createCharacterProfile`, then resolve runtime-facing values with:

- `resolveVoiceId`
- `resolveMotionForEmotion`

Keep profiles data-only so they can be reused across desktop, web, and asset delivery flows.

## When To Use It

Use this package when:

- you need a stable manifest for a character asset bundle
- shell apps need to switch characters without code edits
- runtime layers need voice and motion defaults from content data

## When Not To Use It

Do not use this package when:

- you need to parse OpenClaw Gateway events
- you need speech playback or lip sync
- you need avatar renderer control logic
