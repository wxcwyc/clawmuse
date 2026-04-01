# ClawMuse Electron Live2D Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first explorable ClawMuse Electron shell with one builtin Live2D character, OpenClaw chat connectivity, subtitles, speech playback, lip sync, and a future-ready character architecture.

**Architecture:** Keep the existing ClawMuse runtime-core intact, add an `avatar-driver` abstraction and a minimal `live2d-driver`, then wrap them in a new Electron desktop shell. Reserve character-source and AI-generation interfaces early, but only implement the smallest desktop path now.

**Tech Stack:** Electron, Vite, TypeScript, Vue 3, Pixi, Live2D Cubism Web SDK, `pixi-live2d-display`, existing ClawMuse runtime packages, Vitest.

---

### Task 1: Update Docs and File Skeleton

**Files:**
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/package.json`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/main/index.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/preload/index.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/main.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/App.vue`
- Create: `/home/dministrator/projects/clawmuse/packages/avatar-driver/package.json`
- Create: `/home/dministrator/projects/clawmuse/packages/avatar-driver/src/index.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/package.json`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/index.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/character-registry/package.json`
- Create: `/home/dministrator/projects/clawmuse/packages/character-registry/src/index.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/character-generation/package.json`
- Create: `/home/dministrator/projects/clawmuse/packages/character-generation/src/index.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/generation-provider/package.json`
- Create: `/home/dministrator/projects/clawmuse/packages/generation-provider/src/index.ts`

**Step 1: Write the failing test**

Create a smoke test that imports the new package entrypoints and the Electron renderer entry module.

**Step 2: Run test to verify it fails**

Run: `vitest run <new smoke test> --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the new entrypoints do not exist yet.

**Step 3: Write minimal implementation**

Create the package and app entry files with placeholder exports only.

**Step 4: Run test to verify it passes**

Run the same `vitest` command.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop-electron packages/avatar-driver packages/live2d-driver packages/character-registry packages/character-generation packages/generation-provider
git commit -m "feat: add electron shell and driver package skeletons"
```

### Task 2: Extract Avatar Driver Contract

**Files:**
- Create: `/home/dministrator/projects/clawmuse/packages/avatar-driver/src/types.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/avatar-driver/src/driver.test.ts`
- Modify: `/home/dministrator/projects/clawmuse/packages/avatar-runtime/src/types.ts`
- Modify: `/home/dministrator/projects/clawmuse/packages/avatar-runtime/src/runtime.ts`

**Step 1: Write the failing test**

Write a test that verifies `avatar-runtime` consumes a driver defined by `avatar-driver`, not its own duplicated local contract.

**Step 2: Run test to verify it fails**

Run: `vitest run packages/avatar-driver/src/driver.test.ts packages/avatar-runtime/src/runtime.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the new shared driver contract is not wired in yet.

**Step 3: Write minimal implementation**

Move the stable driver-facing types into `avatar-driver`, then make `avatar-runtime` import them.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/avatar-driver packages/avatar-runtime
git commit -m "refactor: extract shared avatar driver contract"
```

### Task 3: Add Character Registry and Source Types

**Files:**
- Create: `/home/dministrator/projects/clawmuse/packages/character-registry/src/types.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/character-registry/src/registry.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/character-registry/src/registry.test.ts`
- Modify: `/home/dministrator/projects/clawmuse/packages/character-profile/src/types.ts`

**Step 1: Write the failing test**

Write tests that verify the registry can:

- register a builtin character
- register an imported character
- register a generated character
- resolve the active character

**Step 2: Run test to verify it fails**

Run: `vitest run packages/character-registry/src/registry.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the registry does not exist yet.

**Step 3: Write minimal implementation**

Implement a small registry with explicit `source` and `rendererKind` metadata.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/character-registry packages/character-profile
git commit -m "feat: add character registry with source-aware entries"
```

### Task 4: Add AI Generation Contracts Only

**Files:**
- Create: `/home/dministrator/projects/clawmuse/packages/character-generation/src/types.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/character-generation/src/contracts.test.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/generation-provider/src/types.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/generation-provider/src/index.ts`

**Step 1: Write the failing test**

Write tests that verify generation requests and results support:

- `targetKind: live2d | vrm`
- `tasks: expression-pack | motion-pack | full-character-upgrade`
- `assetManifestPatch`
- generated file descriptors

**Step 2: Run test to verify it fails**

Run: `vitest run packages/character-generation/src/contracts.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the contracts do not exist.

**Step 3: Write minimal implementation**

Define data-only generation request/result/provider types. Do not implement provider behavior yet.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/character-generation packages/generation-provider
git commit -m "feat: add AI generation contracts for future character assets"
```

### Task 5: Migrate Minimal Live2D Renderer

**Files:**
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DStage.vue`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DCanvas.vue`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DModel.vue`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/composables/motion-manager.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/driver.ts`
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/driver.test.ts`
- Modify: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/index.ts`

**Reference Source Files:**
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/components/scenes/Live2D.vue`
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/components/scenes/live2d/Canvas.vue`
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/components/scenes/live2d/Model.vue`
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/composables/live2d/motion-manager.ts`

**Step 1: Write the failing test**

Write tests for the driver contract that verify:

- one builtin model can be loaded
- `setLipSync` updates the mouth parameter
- `setEmotion` and `playMotion` route into the migrated model layer

**Step 2: Run test to verify it fails**

Run: `vitest run packages/live2d-driver/src/driver.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the migrated driver does not exist yet.

**Step 3: Write minimal implementation**

Port only the required AIRI logic and replace AIRI store dependencies with props and explicit driver methods.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/live2d-driver
git commit -m "feat: add minimal live2d driver for electron shell"
```

### Task 6: Build the Electron Shell

**Files:**
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/electron.vite.config.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/components/ConnectionPanel.vue`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/components/ChatPanel.vue`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/components/LogPanel.vue`
- Modify: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/App.vue`

**Step 1: Write the failing test**

Write a renderer test that verifies the app can:

- collect Gateway connection fields
- send a message
- render subtitle text
- render log text
- mount the Live2D stage component

**Step 2: Run test to verify it fails**

Run: `vitest run apps/desktop-electron/src/renderer/App.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the renderer shell does not exist yet.

**Step 3: Write minimal implementation**

Implement a single-page shell with a thin local state layer. Do not add settings frameworks or multi-page routing.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop-electron
git commit -m "feat: add first electron shell ui"
```

### Task 7: Wire Session, Registry, and Builtin Character

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/apps/desktop-shell/src/session.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/session-factory.ts`
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/builtin-character.ts`
- Modify: `/home/dministrator/projects/clawmuse/apps/desktop-shell/src/headless-cli.ts`

**Step 1: Write the failing test**

Write tests that verify the shell can create a session from a registry-backed builtin character entry.

**Step 2: Run test to verify it fails**

Run: `vitest run apps/desktop-shell/src/session.test.ts apps/desktop-electron/src/renderer/session-factory.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the registry-backed session creation path does not exist.

**Step 3: Write minimal implementation**

Use `character-registry` to provide one builtin Live2D character and create the session from that source.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop-shell apps/desktop-electron packages/character-registry
git commit -m "feat: wire builtin character registry into shell sessions"
```

### Task 8: Add Electron Smoke Verification

**Files:**
- Create: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/main/index.test.ts`
- Modify: `/home/dministrator/projects/clawmuse/package.json`
- Modify: `/home/dministrator/projects/clawmuse/README.md`

**Step 1: Write the failing test**

Write a smoke test that verifies the Electron main process can construct the BrowserWindow setup and preload path resolution without booting the full app.

**Step 2: Run test to verify it fails**

Run: `vitest run apps/desktop-electron/src/main/index.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the smoke path is not verified yet.

**Step 3: Write minimal implementation**

Add smoke-safe boot wiring and document how to run the first desktop shell locally.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop-electron package.json README.md
git commit -m "docs: add electron shell run path and smoke coverage"
```
