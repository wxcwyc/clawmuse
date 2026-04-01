# Live2D Avatar Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the Electron renderer into a character-only Live2D shell with hotspot-triggered floating panels and native-size-aware model scaling.

**Architecture:** Keep the existing stage, session model, and panel components, but change the renderer composition so the stage owns the full viewport and panels render as overlay cards opened by avatar hotspots. Update the Live2D model fit logic to downscale-to-fit without upscaling past the model's intrinsic size.

**Tech Stack:** Vue 3, Electron renderer, Vitest, Vue Test Utils, pixi-live2d-display

---

### Task 1: Lock the new renderer interaction in tests

**Files:**
- Modify: `apps/desktop-electron/src/renderer/AppShell.test.ts`

**Step 1: Write the failing assertions**

- Assert the default shell only shows the stage shell with hotspot controls and no always-visible `Connection` heading.
- Assert clicking the forehead hotspot opens the connection panel.
- Assert clicking the mouth hotspot opens the chat panel.
- Assert clicking the eye hotspot opens the logs panel.
- Assert warning state auto-opens the logs panel.

**Step 2: Run test to verify it fails**

Run: `npm test -- apps/desktop-electron/src/renderer/AppShell.test.ts`

**Step 3: Implement the minimal renderer shell changes**

- Rebuild `App.vue` around a full-screen stage and overlay panels.

**Step 4: Run test to verify it passes**

Run: `npm test -- apps/desktop-electron/src/renderer/AppShell.test.ts`

### Task 2: Lock the model scaling rule in tests

**Files:**
- Modify: `packages/live2d-driver/src/components/Live2DModel.test.ts`

**Step 1: Write the failing assertion**

- Assert the model scale setter receives `1` instead of a larger value when the renderer is bigger than the model.

**Step 2: Run test to verify it fails**

Run: `npm test -- packages/live2d-driver/src/components/Live2DModel.test.ts`

**Step 3: Implement the scaling cap**

- Update `Live2DModel.vue` fit math to cap the chosen scale at `1`.

**Step 4: Run test to verify it passes**

Run: `npm test -- packages/live2d-driver/src/components/Live2DModel.test.ts`

### Task 3: Convert renderer layout to hotspot overlays

**Files:**
- Modify: `apps/desktop-electron/src/renderer/App.vue`
- Modify: `apps/desktop-electron/src/renderer/components/ConnectionPanel.vue`
- Modify: `apps/desktop-electron/src/renderer/components/ChatPanel.vue`
- Modify: `apps/desktop-electron/src/renderer/components/LogPanel.vue`

**Step 1: Implement shell state**

- Add a single `openPanel` state with `connection | chat | logs | null`.
- Add hotspot handlers and outside-click dismiss behavior.

**Step 2: Replace the page grid**

- Remove the permanent side-by-side dashboard layout.
- Render only the Live2D stage by default.
- Add three hotspot buttons placed over the avatar face area.
- Render floating panels anchored to the stage when their hotspot is active.

**Step 3: Keep warnings visible**

- Auto-open `logs` when `stageWarnings` becomes non-empty.

**Step 4: Re-run renderer tests**

Run: `npm test -- apps/desktop-electron/src/renderer/AppShell.test.ts`

### Task 4: Update Live2D fit behavior

**Files:**
- Modify: `packages/live2d-driver/src/components/Live2DModel.vue`

**Step 1: Adjust fit logic**

- Keep bottom-center placement.
- Change scale selection to `min(1, widthScale, heightScale)` with a tiny positive floor.

**Step 2: Re-run model tests**

Run: `npm test -- packages/live2d-driver/src/components/Live2DModel.test.ts`

### Task 5: Run full verification

**Files:**
- No code changes required

**Step 1: Run targeted tests**

Run: `npm test -- apps/desktop-electron/src/renderer/AppShell.test.ts packages/live2d-driver/src/components/Live2DModel.test.ts packages/live2d-driver/src/components/Live2DCanvas.test.ts`

**Step 2: Run full repository tests**

Run: `npm test`

**Step 3: Run typecheck**

Run: `npm run build`

**Step 4: Run Electron build**

Run: `npm run build:desktop-electron`
