import { describe, expect, it } from 'vitest'

import { createBuiltinCharacterEntry } from './builtin-character'

describe('desktop-electron builtin character', () => {
  it('defines one builtin live2d character entry for the first shell', () => {
    const entry = createBuiltinCharacterEntry()

    expect(entry).toMatchObject({
      source: 'builtin',
      profile: {
        id: 'builtin-hiyori',
        renderer: {
          kind: 'live2d',
          modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
        },
      },
    })
  })
})
