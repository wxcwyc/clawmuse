# openclaw-adapter

Adapter layer between OpenClaw Gateway and ClawMuse runtime events.

## What It Does

- connect to Gateway
- send chat requests
- observe reply stream events
- normalize upstream payloads into ClawMuse events

## Current Pieces

- `OpenClawGatewayChatAdapter`
  normalizes raw `chat` events into ClawMuse runtime events
- `OpenClawGatewayWebSocketTransport`
  implements the minimal Gateway WebSocket handshake for token/password-based clients

## Current Limits

- the transport only covers the first token/password handshake path
- it does not yet copy OpenClaw's reconnect, TLS, or device-auth stack
- it exists to keep ClawMuse decoupled while still enabling a real end-to-end integration path
