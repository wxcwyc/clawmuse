import { describe, expect, it } from 'vitest'

describe('desktop-electron skeleton entrypoints', () => {
  it('loads the first desktop-electron and driver package entry modules', async () => {
    const [
      electronApp,
      electronRenderer,
      avatarDriver,
      live2dDriver,
      characterRegistry,
      characterGeneration,
      generationProvider,
    ] = await Promise.all([
      import('./main/index'),
      import('./renderer/main'),
      import('../../../packages/avatar-driver/src/index'),
      import('../../../packages/live2d-driver/src/index'),
      import('../../../packages/character-registry/src/index'),
      import('../../../packages/character-generation/src/index'),
      import('../../../packages/generation-provider/src/index'),
    ])

    expect(electronApp).toBeTruthy()
    expect(electronRenderer).toBeTruthy()
    expect(avatarDriver).toBeTruthy()
    expect(live2dDriver).toBeTruthy()
    expect(characterRegistry).toBeTruthy()
    expect(characterGeneration).toBeTruthy()
    expect(generationProvider).toBeTruthy()
  })
})
