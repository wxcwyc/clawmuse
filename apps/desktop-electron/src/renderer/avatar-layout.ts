export interface AvatarBounds {
  width: number
  height: number
}

export interface AvatarAnchorPoint {
  x: number
  y: number
}

export interface AvatarZoneAnchor extends AvatarAnchorPoint {
  widthRatio: number
  heightRatio: number
}

export interface AvatarLayoutProfile {
  framePadding: {
    top: number
    right: number
    bottom: number
    left: number
  }
  interactionZones: {
    head: AvatarZoneAnchor
    body: AvatarZoneAnchor
  }
  dragZones: {
    leftArm: AvatarZoneAnchor
    rightArm: AvatarZoneAnchor
  }
}

const defaultAvatarLayout: AvatarLayoutProfile = {
  framePadding: {
    top: 42,
    right: 28,
    bottom: 18,
    left: 28,
  },
  interactionZones: {
    head: { x: 50, y: 18, widthRatio: 0.36, heightRatio: 0.22 },
    body: { x: 50, y: 44, widthRatio: 0.46, heightRatio: 0.32 },
  },
  dragZones: {
    leftArm: { x: 16, y: 54, widthRatio: 0.24, heightRatio: 0.3 },
    rightArm: { x: 84, y: 54, widthRatio: 0.24, heightRatio: 0.3 },
  },
}

const layoutByCharacterId: Record<string, AvatarLayoutProfile> = {
  'builtin-hiyori': defaultAvatarLayout,
}

export function resolveAvatarLayoutProfile(characterId?: string | null) {
  if (!characterId) {
    return defaultAvatarLayout
  }

  return layoutByCharacterId[characterId] ?? defaultAvatarLayout
}

export function resolveAvatarFrameSize(params: {
  bounds?: AvatarBounds | null
  layout: AvatarLayoutProfile
}) {
  if (!params.bounds) {
    return {
      width: 360,
      height: 840,
    }
  }

  return {
    width: Math.ceil(params.bounds.width + params.layout.framePadding.left + params.layout.framePadding.right),
    height: Math.ceil(params.bounds.height + params.layout.framePadding.top + params.layout.framePadding.bottom),
  }
}

export function resolveAvatarZoneStyle(params: {
  zone: AvatarZoneAnchor
  bounds?: AvatarBounds | null
  layout: AvatarLayoutProfile
}) {
  const frame = resolveAvatarFrameSize(params)

  return {
    left: `${params.zone.x}%`,
    top: `${params.zone.y}%`,
    width: `${Math.round(frame.width * params.zone.widthRatio)}px`,
    height: `${Math.round(frame.height * params.zone.heightRatio)}px`,
    transform: 'translate(-50%, -50%)',
  }
}
