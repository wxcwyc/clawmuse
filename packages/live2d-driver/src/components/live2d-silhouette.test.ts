import { describe, expect, it } from 'vitest'

import { findOpaquePixelBounds } from './live2d-silhouette'

describe('findOpaquePixelBounds', () => {
  it('returns the tight bounding box for non-transparent pixels', () => {
    const width = 6
    const height = 5
    const pixels = new Uint8ClampedArray(width * height * 4)

    const setAlpha = (x: number, y: number, alpha: number) => {
      pixels[((y * width) + x) * 4 + 3] = alpha
    }

    setAlpha(1, 1, 255)
    setAlpha(4, 3, 255)
    setAlpha(3, 2, 64)

    expect(findOpaquePixelBounds({
      pixels,
      width,
      height,
    })).toEqual({
      top: 1,
      left: 1,
      right: 4,
      bottom: 3,
      width: 4,
      height: 3,
    })
  })

  it('ignores faint alpha noise below the threshold', () => {
    const width = 4
    const height = 4
    const pixels = new Uint8ClampedArray(width * height * 4)

    pixels[((0 * width) + 0) * 4 + 3] = 6
    pixels[((2 * width) + 2) * 4 + 3] = 12

    expect(findOpaquePixelBounds({
      pixels,
      width,
      height,
      alphaThreshold: 8,
    })).toEqual({
      top: 2,
      left: 2,
      right: 2,
      bottom: 2,
      width: 1,
      height: 1,
    })
  })

  it('returns null when the frame is fully transparent', () => {
    expect(findOpaquePixelBounds({
      pixels: new Uint8ClampedArray(3 * 3 * 4),
      width: 3,
      height: 3,
    })).toBeNull()
  })
})
