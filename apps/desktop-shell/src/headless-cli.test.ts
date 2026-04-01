import { describe, expect, it } from 'vitest'

import {
  createDefaultDemoProfile,
  parseHeadlessDemoCliArgs,
} from './headless-cli'

describe('headless-cli', () => {
  it('parses required message text and optional gateway flags', () => {
    const parsed = parseHeadlessDemoCliArgs([
      '--url',
      'ws://127.0.0.1:18789',
      '--token',
      'gateway-token',
      '--session-key',
      'main',
      '--run-id',
      'run-1',
      'Hello there',
    ])

    expect(parsed).toEqual({
      url: 'ws://127.0.0.1:18789',
      token: 'gateway-token',
      password: undefined,
      sessionKey: 'main',
      runId: 'run-1',
      message: 'Hello there',
    })
  })

  it('uses stable defaults when optional flags are omitted', () => {
    const parsed = parseHeadlessDemoCliArgs(['Hi'])

    expect(parsed.url).toBe('ws://127.0.0.1:18789')
    expect(parsed.sessionKey).toBe('main')
    expect(parsed.message).toBe('Hi')
    expect(parsed.runId).toMatch(/^run-/)
  })

  it('creates a default profile for the headless demo shell', () => {
    const profile = createDefaultDemoProfile()

    expect(profile).toMatchObject({
      id: 'builtin-hiyori',
      displayName: 'Builtin Hiyori',
      voice: {
        defaultVoiceId: 'voice-hiyori',
      },
    })
  })
})
