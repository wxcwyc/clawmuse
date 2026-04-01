import type { CharacterRegistryEntryInput } from '../../../../packages/character-registry/src/types'
import { createCharacterProfile } from '../../../../packages/character-profile/src/profile'

export function createBuiltinCharacterEntry(): CharacterRegistryEntryInput {
  return {
    source: 'builtin',
    profile: createCharacterProfile({
      id: 'builtin-hiyori',
      displayName: 'Builtin Hiyori',
      renderer: {
        kind: 'live2d',
        modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
      },
      voice: {
        defaultVoiceId: 'voice-hiyori',
      },
    }),
  }
}
