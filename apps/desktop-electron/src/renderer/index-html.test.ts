import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('desktop-electron renderer html', () => {
  it('keeps cubism core loading out of static html so the renderer bootstrap can inject it explicitly', () => {
    const html = readFileSync('/home/dministrator/projects/clawmuse/apps/desktop-electron/src/renderer/index.html', 'utf8')

    expect(html).not.toContain('/live2d-core/live2dcubismcore.min.js')
  })
})
