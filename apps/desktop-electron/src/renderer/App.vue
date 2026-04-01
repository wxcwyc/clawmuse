<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Live2DDriver } from '../../../../packages/live2d-driver/src/index'
import Live2DStage from '../../../../packages/live2d-driver/src/components/Live2DStage.vue'
import ConnectionPanel from './components/ConnectionPanel.vue'
import ChatPanel from './components/ChatPanel.vue'
import LogPanel from './components/LogPanel.vue'
import {
  resolveAvatarFrameSize,
  resolveAvatarLayoutProfile,
} from './avatar-layout'
import { createDesktopRendererBootstrap } from './main'

type ShellPanel = 'connection' | 'chat' | 'logs' | null
type SpeechSynthesisLike = {
  speak: (utterance: unknown) => void
  cancel: () => void
}
type SpeechRecognitionResultLike = {
  isFinal?: boolean
  0?: { transcript?: string }
}
type SpeechRecognitionEventLike = {
  resultIndex?: number
  results?: ArrayLike<SpeechRecognitionResultLike>
}
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start: () => void
  stop: () => void
  abort?: () => void
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike
type WindowWithSpeech = Window & {
  speechSynthesis?: SpeechSynthesisLike
  SpeechSynthesisUtterance?: new (text: string) => {
    text: string
    lang?: string
    rate?: number
    pitch?: number
    volume?: number
    onend: (() => void) | null
    onerror: (() => void) | null
  }
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

const stageDriver = new Live2DDriver()
const interactionEmotionEnabled = ref(true)
const CONNECTION_CACHE_KEY = 'clawmuse:connection-cache:v1'
const CONNECTION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const bootstrap = createDesktopRendererBootstrap({
  createAvatarDriver: () => stageDriver,
})
const model = bootstrap.model
const state = model.state
const activeCharacter = bootstrap.registry.getActive()
const openPanel = ref<ShellPanel>(null)
const controlsExpanded = ref(false)
const avatarBounds = ref<{ width: number, height: number } | null>(null)
const lastRequestedWindowBounds = ref<{ width: number, height: number } | null>(null)
const avatarLayout = resolveAvatarLayoutProfile(activeCharacter?.profile.id)
const speechBubbleText = ref('')
const speechBubbleVisible = ref(false)
const subtitleQueue = ref<string[]>([])
const isBubbleQueueRunning = ref(false)
const lastConsumedSubtitleIndex = ref(0)
let speechBubbleHideTimer: ReturnType<typeof setTimeout> | null = null
const voiceOutputEnabled = ref(true)
const voiceInputSupported = ref(false)
const voiceInputListening = ref(false)
const voiceInputInterimText = ref('')
let speechRecognition: SpeechRecognitionLike | null = null
let voiceAutoSendInFlight = false
const manualMotionActions = [
  { id: 'tap-body', label: 'TapBody#0', motion: 'TapBody#0' },
  { id: 'idle-0', label: 'Idle#0', motion: 'Idle#0' },
  { id: 'idle-1', label: 'Idle#1', motion: 'Idle#1' },
  { id: 'idle-2', label: 'Idle#2', motion: 'Idle#2' },
  { id: 'idle-3', label: 'Idle#3', motion: 'Idle#3' },
  { id: 'idle-4', label: 'Idle#4', motion: 'Idle#4' },
] as const

function appendImeLog(line: string) {
  state.logs.push(`[ime] ${line}`)
  if (state.logs.length > 1200) {
    state.logs.splice(0, state.logs.length - 1200)
  }
}

function appendVoiceLog(line: string) {
  state.logs.push(`[voice] ${line}`)
  if (state.logs.length > 1200) {
    state.logs.splice(0, state.logs.length - 1200)
  }
}

watch(() => state.stageWarnings.length, (warningCount) => {
  if (warningCount > 0) {
    openPanel.value = 'logs'
  }
}, {
  immediate: true,
})

type ConnectionCachePayload = {
  connection: {
    url: string
    token: string
    password: string
    sessionKey: string
  }
  connectedUntil: number
  updatedAt: number
}

function readConnectionCache(): ConnectionCachePayload | null {
  try {
    const raw = window.localStorage.getItem(CONNECTION_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<ConnectionCachePayload>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    if (!parsed.connection || typeof parsed.connection !== 'object') {
      return null
    }

    const connection = parsed.connection as Partial<ConnectionCachePayload['connection']>
    if (
      typeof connection.url !== 'string'
      || typeof connection.token !== 'string'
      || typeof connection.password !== 'string'
      || typeof connection.sessionKey !== 'string'
    ) {
      return null
    }

    return {
      connection: {
        url: connection.url,
        token: connection.token,
        password: connection.password,
        sessionKey: connection.sessionKey,
      },
      connectedUntil: typeof parsed.connectedUntil === 'number' ? parsed.connectedUntil : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  }
  catch {
    return null
  }
}

function writeConnectionCache(payload: ConnectionCachePayload) {
  window.localStorage.setItem(CONNECTION_CACHE_KEY, JSON.stringify(payload))
}

function persistConnectionCache(params?: { connectedUntil?: number }) {
  writeConnectionCache({
    connection: {
      url: state.connection.url,
      token: state.connection.token,
      password: state.connection.password,
      sessionKey: state.connection.sessionKey,
    },
    connectedUntil: params?.connectedUntil ?? 0,
    updatedAt: Date.now(),
  })
}

function markConnectionCached() {
  persistConnectionCache({
    connectedUntil: Date.now() + CONNECTION_CACHE_TTL_MS,
  })
}

async function restoreCachedConnection() {
  const cached = readConnectionCache()
  if (!cached) {
    return
  }

  model.setConnectionField('url', cached.connection.url)
  model.setConnectionField('token', cached.connection.token)
  model.setConnectionField('password', cached.connection.password)
  model.setConnectionField('sessionKey', cached.connection.sessionKey)

  if (cached.connectedUntil <= Date.now()) {
    return
  }

  state.logs.push('[session] restoring cached connection')
  try {
    await model.connect()
    markConnectionCached()
    state.logs.push('[session] restored from cache')
  }
  catch {
    persistConnectionCache({
      connectedUntil: 0,
    })
  }
}

function resolveBubbleDurationMs(text: string) {
  const normalizedLength = text.trim().length
  return Math.max(1800, Math.min(4300, 1100 + normalizedLength * 52))
}

function resolveSpeechSynthesisApi() {
  const speechWindow = window as WindowWithSpeech
  if (
    !speechWindow.speechSynthesis
    || typeof speechWindow.speechSynthesis.speak !== 'function'
    || typeof speechWindow.speechSynthesis.cancel !== 'function'
  ) {
    return null
  }
  if (typeof speechWindow.SpeechSynthesisUtterance !== 'function') {
    return null
  }

  return {
    synthesis: speechWindow.speechSynthesis,
    Utterance: speechWindow.SpeechSynthesisUtterance,
  }
}

function stopSpeechOutputPlayback() {
  const api = resolveSpeechSynthesisApi()
  if (!api) {
    return
  }

  api.synthesis.cancel()
}

function resolveSpeechRecognitionCtor() {
  const speechWindow = window as WindowWithSpeech
  if (typeof speechWindow.SpeechRecognition === 'function') {
    return speechWindow.SpeechRecognition
  }
  if (typeof speechWindow.webkitSpeechRecognition === 'function') {
    return speechWindow.webkitSpeechRecognition
  }
  return null
}

function extractRecognitionText(event: SpeechRecognitionEventLike) {
  const allResults = event.results
  if (!allResults || typeof allResults.length !== 'number') {
    return {
      finalText: '',
      interimText: '',
    }
  }

  const startAt = Math.max(0, event.resultIndex ?? 0)
  let finalText = ''
  let interimText = ''

  for (let index = startAt; index < allResults.length; index += 1) {
    const result = allResults[index]
    const transcript = String(result?.[0]?.transcript ?? '').trim()
    if (!transcript) {
      continue
    }

    if (result?.isFinal) {
      finalText += transcript
      continue
    }

    interimText += transcript
  }

  return {
    finalText: finalText.trim(),
    interimText: interimText.trim(),
  }
}

async function speakSentence(sentence: string) {
  if (!voiceOutputEnabled.value) {
    return
  }

  const api = resolveSpeechSynthesisApi()
  if (!api) {
    return
  }

  await new Promise<void>((resolve) => {
    const utterance = new api.Utterance(sentence)
    utterance.lang = 'zh-CN'
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1

    let settled = false
    const settle = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    utterance.onend = settle
    utterance.onerror = settle

    const timeout = setTimeout(settle, resolveBubbleDurationMs(sentence) + 2600)
    const prevOnEnd = utterance.onend
    const prevOnError = utterance.onerror
    utterance.onend = () => {
      clearTimeout(timeout)
      prevOnEnd?.()
    }
    utterance.onerror = () => {
      clearTimeout(timeout)
      prevOnError?.()
    }

    api.synthesis.speak(utterance)
  })
}

function splitBubbleSentences(text: string) {
  const normalized = text.replace(/\r/g, '').trim()
  if (!normalized) {
    return [] as string[]
  }

  const parts: string[] = []
  let buffer = ''

  for (const char of normalized) {
    if (char === '\n') {
      const line = buffer.trim()
      if (line) {
        parts.push(line)
      }
      buffer = ''
      continue
    }

    buffer += char

    if ('。！？!?；;…'.includes(char)) {
      const sentence = buffer.trim()
      if (sentence) {
        parts.push(sentence)
      }
      buffer = ''
    }
  }

  const trailing = buffer.trim()
  if (trailing) {
    parts.push(trailing)
  }

  return parts
}

function queueSubtitle(text: string) {
  const sentences = splitBubbleSentences(text)
  if (sentences.length === 0) {
    return
  }

  subtitleQueue.value.push(...sentences)
  void runBubbleQueue()
}

async function runBubbleQueue() {
  if (isBubbleQueueRunning.value) {
    return
  }

  isBubbleQueueRunning.value = true
  while (subtitleQueue.value.length > 0) {
    const sentence = subtitleQueue.value.shift()
    if (!sentence) {
      continue
    }

    speechBubbleText.value = sentence
    speechBubbleVisible.value = true

    const bubbleVisibleDuration = resolveBubbleDurationMs(sentence)
    const visibleDelay = new Promise<void>((resolve) => {
      if (speechBubbleHideTimer) {
        clearTimeout(speechBubbleHideTimer)
      }

      speechBubbleHideTimer = setTimeout(() => {
        speechBubbleHideTimer = null
        resolve()
      }, bubbleVisibleDuration)
    })

    await Promise.all([
      visibleDelay,
      speakSentence(sentence),
    ])
    speechBubbleVisible.value = false

    await new Promise(resolve => setTimeout(resolve, 320))
  }

  isBubbleQueueRunning.value = false
}

watch(() => state.subtitles.length, (length, previousLength = 0) => {
  if (length === 0) {
    subtitleQueue.value = []
    lastConsumedSubtitleIndex.value = 0
    speechBubbleText.value = ''
    speechBubbleVisible.value = false
    stopSpeechOutputPlayback()
    return
  }

  if (length < previousLength || lastConsumedSubtitleIndex.value > length) {
    subtitleQueue.value = []
    lastConsumedSubtitleIndex.value = 0
  }

  const newItems = state.subtitles.slice(lastConsumedSubtitleIndex.value)
  for (const item of newItems) {
    queueSubtitle(item)
  }
  lastConsumedSubtitleIndex.value = length
})

watch(() => state.connectionStatus, (status) => {
  if (status !== 'speaking' && status !== 'thinking') {
    return
  }

  if (speechBubbleVisible.value || subtitleQueue.value.length > 0) {
    return
  }

  speechBubbleText.value = status === 'speaking' ? '正在回复…' : '思考中…'
  speechBubbleVisible.value = true
  if (speechBubbleHideTimer) {
    clearTimeout(speechBubbleHideTimer)
  }
  speechBubbleHideTimer = setTimeout(() => {
    speechBubbleVisible.value = false
    speechBubbleHideTimer = null
  }, 9000)
})

onMounted(() => {
  void (async () => {
    const bridge = window.clawmuse
    state.logs.push(`[env] hostPlatform=${bridge?.hostPlatform ?? 'unknown'} imeCompatMode=${bridge?.imeCompatMode ? '1' : '0'}`)
    if (bridge?.hostPlatform && bridge.hostPlatform !== 'win32') {
      state.logs.push('[ime] hint: host platform is not win32, Windows IME switching hotkeys may not apply in this process.')
    }

    voiceInputSupported.value = Boolean(resolveSpeechRecognitionCtor())
    appendVoiceLog(`[tts] supported=${resolveSpeechSynthesisApi() ? '1' : '0'}`)
    appendVoiceLog(`[stt] supported=${voiceInputSupported.value ? '1' : '0'}`)

    await model.mountStage({
      modelSource: activeCharacter?.profile.renderer.modelSource ?? '',
    })
    await restoreCachedConnection()
  })()
})

onBeforeUnmount(() => {
  if (speechBubbleHideTimer) {
    clearTimeout(speechBubbleHideTimer)
    speechBubbleHideTimer = null
  }
  stopSpeechOutputPlayback()
  if (speechRecognition) {
    try {
      speechRecognition.stop()
      speechRecognition.abort?.()
    }
    catch {
      // ignore stop errors while destroying renderer
    }
    speechRecognition = null
  }
  subtitleQueue.value = []
  isBubbleQueueRunning.value = false
})

function togglePanel(panel: Exclude<ShellPanel, null>) {
  openPanel.value = openPanel.value === panel ? null : panel
}

function closePanel() {
  openPanel.value = null
}

function toggleControlsMenu() {
  controlsExpanded.value = !controlsExpanded.value
}

function openPanelFromMenu(panel: Exclude<ShellPanel, null>) {
  if (panel === 'chat' && !state.connected) {
    openPanel.value = 'connection'
    controlsExpanded.value = false
    return
  }

  togglePanel(panel)
  controlsExpanded.value = false
}

async function sendDraftMessage() {
  if (!state.draftMessage.trim()) {
    return false
  }

  const runId = crypto.randomUUID()

  try {
    await model.sendMessage({ runId })
    return true
  }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'Session is not connected') {
      throw error
    }

    await model.connect()
    markConnectionCached()
    await model.sendMessage({ runId })
    return true
  }
}

async function handleVoiceFinalText(text: string) {
  const normalizedText = text.trim()
  if (!normalizedText) {
    return
  }

  appendVoiceLog(`[stt] final: ${normalizedText}`)
  model.setDraftMessage(normalizedText)

  if (!state.connected) {
    appendVoiceLog('[stt] ignored auto-send: session not connected')
    openPanel.value = 'connection'
    return
  }

  if (voiceAutoSendInFlight) {
    appendVoiceLog('[stt] ignored auto-send: previous send still in progress')
    return
  }

  voiceAutoSendInFlight = true
  try {
    await handleSend()
  }
  finally {
    voiceAutoSendInFlight = false
  }
}

function ensureSpeechRecognitionInstance() {
  if (speechRecognition) {
    return speechRecognition
  }

  const Ctor = resolveSpeechRecognitionCtor()
  if (!Ctor) {
    return null
  }

  const instance = new Ctor()
  instance.lang = 'zh-CN'
  instance.continuous = false
  instance.interimResults = true
  instance.maxAlternatives = 1
  instance.onstart = () => {
    voiceInputListening.value = true
    appendVoiceLog('[stt] listening started')
  }
  instance.onend = () => {
    voiceInputListening.value = false
    voiceInputInterimText.value = ''
    appendVoiceLog('[stt] listening stopped')
  }
  instance.onerror = (event) => {
    voiceInputListening.value = false
    const errorReason = String(event?.error ?? 'unknown error')
    appendVoiceLog(`[stt] error: ${errorReason}`)
  }
  instance.onresult = (event) => {
    const { finalText, interimText } = extractRecognitionText(event)
    voiceInputInterimText.value = interimText
    if (interimText) {
      appendVoiceLog(`[stt] interim: ${interimText}`)
    }
    if (finalText) {
      void handleVoiceFinalText(finalText)
    }
  }

  speechRecognition = instance
  return speechRecognition
}

function handleVoiceInputToggle() {
  if (!voiceInputSupported.value) {
    appendVoiceLog('[stt] unsupported: SpeechRecognition/webkitSpeechRecognition not found')
    return
  }

  const instance = ensureSpeechRecognitionInstance()
  if (!instance) {
    appendVoiceLog('[stt] unavailable: failed to create recognition instance')
    return
  }

  if (voiceInputListening.value) {
    appendVoiceLog('[stt] stop requested')
    instance.stop()
    return
  }

  appendVoiceLog('[stt] start requested')
  try {
    instance.start()
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[stt] start failed: ${reason}`)
  }
}

function handleModelBoundsChange(bounds: { width: number, height: number }) {
  avatarBounds.value = bounds
  const frame = resolveAvatarFrameSize({
    bounds,
    layout: avatarLayout,
  })

  if (
    lastRequestedWindowBounds.value
    && lastRequestedWindowBounds.value.width === frame.width
    && lastRequestedWindowBounds.value.height === frame.height
  ) {
    return
  }

  window.clawmuse?.resizeWindowToAvatar(frame)
  lastRequestedWindowBounds.value = frame
}

async function handleConnect() {
  try {
    await model.connect()
    markConnectionCached()
    openPanel.value = 'chat'
  }
  catch {
    openPanel.value = 'connection'
  }
}

async function handleSend() {
  try {
    const sent = await sendDraftMessage()
    if (sent) {
      markConnectionCached()
    }
  }
  catch {
    openPanel.value = 'logs'
  }
}

function toggleInteractionEmotion() {
  interactionEmotionEnabled.value = !interactionEmotionEnabled.value
}

async function handleManualMotion(motion: string) {
  if (!interactionEmotionEnabled.value) {
    return
  }

  await stageDriver.playMotion({
    motion,
    priority: 2,
    durationMs: 1600,
  })
}

async function handleRetryStageChecks() {
  await model.refreshStageWarnings({
    modelSource: activeCharacter?.profile.renderer.modelSource ?? '',
  })
}

function handleChatPanelImeDebug(line: string) {
  appendImeLog(`chat-panel ${line}`)
  if (
    line.includes('keydown key= ') && line.includes('code=Space')
    && (line.includes('ctrl=1') || line.includes('shift=1') || line.includes('alt=1'))
  ) {
    appendImeLog('chat-panel hint: app got this hotkey directly, OS did not switch IME. Try Win+Space / Alt+Shift in Windows settings.')
  }
}

function handleConnectionFieldUpdate(
  field: 'url' | 'token' | 'password' | 'sessionKey',
  value: string,
) {
  model.setConnectionField(field, value)
  persistConnectionCache({
    connectedUntil: 0,
  })
}
</script>

<template>
  <main class="avatar-shell">
    <section class="avatar-shell__stage">
      <Live2DStage
        :driver="stageDriver"
        :model-source="activeCharacter?.profile.renderer.modelSource ?? ''"
        :model-id="activeCharacter?.profile.id"
        @model-bounds-change="handleModelBoundsChange"
      >
        <div class="avatar-shell__overlay">
          <Transition name="avatar-shell__speech-bubble-transition">
            <aside
              v-if="speechBubbleVisible && speechBubbleText"
              class="avatar-shell__speech-bubble"
              data-role="speech-bubble"
              aria-live="polite"
            >
              <p>{{ speechBubbleText }}</p>
            </aside>
          </Transition>

          <nav
            class="avatar-shell__controls"
            aria-label="Avatar controls"
            @click.stop
          >
            <Transition name="avatar-shell__controls-menu-transition">
              <div v-if="controlsExpanded" class="avatar-shell__controls-menu">
                <p class="avatar-shell__menu-hint">
                  {{ state.connected ? 'Connected' : 'Not Connected' }}
                </p>

                <button
                  type="button"
                  class="avatar-shell__control-button"
                  data-action="chat"
                  @click="openPanelFromMenu('chat')"
                >
                  Chat
                </button>
                <button
                  type="button"
                  class="avatar-shell__control-button"
                  data-action="logs"
                  @click="openPanelFromMenu('logs')"
                >
                  Logs
                </button>
                <button
                  type="button"
                  class="avatar-shell__control-button avatar-shell__control-button--secondary"
                  data-action="toggle-interaction-emotion"
                  :aria-pressed="interactionEmotionEnabled ? 'true' : 'false'"
                  @click="toggleInteractionEmotion"
                >
                  Interaction Emote: {{ interactionEmotionEnabled ? 'On' : 'Off' }}
                </button>
                <div class="avatar-shell__manual-motion-group">
                  <p>Motion Test</p>
                  <small>Hiyori: TapBody#0 + Idle#0..#8</small>
                  <div class="avatar-shell__manual-motion-grid">
                    <button
                      v-for="item in manualMotionActions"
                      :key="item.id"
                      type="button"
                      class="avatar-shell__manual-motion-button"
                      :data-action="`manual-motion-${item.id}`"
                      @click="handleManualMotion(item.motion)"
                    >
                      {{ item.label }}
                    </button>
                  </div>
                </div>
              </div>
            </Transition>

            <button
              type="button"
              class="avatar-shell__control-toggle"
              data-action="toggle-controls"
              :aria-expanded="controlsExpanded ? 'true' : 'false'"
              @click="toggleControlsMenu"
            >
              {{ controlsExpanded ? 'Hide' : 'Menu' }}
            </button>
          </nav>

          <section
            v-if="openPanel"
            class="avatar-shell__panel"
            :class="{ 'avatar-shell__panel--chat': openPanel === 'chat' }"
            :data-panel="openPanel"
            @click.stop
          >
            <button
              type="button"
              class="avatar-shell__panel-close"
              aria-label="Close panel"
              @click="closePanel"
            >
              Close
            </button>
            <ConnectionPanel
              v-if="openPanel === 'connection'"
              :url="state.connection.url"
              :token="state.connection.token"
              :password="state.connection.password"
              :session-key="state.connection.sessionKey"
              @update-field="handleConnectionFieldUpdate"
              @connect="handleConnect"
            />
            <ChatPanel
              v-else-if="openPanel === 'chat'"
              :draft-message="state.draftMessage"
              :voice-supported="voiceInputSupported"
              :voice-listening="voiceInputListening"
              :voice-interim-text="voiceInputInterimText"
              @update-draft="model.setDraftMessage"
              @send="handleSend"
              @toggle-voice-input="handleVoiceInputToggle"
              @ime-debug="handleChatPanelImeDebug"
            />
            <div v-else class="avatar-shell__log-panel">
              <section v-if="state.stageWarnings.length" class="avatar-shell__warnings">
                <h2>Stage warnings</h2>
                <ul>
                  <li v-for="warning in state.stageWarnings" :key="warning">
                    {{ warning }}
                  </li>
                </ul>
                <button type="button" @click="handleRetryStageChecks">
                  Retry stage checks
                </button>
              </section>
              <LogPanel :logs="state.logs" />
            </div>
          </section>
        </div>
      </Live2DStage>
    </section>
  </main>
</template>

<style scoped>
:global(html) {
  height: 100%;
}

:global(body) {
  min-height: 100%;
  margin: 0;
  background: transparent;
  color: #1f1b16;
  font-family: "Avenir Next", "Segoe UI Variable", "Noto Sans SC", sans-serif;
  color-scheme: light dark;
}

:global(#app) {
  min-height: 100vh;
  background: transparent;
}

.avatar-shell {
  min-height: 100vh;
  background: transparent;
}

.avatar-shell__stage {
  position: relative;
}

.avatar-shell :deep(.clawmuse-live2d-stage) {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
}

.avatar-shell :deep(.clawmuse-live2d-canvas) {
  width: 100%;
  height: 100%;
  pointer-events: auto;
  -webkit-app-region: drag;
}

.avatar-shell :deep(.clawmuse-live2d-canvas canvas) {
  pointer-events: auto;
  -webkit-app-region: drag;
}

.avatar-shell__overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.avatar-shell__speech-bubble {
  position: absolute;
  left: clamp(52px, 14vw, 240px);
  top: clamp(18px, 7vh, 108px);
  max-width: min(430px, 66vw);
  padding: 0.86rem 1.02rem;
  border: 2px solid rgba(53, 34, 19, 0.9);
  border-radius: 20px;
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.94), transparent 52%),
    linear-gradient(164deg, rgba(255, 252, 244, 0.97) 0%, rgba(247, 230, 201, 0.98) 100%);
  box-shadow:
    0 18px 30px rgba(59, 34, 14, 0.2),
    0 3px 0 rgba(53, 34, 19, 0.2) inset;
  color: #2b1a0f;
  pointer-events: none;
}

.avatar-shell__speech-bubble::before {
  content: '';
  position: absolute;
  left: clamp(84px, 28%, 140px);
  bottom: -16px;
  width: 24px;
  height: 24px;
  background: linear-gradient(145deg, rgba(252, 238, 214, 0.98), rgba(247, 226, 193, 0.98));
  border-right: 2px solid rgba(53, 34, 19, 0.9);
  border-bottom: 2px solid rgba(53, 34, 19, 0.9);
  transform: rotate(45deg);
  border-radius: 2px;
}

.avatar-shell__speech-bubble p {
  margin: 0;
  line-height: 1.45;
  font-size: 0.95rem;
  font-weight: 700;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.66);
}

.avatar-shell__speech-bubble-transition-enter-active,
.avatar-shell__speech-bubble-transition-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.avatar-shell__speech-bubble-transition-enter-from,
.avatar-shell__speech-bubble-transition-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.avatar-shell__controls {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: grid;
  justify-items: end;
  gap: 8px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  user-select: none;
}

.avatar-shell__controls * {
  -webkit-app-region: no-drag;
  user-select: none;
}

.avatar-shell__controls-menu {
  display: grid;
  gap: 8px;
  min-width: 220px;
  max-width: min(360px, 78vw);
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 14px;
  background: rgba(20, 14, 10, 0.58);
  backdrop-filter: blur(8px);
}

.avatar-shell__controls-menu-transition-enter-active,
.avatar-shell__controls-menu-transition-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.avatar-shell__controls-menu-transition-enter-from,
.avatar-shell__controls-menu-transition-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.avatar-shell__quick-chat {
  display: grid;
  gap: 6px;
}

.avatar-shell__quick-chat-input {
  width: 100%;
  min-height: 58px;
  resize: vertical;
  box-sizing: border-box;
  border: 1.5px solid rgba(255, 255, 255, 0.34);
  border-radius: 12px;
  padding: 0.58rem 0.7rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 240, 229, 0.96) 100%);
  color: #20160e;
  font: inherit;
  line-height: 1.35;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
  user-select: text;
  -webkit-user-select: text;
}

.avatar-shell__quick-chat-input::placeholder {
  color: rgba(73, 49, 29, 0.72);
}

.avatar-shell__quick-chat-input:focus {
  outline: none;
  border-color: rgba(255, 221, 187, 0.92);
  box-shadow: 0 0 0 3px rgba(255, 210, 162, 0.24);
}

.avatar-shell__quick-send-button[disabled] {
  opacity: 0.6;
  cursor: default;
}

.avatar-shell__menu-hint {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(255, 236, 217, 0.86);
}

.avatar-shell__manual-motion-group {
  display: grid;
  gap: 6px;
  padding-top: 4px;
}

.avatar-shell__manual-motion-group p {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(255, 245, 236, 0.9);
}

.avatar-shell__manual-motion-group small {
  color: rgba(255, 240, 224, 0.74);
  font-size: 0.66rem;
}

.avatar-shell__manual-motion-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.avatar-shell__manual-motion-button {
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 9px;
  padding: 0.42rem 0.45rem;
  background: rgba(255, 255, 255, 0.08);
  color: #fff5eb;
  font: inherit;
  font-size: 0.68rem;
  cursor: pointer;
}

.avatar-shell__panel {
  position: fixed;
  right: 16px;
  top: 16px;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(19, 13, 10, 0.62);
  backdrop-filter: blur(9px);
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.avatar-shell__panel * {
  -webkit-app-region: no-drag;
}

.avatar-shell__panel {
  user-select: text;
  -webkit-user-select: text;
}

.avatar-shell__panel--chat {
  top: auto;
  bottom: 16px;
}

.avatar-shell__control-button,
.avatar-shell__panel-close,
.avatar-shell__control-toggle {
  border: 0;
  border-radius: 10px;
  padding: 0.48rem 0.72rem;
  background: linear-gradient(165deg, #724618 0%, #b77431 100%);
  color: #fff8f1;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.avatar-shell__control-button[disabled] {
  opacity: 0.58;
  cursor: default;
}

.avatar-shell__control-button--secondary {
  background: rgba(255, 255, 255, 0.14);
}

.avatar-shell__control-toggle {
  border-radius: 999px;
  padding-inline: 0.9rem;
}

.avatar-shell__panel-close {
  margin-bottom: 8px;
}

.avatar-shell__log-panel {
  display: grid;
  gap: 10px;
}

.avatar-shell__warnings {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 196, 136, 0.3);
  background: rgba(82, 49, 20, 0.4);
  color: #ffe7cf;
}

.avatar-shell__warnings h2 {
  margin: 0;
  font-size: 0.8rem;
}

.avatar-shell__warnings ul {
  margin: 0;
  padding-left: 1.1rem;
}

.avatar-shell__warnings button {
  justify-self: start;
  border: 0;
  border-radius: 9px;
  padding: 0.45rem 0.66rem;
  background: rgba(255, 255, 255, 0.2);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
  .avatar-shell__quick-chat-input {
    border-color: rgba(251, 217, 176, 0.32);
    background: linear-gradient(180deg, rgba(67, 49, 34, 0.95) 0%, rgba(54, 39, 27, 0.93) 100%);
    color: #fff3e3;
  }

  .avatar-shell__quick-chat-input::placeholder {
    color: rgba(245, 216, 183, 0.65);
  }

  .avatar-shell__quick-chat-input:focus {
    border-color: rgba(255, 211, 166, 0.72);
    box-shadow: 0 0 0 3px rgba(255, 193, 130, 0.2);
  }
}

@media (max-width: 720px) {
  .avatar-shell__speech-bubble {
    left: 10px;
    top: 10px;
    max-width: calc(100vw - 20px);
  }

  .avatar-shell__controls {
    right: 10px;
    bottom: 10px;
  }

  .avatar-shell__panel {
    right: 10px;
    left: 10px;
    width: auto;
    max-height: calc(100vh - 20px);
  }
}
</style>
