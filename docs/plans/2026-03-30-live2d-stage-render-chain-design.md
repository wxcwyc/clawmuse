# Live2D Stage Render Chain Design

## Goal

Move `packages/live2d-driver/src/components/Live2DStage.vue` from a placeholder wrapper to the first real ClawMuse-owned Live2D render chain migrated from AIRI.

This slice should make the desktop shell capable of mounting a Pixi-backed Live2D stage, loading one model, reacting to focus updates, and applying lip-sync mouth values without importing AIRI product state.

## Scope

This design covers the smallest viable migration slice:

- Pixi canvas setup
- Live2D model loading
- model disposal
- pointer focus forwarding
- mouth-open parameter updates
- binding the rendered stage back to the existing `Live2DDriver`

This design explicitly does not cover:

- AIRI Pinia stores
- theme systems
- runtime motion editor behavior
- idle and blink plugins
- advanced motion routing
- importer or settings UI

## Approved Approach

ClawMuse should keep the current split between `Stage`, `Canvas`, and `Model`, but make each layer real:

- `Live2DStage.vue`
  owns orchestration and the migration boundary
- `Live2DCanvas.vue`
  owns Pixi `Application` lifecycle and resize
- `Live2DModel.vue`
  owns `pixi-live2d-display` model lifecycle and direct model parameter writes

The stage component should create a local controller that implements the minimum `Live2DModelController` surface needed by this slice, then bind that controller into the passed-in `Live2DDriver` instance.

This preserves the existing runtime-facing driver contract while allowing the renderer tree to stay Vue-native.

## Why This Approach

Putting the full render chain directly into `Live2DStage.vue` would make the first migration quick, but it would collapse the intended boundaries and make future work on motion, diagnostics, and renderer reuse harder.

Porting more of AIRI now would overshoot the approved slice and pull in stateful dependencies that ClawMuse has already decided to exclude from the first desktop renderer.

The approved approach keeps the current package structure, satisfies the current runtime contract, and leaves a clean place to add motion and blink later.

## Architecture

### `Live2DStage.vue`

Responsibilities:

- host the render-chain assembly
- create and bind a stage-local controller
- trigger initial model load when the stage mounts
- react to `modelSource`, `modelId`, `focusAt`, and `mouthOpenSize` prop changes
- dispose the controller and unbind it from the driver when unmounted

`Live2DStage.vue` should remain the ClawMuse-owned migration boundary. It should know about the driver, but it should not own Pixi internals directly.

### `Live2DCanvas.vue`

Responsibilities:

- create the Pixi `Application`
- attach the Pixi canvas to the DOM
- resize the renderer when container dimensions change
- expose the active Pixi application to the model layer
- destroy the Pixi application on unmount

This component should not know about model source, lip sync, or focus.

### `Live2DModel.vue`

Responsibilities:

- load a Live2D model via `pixi-live2d-display`
- attach the model to the Pixi stage
- compute initial scale and position for the model
- write `ParamMouthOpenY` when mouth-open changes
- forward focus calls via `model.focus(x, y)`
- tear down the current model cleanly before loading a new one

This component should expose only the minimum control surface needed by the stage-local controller:

- `loadModel`
- `setMouthOpen`
- `setFocusAt`
- `dispose`

## Driver Binding

The current `Live2DDriver` can only receive a controller at construction time. That does not match the real renderer lifecycle, because the stage mounts later inside Vue.

The driver therefore needs a small extension:

- support binding a controller after construction
- keep a noop controller when nothing is bound yet
- support unbinding on component teardown

This keeps the runtime free to instantiate a `Live2DDriver` before the stage exists, while still allowing the stage to become the concrete renderer endpoint later.

## Data Flow

The desktop renderer should keep one shared `Live2DDriver` instance.

Flow:

1. `App.vue` creates one `Live2DDriver`
2. `App.vue` passes that instance to `Live2DStage.vue`
3. `Live2DStage.vue` binds its local controller into the driver on mount
4. `Live2DStage.vue` calls `driver.loadModel({ modelSource, modelId })`
5. `Live2DDriver` forwards to the bound controller
6. The controller forwards to `Live2DModel.vue`
7. Runtime-driven `setLipSync` and `setFocusAt` calls hit the same driver instance and therefore the same mounted model

This ensures the session/runtime path and the visible stage are manipulating the same render target.

## Dependencies

Add only the minimum runtime dependencies required for this slice:

- Pixi runtime packages
- `pixi-live2d-display`

Do not add AIRI-specific packages, state libraries, or theme utilities for this migration.

## Error Handling

If model loading fails:

- log the error in the renderer
- leave the stage mounted
- keep the controller reusable for a later model reload

If the driver receives runtime calls before the stage binds:

- noop behavior is acceptable for this slice
- once bound, future calls should hit the real controller

## Testing Strategy

Use test-first implementation.

Required tests:

- `driver.test.ts`
  verify late controller binding and unbinding work with the existing driver API
- stage component test
  verify mount triggers model load, prop updates trigger focus and mouth updates, and unmount disposes resources

Manual verification after code changes:

- run the live2d-driver tests
- run the repository build
- launch the Electron renderer to confirm the stage no longer renders the placeholder-only shell

## Success Criteria

This migration slice is complete when:

- `Live2DStage.vue` no longer renders as a placeholder-only wrapper
- the stage creates a real Pixi-backed Live2D scene
- the shared `Live2DDriver` can control the mounted model after Vue mount
- focus and mouth-open updates propagate to the model
- the new behavior is covered by tests and verified with a fresh local run
