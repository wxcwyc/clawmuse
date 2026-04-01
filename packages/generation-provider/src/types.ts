import type {
  CharacterGenerationRequest,
  CharacterGenerationResult,
} from '../../character-generation/src/types'

export interface GenerationProvider {
  createJob(request: CharacterGenerationRequest): Promise<{ jobId: string }>
  getJob(jobId: string): Promise<CharacterGenerationResult>
}
