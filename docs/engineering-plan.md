# ClawMuse Engineering Plan

## 1. Product Definition

ClawMuse is a new project that provides the character shell for OpenClaw.

Responsibilities:

- connect to OpenClaw Gateway
- send user messages and observe assistant reply streams
- render the avatar
- render real-time subtitles
- convert reply text into speech
- drive lip sync, expressions, and simple motions

Non-goals for the first version:

- replacing OpenClaw as the assistant runtime
- embedding OpenClaw UI
- reusing AIRI as a product shell directly
- shipping a full commercial backend in the first milestone

## 2. Architecture

Recommended system split:

- `openclaw-adapter`
  - owns Gateway transport
  - sends chat requests
  - subscribes to OpenClaw events
  - translates raw Gateway payloads into ClawMuse internal events
- `avatar-driver`
  - defines the stable renderer-facing avatar contract
  - allows Live2D and VRM implementations to share the same runtime surface
- `session-orchestrator`
  - accumulates assistant text deltas
  - detects sentence boundaries
  - emits subtitle segments
  - derives emotion and motion hints
  - feeds TTS requests into speech-runtime
- `speech-runtime`
  - receives text segments
  - performs TTS generation
  - schedules audio playback
  - emits lip sync amplitude events during playback
- `avatar-runtime`
  - renders through the active avatar driver
  - consumes motion, emotion, and lip sync events
  - controls stage presentation and camera/look-at behavior
- `character-profile`
  - defines per-character resource manifests
  - binds avatar assets to voice, motion mappings, and presentation defaults
- `character-registry`
  - tracks builtin, imported, and generated characters
  - resolves the active character profile and renderer kind
- `character-generation`
  - defines the interface for model-assisted asset generation
  - converts source images or base characters into manifest patches and generated files
- `generation-provider`
  - hosts provider-specific implementations for future AI-assisted asset generation flows
- `desktop-shell`
  - provides chat view, stage view, provider settings, runtime logs, and diagnostics
  - hosts the first Electron desktop experience

## 3. Why Gateway Events

ClawMuse should integrate with OpenClaw through Gateway WebSocket events, not transcript file polling.

Reasons:

- better real-time behavior for subtitles and TTS
- cleaner separation from OpenClaw internals
- closer fit to the eventual production architecture
- avoids binding presentation timing to file persistence

Transcript-based integration can remain a fallback or debugging mode, but it should not be the primary runtime path.

## 4. Avatar Strategy

ClawMuse should start with Live2D.

Reasons:

- strongest fit for AI companion / girlfriend presentation
- lower effort to achieve expressive 2D speaking behavior
- simpler first-version emotion pipeline

VRM remains a future extension for:

- full-body motion
- 3D scenes
- stronger spatial presentation
- multi-character or world-based experiences

## 5. Milestones

### M1: Gateway to Subtitle

Deliverables:

- connect to OpenClaw Gateway
- send a chat message
- receive assistant reply stream
- render real-time subtitles
- show session and run identifiers

Success criteria:

- user can chat with OpenClaw through ClawMuse
- assistant text appears incrementally

### M2: Subtitle to Speech

Deliverables:

- sentence chunking
- TTS queue
- streaming or batched playback
- playback state logs

Success criteria:

- assistant speech begins before the full reply completes

### M3: Speech to Lip Sync

Deliverables:

- playback amplitude tracking
- lip sync event emission
- mouth parameter binding in avatar-runtime

Success criteria:

- avatar mouth moves with audio playback

### M4: Text to Emotion and Motion

Deliverables:

- simple rule-based emotion detection
- simple rule-based motion triggers
- expression and motion queues

Success criteria:

- greeting, thinking, happy, shy, and neutral states feel coherent

### M5: Character Profiles

Deliverables:

- character manifest format
- selectable character profiles
- per-character avatar, voice, and motion defaults

Success criteria:

- switching characters changes the runtime presentation without code edits

### M6: Character Sources and Registry

Deliverables:

- builtin character source
- imported character source contract
- generated character source contract
- active character switching

Success criteria:

- the shell can switch characters without coupling to renderer-specific code

### M7: AI-Assisted Character Generation

Deliverables:

- generation request schema
- generation result schema
- provider abstraction for future model-backed generation
- manifest patch flow for adding generated expressions, motions, or upgraded characters

Success criteria:

- generated assets can be integrated through the same registry path as builtin or imported assets

### M8: Commercial Layer

Deliverables:

- account system requirements
- asset delivery strategy
- sync requirements
- subscription and credit boundaries

Success criteria:

- product and technical boundaries are ready for paid distribution

## 6. Implementation Plan by Module

### openclaw-adapter

Responsibilities:

- Gateway authentication
- session selection
- message send
- assistant stream observation
- connection diagnostics

Outputs:

- normalized internal events only

### avatar-driver

Responsibilities:

- define `loadModel`, `setEmotion`, `playMotion`, `setLipSync`, and disposal boundaries
- keep renderer-specific logic out of the core runtime
- support both Live2D-first delivery and future VRM expansion

### session-orchestrator

Responsibilities:

- accumulate deltas into a stable response buffer
- emit sentence or segment boundaries
- keep subtitle stream responsive
- avoid replaying already-spoken text
- derive lightweight emotion and motion hints

### speech-runtime

Responsibilities:

- segment queueing
- TTS generation
- playback serialization
- interruption handling
- amplitude sampling for lip sync

### avatar-runtime

Responsibilities:

- model loading
- stage state
- expression and motion queueing
- mouth movement
- focus and look-at behavior
- runtime diagnostics

### live2d-driver

Responsibilities:

- host the first concrete avatar-driver implementation
- migrate the minimum viable Live2D subset from AIRI
- support one builtin model, base emotion routing, lip sync, and pointer focus

### vrm-driver

Responsibilities:

- reserve the future renderer slot for 3D characters
- reuse the same avatar-driver interface instead of branching runtime-core

### character-profile

Responsibilities:

- character manifest schema
- avatar asset references
- default speech voice and style
- emotion to expression mapping
- motion names and priorities

### character-registry

Responsibilities:

- register builtin characters
- register imported characters
- register generated characters
- resolve active character and renderer kind
- keep asset-source concerns outside renderer code

### character-generation

Responsibilities:

- define request and result contracts for AI-assisted asset generation
- support `live2d` and `vrm` targets through a shared abstraction
- emit asset manifest patches instead of mutating live runtime state directly

### generation-provider

Responsibilities:

- wrap future model-backed generation services
- isolate provider-specific prompts, job polling, and file packaging
- keep `character-generation` stable even if provider choices change

### desktop-shell

Responsibilities:

- chat panel
- stage panel
- runtime log panel
- connection and model settings
- character selection

## 7. Risks

- OpenClaw event payload shape may evolve, so the adapter must isolate raw protocol dependencies.
- TTS latency can exceed subtitle cadence, so segmenting and queueing must tolerate lag.
- Emotion inference can easily become noisy; first version should use simple deterministic rules.
- Live2D and asset licensing must be treated as a separate product concern from code licensing.
- Live2D migration must avoid dragging AIRI's product-level stores and settings surface into ClawMuse.
- AI-assisted asset generation must stay asynchronous and registry-based, otherwise generated assets will couple directly to the renderer.

## 8. Initial Delivery Recommendation

Build order:

1. `openclaw-adapter`
2. `desktop-shell` subtitle-only prototype
3. `session-orchestrator`
4. `speech-runtime`
5. `avatar-driver`
6. `avatar-runtime` with `live2d-driver`
7. `character-profile`
8. `character-registry`
9. `character-generation` interface
10. `generation-provider` stubs

This keeps the project testable while preserving a short path to the first visible demo.
