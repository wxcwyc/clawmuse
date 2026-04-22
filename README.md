# ClawMuse

ClawMuse is a desktop avatar runtime that turns OpenClaw replies into:

- subtitles
- voice playback
- lip sync
- expressions
- motions

In one sentence: **ClawMuse is the shell that makes OpenClaw feel like a speaking, animated desktop character.**

## What it is

ClawMuse sits between an agent/chat backend and an avatar presentation layer.

OpenClaw remains the conversation brain and session system. ClawMuse handles the
presentation loop:

1. receive streaming reply text
2. render subtitles immediately
3. split text into spoken segments
4. play speech
5. drive mouth movement, emotion, and simple motions from runtime events

The first target is a Live2D-first desktop experience for AI companion
scenarios. VRM remains a later expansion path.

## Scope

ClawMuse is intentionally separated from both OpenClaw and AIRI:

- it does not embed OpenClaw UI
- it does not modify AIRI directly
- it consumes OpenClaw Gateway events through an adapter
- it owns avatar runtime, speech runtime, and companion presentation logic

## Repository layout

- `apps/desktop-shell`  
  Headless runtime session, demo CLI, and gateway orchestration
- `apps/desktop-electron`  
  Electron shell, preload bridge, renderer model, and stage bootstrap
- `packages/openclaw-adapter`  
  OpenClaw Gateway integration and event normalization
- `packages/session-orchestrator`  
  Converts text stream events into subtitle / speech / emotion / motion events
- `packages/speech-runtime`  
  Sentence chunking, TTS queueing, playback, and lip sync output
- `packages/avatar-runtime`  
  Live2D / VRM presentation runtime
- `packages/live2d-driver`  
  ClawMuse-owned Live2D driver boundary and stage components
- `packages/character-profile`  
  Character asset manifests, voice defaults, motion mappings, and presentation rules
- `packages/character-registry`  
  Builtin / imported / generated character source registry

## Current status

The project already has:

- a working headless runtime chain
- a first Electron shell bootstrap
- a real Pixi + Live2D render chain boundary
- a local voice service bridge for STT + TTS

Current constraints:

- the renderer UI is still minimal and focused on connection, chat, subtitles, and logs
- the builtin character is a placeholder flow, not a redistributable production avatar pack
- motion / blink / richer presentation behaviors are still evolving

## Open-source release boundary

This repository is open-sourced under the MIT License for **ClawMuse code**.

However, some runtimes and assets mentioned by the project are **not** covered by
that MIT license and are **not shipped by default** in the public repo:

- Live2D Cubism Core runtime files
- Live2D model assets
- Open-LLM-VTuber source bundles
- CosyVoice source bundles
- offline ASR model archives
- offline Python runtimes / wheelhouses

Read `THIRD_PARTY_NOTICES.md` before redistributing any of those.

## Local development

Install dependencies in the repository root:

```bash
pnpm install
```

Start the Electron shell:

```bash
pnpm dev:desktop-electron
```

### Live2D setup for local development

This repository includes:

- a checked-in copy of the Redistributable `live2dcubismcore.min.js` runtime
  file from the official Live2D Cubism SDK package
- a checked-in copy of the official `Hiyori` sample model assets so the desktop
  stage can boot and render out of the box

Builtin asset path:

- `apps/desktop-electron/src/renderer/public/live2d/builtin-hiyori/Hiyori.model3.json`

Important license note:

- Live2D Cubism Core remains under Live2D's own license terms even when copied
  into this repository.
- The bundled `Hiyori` assets are sample data owned by Live2D Inc. and are not
  covered by this repository's MIT license.
- Live2D sample models are **not** blanket-free assets. Official Live2D help
  says General Users / Small-Scale Enterprises may publish works using sample
  models in some cases, but use still remains subject to the Free Material
  License Agreement, model-specific terms, copyright notice requirements, and
  any separate Live2D rules that apply to expandable/avatar-style applications.
- For Hiyori specifically, Live2D lists additional character-specific
  restrictions, including no design changes.

See `THIRD_PARTY_NOTICES.md` before redistributing any Live2D runtime or model
asset with your own build.

If you replace the builtin model or add more characters, put them at:

- `apps/desktop-electron/src/renderer/public/live2d/<character-id>/...`

## Integrated voice service (STT + TTS)

Desktop Electron can start a local voice adapter automatically on app launch:

- STT endpoint: `http://127.0.0.1:8788/stt`
- TTS endpoint: `http://127.0.0.1:8787/tts`

Renderer defaults use these local endpoints (`Local HTTP STT` + `Local HTTP TTS`).

The adapter proxies to an upstream speech backend (default is Open-LLM-VTuber):

- upstream base: `http://127.0.0.1:12393`
- STT proxy target: `POST /asr`
- TTS proxy target: `WS /tts-ws`

Environment overrides:

- `CLAWMUSE_VOICE_STT_HOST`
- `CLAWMUSE_VOICE_STT_PORT`
- `CLAWMUSE_VOICE_TTS_HOST`
- `CLAWMUSE_VOICE_TTS_PORT`
- `CLAWMUSE_VOICE_BACKEND_URL`
- `CLAWMUSE_VOICE_BACKEND_AUTO_LAUNCH`
- `CLAWMUSE_VOICE_BACKEND_CMD`
- `CLAWMUSE_VOICE_BACKEND_CWD`
- `CLAWMUSE_VOICE_BACKEND_STARTUP_TIMEOUT_MS`

## Windows packaging

```bash
pnpm run pack:win-unpacked
```

### Safe default

The default `pack:win-unpacked` flow now builds the app **without automatically
bundling third-party voice backends, offline models, or Python runtimes**.

This is intentional for open-source release safety.

### Optional explicit bundling

If you have the rights and want to make a private/internal bundle, you can opt in:

- `CLAWMUSE_BUNDLE_VOICE_BACKEND=1`
- `CLAWMUSE_BUNDLE_COSYVOICE_BACKEND=1`
- `CLAWMUSE_BUNDLE_ASR_MODEL=1`
- `CLAWMUSE_BUNDLE_PYTHON_RUNTIME=1`
- `CLAWMUSE_BUNDLE_WHEELHOUSE=1`

Useful source-path overrides:

- `CLAWMUSE_VOICE_BACKEND_SOURCE=/your/path/Open-LLM-VTuber`
- `CLAWMUSE_COSYVOICE_BACKEND_SOURCE=/your/path/CosyVoice`
- `CLAWMUSE_VOICE_ASR_MODEL_ARCHIVE_SOURCE=/path/model.tar.bz2`
- `CLAWMUSE_VOICE_ASR_MODEL_DIR_SOURCE=/path/model-dir`
- `CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE=/path/to/python-runtime`
- `CLAWMUSE_VOICE_WHEELHOUSE_SOURCE=/path/to/wheelhouse`
- `CLAWMUSE_VOICE_BUNDLE_STRICT=1`

### Offline strict packaging

For explicit internal/offline handoff flows:

```bash
pnpm run voice:prepare-offline-assets
pnpm run pack:win-unpacked:offline
```

`pack:win-unpacked:offline` is an explicit opt-in path that turns bundling back
on and expects you to have already verified redistribution rights for every
bundled backend/runtime/model.

## Related documents

- `docs/engineering-plan.md`
- `docs/message-protocol.md`
- `docs/commercial-notes.md`
- `THIRD_PARTY_NOTICES.md`

## License

- ClawMuse code: [MIT](./LICENSE)
- Third-party runtimes, SDKs, and assets: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
