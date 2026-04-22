# Third-Party Notices and Release Boundaries

This repository is open-sourced under the MIT License, but not every runtime,
asset, or optional bundle mentioned by the project is covered by that license.

## Not included in the repository by default

The public repository intentionally does **not** include:

- Open-LLM-VTuber source bundles
- CosyVoice source bundles
- offline ASR model archives
- offline Python runtimes or wheelhouses

If you add or redistribute any of the above yourself, you are responsible for
verifying the relevant license terms and redistribution rights.

## Important third-party components

### Live2D / Cubism

- ClawMuse can load Live2D models, but Live2D SDK/Core and sample assets are
  governed by Live2D's own license terms.
- This repository currently includes a checked-in copy of
  `live2dcubismcore.min.js` because the official SDK package marks that file as
  redistributable.
- This repository also includes the official `Hiyori` sample model assets so the
  app can render a builtin character on first run.
- Those `Hiyori` assets remain owned by Live2D Inc., are not relicensed under
  MIT by this repository, and remain subject to Live2D's sample-data terms.
- The repository includes those files only as a builtin runtime sample for
  ClawMuse and not as a general-purpose asset pack.

Official references:

- <https://www.live2d.com/en/sdk/license/>
- <https://www.live2d.com/en/download/sample-data/>
- <https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html>
- <https://www.live2d.com/eula/live2d-sample-model-terms_en.html>
- <https://help.live2d.com/en/other/other_16/>
- <https://help.live2d.com/en/other/other_31/>

### pixi-live2d-display

- `pixi-live2d-display` is a separate dependency used for Live2D display on PixiJS.
- Its code license is MIT.
- Example Live2D models remain subject to Live2D material terms rather than the
  library's MIT license.

Official reference:

- <https://github.com/guansss/pixi-live2d-display>

### Open-LLM-VTuber

- ClawMuse can integrate with Open-LLM-VTuber as an optional upstream/backend.
- Open-LLM-VTuber is licensed separately.
- Its repository also publishes a dedicated Live2D notice for sample/model data.

Official references:

- <https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>
- <https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/LICENSE>
- <https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/blob/main/LICENSE-Live2D.md>

### OpenClaw

- ClawMuse is designed to work with OpenClaw, but it is a separate project and
  remains under OpenClaw's own license and branding.

Official reference:

- <https://github.com/openclaw/openclaw>

## Practical rule for contributors

Treat **code**, **SDK/runtime binaries**, **model assets**, and **downloaded
offline data** as separate licensing categories. Do not assume one MIT-licensed
repository makes every bundled runtime or asset safe to redistribute.

## Legal note

This file is an engineering release note, not legal advice. If you plan to ship
commercial builds or redistribute third-party assets at scale, get a proper
legal review.
