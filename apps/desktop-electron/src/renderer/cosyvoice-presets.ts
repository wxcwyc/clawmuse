export type HttpTtsProviderId = 'openllm' | 'cosyvoice'

export type CosyVoiceModeId = 'sft' | 'zero_shot' | 'cross_lingual' | 'instruct' | 'instruct2'

export interface HttpTtsProviderOption {
  id: HttpTtsProviderId
  label: string
}

export interface CosyVoiceModeOption {
  id: CosyVoiceModeId
  label: string
}

export interface CosyVoiceSpeakerOption {
  id: string
  label: string
}

const HTTP_TTS_PROVIDER_OPTIONS: HttpTtsProviderOption[] = [
  { id: 'openllm', label: 'Open-LLM-VTuber' },
  { id: 'cosyvoice', label: 'CosyVoice' },
]

const COSYVOICE_MODE_OPTIONS: CosyVoiceModeOption[] = [
  { id: 'sft', label: '预训练音色 (sft)' },
  { id: 'zero_shot', label: '3s 极速复刻 (zero-shot)' },
  { id: 'cross_lingual', label: '跨语种复刻' },
  { id: 'instruct', label: '自然语言控制' },
  { id: 'instruct2', label: '自然语言控制 + 复刻' },
]

const COSYVOICE_SPEAKER_OPTIONS: CosyVoiceSpeakerOption[] = [
  { id: '中文女', label: '中文女' },
  { id: '中文男', label: '中文男' },
  { id: '粤语女', label: '粤语女' },
  { id: '粤语男', label: '粤语男' },
  { id: '英文女', label: '英文女' },
  { id: '英文男', label: '英文男' },
  { id: '日语女', label: '日语女' },
  { id: '韩语女', label: '韩语女' },
  { id: 'my_zero_shot_spk', label: 'my_zero_shot_spk (示例克隆ID)' },
]

export function getHttpTtsProviderOptions(): HttpTtsProviderOption[] {
  return [...HTTP_TTS_PROVIDER_OPTIONS]
}

export function getCosyVoiceModeOptions(): CosyVoiceModeOption[] {
  return [...COSYVOICE_MODE_OPTIONS]
}

export function getCosyVoiceSpeakerOptions(): CosyVoiceSpeakerOption[] {
  return [...COSYVOICE_SPEAKER_OPTIONS]
}

export function resolveHttpTtsProviderId(input?: string): HttpTtsProviderId {
  if (input === 'cosyvoice') {
    return input
  }
  return 'openllm'
}

export function resolveCosyVoiceModeId(input?: string): CosyVoiceModeId {
  if (input === 'zero_shot') {
    return input
  }
  if (input === 'cross_lingual') {
    return input
  }
  if (input === 'instruct') {
    return input
  }
  if (input === 'instruct2') {
    return input
  }
  return 'sft'
}
