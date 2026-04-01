import type {
  CharacterRegistryEntry,
  CharacterRegistryEntryInput,
} from './types'

export class CharacterRegistry {
  private readonly entries = new Map<string, CharacterRegistryEntry>()
  private activeId: string | null = null

  register(entry: CharacterRegistryEntryInput): CharacterRegistryEntry {
    const next: CharacterRegistryEntry = {
      ...entry,
      id: entry.profile.id,
    }

    this.entries.set(next.id, next)
    if (!this.activeId) {
      this.activeId = next.id
    }

    return next
  }

  list(): CharacterRegistryEntry[] {
    return [...this.entries.values()]
  }

  setActive(id: string) {
    if (!this.entries.has(id)) {
      throw new Error(`Character registry entry "${id}" does not exist`)
    }

    this.activeId = id
  }

  getActive(): CharacterRegistryEntry | null {
    if (!this.activeId) {
      return null
    }

    return this.entries.get(this.activeId) ?? null
  }
}
