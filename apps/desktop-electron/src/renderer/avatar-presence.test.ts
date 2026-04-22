import { describe, expect, it } from 'vitest'

import {
  resolveAvatarPresenceState,
  resolveAvatarPresenceTransition,
  shouldHoldPresenceFallback,
} from './avatar-presence'

describe('avatar presence', () => {
  it('maps UI/runtime signals to deterministic avatar presence states', () => {
    expect(resolveAvatarPresenceState({
      connectionStatus: 'idle',
      voiceInputListening: false,
    })).toBe('idle')
    expect(resolveAvatarPresenceState({
      connectionStatus: 'thinking',
      voiceInputListening: false,
    })).toBe('thinking')
    expect(resolveAvatarPresenceState({
      connectionStatus: 'speaking',
      voiceInputListening: false,
    })).toBe('speaking')
    expect(resolveAvatarPresenceState({
      connectionStatus: 'error',
      voiceInputListening: false,
    })).toBe('error')
    expect(resolveAvatarPresenceState({
      connectionStatus: 'speaking',
      voiceInputListening: true,
    })).toBe('listening')
  })

  it('holds fallback state pushes briefly after server emotion/motion directives', () => {
    expect(shouldHoldPresenceFallback({
      state: 'thinking',
      lastServerDirectiveAt: 1000,
      now: 1900,
      holdMs: 1200,
    })).toBe(true)

    expect(shouldHoldPresenceFallback({
      state: 'idle',
      lastServerDirectiveAt: 1000,
      now: 2400,
      holdMs: 1200,
    })).toBe(false)
  })

  it('never blocks explicit listening/error fallback states', () => {
    expect(shouldHoldPresenceFallback({
      state: 'listening',
      lastServerDirectiveAt: 1000,
      now: 1100,
      holdMs: 1200,
    })).toBe(false)
    expect(shouldHoldPresenceFallback({
      state: 'error',
      lastServerDirectiveAt: 1000,
      now: 1100,
      holdMs: 1200,
    })).toBe(false)
  })

  it('allows higher-priority transitions immediately', () => {
    expect(resolveAvatarPresenceTransition({
      currentState: 'thinking',
      nextState: 'listening',
      stateEnteredAt: 1_000,
      now: 1_050,
    })).toEqual({
      shouldTransition: true,
      waitMs: 0,
      reason: 'higher-priority',
    })
  })

  it('blocks lower-priority transition until minimum dwell has elapsed', () => {
    const decision = resolveAvatarPresenceTransition({
      currentState: 'speaking',
      nextState: 'idle',
      stateEnteredAt: 2_000,
      now: 2_400,
      minStateMsByState: {
        speaking: 900,
      },
    })

    expect(decision.shouldTransition).toBe(false)
    expect(decision.reason).toBe('min-dwell-blocked')
    expect(decision.waitMs).toBe(500)
  })

  it('allows lower-priority transition after minimum dwell time', () => {
    expect(resolveAvatarPresenceTransition({
      currentState: 'speaking',
      nextState: 'idle',
      stateEnteredAt: 2_000,
      now: 3_100,
      minStateMsByState: {
        speaking: 900,
      },
    })).toEqual({
      shouldTransition: true,
      waitMs: 0,
      reason: 'min-dwell-elapsed',
    })
  })
})
