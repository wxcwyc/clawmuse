export type GenerationTargetKind = 'live2d' | 'vrm'

export type GenerationTask =
  | 'expression-pack'
  | 'motion-pack'
  | 'full-character-upgrade'

export interface CharacterGenerationRequest {
  targetKind: GenerationTargetKind
  tasks: GenerationTask[]
  sourceImages: string[]
  styleHints?: string[]
  characterBaseId?: string
}

export interface GeneratedFileDescriptor {
  path: string
  mediaType: string
}

export interface CharacterGenerationResult {
  jobId: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  assetManifestPatch: Record<string, unknown>
  generatedFiles: GeneratedFileDescriptor[]
  warnings?: string[]
}

export function createGenerationRequest(
  request: CharacterGenerationRequest,
): CharacterGenerationRequest {
  return request
}

export function createGenerationResult(
  result: CharacterGenerationResult,
): CharacterGenerationResult {
  return result
}
