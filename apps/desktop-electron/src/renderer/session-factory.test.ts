import { describe, expect, it, vi } from 'vitest'

import { CharacterRegistry } from '../../../../packages/character-registry/src/registry'
import type { OpenClawGatewayTransport, OpenClawGatewayTransportLifecycle } from '../../../../packages/openclaw-adapter/src/types'

import { createBuiltinCharacterEntry } from './builtin-character'
import { createDesktopSessionFactory } from './session-factory'

describe('desktop-electron session factory', () => {
  it('creates a DesktopShellSession from the active registry-backed builtin character', async () => {
    const registry = new CharacterRegistry()
    registry.register(createBuiltinCharacterEntry())

    const transport = {
      start: vi.fn(),
      stop: vi.fn(),
      waitForReady: vi.fn(async () => {}),
      onEvent: vi.fn(() => () => {}),
      request: vi.fn(async () => ({ ok: true })),
    } satisfies OpenClawGatewayTransport & OpenClawGatewayTransportLifecycle
    const createTransport = vi.fn(() => transport)

    const createSession = createDesktopSessionFactory({
      registry,
      createTransport,
    })

    const session = createSession({
      url: 'ws://127.0.0.1:18789',
      token: 'gateway-token',
      password: '',
      sessionKey: 'main',
    })

    expect(session).toBeTruthy()
    expect(createTransport).toHaveBeenCalledWith({
      url: 'ws://127.0.0.1:18789',
      token: 'gateway-token',
      password: '',
    })

    await session.start()

    expect(transport.start).toHaveBeenCalledTimes(1)
  })
})
