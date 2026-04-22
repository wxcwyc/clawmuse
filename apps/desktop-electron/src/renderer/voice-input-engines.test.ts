import { describe, expect, it } from 'vitest'

import {
  getVoiceInputEngineOptions,
  normalizeHttpSttEndpoint,
  resolveVoiceInputEngineId,
} from './voice-input-engines'

describe('voice input engines', () => {
  it('returns supported voice input engine options', () => {
    const options = getVoiceInputEngineOptions()
    expect(options.map(item => item.id)).toEqual(['web_speech', 'http_stt'])
  })

  it('resolves unknown engine ids to web_speech', () => {
    expect(resolveVoiceInputEngineId('http_stt')).toBe('http_stt')
    expect(resolveVoiceInputEngineId('anything')).toBe('web_speech')
  })

  it('normalizes empty endpoint to default local stt url', () => {
    expect(normalizeHttpSttEndpoint('')).toBe('http://127.0.0.1:8788/stt')
    expect(normalizeHttpSttEndpoint(' http://127.0.0.1:9999/stt ')).toBe('http://127.0.0.1:9999/stt')
  })
})

