export function resolveLive2DModelSource(modelSource: string) {
  if (!modelSource.startsWith('assets://')) {
    return modelSource
  }

  const relativePath = modelSource.slice('assets://'.length).replace(/^\/+/, '')
  return `/live2d/${relativePath}`
}
