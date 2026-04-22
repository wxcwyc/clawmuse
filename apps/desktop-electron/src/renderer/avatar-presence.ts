export type RendererConnectionStatus = 'idle' | 'connecting' | 'thinking' | 'speaking' | 'error'

export type AvatarPresenceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export const DEFAULT_AVATAR_PRESENCE_MIN_STATE_MS: Record<AvatarPresenceState, number> = {
  idle: 680,
  listening: 620,
  thinking: 900,
  speaking: 980,
  error: 1200,
}

export const AVATAR_PRESENCE_STATE_PRIORITY: Record<AvatarPresenceState, number> = {
  idle: 1,
  thinking: 2,
  speaking: 3,
  listening: 4,
  error: 5,
}

export type AvatarPresenceTransitionDecision = {
  shouldTransition: boolean
  waitMs: number
  reason: 'initial' | 'same-state' | 'higher-priority' | 'min-dwell-elapsed' | 'min-dwell-blocked'
}

export function resolveAvatarPresenceState(params: {
  connectionStatus: RendererConnectionStatus
  voiceInputListening: boolean
}): AvatarPresenceState {
  if (params.voiceInputListening) {
    return 'listening'
  }

  switch (params.connectionStatus) {
    case 'error':
      return 'error'
    case 'thinking':
      return 'thinking'
    case 'speaking':
      return 'speaking'
    default:
      return 'idle'
  }
}

export function shouldHoldPresenceFallback(params: {
  state: AvatarPresenceState
  lastServerDirectiveAt: number
  now: number
  holdMs: number
}): boolean {
  if (params.lastServerDirectiveAt <= 0) {
    return false
  }

  if (params.state === 'listening' || params.state === 'error') {
    return false
  }

  return (params.now - params.lastServerDirectiveAt) < params.holdMs
}

export function resolveAvatarPresenceTransition(params: {
  currentState: AvatarPresenceState | null
  nextState: AvatarPresenceState
  stateEnteredAt: number
  now: number
  minStateMsByState?: Partial<Record<AvatarPresenceState, number>>
}): AvatarPresenceTransitionDecision {
  if (!params.currentState) {
    return {
      shouldTransition: true,
      waitMs: 0,
      reason: 'initial',
    }
  }

  if (params.currentState === params.nextState) {
    return {
      shouldTransition: false,
      waitMs: 0,
      reason: 'same-state',
    }
  }

  const nextPriority = AVATAR_PRESENCE_STATE_PRIORITY[params.nextState]
  const currentPriority = AVATAR_PRESENCE_STATE_PRIORITY[params.currentState]
  if (nextPriority > currentPriority) {
    return {
      shouldTransition: true,
      waitMs: 0,
      reason: 'higher-priority',
    }
  }

  const minStateMs = params.minStateMsByState?.[params.currentState]
    ?? DEFAULT_AVATAR_PRESENCE_MIN_STATE_MS[params.currentState]
  const elapsed = Math.max(0, params.now - params.stateEnteredAt)
  if (elapsed >= minStateMs) {
    return {
      shouldTransition: true,
      waitMs: 0,
      reason: 'min-dwell-elapsed',
    }
  }

  return {
    shouldTransition: false,
    waitMs: Math.max(0, minStateMs - elapsed),
    reason: 'min-dwell-blocked',
  }
}
