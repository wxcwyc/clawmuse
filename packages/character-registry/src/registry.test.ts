import { describe, expect, it } from 'vitest'

import { createCharacterProfile } from '../../character-profile/src/profile'

import { CharacterRegistry } from './registry'

function createProfile(id: string, kind: 'live2d' | 'vrm' = 'live2d') {
  return createCharacterProfile({
    id,
    displayName: id,
    renderer: {
      kind,
      modelSource: `assets://${id}`,
    },
    voice: {
      defaultVoiceId: `voice-${id}`,
    },
  })
}

describe('CharacterRegistry', () => {
  it('registers builtin, imported, and generated character entries', () => {
    const registry = new CharacterRegistry()

    registry.register({
      source: 'builtin',
      profile: createProfile('builtin-1'),
    })
    registry.register({
      source: 'imported',
      profile: createProfile('imported-1'),
    })
    registry.register({
      source: 'generated',
      profile: createProfile('generated-1', 'vrm'),
    })

    expect(registry.list()).toEqual([
      expect.objectContaining({ id: 'builtin-1', source: 'builtin' }),
      expect.objectContaining({ id: 'imported-1', source: 'imported' }),
      expect.objectContaining({ id: 'generated-1', source: 'generated' }),
    ])
  })

  it('resolves and switches the active character entry', () => {
    const registry = new CharacterRegistry()

    registry.register({
      source: 'builtin',
      profile: createProfile('airi'),
    })
    registry.register({
      source: 'generated',
      profile: createProfile('muse'),
    })

    expect(registry.getActive()).toMatchObject({
      id: 'airi',
      source: 'builtin',
    })

    registry.setActive('muse')

    expect(registry.getActive()).toMatchObject({
      id: 'muse',
      source: 'generated',
    })
  })
})
