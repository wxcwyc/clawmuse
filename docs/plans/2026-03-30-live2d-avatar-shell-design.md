# Live2D Avatar Shell Design

**Date:** 2026-03-30

## Goal

Turn the desktop Electron renderer into a character-first shell where the default UI is only the Live2D avatar. Connection, chat, and logs move behind character hotspots instead of taking permanent screen space.

## Scope

- Keep the current Live2D render chain and session model.
- Replace the always-visible panel layout with a single full-screen stage.
- Open `Connect`, `Chat`, and `Logs` from fixed avatar hotspots.
- Change model scaling so it respects the resource's native size and only scales down when needed.

## Interaction Model

- The stage fills the renderer viewport.
- The default state shows only the avatar and a minimal atmosphere background.
- Three fixed hotspot buttons sit over the approximate face area:
  - forehead -> `Connect`
  - mouth -> `Chat`
  - eyes -> `Logs`
- Only one overlay panel can be open at a time.
- Clicking outside the open panel closes it.
- If stage warnings exist, the `Logs` panel opens automatically so failures are visible.

## Layout

- [`App.vue`](/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/App.vue) becomes a single-stage composition.
- The existing `ConnectionPanel`, `ChatPanel`, and `LogPanel` components are reused as floating cards rather than grid columns.
- Stage overlays use absolute positioning and pointer-event isolation so the Live2D canvas still owns the main visual surface.

## Scaling Rule

- [`Live2DModel.vue`](/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DModel.vue) continues to fit the model within the renderer bounds.
- The fit scale is capped at `1`, so small models are not artificially enlarged.
- Large models still scale down to fit the viewport.
- The model remains bottom-centered.

## Error Handling

- Stage warnings still come from the existing preflight path.
- Warnings are surfaced in the floating `Logs` panel.
- If model load or stage checks fail, the character-first shell remains mounted and the user can still open `Logs`.

## Testing

- Update [`AppShell.test.ts`](/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/AppShell.test.ts) to assert:
  - default character-first shell renders
  - hotspot clicks open the correct panel
  - warning state auto-opens `Logs`
- Update [`Live2DModel.test.ts`](/home/dministrator/projects/clawmuse/packages/live2d-driver/src/components/Live2DModel.test.ts) to assert the fit scale never exceeds `1`.
