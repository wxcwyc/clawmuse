# ClawMuse Electron Live2D Shell Design

## Goal

Build the first directly explorable ClawMuse desktop experience as an Electron shell that:

- connects to OpenClaw Gateway
- renders one builtin Live2D character
- supports text chat, subtitles, speech playback, lip sync, and basic motion
- stays structurally ready for imported characters, multi-character support, VRM, and AI-assisted asset generation

## Scope

This design intentionally does not copy AIRI as a product shell.

It only migrates the smallest stable Live2D subset required for the first desktop experience:

- Pixi canvas setup
- Live2D model loading
- base motion handling
- pointer focus
- lip sync input

It does not migrate:

- AIRI settings pages
- model import UI
- multi-character management UI
- VRM runtime
- complex stage layouts
- AIRI-specific stores or business flows

## Approved Architecture

The implementation is organized into five stable layers:

- `runtime-core`
  already represented by `openclaw-adapter`, `session-orchestrator`, `speech-runtime`, `avatar-runtime`, and `desktop-shell/session`
- `avatar-driver`
  the stable renderer-facing interface used by runtime-core
- `live2d-driver`
  the first concrete renderer implementation, migrated and simplified from AIRI
- `character-registry`
  the source-of-truth for builtin, imported, and generated characters
- `character-generation`
  a future-facing interface that turns source images or base characters into manifest patches and generated files

This keeps conversation logic independent from rendering technology and from future asset creation workflows.

## Why This Is Better Than Copying AIRI

Directly copying AIRI would pull in product-level state, settings, and compatibility baggage that ClawMuse does not want.

The approved design instead:

- reuses the proven Live2D rendering subset
- keeps ClawMuse-specific runtime boundaries intact
- leaves room for VRM and generated assets without forcing a rewrite later

## Electron Shell

The first Electron shell should contain:

- one main window
- one preload bridge for safe renderer access
- one renderer page with:
  - connection fields
  - message input
  - send button
  - subtitle area
  - log panel
  - Live2D stage area

The first version should avoid a settings framework and keep all runtime state local to the shell page.

## Live2D Migration Rules

ClawMuse should migrate only the minimum AIRI subset:

- `Live2D.vue`
- `Canvas.vue`
- `Model.vue`
- the minimum motion-manager logic needed for:
  - idle handling
  - pointer focus
  - blink
  - lip sync

The migration must convert AIRI-specific store dependencies into explicit props, driver methods, or local state.

The target package should be a ClawMuse-owned `live2d-driver`, not a reused AIRI package import, so future changes are isolated.

## Character Model

The first release uses one builtin character.

Even so, the character layer must already distinguish between:

- `builtin`
- `imported`
- `generated`

and between:

- `live2d`
- `vrm`

This keeps the first shell small while making later features additive instead of invasive.

## AI-Assisted Asset Generation

The design reserves a dedicated path for future model-backed character generation.

That path must not directly mutate the running renderer.

Instead it should work like this:

1. User supplies source images or a base character
2. `character-generation` creates a generation request
3. `generation-provider` runs the provider-specific job
4. The provider returns generated files plus an `assetManifestPatch`
5. `character-registry` registers the generated result as a new character version or new generated character
6. The shell can activate it using the same runtime path as any other character

This supports future use cases such as:

- image-to-Live2D expression packs
- image-to-VRM expression packs
- upgrading an existing character with new emotion variants
- generated motion packs
- richer custom-character workflows

## First Delivery Boundaries

Must have:

- Electron shell
- one builtin Live2D model
- OpenClaw Gateway connection
- send message
- subtitle rendering
- speech playback
- lip sync
- basic expression and motion
- runtime log output

Explicitly deferred:

- model importer UI
- multi-character selection UI
- VRM renderer
- complex stage layouts
- generated asset provider implementation
- image-to-model generation jobs

## Validation Strategy

The work should remain test-first.

Key test layers:

- unit tests for renderer-independent runtime logic
- unit tests for shell orchestration
- unit tests for registry and generation schemas
- smoke tests for Electron preload and renderer boot wiring

## Outcome

The result is a desktop shell that is immediately explorable, but is also structurally ready for:

- imported models
- multi-character support
- VRM
- more advanced stage layouts
- AI-assisted asset generation
