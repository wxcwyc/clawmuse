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
})

const speechSynthesisSpeak = vi.fn()
const speechSynthesisCancel = vi.fn()

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
    state.subtitles.splice(0)
    state.logs.splice(0)
    state.messages.splice(0)
    state.connected = false
    state.connectionStatus = 'idle'
    state.draftMessage = ''
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
      resizeWindowToAvatar: vi.fn(),
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
  })

  it('renders stage and menu toggle by default', async () => {
    const wrapper = mount(App)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.avatar-shell__stage').exists()).toBe(true)
    expect(wrapper.find('[data-action="toggle-controls"]').exists()).toBe(true)
    expect(window.clawmuse?.resizeWindowToAvatar).toHaveBeenCalledWith({
      width: 468,
      height: 748,
    })
  })

  it('routes chat click to connection panel when disconnected', async () => {
    const wrapper = mount(App)

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')

    expect(wrapper.find('[data-panel="connection"]').exists()).toBe(true)
  })

  it('opens connection panel and calls connect', async () => {
    const wrapper = mount(App)

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')
    expect(wrapper.find('[data-panel="connection"]').exists()).toBe(true)

    await wrapper.get('[data-action="connection-connect"]').trigger('click')
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('shows chat/logs and motion test controls in menu', async () => {
    const wrapper = mount(App)

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    expect(wrapper.find('[data-action="chat"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="logs"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="manual-motion-tap-body"]').exists()).toBe(true)
    expect(wrapper.find('[data-action="quick-chat"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="toggle-interaction-emotion"]').exists()).toBe(true)
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

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')
    await wrapper.get('[data-action="chat-input"]').setValue('你好')
    await wrapper.get('[data-action="chat-send"]').trigger('click')

    expect(setDraftMessage).toHaveBeenCalledWith('你好')
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('sends from chat panel on Enter and keeps newline on Shift+Enter', async () => {
    state.connected = true
    const wrapper = mount(App)

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')
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

      await wrapper.get('[data-action="toggle-controls"]').trigger('click')
      await wrapper.get('[data-action="chat"]').trigger('click')
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

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')
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

  it('speaks subtitle sentences through speechSynthesis', async () => {
    const wrapper = mount(App)

    state.subtitles.push('语音播报测试。')
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(speechSynthesisSpeak).toHaveBeenCalledTimes(1)
    const firstCallArg = speechSynthesisSpeak.mock.calls[0]?.[0] as { text?: string } | undefined
    expect(firstCallArg?.text).toBe('语音播报测试。')
  })

  it('shows voice input toggle in chat panel', async () => {
    state.connected = true
    const wrapper = mount(App)

    await wrapper.get('[data-action="toggle-controls"]').trigger('click')
    await wrapper.get('[data-action="chat"]').trigger('click')

    expect(wrapper.find('[data-action="chat-voice-toggle"]').exists()).toBe(true)
  })
})
