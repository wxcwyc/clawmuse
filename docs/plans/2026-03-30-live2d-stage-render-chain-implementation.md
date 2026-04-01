# Live2D Stage Render Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the placeholder `Live2DStage.vue` with a real Pixi-backed Live2D render chain that loads one model and responds to focus and mouth-open updates through the shared `Live2DDriver`.

**Architecture:** Keep `Live2DStage.vue` as the migration boundary, make `Live2DCanvas.vue` own the Pixi application lifecycle, make `Live2DModel.vue` own Live2D model lifecycle, and extend `Live2DDriver` so a mounted stage can bind itself as the live controller after construction.

**Tech Stack:** Vue 3, TypeScript, Vitest, Pixi, `pixi-live2d-display`, Electron renderer wiring already present in the repository.

---

### Task 1: Add Driver Late-Binding Coverage

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/driver.test.ts`

**Step 1: Write the failing test**

Add tests that verify:

- a `Live2DDriver` created without a controller can bind one later
- runtime calls after binding reach the real controller
- unbinding restores noop behavior without throwing

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/driver.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because `Live2DDriver` does not yet support late controller binding.

**Step 3: Write minimal implementation**

Extend `Live2DDriver` with explicit bind and unbind methods while preserving the existing constructor-based injection path.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/live2d-driver/src/driver.ts packages/live2d-driver/src/driver.test.ts packages/live2d-driver/src/types.ts
git commit -m "feat: support late binding for live2d model controller"
```

### Task 2: Add Stage Orchestration Coverage

**Files:**
- Create: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DStage.test.ts`

**Step 1: Write the failing test**

Add a component-level test that verifies:

- mounting `Live2DStage.vue` triggers a model load
- updating `focusAt` triggers a focus call
- updating `mouthOpenSize` triggers a mouth-open call
- unmounting the stage disposes the controller

Stub `Live2DCanvas.vue` and `Live2DModel.vue` so the test stays focused on stage orchestration.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/components/Live2DStage.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the stage does not yet orchestrate the render chain.

**Step 3: Write minimal implementation**

Implement the stage orchestration surface needed to satisfy the test without adding motion or theme behavior.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/live2d-driver/src/components/Live2DStage.vue packages/live2d-driver/src/components/Live2DStage.test.ts
git commit -m "test: cover live2d stage orchestration"
```

### Task 3: Add Minimal Renderer Dependencies

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/package.json`
- Modify: `/home/dministrator/projects/clawmuse/pnpm-lock.yaml`

**Step 1: Write the failing test**

Use the next renderer-facing test or build step as the failure signal by attempting to import the Pixi and Live2D runtime modules from the driver components.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/components/Live2DStage.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL with module resolution errors for Pixi or `pixi-live2d-display`.

**Step 3: Write minimal implementation**

Add only the packages required by the minimal render chain and install them into the workspace.

**Step 4: Run test to verify it passes**

Run the same command again after installation.
Expected: PASS or proceed to the next missing-behavior failure.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add live2d renderer dependencies"
```

### Task 4: Implement `Live2DCanvas.vue`

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DCanvas.vue`

**Reference Source Files:**
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/components/scenes/live2d/Canvas.vue`

**Step 1: Write the failing test**

Rely on the stage orchestration test and the repository build to expose missing Pixi canvas lifecycle behavior.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/components/Live2DStage.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the canvas layer does not expose a usable Pixi application lifecycle.

**Step 3: Write minimal implementation**

Create a Pixi `Application`, attach its canvas to the DOM, react to size changes, expose the app through the slot, and destroy it on unmount.

**Step 4: Run test to verify it passes**

Run the same stage test command.
Expected: PASS for canvas-related assertions.

**Step 5: Commit**

```bash
git add packages/live2d-driver/src/components/Live2DCanvas.vue
git commit -m "feat: add pixi canvas lifecycle for live2d stage"
```

### Task 5: Implement `Live2DModel.vue`

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DModel.vue`

**Reference Source Files:**
- `/home/dministrator/projects/AIGirlFriend/packages/stage-ui-live2d/src/components/scenes/live2d/Model.vue`

**Step 1: Write the failing test**

Extend or add tests around the model control surface to verify:

- model load requests replace any prior model
- mouth-open updates write to `ParamMouthOpenY`
- focus updates call the model focus API
- dispose removes and destroys the current model

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/components/Live2DStage.test.ts packages/live2d-driver/src/driver.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL because the model component is still a placeholder.

**Step 3: Write minimal implementation**

Port only the minimal AIRI-derived logic needed for model lifecycle, scale, focus, and mouth-open parameter updates.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/live2d-driver/src/components/Live2DModel.vue
git commit -m "feat: add minimal live2d model lifecycle"
```

### Task 6: Wire the Real Stage Into the Desktop Shell

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DStage.vue`
- Modify: `/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/App.vue`

**Step 1: Write the failing test**

Use the stage test and, if needed, a renderer smoke test to verify the shared driver instance is the one given to both the UI stage and the runtime.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/live2d-driver/src/components/Live2DStage.test.ts apps/desktop-electron/src/entrypoints.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: FAIL if the stage is not yet using the shared driver instance correctly.

**Step 3: Write minimal implementation**

Keep one `Live2DDriver` in the renderer app, pass it to `Live2DStage.vue`, and let stage orchestration handle model binding and control propagation.

**Step 4: Run test to verify it passes**

Run the same command.
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/live2d-driver/src/components/Live2DStage.vue apps/desktop-electron/src/renderer/App.vue
git commit -m "feat: wire real live2d stage into desktop shell"
```

### Task 7: Verify the Slice End-to-End

**Files:**
- Modify: `/home/dministrator/projects/clawmuse/package.json`
  only if a script tweak is required for verification

**Step 1: Run targeted tests**

Run: `pnpm vitest run packages/live2d-driver/src/driver.test.ts packages/live2d-driver/src/components/Live2DStage.test.ts --config /home/dministrator/projects/clawmuse/vitest.config.ts`
Expected: PASS.

**Step 2: Run repository build**

Run: `pnpm build`
Expected: PASS with no TypeScript errors.

**Step 3: Run desktop renderer manually**

Run: `pnpm dev:desktop-electron`
Expected: the desktop shell opens with the Live2D stage mounting the real render chain instead of the placeholder-only wrapper.

**Step 4: Record any gaps**

If the manual run exposes unresolved Cubism asset or Electron-environment issues, document them before moving on to motion migration.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: migrate live2d stage to real render chain"
```
