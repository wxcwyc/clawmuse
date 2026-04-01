# ClawMuse Commercial Notes

## 1. Business Positioning

ClawMuse should not sell "OpenClaw integration" as the product.

The commercial value is the companion layer:

- character identity
- voice
- memory continuity
- relationship presentation
- asset quality
- multi-device experience

OpenClaw remains the underlying assistant brain. ClawMuse is the paid companion shell.

## 2. Recommended Monetization Model

Recommended pricing structure:

- `Free`
  - local-only
  - bring-your-own OpenClaw and model credentials
  - one base character
  - limited assets
- `Pro`
  - multiple characters
  - better voice options
  - richer avatar behaviors
  - basic cloud sync
- `Premium`
  - premium character assets
  - higher quality voices
  - persistent memory sync
  - cross-device continuity
  - advanced companion modes
- `Credits`
  - high-cost TTS
  - high-cost model usage
  - premium generation-heavy features

## 3. Product Boundaries

The project should separate:

- local runtime capabilities
- cloud account and billing capabilities

Local-first scope:

- avatar rendering
- subtitle rendering
- local speech playback
- local motion orchestration

Cloud-required scope:

- account login
- subscription state
- asset entitlement
- cloud memory sync
- paid voice/model routing

## 4. Licensing Risks

Code licensing and content licensing must be treated separately.

Important distinction:

- open-source code can be permissive
- avatar engine licensing can still be restricted
- avatar asset licensing can be even more restricted

For AIRI-derived references, the repository itself already notes that Cubism SDK usage should be treated as nonfree:

- `AIGirlFriend/nix/common.nix`

The bundled Hiyori sample model packages are also conditional, not blanket-free-for-all:

- small-scale users may have commercial usage rights under the official terms
- medium and large companies are restricted to non-public internal trial usage

Therefore:

- do not assume bundled AIRI Live2D assets are safe for commercial distribution
- do not assume MIT repo licensing covers Cubism SDK or model assets

## 5. Commercial Asset Policy

For any paid product:

- avoid shipping AIRI bundled Hiyori assets as the production commercial default
- obtain explicit commercial rights for every shipped Live2D model
- document voice rights separately from character art rights
- track asset provenance per character

Recommended internal policy:

- every character profile must include a rights manifest
- every voice must include a rights manifest
- commercial builds should allow asset inclusion only when entitlement is verified

## 6. Compliance and Safety

Key compliance areas:

- user message and memory storage
- emotional companion safety boundaries
- age and content gating
- voice cloning restrictions
- creator and art licensing
- provider terms for paid model and voice usage

## 7. Technical Planning for Paid Distribution

Must-have product systems before large-scale paid rollout:

- account system
- subscription state service
- asset delivery service
- sync service
- usage metering
- entitlement checks
- audit trail for asset licensing

## 8. Recommended First Commercial Strategy

The safest first commercial release is:

- local-first runtime
- paid asset packs
- optional premium voices
- limited cloud sync

This avoids making the initial business model entirely dependent on variable model inference cost.
