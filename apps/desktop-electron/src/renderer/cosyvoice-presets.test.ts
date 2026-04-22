import { describe, expect, it } from 'vitest'

import {
  getCosyVoiceModeOptions,
  getCosyVoiceSpeakerOptions,
  getHttpTtsProviderOptions,
  resolveCosyVoiceModeId,
  resolveHttpTtsProviderId,
} from './cosyvoice-presets'

describe('cosyvoice presets', () => {
  it('exposes provider and mode options', () => {
    expect(getHttpTtsProviderOptions().map(item => item.id)).toEqual(['openllm', 'cosyvoice'])
    expect(getCosyVoiceModeOptions().map(item => item.id)).toEqual(['sft', 'zero_shot', 'cross_lingual', 'instruct', 'instruct2'])
    expect(getCosyVoiceSpeakerOptions().length).toBeGreaterThan(0)
  })

  it('falls back to safe defaults when ids are invalid', () => {
    expect(resolveHttpTtsProviderId('bad-value')).toBe('openllm')
    expect(resolveCosyVoiceModeId('bad-value')).toBe('sft')
  })
})
