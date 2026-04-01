import { describe, expect, it } from 'vitest'

import {
  resolveAvatarFrameSize,
  resolveAvatarLayoutProfile,
  resolveAvatarZoneStyle,
} from './avatar-layout'

describe('avatar-layout', () => {
  it('uses a tighter builtin hiyori frame based on measured avatar bounds', () => {
    const layout = resolveAvatarLayoutProfile('builtin-hiyori')

    expect(resolveAvatarFrameSize({
      bounds: {
        width: 412,
        height: 688,
      },
      layout,
    })).toEqual({
      width: 468,
      height: 748,
    })
  })

  it('maps builtin hiyori interaction zones into character-calibrated regions', () => {
    const layout = resolveAvatarLayoutProfile('builtin-hiyori')

    expect(resolveAvatarZoneStyle({
      zone: layout.interactionZones.head,
      bounds: {
        width: 412,
        height: 688,
      },
      layout,
    })).toMatchObject({
      left: '50%',
      top: '18%',
      width: '168px',
      height: '165px',
      transform: 'translate(-50%, -50%)',
    })

    expect(resolveAvatarZoneStyle({
      zone: layout.interactionZones.body,
      bounds: {
        width: 412,
        height: 688,
      },
      layout,
    })).toMatchObject({
      top: '44%',
    })
  })

  it('sizes arm drag zones from the current avatar frame instead of the full transparent window', () => {
    const layout = resolveAvatarLayoutProfile('builtin-hiyori')

    expect(resolveAvatarZoneStyle({
      zone: layout.dragZones.leftArm,
      bounds: {
        width: 412,
        height: 688,
      },
      layout,
    })).toEqual({
      left: '16%',
      top: '54%',
      width: '112px',
      height: '224px',
      transform: 'translate(-50%, -50%)',
    })
  })
})
