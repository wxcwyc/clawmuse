import type { CharacterProfile } from '../../character-profile/src/types'

export type CharacterSource = 'builtin' | 'imported' | 'generated'

export interface CharacterRegistryEntryInput {
  source: CharacterSource
  profile: CharacterProfile
}

export interface CharacterRegistryEntry extends CharacterRegistryEntryInput {
  id: string
}
