// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mountStage = vi.fn(async () => {})
const refreshStageWarnings = vi.fn(async () => {})
const connect = vi.fn(async () => {})
const sendMessage = vi.fn(async () => {})
const setDraftMessage = vi.fn()
const setConnectionField = vi.fn()

const state = reactive({
  connection: {
    url: 'ws://127.0.0.1:18789',
    token: '',
    password: '',
    sessionKey: 'main',
  },
  connected: false,
  connectionStatus: 'idle' as const,
  draftMessage: '',
  subtitles: [] as string[],
  liveAssistantText: '',
  messages: [] as Array<{ id: string, role: 'user' | 'assistant' | 'system', text: string }>,
  logs: [],
  stageMounted: true,
  stageWarnings: [] as string[],
  lastAvatarDirectiveAt: 0,
})

const speechSynthesisSpeak = vi.fn()
const speechSynthesisCancel = vi.fn()
const fetchMock = vi.fn()
let shellCommandListener: ((event: unknown) => void) | null = null

function emitShellCommand(event: unknown) {
  shellCommandListener?.(event)
}

async function openPanelViaShell(wrapper: ReturnType<typeof mount>, panel: 'chat' | 'logs' | 'connection') {
  emitShellCommand({
    type: 'open-panel',
    panel,
  })
  await wrapper.vm.$nextTick()
  await Promise.resolve()
  await wrapper.vm.$nextTick()
}

class FakeSpeechRecognition {
  lang = 'zh-CN'
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((event: any) => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  start = vi.fn(() => {
    this.onstart?.()
  })
  stop = vi.fn(() => {
    this.onend?.()
  })
}

vi.mock('./main', () => ({
  createDesktopRendererBootstrap: () => ({
    registry: {
      getActive: () => ({
        profile: {
          id: 'builtin-hiyori',
          displayName: 'Builtin Hiyori',
          renderer: {
            modelSource: 'assets://builtin-hiyori/Hiyori.model3.json',
          },
        },
      }),
    },
    model: {
      state,
      mountStage,
      refreshStageWarnings,
      connect,
      sendMessage,
      setDraftMessage,
      setConnectionField,
    },
  }),
}))

vi.mock('../../../../packages/live2d-driver/src/components/Live2DStage.vue', () => ({
  default: {
    emits: ['modelBoundsChange'],
    mounted() {
      this.$emit('modelBoundsChange', { width: 412, height: 688 })
    },
    template: '<div class="live2d-stage-stub"><slot /></div>',
  },
}))

import App from './App.vue'

describe('desktop-electron App shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    shellCommandListener = null
    state.subtitles.splice(0)
    state.logs.splice(0)
    state.messages.splice(0)
    state.connected = false
    state.connectionStatus = 'idle'
    state.draftMessage = ''
    state.lastAvatarDirectiveAt = 0
    window.localStorage.clear()
    connect.mockImplementation(async () => {
      state.connected = true
      state.connectionStatus = 'idle'
    })
    setDraftMessage.mockImplementation((value: string) => {
      state.draftMessage = value
    })
    setConnectionField.mockImplementation((field: 'url' | 'token' | 'password' | 'sessionKey', value: string) => {
      state.connection[field] = value
    })

    window.clawmuse = {
      platform: 'desktop-electron',
      version: '0.1.0',
      hostPlatform: 'win32',
      imeCompatMode: true,
      dragWindowBy: vi.fn(async () => true),
      resizeWindowToAvatar: vi.fn(),
      startVoiceService: vi.fn(async () => ({
        state: 'running',
        adapter: {
          sttMode: 'owned',
          ttsMode: 'owned',
        },
        upstream: {
          healthy: false,
          baseUrl: 'http://127.0.0.1:12393',
        },
      })),
      getVoiceServiceStatus: vi.fn(async () => ({
        state: 'running',
        adapter: {
          sttMode: 'owned',
          ttsMode: 'owned',
        },
        upstream: {
          healthy: false,
          baseUrl: 'http://127.0.0.1:12393',
        },
      })),
      stopVoiceService: vi.fn(async () => ({
        state: 'stopped',
      })),
      onVoiceServiceEvent: vi.fn(() => () => {}),
      onShellCommand: vi.fn((listener: (event: unknown) => void) => {
        shellCommandListener = listener
        return () => {
          if (shellCommandListener === listener) {
            shellCommandListener = null
          }
        }
      }),
    }

    ;(window as any).speechSynthesis = {
      speak: speechSynthesisSpeak,
      cancel: speechSynthesisCancel,
      getVoices: () => [],
      speaking: false,
      pending: false,
    }
    ;(window as any).webkitSpeechRecognition = FakeSpeechRecognition
    ;(window as any).SpeechRecognition = FakeSpeechRecognition
    ;(window as any).SpeechSynthesisUtterance = class {
      text: string
      lang = 'zh-CN'
      rate = 1
      pitch = 1
      volume = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    ;(globalThis as any).fetch = fetchMock
  })

  it('renders stage without in-window menu controls by default', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.avatar-shell__stage').exists()).toBe(true)
    expect(wrapper.find('[data-action="toggle-controls"]').exists()).toBe(false)
    expect(window.clawmuse?.resizeWindowToAvatar).not.toHaveBeenCalled()
  })

  it('routes tray chat command to connection panel when disconnected', async () => {
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')

    expect(wrapper.find('[data-panel="connection"]').exists()).toBe(true)
  })

  it('opens connection panel from tray command and calls connect', async () => {
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    expect(wrapper.find('[data-panel="connection"]').exists()).toBe(true)

    await wrapper.get('[data-action="connection-connect"]').trigger('click')
    expect(connect).toHaveBeenCalled()
  })

  it('handles tray logs and manual motion commands', async () => {
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'logs')
    emitShellCommand({
      type: 'avatar.manual-motion',
      motion: 'TapBody#0',
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-panel="logs"]').exists()).toBe(true)
    expect(state.logs.some(line => line.includes('[window] manualMotion=TapBody#0'))).toBe(true)
  })

  it('auto connects from cached connection state within 30 days', async () => {
    window.localStorage.setItem('clawmuse:connection-cache:v1', JSON.stringify({
      connection: {
        url: 'ws://127.0.0.1:18789',
        token: 't1',
        password: 'p1',
        sessionKey: 'main',
      },
      connectedUntil: Date.now() + (5 * 24 * 60 * 60 * 1000),
      updatedAt: Date.now(),
    }))

    mount(App)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(connect).toHaveBeenCalledTimes(1)
    expect(setConnectionField).toHaveBeenCalledWith('url', 'ws://127.0.0.1:18789')
    expect(setConnectionField).toHaveBeenCalledWith('token', 't1')
    expect(setConnectionField).toHaveBeenCalledWith('password', 'p1')
    expect(setConnectionField).toHaveBeenCalledWith('sessionKey', 'main')
  })

  it('sends from chat panel after connected', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    await wrapper.get('[data-action="chat-input"]').setValue('你好')
    await wrapper.get('[data-action="chat-send"]').trigger('click')

    expect(setDraftMessage).toHaveBeenCalledWith('你好')
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('sends from chat panel on Enter and keeps newline on Shift+Enter', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    const input = wrapper.get('[data-action="chat-input"]')
    await input.setValue('键盘发送')

    await input.trigger('keydown', { key: 'Enter' })
    expect(sendMessage).toHaveBeenCalledTimes(1)

    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('does not send while Chinese IME composition is active', async () => {
    vi.useFakeTimers()
    state.connected = true
    try {
      const wrapper = mount(App)

      await openPanelViaShell(wrapper, 'chat')
      const input = wrapper.get('[data-action="chat-input"]')
      await input.setValue('中文输入')

      const imeEnter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(imeEnter, 'keyCode', { get: () => 229 })
      Object.defineProperty(imeEnter, 'which', { get: () => 229 })
      input.element.dispatchEvent(imeEnter)
      await wrapper.vm.$nextTick()
      expect(sendMessage).toHaveBeenCalledTimes(0)

      await input.trigger('compositionstart')
      await input.trigger('keydown', { key: 'Enter' })
      expect(sendMessage).toHaveBeenCalledTimes(0)

      await input.trigger('compositionend')
      await input.trigger('keydown', { key: 'Enter' })
      expect(sendMessage).toHaveBeenCalledTimes(0)

      vi.advanceTimersByTime(120)
      await input.trigger('keydown', { key: 'Enter' })
      expect(sendMessage).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('writes IME diagnostics into logs panel entries', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    const input = wrapper.get('[data-action="chat-input"]')

    await input.trigger('focus')
    await input.trigger('compositionstart')
    await input.trigger('compositionupdate', { data: 'ni' })
    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })

    expect(state.logs.some(line => line.includes('[ime] chat-panel compositionstart'))).toBe(true)
    expect(state.logs.some(line => line.includes('[ime] chat-panel compositionupdate'))).toBe(true)
    expect(state.logs.some(line => line.includes('[ime] chat-panel keydown key=Enter'))).toBe(true)
  })

  it('renders speech bubble from subtitle stream', async () => {
    const wrapper = mount(App)

    state.subtitles.push('这是第一句。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const bubble = wrapper.find('[data-role="speech-bubble"]')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toContain('这是第一句。')
  })

  it('strips markdown formatting symbols in speech bubble subtitle', async () => {
    const wrapper = mount(App)

    state.subtitles.push('**你好**，这是`code` [链接](https://example.com) #标题。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const bubble = wrapper.find('[data-role="speech-bubble"]')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toContain('你好，这是code 链接 标题。')
    expect(bubble.text()).not.toContain('**')
    expect(bubble.text()).not.toContain('`')
    expect(bubble.text()).not.toContain('[')
    expect(bubble.text()).not.toContain(']')
  })

  it('speaks subtitle sentences through speechSynthesis', async () => {
    const wrapper = mount(App)

    state.subtitles.push('语音播报测试。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(1)
    const firstCallArg = speechSynthesisSpeak.mock.calls[0]?.[0] as { text?: string } | undefined
    expect(firstCallArg?.text).toBe('语音播报测试。')
  })

  it('does not over-split a sentence wrapped with quotes and trailing punctuation', async () => {
    const wrapper = mount(App)

    state.subtitles.push('她说“你好！”。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(1)
    const firstCallArg = speechSynthesisSpeak.mock.calls[0]?.[0] as { text?: string } | undefined
    expect(firstCallArg?.text).toBe('她说“你好！”。')
  })

  it('keeps single-line wraps in one spoken sentence', async () => {
    const wrapper = mount(App)

    state.subtitles.push(`这是第一行
继续这一句。`)
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(1)
    const firstCallArg = speechSynthesisSpeak.mock.calls[0]?.[0] as { text?: string } | undefined
    expect(firstCallArg?.text).toBe('这是第一行 继续这一句。')
  })

  it('sanitizes noisy symbols before speech output', async () => {
    const wrapper = mount(App)

    state.subtitles.push('路径是 A/B & C*D。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(1)
    const firstCallArg = speechSynthesisSpeak.mock.calls[0]?.[0] as { text?: string } | undefined
    expect(firstCallArg?.text).toBe('路径是。')
  })

  it('renders thought text in bubble but does not send it to speech synthesis', async () => {
    const wrapper = mount(App)

    state.subtitles.push('<think>我先整理一下思路</think>')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    const bubble = wrapper.find('[data-role="speech-bubble"]')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toContain('内心：我先整理一下思路')
    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(0)
  })

  it('shows voice input toggle in chat panel', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')

    expect(wrapper.find('[data-action="chat-voice-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="chat-voice-service-status"]').exists()).toBe(true)
    expect(wrapper.find('[data-role="chat-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="chat-voice-toggle"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-role="chat-voice-readiness"]').text()).toContain('上游')
    expect(wrapper.find('[data-role="chat-voice-service-notice"]').text()).toContain('上游未就绪')
  })

  it('runs voice diagnostics and writes summary logs', async () => {
    state.connected = true
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audioBase64: 'UklGRg==',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: '诊断通过',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))

    const wrapper = mount(App)
    await openPanelViaShell(wrapper, 'chat')
    await wrapper.get('[data-action="chat-voice-diagnostics"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(state.logs.some(line => line.includes('[voice] [diag] tts ok:'))).toBe(true)
    expect(state.logs.some(line => line.includes('[voice] [diag] stt ok:'))).toBe(true)
    expect(state.logs.some(line => line.includes('[voice] [diag][suggest] TTS: service looks healthy.'))).toBe(true)
    expect(state.logs.some(line => line.includes('[voice] [diag] voice diagnostics finished: ok'))).toBe(true)
    expect(wrapper.find('[data-role="chat-voice-diagnostics"]').text()).toContain('Voice diagnostics: all checks passed.')
    expect(wrapper.find('[data-role="chat-voice-diagnostics-badge"]').text()).toContain('Last diagnostics')
  })

  it('applies diagnostic quick-fix action to switch TTS engine', async () => {
    state.connected = true
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        detail: 'bad payload',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: '诊断通过',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audioBase64: 'UklGRg==',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        text: '诊断通过',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))

    const wrapper = mount(App)
    await openPanelViaShell(wrapper, 'chat')
    await wrapper.get('[data-action="chat-voice-engine-select"]').setValue('http_tts')
    await wrapper.get('[data-action="chat-voice-diagnostics"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))

    const fixButton = wrapper.find('[data-action-id="tts-engine-web-speech"]')
    expect(fixButton.exists()).toBe(true)
    expect(fixButton.text()).toContain('推荐：')
    await fixButton.trigger('click')
    expect(wrapper.find('[data-role="chat-voice-diagnostic-confirm"]').text()).toContain('Change `Engine`')
    await wrapper.get('[data-action="chat-voice-diagnostic-confirm"]').trigger('click')
    await new Promise(resolve => setTimeout(resolve, 260))

    const engineSelect = wrapper.get('[data-action="chat-voice-engine-select"]')
    expect((engineSelect.element as HTMLSelectElement).value).toBe('web_speech')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(state.logs.some(line => line.includes('[voice] [diag][apply] tts-engine-web-speech'))).toBe(true)
    expect(state.logs.some(line => line.includes('[voice] [diag][apply] auto-rerun queued reason=tts-engine-web-speech'))).toBe(true)
    expect(state.logs.some(line => line.includes('[voice] [diag][summary] source=auto reason=tts-engine-web-speech status=ok'))).toBe(true)
    expect(wrapper.find('[data-role="chat-voice-diagnostics-badge"]').text()).toContain('Recheck')
  })

  it('shows stt endpoint input by default in integrated mode', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    expect(wrapper.find('[data-action="chat-voice-input-endpoint-input"]').exists()).toBe(true)
  })

  it('shows http tts endpoint input by default in integrated mode', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    expect(wrapper.find('[data-action="chat-voice-endpoint-input"]').exists()).toBe(true)
  })

  it('shows endpoint validation errors for malformed HTTP service URLs', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    await wrapper.get('[data-action="chat-voice-input-engine-select"]').setValue('http_stt')
    await wrapper.get('[data-action="chat-voice-engine-select"]').setValue('http_tts')
    await wrapper.get('[data-action="chat-voice-input-endpoint-input"]').setValue('not-a-url')
    await wrapper.get('[data-action="chat-voice-endpoint-input"]').setValue('also-not-a-url')

    expect(wrapper.get('[data-role="chat-voice-input-endpoint-error"]').text()).toContain('STT endpoint is not a valid URL.')
    expect(wrapper.get('[data-role="chat-voice-endpoint-error"]').text()).toContain('TTS endpoint is not a valid URL.')
  })

  it('restores cached disabled voice output settings in chat controls', async () => {
    state.connected = true
    window.localStorage.setItem('clawmuse:voice-settings:v1', JSON.stringify({
      outputEnabled: false,
      presetId: 'clear',
      updatedAt: Date.now(),
    }))
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('[data-action="chat-voice-output-toggle"]').text()).toContain('开启语音输出')
    expect(state.logs.some(line => line.includes('[voice] [tts] restored settings stt=web_speech tts=web_speech provider=openllm mode=sft preset=clear output=0'))).toBe(true)
  })

  it('applies selected voice preset settings to speech synthesis utterance', async () => {
    state.connected = true
    const wrapper = mount(App)

    await openPanelViaShell(wrapper, 'chat')
    await wrapper.get('[data-action="chat-voice-preset-select"]').setValue('loli')
    speechSynthesisSpeak.mockClear()

    state.subtitles.push('预设生效测试。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak.mock.calls.length).toBeGreaterThanOrEqual(1)
    const utterance = speechSynthesisSpeak.mock.calls.at(-1)?.[0] as { pitch?: number, rate?: number, lang?: string } | undefined
    expect(utterance?.lang).toBe('zh-CN')
    expect((utterance?.pitch ?? 0)).toBeGreaterThan(1.2)
    expect((utterance?.rate ?? 0)).toBeGreaterThan(1)
  })
})
