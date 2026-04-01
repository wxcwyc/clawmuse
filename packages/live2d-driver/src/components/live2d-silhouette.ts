export interface Live2DSilhouetteBounds {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export function findOpaquePixelBounds(params: {
  pixels: Uint8ClampedArray
  width: number
  height: number
  alphaThreshold?: number
}): Live2DSilhouetteBounds | null {
  const { pixels, width, height } = params
  const alphaThreshold = params.alphaThreshold ?? 8

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[((y * width) + x) * 4 + 3]
      if (alpha < alphaThreshold) {
        continue
      }

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null
  }

  return {
    top: minY,
    left: minX,
    right: maxX,
    bottom: maxY,
    width: (maxX - minX) + 1,
    height: (maxY - minY) + 1,
  }
}

export function measureCanvasSilhouetteBounds(canvas: HTMLCanvasElement, alphaThreshold?: number) {
  const width = canvas.width
  const height = canvas.height
  if (!width || !height) {
    return null
  }

  const measurementCanvas = document.createElement('canvas')
  measurementCanvas.width = width
  measurementCanvas.height = height
  const context = measurementCanvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return null
  }

  context.clearRect(0, 0, width, height)
  context.drawImage(canvas, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  return findOpaquePixelBounds({
    pixels: imageData.data,
    width,
    height,
    alphaThreshold,
  })
}
