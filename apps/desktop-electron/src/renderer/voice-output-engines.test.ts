import { describe, expect, it } from 'vitest'

import {
  getVoiceOutputEngineOptions,
  normalizeHttpTtsEndpoint,
  resolveVoiceOutputEngineId,
} from './voice-output-engines'

describe('voice output engines', () => {
  it('returns supported engine options', () => {
    const options = getVoiceOutputEngineOptions()
    expect(options.map(item => item.id)).toEqual(['web_speech', 'http_tts'])
  })

  it('resolves unknown engine ids to web_speech', () => {
    expect(resolveVoiceOutputEngineId('http_tts')).toBe('http_tts')
    expect(resolveVoiceOutputEngineId('missing')).toBe('web_speech')
  })

  it('normalizes empty endpoint to default local url', () => {
    expect(normalizeHttpTtsEndpoint('')).toBe('http://127.0.0.1:8787/tts')
    expect(normalizeHttpTtsEndpoint(' http://127.0.0.1:8899/tts ')).toBe('http://127.0.0.1:8899/tts')
  })
})

