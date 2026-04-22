function resolveRendererAssetBaseUrl(explicitBaseUrl?: string) {
  if (explicitBaseUrl && explicitBaseUrl.trim().length > 0) {
    return explicitBaseUrl
  }
  return './'
}

function resolveRendererAssetUrl(params: {
  relativePath: string
  baseUrl?: string
}) {
  const cleanedRelativePath = params.relativePath.replace(/^\/+/, '')
  const baseUrl = resolveRendererAssetBaseUrl(params.baseUrl)

  if (baseUrl === './') {
    return `./${cleanedRelativePath}`
  }

  try {
    return new URL(cleanedRelativePath, baseUrl).toString()
  }
  catch {
    return `/${cleanedRelativePath}`
  }
}

export function resolveLive2DModelSource(
  modelSource: string,
  options?: {
    baseUrl?: string
  },
) {
  if (!modelSource.startsWith('assets://')) {
    return modelSource
  }

  const relativePath = modelSource.slice('assets://'.length).replace(/^\/+/, '')
  return resolveRendererAssetUrl({
    relativePath: `live2d/${relativePath}`,
    baseUrl: options?.baseUrl,
  })
}
