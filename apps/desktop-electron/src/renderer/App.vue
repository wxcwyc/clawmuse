<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Live2DDriver } from '../../../../packages/live2d-driver/src/index'
import { resolveLive2DModelSource } from '../../../../packages/live2d-driver/src/asset-resolver'
import Live2DStage from '../../../../packages/live2d-driver/src/components/Live2DStage.vue'
import ConnectionPanel from './components/ConnectionPanel.vue'
import ChatPanel from './components/ChatPanel.vue'
import LogPanel from './components/LogPanel.vue'
import {
  resolveAvatarFrameSize,
  resolveAvatarLayoutProfile,
} from './avatar-layout'
import {
  resolveAvatarPresenceState,
  resolveAvatarPresenceTransition,
  shouldHoldPresenceFallback,
  type AvatarPresenceState,
} from './avatar-presence'
import {
  getVoicePresets,
  resolveVoicePreset,
  selectSpeechSynthesisVoice,
  type SpeechSynthesisVoiceLike,
  type VoicePresetId,
} from './voice-profiles'
import {
  getVoiceOutputEngineOptions,
  normalizeHttpTtsEndpoint,
  resolveVoiceOutputEngineId,
  type VoiceOutputEngineId,
} from './voice-output-engines'
import {
  getVoiceInputEngineOptions,
  normalizeHttpSttEndpoint,
  resolveVoiceInputEngineId,
  type VoiceInputEngineId,
} from './voice-input-engines'
import {
  getCosyVoiceModeOptions,
  getCosyVoiceSpeakerOptions,
  getHttpTtsProviderOptions,
  resolveCosyVoiceModeId,
  resolveHttpTtsProviderId,
  type CosyVoiceModeId,
  type HttpTtsProviderId,
} from './cosyvoice-presets'
import { createDesktopRendererBootstrap } from './main'

type ShellPanel = 'connection' | 'chat' | 'logs' | null
type SpeechSynthesisLike = {
  speak: (utterance: unknown) => void
  cancel: () => void
  getVoices?: () => SpeechSynthesisVoiceLike[]
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
    voice?: unknown
    onend: (() => void) | null
    onerror: (() => void) | null
  }
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}
type VoiceServiceEventLike = {
  level?: 'info' | 'warn' | 'error'
  line?: string
}
type ShellCommandLike =
  | { type?: 'open-panel', panel?: 'chat' | 'logs' | 'connection' }
  | { type?: 'window.always-on-top', enabled?: boolean }
  | { type?: 'window.click-through', enabled?: boolean }
  | { type?: 'avatar.manual-motion', motion?: string }
  | { type?: 'avatar.switch-model', modelId?: string }
type VoiceServiceStatusLike = {
  state?: string
  lastError?: string
  adapter?: {
    sttMode?: string
    ttsMode?: string
  }
  upstream?: {
    healthy?: boolean
    baseUrl?: string
    launchAttempted?: boolean
  }
  cosyvoice?: {
    healthy?: boolean
    baseUrl?: string
    launchAttempted?: boolean
  }
}
type VoiceSpeakerListLike = {
  provider?: 'cosyvoice' | 'openllm'
  baseUrl?: string
  speakers?: string[]
  source?: 'endpoint' | 'fallback' | 'none'
  endpoint?: string
  reason?: string
}
type VoiceServiceUiTone = 'idle' | 'ok' | 'warn' | 'error'
type VoiceServiceBadgeItem = {
  id: string
  label: string
  tone: VoiceServiceUiTone
}
type BuiltinModelPresetId = 'builtin-hiyori' | 'openclaw-shizuku' | 'openclaw-mao-pro'
type ModelPresetId = BuiltinModelPresetId | 'custom' | `scan:${string}`
type ModelPresetOption = {
  id: string
  label: string
}
type ModelCatalogEntryLike = {
  id?: string
  label?: string
  source?: string
  absolutePath?: string
}
type AvatarEmotionName = 'neutral' | 'happy' | 'shy' | 'sad' | 'excited' | 'thinking'
type ModelCapabilitySummary = {
  source: string
  motionGroups: Array<{ group: string, count: number, displayName: string }>
  expressions: string[]
}
type ContextMotionOption = {
  id: string
  label: string
  motion: string
}
type ContextExpressionOption = {
  id: string
  label: string
  expression: string
}

const stageDriver = new Live2DDriver()
const CONNECTION_CACHE_KEY = 'clawmuse:connection-cache:v1'
const CONNECTION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const VOICE_SETTINGS_CACHE_KEY = 'clawmuse:voice-settings:v1'
const MODEL_SOURCE_CACHE_KEY = 'clawmuse:model-source:v1'
const DEFAULT_HTTP_TTS_ENDPOINT = normalizeHttpTtsEndpoint('')
const DEFAULT_HTTP_STT_ENDPOINT = normalizeHttpSttEndpoint('')

const bootstrap = createDesktopRendererBootstrap({
  createAvatarDriver: () => stageDriver,
})
const model = bootstrap.model
const state = model.state
const activeCharacter = bootstrap.registry.getActive()
const defaultModelSource = activeCharacter?.profile.renderer.modelSource ?? ''
const activeModelSource = ref(defaultModelSource)
const modelPresetId = ref<ModelPresetId>('builtin-hiyori')
const modelPresetStatus = ref('')
const builtinModelPresetOptions: ModelPresetOption[] = [
  { id: 'builtin-hiyori', label: 'Hiyori (Built-in)' },
  { id: 'openclaw-shizuku', label: 'Shizuku (Open-LLM-VTuber)' },
  { id: 'openclaw-mao-pro', label: 'Mao_pro (Open-LLM-VTuber)' },
]
const discoveredModelPresetOptions = ref<ModelPresetOption[]>([])
const discoveredModelSourceByPresetId = ref(new Map<string, string>())
function resolveModelOptionDedupKey(input: string): string {
  const direct = input.toLowerCase()
  if (
    direct === 'builtin-hiyori'
    || direct.includes('builtin-hiyori')
    || direct.includes('/builtin-hiyori/')
    || direct.includes('hiyori')
  ) {
    return 'builtin-hiyori'
  }
  if (direct === 'openclaw-shizuku' || direct.includes('shizuku') || direct.includes('/shizuku/')) {
    return 'openclaw-shizuku'
  }
  if (
    direct === 'openclaw-mao-pro'
    || direct.includes('mao_pro')
    || direct.includes('/mao_pro/')
    || direct.includes('mao pro')
    || /\bmao\b/.test(direct)
  ) {
    return 'openclaw-mao-pro'
  }

  const fileLike = direct.match(/([a-z0-9_-]+)\.model(?:3)?\.json/)
  if (fileLike?.[1]) {
    return `model:${fileLike[1]}`
  }
  return direct.trim()
}

const modelPresetOptions = computed<ModelPresetOption[]>(() => {
  const merged: ModelPresetOption[] = []
  const seen = new Set<string>()
  const pushUnique = (item: ModelPresetOption) => {
    const source = discoveredModelSourceByPresetId.value.get(item.id) ?? ''
    const dedupKey = resolveModelOptionDedupKey(`${item.id} ${item.label} ${source}`)
    if (seen.has(dedupKey)) {
      return
    }
    seen.add(dedupKey)
    merged.push(item)
  }

  for (const item of builtinModelPresetOptions) {
    pushUnique(item)
  }
  for (const item of discoveredModelPresetOptions.value) {
    pushUnique(item)
  }
  merged.push({
    id: 'custom',
    label: 'Custom Model Source',
  })
  return merged
})
const openPanel = ref<ShellPanel>(null)
const stageContextMenuVisible = ref(false)
const stageContextMenuX = ref(24)
const stageContextMenuY = ref(24)
const avatarBounds = ref<{ width: number, height: number } | null>(null)
const lastRequestedWindowBounds = ref<{ width: number, height: number } | null>(null)
const contextMenuModelOptions = computed(() => (
  modelPresetOptions.value.filter(item => item.id !== 'custom')
))
const currentModelCapabilities = ref<ModelCapabilitySummary | null>(null)
const contextMenuMotionOptions = computed<ContextMotionOption[]>(() => {
  const capability = currentModelCapabilities.value
  if (!capability || capability.motionGroups.length === 0) {
    return []
  }

  const options: ContextMotionOption[] = []
  for (const entry of capability.motionGroups) {
    const count = Math.max(0, Number(entry.count) || 0)
    const displayName = entry.displayName || (entry.group || 'Default')
    const motionBase = entry.group.trim()
    if (count <= 1) {
      options.push({
        id: `motion:${displayName}`,
        label: displayName,
        motion: motionBase || '#0',
      })
      continue
    }

    const perGroupLimit = Math.min(count, 6)
    for (let index = 0; index < perGroupLimit; index += 1) {
      options.push({
        id: `motion:${displayName}#${index}`,
        label: `${displayName} #${index}`,
        motion: motionBase ? `${motionBase}#${index}` : `#${index}`,
      })
    }
  }

  return options.slice(0, 28)
})
const contextMenuExpressionOptions = computed<ContextExpressionOption[]>(() => {
  const capability = currentModelCapabilities.value
  if (!capability || capability.expressions.length === 0) {
    return []
  }

  return capability.expressions.map((expression, index) => ({
    id: `expression:${expression}:${index}`,
    label: expression,
    expression,
  })).slice(0, 24)
})
const avatarLayout = resolveAvatarLayoutProfile(activeCharacter?.profile.id)
const speechBubbleText = ref('')
const speechBubbleVisible = ref(false)
type BubbleQueueItem = {
  text: string
  mode: 'speech' | 'thought'
  emotion?: AvatarEmotionName
  tone?: string
}
const speechBubbleMode = ref<'speech' | 'thought'>('speech')
const subtitleQueue = ref<BubbleQueueItem[]>([])
const isBubbleQueueRunning = ref(false)
const lastConsumedSubtitleIndex = ref(0)
let speechBubbleHideTimer: ReturnType<typeof setTimeout> | null = null
const voiceOutputEnabled = ref(true)
const voiceOutputEngineId = ref<VoiceOutputEngineId>('http_tts')
const voiceOutputEngineOptions = getVoiceOutputEngineOptions().map((item) => ({
  id: item.id,
  label: item.label,
}))
const voiceTtsProviderId = ref<HttpTtsProviderId>('openllm')
const voiceTtsProviderOptions = getHttpTtsProviderOptions().map(item => ({
  id: item.id,
  label: item.label,
}))
const voiceCosyVoiceModeId = ref<CosyVoiceModeId>('sft')
const voiceCosyVoiceModeOptions = getCosyVoiceModeOptions().map(item => ({
  id: item.id,
  label: item.label,
}))
const defaultVoiceCosyVoiceSpeakerOptions = getCosyVoiceSpeakerOptions().map(item => ({
  id: item.id,
  label: item.label,
}))
const voiceCosyVoiceSpeakerOptions = ref([...defaultVoiceCosyVoiceSpeakerOptions])
const voiceCosyVoiceSpeakersLoading = ref(false)
const voiceCosyVoiceSpeakersHint = ref('')
const voiceCosyVoiceBaseUrl = ref('http://127.0.0.1:50000')
const voiceCosyVoiceSpeakerId = ref('中文女')
const voiceCosyVoicePromptText = ref('')
const voiceCosyVoicePromptWavPath = ref('')
const voiceCosyVoiceInstructText = ref('')
const voiceCosyVoiceSampleRate = ref(22050)
const voiceCosyVoiceSpeed = ref(1)
const voiceHttpEndpoint = ref('http://127.0.0.1:8787/tts')
const voiceHttpTimeoutMs = ref(12000)
const voiceInputEngineId = ref<VoiceInputEngineId>('http_stt')
const voiceInputEngineOptions = getVoiceInputEngineOptions().map((item) => ({
  id: item.id,
  label: item.label,
}))
const voiceHttpSttEndpoint = ref('http://127.0.0.1:8788/stt')
const voiceHttpSttTimeoutMs = ref(12000)
const voicePresetId = ref<VoicePresetId>('clear')
const voicePresetOptions = getVoicePresets().map((preset) => ({
  id: preset.id,
  label: preset.label,
}))
const voiceInputSupported = ref(false)
const voiceInputListening = ref(false)
const voiceInputInterimText = ref('')
let speechRecognition: SpeechRecognitionLike | null = null
let httpSttMediaRecorder: MediaRecorder | null = null
let httpSttMediaStream: MediaStream | null = null
let voiceAutoSendInFlight = false
const voiceDiagnosticStatus = ref<VoiceDiagnosticStatus>('idle')
const voiceDiagnosticSummary = ref('')
const voiceDiagnosticSuggestions = ref<string[]>([])
const voiceDiagnosticActions = ref<VoiceDiagnosticAction[]>([])
const voiceDiagnosticLastRunAt = ref<number | null>(null)
const voiceDiagnosticLastRunSource = ref<VoiceDiagnosticRunSource | null>(null)
const voiceDiagnosticLastRunReason = ref('')
let voiceDiagnosticAutoRerunTimer: ReturnType<typeof setTimeout> | null = null
let voiceDiagnosticRerunPending = false
let voiceDiagnosticRerunReason = ''
let voiceCosyVoiceSpeakerRefreshTimer: ReturnType<typeof setTimeout> | null = null
let voiceServiceEventUnsubscribe: (() => void) | null = null
let shellCommandUnsubscribe: (() => void) | null = null
let stageTapTimer: ReturnType<typeof setTimeout> | null = null
let stageLastDownAt = 0
let stageLastDownX = 0
let stageLastDownY = 0
let stageLastTapAt = 0
let stageManualDragActive = false
let stageManualDragLastScreenX = 0
let stageManualDragLastScreenY = 0
let stageManualDragDistance = 0
let stageDownOnCanvas = false
let stageMouseIsDown = false
let stageInteractiveRegionActive = false
let assistantCueMotionUntil = 0
const STAGE_MODEL_BOTTOM_PADDING = 8
const STAGE_INTERACTIVE_HIT_SLOP = 20
const voiceServiceState = ref<'unknown' | 'starting' | 'running' | 'stopped' | 'error'>('unknown')
type VoiceServicePhase = 'unknown' | 'starting' | 'installing' | 'loading-model' | 'ready' | 'degraded'
const voiceServicePhase = ref<VoiceServicePhase>('unknown')
const voiceServiceSummary = ref('')
const voiceServiceTone = ref<VoiceServiceUiTone>('idle')
const voiceServiceBadges = ref<VoiceServiceBadgeItem[]>([])
const voiceServiceNotice = ref('')
const lastVoiceServiceStatus = ref<VoiceServiceStatusLike | null>(null)
const voiceInputLastError = ref('')
const voiceServiceBusy = ref(false)
const voiceServiceAvailable = computed<boolean | null>(() => {
  const status = lastVoiceServiceStatus.value
  if (!status) {
    return null
  }
  if (voiceServiceState.value === 'starting' || voiceServiceState.value === 'unknown') {
    return null
  }
  const sttMode = status.adapter?.sttMode
  const ttsMode = status.adapter?.ttsMode
  const sttAvailable = sttMode === 'owned' || sttMode === 'external'
  const ttsAvailable = ttsMode === 'owned' || ttsMode === 'external'
  const requiresCosyVoice = (
    voiceOutputEngineId.value === 'http_tts'
    && resolveHttpTtsProviderId(voiceTtsProviderId.value) === 'cosyvoice'
  )
  const cosyvoiceAvailable = requiresCosyVoice ? Boolean(status.cosyvoice?.healthy) : true
  return voiceServiceState.value === 'running'
    && Boolean(status.upstream?.healthy)
    && cosyvoiceAvailable
    && sttAvailable
    && ttsAvailable
})
const voiceServicePhaseLabel = computed(() => {
  if (voiceServicePhase.value === 'starting') {
    return '启动中'
  }
  if (voiceServicePhase.value === 'installing') {
    return '安装依赖中'
  }
  if (voiceServicePhase.value === 'loading-model') {
    return '加载模型中'
  }
  if (voiceServicePhase.value === 'ready') {
    return '已就绪'
  }
  if (voiceServicePhase.value === 'degraded') {
    return '异常/降级'
  }
  return '未知'
})
const voiceInputReady = computed(() => {
  if (voiceInputEngineId.value !== 'http_stt') {
    return true
  }
  const status = lastVoiceServiceStatus.value
  const sttMode = status?.adapter?.sttMode
  const sttAvailable = sttMode === 'owned' || sttMode === 'external'
  return voiceServiceState.value === 'running'
    && Boolean(status?.upstream?.healthy)
    && sttAvailable
})
const voiceInputBlockedReason = computed(() => {
  if (voiceInputEngineId.value !== 'http_stt') {
    return ''
  }
  const status = lastVoiceServiceStatus.value
  if (voiceServiceState.value === 'starting') {
    return '语音服务启动中，正在初始化依赖...'
  }
  if (status?.upstream?.launchAttempted && !status?.upstream?.healthy) {
    return '语音上游初始化中（首次可能安装依赖），完成后会自动就绪。'
  }
  if (!status?.upstream?.healthy) {
    return '语音上游未就绪，请稍候或点击 Restart Voice Service。'
  }
  const sttMode = status?.adapter?.sttMode
  if (sttMode !== 'owned' && sttMode !== 'external') {
    return 'STT 服务未绑定成功，请检查端口占用或重启语音服务。'
  }
  return ''
})

type VoicePersonaRule = {
  persona: string
  wording: string
  rhythm: string
  defaultTone: string
}

const voicePersonaRuleByPreset: Record<VoicePresetId, VoicePersonaRule> = {
  clear: {
    persona: '清纯、礼貌、轻快',
    wording: '用词干净自然，少俚语，不油腻',
    rhythm: '每次 1-3 句，先结论后补充',
    defaultTone: 'gentle',
  },
  loli: {
    persona: '元气、可爱、俏皮',
    wording: '口语化一点，可用轻度语气词',
    rhythm: '短句为主，节奏偏快',
    defaultTone: 'playful',
  },
  mature: {
    persona: '沉稳、知性、可靠',
    wording: '表达克制，信息密度高',
    rhythm: '句子完整，节奏偏慢',
    defaultTone: 'calm',
  },
  warm: {
    persona: '温柔、安抚、亲和',
    wording: '鼓励式表达，减少攻击性',
    rhythm: '中短句，语调柔和',
    defaultTone: 'gentle',
  },
  neutral: {
    persona: '中性、直接、专业',
    wording: '避免过度情绪化措辞',
    rhythm: '先要点后细节',
    defaultTone: 'serious',
  },
}
const AVATAR_PRESENCE_SERVER_HOLD_MS = 1400
const AVATAR_PRESENCE_MOTION_COOLDOWN_MS = 1200
const AVATAR_PRESENCE_TRANSITION_RETRY_PADDING_MS = 24
const AVATAR_IDLE_AMBIENT_MIN_MS = 4_800
const AVATAR_IDLE_AMBIENT_MAX_MS = 9_200
const AVATAR_IDLE_AMBIENT_MOTIONS = ['Idle#2', 'Idle#3', 'Idle#4', 'Idle#5'] as const
const avatarPresenceAppliedState = ref<AvatarPresenceState | null>(null)
const avatarPresenceStateEnteredAt = ref(0)
let avatarPresenceMotionUntil = 0
let avatarPresenceHoldTimer: ReturnType<typeof setTimeout> | null = null
let avatarPresenceTransitionRetryTimer: ReturnType<typeof setTimeout> | null = null
let avatarIdleAmbientTimer: ReturnType<typeof setTimeout> | null = null

const avatarPresenceProfiles: Record<AvatarPresenceState, {
  emotion: AvatarEmotionName
  intensity: number
  motion?: string
  priority?: number
  durationMs?: number
}> = {
  idle: {
    emotion: 'neutral',
    intensity: 0.35,
    motion: 'Idle#0',
    priority: 0,
    durationMs: 1200,
  },
  listening: {
    emotion: 'happy',
    intensity: 0.52,
    motion: 'Idle#1',
    priority: 1,
    durationMs: 1200,
  },
  thinking: {
    emotion: 'thinking',
    intensity: 0.64,
    motion: 'Idle#4',
    priority: 1,
    durationMs: 1500,
  },
  speaking: {
    emotion: 'happy',
    intensity: 0.58,
    motion: 'Idle#2',
    priority: 0,
    durationMs: 1200,
  },
  error: {
    emotion: 'sad',
    intensity: 0.78,
    motion: 'TapBody#0',
    priority: 2,
    durationMs: 1800,
  },
}

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

function mapVoiceServiceStateLabel(value: string) {
  if (value === 'running') {
    return '服务运行中'
  }
  if (value === 'starting') {
    return '服务启动中'
  }
  if (value === 'stopped') {
    return '服务已停止'
  }
  if (value === 'error') {
    return '服务错误'
  }
  return '服务未知'
}

function mapVoiceServicePhaseByStatus(status: VoiceServiceStatusLike | null | undefined): VoiceServicePhase {
  const stateValue = String(status?.state ?? 'unknown')
  const requiresCosyVoice = (
    voiceOutputEngineId.value === 'http_tts'
    && resolveHttpTtsProviderId(voiceTtsProviderId.value) === 'cosyvoice'
  )
  const cosyvoiceHealthy = requiresCosyVoice ? Boolean(status?.cosyvoice?.healthy) : true
  if (stateValue === 'starting') {
    return 'starting'
  }
  if (stateValue === 'running' && status?.upstream?.healthy && cosyvoiceHealthy) {
    return 'ready'
  }
  if (stateValue === 'running' && status?.upstream?.launchAttempted && !status?.upstream?.healthy) {
    return 'installing'
  }
  if (stateValue === 'running' && requiresCosyVoice && status?.cosyvoice?.launchAttempted && !status?.cosyvoice?.healthy) {
    return 'installing'
  }
  if (stateValue === 'running' && !status?.upstream?.healthy) {
    return 'degraded'
  }
  if (stateValue === 'running' && requiresCosyVoice && !status?.cosyvoice?.healthy) {
    return 'degraded'
  }
  if (stateValue === 'error' || stateValue === 'stopped') {
    return 'degraded'
  }
  return 'unknown'
}

function updateVoiceServicePhaseFromLogLine(line: string) {
  const normalized = line.toLowerCase()

  if (
    normalized.includes('upstream healthy')
    || normalized.includes('upstream ready')
    || normalized.includes('cosyvoice healthy')
    || normalized.includes('cosyvoice ready')
  ) {
    voiceServicePhase.value = 'ready'
    return
  }

  if (
    normalized.includes('bootstrap python deps')
    || normalized.includes('pip install')
    || normalized.includes('collecting ')
    || normalized.includes('building wheel')
    || normalized.includes('installing ')
  ) {
    voiceServicePhase.value = 'installing'
    return
  }

  if (
    normalized.includes('loading model')
    || normalized.includes('download')
    || normalized.includes('model archive')
    || normalized.includes('sherpa-onnx')
  ) {
    voiceServicePhase.value = 'loading-model'
    return
  }

  if (
    normalized.includes('upstream unavailable')
    || normalized.includes('upstream launch timeout')
    || normalized.includes('upstream process exited')
    || normalized.includes('cosyvoice unavailable')
    || normalized.includes('cosyvoice launch timeout')
    || normalized.includes('cosyvoice process exited')
    || normalized.includes('start failed')
  ) {
    voiceServicePhase.value = 'degraded'
  }
}

function mapAdapterModeLabel(kind: 'STT' | 'TTS', mode: string | undefined): VoiceServiceBadgeItem {
  if (mode === 'owned') {
    return {
      id: `adapter-${kind.toLowerCase()}`,
      label: `${kind} 代理就绪`,
      tone: 'ok',
    }
  }
  if (mode === 'external') {
    return {
      id: `adapter-${kind.toLowerCase()}`,
      label: `${kind} 外部服务`,
      tone: 'warn',
    }
  }
  if (mode === 'failed') {
    return {
      id: `adapter-${kind.toLowerCase()}`,
      label: `${kind} 绑定失败`,
      tone: 'error',
    }
  }
  return {
    id: `adapter-${kind.toLowerCase()}`,
    label: `${kind} 状态未知`,
    tone: 'idle',
  }
}

function applyVoiceServiceStatus(status: VoiceServiceStatusLike | null | undefined) {
  lastVoiceServiceStatus.value = status ?? null
  const stateValue = String(status?.state ?? 'unknown')
  if (stateValue === 'running' || stateValue === 'starting' || stateValue === 'stopped' || stateValue === 'error') {
    voiceServiceState.value = stateValue
  }
  else {
    voiceServiceState.value = 'unknown'
  }
  const statusPhase = mapVoiceServicePhaseByStatus(status)
  if (voiceServicePhase.value === 'unknown' || statusPhase === 'ready' || statusPhase === 'degraded' || statusPhase === 'starting') {
    voiceServicePhase.value = statusPhase
  }

  const sttMode = status?.adapter?.sttMode ?? '-'
  const ttsMode = status?.adapter?.ttsMode ?? '-'
  const upstreamOk = status?.upstream?.healthy ? '1' : '0'
  const baseUrl = status?.upstream?.baseUrl ?? '-'
  const cosyvoiceOk = status?.cosyvoice?.healthy ? '1' : '0'
  const cosyvoiceBase = status?.cosyvoice?.baseUrl ?? '-'
  const requiresCosyVoice = (
    voiceOutputEngineId.value === 'http_tts'
    && resolveHttpTtsProviderId(voiceTtsProviderId.value) === 'cosyvoice'
  )
  const cosyvoiceHealthyForOutput = requiresCosyVoice ? Boolean(status?.cosyvoice?.healthy) : true
  const lastError = String(status?.lastError ?? '').trim()
  const badges: VoiceServiceBadgeItem[] = [
    {
      id: 'state',
      label: mapVoiceServiceStateLabel(voiceServiceState.value),
      tone: voiceServiceState.value === 'running'
        ? 'ok'
        : (voiceServiceState.value === 'error' ? 'error' : 'idle'),
    },
    mapAdapterModeLabel('STT', status?.adapter?.sttMode),
    mapAdapterModeLabel('TTS', status?.adapter?.ttsMode),
    {
      id: 'upstream',
      label: status?.upstream?.healthy ? '上游可用' : '上游离线',
      tone: status?.upstream?.healthy ? 'ok' : 'warn',
    },
    {
      id: 'cosyvoice',
      label: requiresCosyVoice
        ? (status?.cosyvoice?.healthy ? 'CosyVoice可用' : 'CosyVoice离线')
        : 'CosyVoice未启用',
      tone: requiresCosyVoice
        ? (status?.cosyvoice?.healthy ? 'ok' : 'warn')
        : 'idle',
    },
    {
      id: 'phase',
      label: `阶段：${voiceServicePhaseLabel.value}`,
      tone: voiceServicePhase.value === 'ready'
        ? 'ok'
        : (voiceServicePhase.value === 'degraded' ? 'error' : 'idle'),
    },
  ]
  voiceServiceBadges.value = badges

  voiceServiceSummary.value = (
    `state=${voiceServiceState.value} `
    + `stt=${sttMode} `
    + `tts=${ttsMode} `
    + `upstream=${upstreamOk} `
    + `cosyvoice=${cosyvoiceOk} `
    + `base=${baseUrl}`
    + ` cosybase=${cosyvoiceBase}`
    + (lastError ? ` err=${lastError}` : '')
  )

  const notices: string[] = []
  const inputReason = voiceInputLastError.value.toLowerCase()
  if (inputReason.includes('requested device not found')) {
    notices.push('麦克风不可用：系统默认输入设备未找到。请检查系统麦克风并重试。')
  }
  if (status?.upstream?.launchAttempted && !status?.upstream?.healthy) {
    notices.push('语音后端初始化中（首次可能安装依赖），完成后会自动可用。')
  }
  else if (!status?.upstream?.healthy) {
    notices.push('语音上游未就绪，STT/TTS 会返回 503。可点 Restart Voice Service。')
  }
  if (requiresCosyVoice && status?.cosyvoice?.launchAttempted && !status?.cosyvoice?.healthy) {
    notices.push('CosyVoice 初始化中（首次可能安装依赖/加载模型），完成后会自动可用。')
  }
  else if (requiresCosyVoice && !status?.cosyvoice?.healthy) {
    notices.push('CosyVoice 未就绪，当前 TTS 会失败。可点 Restart Voice Service。')
  }
  if (lastError) {
    notices.push(`服务错误：${lastError}`)
  }
  voiceServiceNotice.value = notices[0] ?? ''

  if (voiceServiceState.value === 'running') {
    voiceServiceTone.value = (Boolean(status?.upstream?.healthy) && cosyvoiceHealthyForOutput) ? 'ok' : 'warn'
    return
  }
  if (voiceServiceState.value === 'starting') {
    voiceServiceTone.value = 'idle'
    return
  }
  if (voiceServiceState.value === 'error') {
    voiceServiceTone.value = 'error'
    return
  }
  voiceServiceTone.value = 'warn'
}

async function refreshVoiceServiceStatus(options?: { silent?: boolean }) {
  const bridge = window.clawmuse
  if (!bridge || typeof bridge.getVoiceServiceStatus !== 'function') {
    return
  }

  if (!options?.silent) {
    voiceServiceBusy.value = true
  }
  try {
    const nextStatus = await bridge.getVoiceServiceStatus()
    applyVoiceServiceStatus(nextStatus as VoiceServiceStatusLike)
    appendVoiceLog(`[service] refreshed ${voiceServiceSummary.value}`)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[service] refresh failed: ${reason}`)
  }
  finally {
    if (!options?.silent) {
      voiceServiceBusy.value = false
    }
  }
}

async function restartVoiceService() {
  const bridge = window.clawmuse
  if (!bridge || typeof bridge.stopVoiceService !== 'function' || typeof bridge.startVoiceService !== 'function') {
    appendVoiceLog('[service] restart unavailable: preload bridge does not expose voice controls')
    return
  }

  voiceServiceBusy.value = true
  try {
    appendVoiceLog('[service] restart requested')
    await bridge.stopVoiceService()
    const nextStatus = await bridge.startVoiceService()
    applyVoiceServiceStatus(nextStatus as VoiceServiceStatusLike)
    appendVoiceLog(`[service] restarted ${voiceServiceSummary.value}`)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[service] restart failed: ${reason}`)
  }
  finally {
    voiceServiceBusy.value = false
  }
}

async function recoverVoiceServiceAfterHttpFetchFailure(params: {
  scope: 'stt' | 'tts'
  endpoint: string
}): Promise<boolean> {
  const bridge = window.clawmuse
  if (
    !bridge
    || typeof bridge.getVoiceServiceStatus !== 'function'
    || typeof bridge.startVoiceService !== 'function'
  ) {
    appendVoiceLog(`[service] recover skipped (${params.scope}): preload bridge unavailable`)
    return false
  }

  voiceServiceBusy.value = true
  try {
    const before = await bridge.getVoiceServiceStatus() as VoiceServiceStatusLike
    applyVoiceServiceStatus(before)
    appendVoiceLog(`[service] recover(${params.scope}) before ${voiceServiceSummary.value}`)

    if (before.state === 'running' && typeof bridge.stopVoiceService === 'function') {
      appendVoiceLog(`[service] recover(${params.scope}) action=restart endpoint=${params.endpoint}`)
      await bridge.stopVoiceService()
      const afterRestart = await bridge.startVoiceService() as VoiceServiceStatusLike
      applyVoiceServiceStatus(afterRestart)
      appendVoiceLog(`[service] recover(${params.scope}) after ${voiceServiceSummary.value}`)
      return true
    }

    appendVoiceLog(`[service] recover(${params.scope}) action=start endpoint=${params.endpoint}`)
    const afterStart = await bridge.startVoiceService() as VoiceServiceStatusLike
    applyVoiceServiceStatus(afterStart)
    appendVoiceLog(`[service] recover(${params.scope}) after ${voiceServiceSummary.value}`)
    return true
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[service] recover(${params.scope}) failed: ${reason}`)
    return false
  }
  finally {
    voiceServiceBusy.value = false
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

type VoiceSettingsCachePayload = {
  outputEnabled: boolean
  engineId: VoiceOutputEngineId
  ttsProviderId: HttpTtsProviderId
  cosyVoiceModeId: CosyVoiceModeId
  cosyVoiceBaseUrl: string
  cosyVoiceSpeakerId: string
  cosyVoicePromptText: string
  cosyVoicePromptWavPath: string
  cosyVoiceInstructText: string
  cosyVoiceSampleRate: number
  cosyVoiceSpeed: number
  httpEndpoint: string
  httpTimeoutMs: number
  inputEngineId: VoiceInputEngineId
  sttHttpEndpoint: string
  sttHttpTimeoutMs: number
  presetId: VoicePresetId
  updatedAt: number
}

type ModelSourceCachePayload = {
  modelSource: string
  updatedAt: number
}

type VoiceDiagnosticOutcome = {
  ok: boolean
  reachable: boolean
  detail: string
}
type VoiceDiagnosticStatus = 'idle' | 'running' | 'ok' | 'partial' | 'failed'
type VoiceDiagnosticRunSource = 'manual' | 'auto'
type VoiceDiagnosticBadgeTone = 'idle' | 'running' | 'ok' | 'partial' | 'failed'
type VoiceDiagnosticActionId =
  | 'tts-engine-web-speech'
  | 'stt-engine-web-speech'
  | 'tts-endpoint-default'
  | 'stt-endpoint-default'
  | 'both-endpoints-default'
type VoiceDiagnosticAction = {
  id: VoiceDiagnosticActionId
  label: string
  description: string
  changePreview: string
  priority: number
  recommended?: boolean
}

function validateHttpServiceEndpoint(endpoint: string, label: 'TTS' | 'STT'): string {
  const trimmed = endpoint.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `${label} endpoint must start with http:// or https://.`
    }
    return ''
  }
  catch {
    return `${label} endpoint is not a valid URL.`
  }
}

const voiceHttpEndpointError = computed(() => {
  if (voiceOutputEngineId.value !== 'http_tts') {
    return ''
  }
  return validateHttpServiceEndpoint(voiceHttpEndpoint.value, 'TTS')
})

const voiceHttpSttEndpointError = computed(() => {
  if (voiceInputEngineId.value !== 'http_stt') {
    return ''
  }
  return validateHttpServiceEndpoint(voiceHttpSttEndpoint.value, 'STT')
})

const voiceDiagnosticBadge = computed(() => {
  if (voiceDiagnosticStatus.value === 'running') {
    return 'Voice diagnostics running...'
  }
  if (!voiceDiagnosticLastRunAt.value) {
    return ''
  }

  const statusLabel = (
    voiceDiagnosticStatus.value === 'ok'
      ? 'ok'
      : voiceDiagnosticStatus.value === 'partial'
        ? 'partial'
        : voiceDiagnosticStatus.value === 'failed'
          ? 'failed'
          : 'idle'
  )
  const timeLabel = new Date(voiceDiagnosticLastRunAt.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const reasonPart = voiceDiagnosticLastRunReason.value
    ? ` · ${voiceDiagnosticLastRunReason.value}`
    : ''
  if (voiceDiagnosticLastRunSource.value === 'auto') {
    return `Recheck ${timeLabel} · ${statusLabel}${reasonPart}`
  }
  return `Last diagnostics ${timeLabel} · ${statusLabel}`
})

const voiceDiagnosticBadgeTone = computed<VoiceDiagnosticBadgeTone>(() => {
  if (voiceDiagnosticStatus.value === 'running') {
    return 'running'
  }
  if (voiceDiagnosticStatus.value === 'ok') {
    return 'ok'
  }
  if (voiceDiagnosticStatus.value === 'partial') {
    return 'partial'
  }
  if (voiceDiagnosticStatus.value === 'failed') {
    return 'failed'
  }
  return 'idle'
})

const voiceDiagnosticBadgeRecheck = computed(() => {
  return voiceDiagnosticLastRunSource.value === 'auto'
})

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

function readVoiceSettingsCache(): VoiceSettingsCachePayload | null {
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<VoiceSettingsCachePayload>
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const preset = resolveVoicePreset(parsed.presetId)
    const engineId = resolveVoiceOutputEngineId(parsed.engineId)
    const inputEngineId = resolveVoiceInputEngineId(parsed.inputEngineId)
    const ttsProviderId = resolveHttpTtsProviderId(parsed.ttsProviderId)
    const cosyVoiceModeId = resolveCosyVoiceModeId(parsed.cosyVoiceModeId)
    const cosyVoiceSampleRate = (
      typeof parsed.cosyVoiceSampleRate === 'number'
      && Number.isFinite(parsed.cosyVoiceSampleRate)
      && parsed.cosyVoiceSampleRate >= 8000
      && parsed.cosyVoiceSampleRate <= 96000
    ) ? parsed.cosyVoiceSampleRate : 22050
    const cosyVoiceSpeed = (
      typeof parsed.cosyVoiceSpeed === 'number'
      && Number.isFinite(parsed.cosyVoiceSpeed)
      && parsed.cosyVoiceSpeed >= 0.5
      && parsed.cosyVoiceSpeed <= 2
    ) ? parsed.cosyVoiceSpeed : 1
    return {
      outputEnabled: parsed.outputEnabled !== false,
      engineId,
      ttsProviderId,
      cosyVoiceModeId,
      cosyVoiceBaseUrl: String(parsed.cosyVoiceBaseUrl ?? 'http://127.0.0.1:50000').trim() || 'http://127.0.0.1:50000',
      cosyVoiceSpeakerId: String(parsed.cosyVoiceSpeakerId ?? '中文女'),
      cosyVoicePromptText: String(parsed.cosyVoicePromptText ?? ''),
      cosyVoicePromptWavPath: String(parsed.cosyVoicePromptWavPath ?? ''),
      cosyVoiceInstructText: String(parsed.cosyVoiceInstructText ?? ''),
      cosyVoiceSampleRate,
      cosyVoiceSpeed,
      httpEndpoint: normalizeHttpTtsEndpoint(String(parsed.httpEndpoint ?? '')),
      httpTimeoutMs: (
        typeof parsed.httpTimeoutMs === 'number'
        && Number.isFinite(parsed.httpTimeoutMs)
        && parsed.httpTimeoutMs >= 1000
      ) ? parsed.httpTimeoutMs : 12000,
      inputEngineId,
      sttHttpEndpoint: normalizeHttpSttEndpoint(String(parsed.sttHttpEndpoint ?? '')),
      sttHttpTimeoutMs: (
        typeof parsed.sttHttpTimeoutMs === 'number'
        && Number.isFinite(parsed.sttHttpTimeoutMs)
        && parsed.sttHttpTimeoutMs >= 1000
      ) ? parsed.sttHttpTimeoutMs : 12000,
      presetId: preset.id,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  }
  catch {
    return null
  }
}

function persistVoiceSettingsCache() {
  const preset = resolveVoicePreset(voicePresetId.value)
  window.localStorage.setItem(VOICE_SETTINGS_CACHE_KEY, JSON.stringify({
    outputEnabled: voiceOutputEnabled.value,
    engineId: voiceOutputEngineId.value,
    ttsProviderId: voiceTtsProviderId.value,
    cosyVoiceModeId: voiceCosyVoiceModeId.value,
    cosyVoiceBaseUrl: voiceCosyVoiceBaseUrl.value.trim(),
    cosyVoiceSpeakerId: voiceCosyVoiceSpeakerId.value,
    cosyVoicePromptText: voiceCosyVoicePromptText.value,
    cosyVoicePromptWavPath: voiceCosyVoicePromptWavPath.value.trim(),
    cosyVoiceInstructText: voiceCosyVoiceInstructText.value,
    cosyVoiceSampleRate: voiceCosyVoiceSampleRate.value,
    cosyVoiceSpeed: voiceCosyVoiceSpeed.value,
    httpEndpoint: normalizeHttpTtsEndpoint(voiceHttpEndpoint.value),
    httpTimeoutMs: voiceHttpTimeoutMs.value,
    inputEngineId: voiceInputEngineId.value,
    sttHttpEndpoint: normalizeHttpSttEndpoint(voiceHttpSttEndpoint.value),
    sttHttpTimeoutMs: voiceHttpSttTimeoutMs.value,
    presetId: preset.id,
    updatedAt: Date.now(),
  } satisfies VoiceSettingsCachePayload))
}

function restoreVoiceSettingsCache() {
  const cached = readVoiceSettingsCache()
  if (!cached) {
    return
  }

  voiceOutputEnabled.value = cached.outputEnabled
  voiceOutputEngineId.value = cached.engineId
  voiceTtsProviderId.value = cached.ttsProviderId
  voiceCosyVoiceModeId.value = cached.cosyVoiceModeId
  voiceCosyVoiceBaseUrl.value = cached.cosyVoiceBaseUrl
  voiceCosyVoiceSpeakerId.value = cached.cosyVoiceSpeakerId
  voiceCosyVoicePromptText.value = cached.cosyVoicePromptText
  voiceCosyVoicePromptWavPath.value = cached.cosyVoicePromptWavPath
  voiceCosyVoiceInstructText.value = cached.cosyVoiceInstructText
  voiceCosyVoiceSampleRate.value = cached.cosyVoiceSampleRate
  voiceCosyVoiceSpeed.value = cached.cosyVoiceSpeed
  voiceHttpEndpoint.value = normalizeHttpTtsEndpoint(cached.httpEndpoint)
  voiceHttpTimeoutMs.value = cached.httpTimeoutMs
  voiceInputEngineId.value = cached.inputEngineId
  voiceHttpSttEndpoint.value = normalizeHttpSttEndpoint(cached.sttHttpEndpoint)
  voiceHttpSttTimeoutMs.value = cached.sttHttpTimeoutMs
  voicePresetId.value = resolveVoicePreset(cached.presetId).id
  appendVoiceLog(
    `[tts] restored settings stt=${voiceInputEngineId.value} tts=${voiceOutputEngineId.value} provider=${voiceTtsProviderId.value} mode=${voiceCosyVoiceModeId.value} preset=${voicePresetId.value} output=${voiceOutputEnabled.value ? '1' : '0'}`,
  )
}

function updateCosyVoiceSpeakerOptions(speakers: string[]) {
  const normalized = Array.from(new Set([
    ...speakers
      .map(item => String(item ?? '').trim())
      .filter(Boolean),
    ...defaultVoiceCosyVoiceSpeakerOptions.map(item => item.id),
  ]))
  voiceCosyVoiceSpeakerOptions.value = normalized.map(id => ({
    id,
    label: id,
  }))
}

async function refreshCosyVoiceSpeakerOptions(options?: {
  source?: 'manual' | 'auto'
}) {
  if (resolveHttpTtsProviderId(voiceTtsProviderId.value) !== 'cosyvoice') {
    return
  }
  const bridge = window.clawmuse
  if (!bridge || typeof bridge.getVoiceServiceSpeakers !== 'function') {
    voiceCosyVoiceSpeakersHint.value = '当前构建不支持自动读取声线（桥接缺失）'
    return
  }

  const baseUrl = voiceCosyVoiceBaseUrl.value.trim() || 'http://127.0.0.1:50000'
  const source = options?.source ?? 'manual'
  voiceCosyVoiceSpeakersLoading.value = true
  try {
    const result = await bridge.getVoiceServiceSpeakers({
      provider: 'cosyvoice',
      baseUrl,
    }) as VoiceSpeakerListLike
    const speakers = Array.isArray(result?.speakers)
      ? result.speakers.map(item => String(item ?? '').trim()).filter(Boolean)
      : []
    if (speakers.length > 0) {
      updateCosyVoiceSpeakerOptions(speakers)
      if (!voiceCosyVoiceSpeakerId.value.trim()) {
        voiceCosyVoiceSpeakerId.value = speakers[0]
      }
      const listSource = result?.source || 'endpoint'
      voiceCosyVoiceSpeakersHint.value = (
        listSource === 'endpoint'
          ? `已自动读取 ${speakers.length} 个声线`
          : `自动读取失败，使用内置 ${speakers.length} 个声线`
      )
      appendVoiceLog(
        `[tts] cosyvoice speakers loaded source=${listSource} count=${speakers.length} base=${baseUrl}`,
      )
      if (result?.reason) {
        appendVoiceLog(`[tts] cosyvoice speakers reason=${result.reason}`)
      }
      persistVoiceSettingsCache()
      return
    }

    updateCosyVoiceSpeakerOptions(defaultVoiceCosyVoiceSpeakerOptions.map(item => item.id))
    voiceCosyVoiceSpeakersHint.value = '未读取到声线列表，使用内置列表'
    appendVoiceLog(`[tts] cosyvoice speakers empty source=${result?.source ?? 'none'} base=${baseUrl}`)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    updateCosyVoiceSpeakerOptions(defaultVoiceCosyVoiceSpeakerOptions.map(item => item.id))
    voiceCosyVoiceSpeakersHint.value = '自动读取失败，使用内置列表'
    appendVoiceLog(`[tts] cosyvoice speakers fetch failed source=${source} base=${baseUrl} reason=${reason}`)
  }
  finally {
    voiceCosyVoiceSpeakersLoading.value = false
  }
}

function scheduleRefreshCosyVoiceSpeakerOptions(reason: string) {
  if (voiceCosyVoiceSpeakerRefreshTimer) {
    clearTimeout(voiceCosyVoiceSpeakerRefreshTimer)
    voiceCosyVoiceSpeakerRefreshTimer = null
  }
  voiceCosyVoiceSpeakerRefreshTimer = setTimeout(() => {
    voiceCosyVoiceSpeakerRefreshTimer = null
    appendVoiceLog(`[tts] cosyvoice speakers auto refresh reason=${reason}`)
    void refreshCosyVoiceSpeakerOptions({
      source: 'auto',
    })
  }, 520)
}

function normalizeModelSourceInput(rawSource: string): string {
  const trimmed = rawSource.trim()
  if (!trimmed) {
    return defaultModelSource
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    const normalizedPath = trimmed.replace(/\\/g, '/')
    return `file:///${normalizedPath}`
  }

  return trimmed
}

function isBuiltinModelPresetId(value: string): value is BuiltinModelPresetId {
  return value === 'builtin-hiyori' || value === 'openclaw-shizuku' || value === 'openclaw-mao-pro'
}

function inferModelPresetIdBySource(modelSource: string): ModelPresetId {
  const normalized = normalizeModelSourceInput(modelSource).toLowerCase()
  const discovered = discoveredModelSourceByPresetId.value
  for (const [id, source] of discovered) {
    if (normalizeModelSourceInput(source).toLowerCase() === normalized) {
      return id as ModelPresetId
    }
  }

  if (normalized === defaultModelSource.toLowerCase() || normalized.includes('/builtin-hiyori/')) {
    return 'builtin-hiyori'
  }
  if (normalized.includes('/shizuku/')) {
    return 'openclaw-shizuku'
  }
  if (normalized.includes('/mao_pro/')) {
    return 'openclaw-mao-pro'
  }
  return 'custom'
}

function resolveModelRootUrlCandidates(): string[] {
  if (typeof window === 'undefined') {
    return []
  }

  const locationHref = window.location.href
  const candidates: string[] = []
  const pushUnique = (value: string) => {
    if (!candidates.includes(value)) {
      candidates.push(value)
    }
  }

  try {
    const currentUrl = new URL(locationHref)
    // packaged Electron: file:///.../resources/app.asar/out/renderer/index.html -> ../../../../
    pushUnique(new URL('../../../../', currentUrl).toString())
    // local built output: .../out/renderer/index.html -> ../../
    pushUnique(new URL('../../', currentUrl).toString())
    // direct working dir fallback
    pushUnique(new URL('./', currentUrl).toString())
  }
  catch {
    // ignore URL parse errors
  }

  return candidates
}

function buildModelPresetCandidates(presetIdValue: BuiltinModelPresetId): string[] {
  if (presetIdValue === 'builtin-hiyori') {
    return [defaultModelSource]
  }

  const relativeModelPath = presetIdValue === 'openclaw-shizuku'
    ? 'voice-backend/Open-LLM-VTuber/live2d-models/shizuku/runtime/shizuku.model3.json'
    : 'voice-backend/Open-LLM-VTuber/live2d-models/mao_pro/runtime/mao_pro.model3.json'
  const candidates: string[] = []
  const pushUnique = (value: string) => {
    if (!candidates.includes(value)) {
      candidates.push(value)
    }
  }

  pushUnique(`./${relativeModelPath}`)
  pushUnique(`../../${relativeModelPath}`)
  pushUnique(`../../../../${relativeModelPath}`)

  for (const root of resolveModelRootUrlCandidates()) {
    try {
      pushUnique(new URL(relativeModelPath, root).toString())
    }
    catch {
      // ignore malformed root candidates
    }
  }

  return candidates
}

async function isModelSourceReachable(modelSource: string): Promise<boolean> {
  const resolvedModelSource = modelSource.startsWith('assets://')
    ? resolveLive2DModelSource(modelSource)
    : modelSource
  try {
    const response = await fetch(resolvedModelSource)
    return response.ok
  }
  catch {
    return false
  }
}

function normalizeCatalogEntry(rawEntry: ModelCatalogEntryLike): {
  id: string
  label: string
  source: string
} | null {
  if (!rawEntry || typeof rawEntry !== 'object') {
    return null
  }

  const source = normalizeModelSourceInput(String(rawEntry.source ?? ''))
  if (!source) {
    return null
  }

  const entryIdRaw = String(rawEntry.id ?? '').trim()
  const id = entryIdRaw.startsWith('scan:') ? entryIdRaw : `scan:${entryIdRaw || source}`
  const label = String(rawEntry.label ?? '').trim() || source
  return {
    id,
    label,
    source,
  }
}

async function refreshDiscoveredModelCatalog(options?: { silent?: boolean }) {
  const bridge = window.clawmuse as (typeof window.clawmuse & {
    scanLive2DModels?: () => Promise<ModelCatalogEntryLike[]>
  }) | undefined
  if (!bridge || typeof bridge.scanLive2DModels !== 'function') {
    return
  }

  try {
    const payload = await bridge.scanLive2DModels()
    const optionsList: ModelPresetOption[] = []
    const sourceMap = new Map<string, string>()
    const seenId = new Set<string>()

    for (const rawEntry of (Array.isArray(payload) ? payload : [])) {
      const normalized = normalizeCatalogEntry(rawEntry)
      if (!normalized || seenId.has(normalized.id)) {
        continue
      }
      seenId.add(normalized.id)
      optionsList.push({
        id: normalized.id,
        label: normalized.label,
      })
      sourceMap.set(normalized.id, normalized.source)
    }

    discoveredModelPresetOptions.value = optionsList
    discoveredModelSourceByPresetId.value = sourceMap
    if (!options?.silent) {
      modelPresetStatus.value = optionsList.length > 0
        ? `已发现 ${optionsList.length} 个本地模型`
        : '未发现额外模型，可使用 Custom Model Source'
    }
    state.logs.push(`[stage] model catalog refreshed count=${optionsList.length}`)
    modelPresetId.value = inferModelPresetIdBySource(activeModelSource.value)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    state.logs.push(`[stage] model catalog refresh failed: ${reason}`)
    if (!options?.silent) {
      modelPresetStatus.value = '模型扫描失败，请查看 Logs'
    }
  }
}

function readModelSourceCache(): ModelSourceCachePayload | null {
  try {
    const raw = window.localStorage.getItem(MODEL_SOURCE_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<ModelSourceCachePayload>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.modelSource !== 'string') {
      return null
    }

    const normalizedModelSource = normalizeModelSourceInput(parsed.modelSource)
    if (!normalizedModelSource) {
      return null
    }

    return {
      modelSource: normalizedModelSource,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  }
  catch {
    return null
  }
}

function persistModelSourceCache(modelSource: string) {
  window.localStorage.setItem(MODEL_SOURCE_CACHE_KEY, JSON.stringify({
    modelSource,
    updatedAt: Date.now(),
  } satisfies ModelSourceCachePayload))
}

function normalizeExpressionName(value: string) {
  const basename = value
    .replace(/^.*[\\/]/, '')
    .replace(/\.(?:exp3|json)$/gi, '')
    .trim()
  return basename || value.trim()
}

function parseModelCapabilitiesFromJson(json: unknown, source: string): ModelCapabilitySummary | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const fileReferences = (json as { FileReferences?: unknown }).FileReferences
  if (!fileReferences || typeof fileReferences !== 'object') {
    return null
  }

  const motions = ((fileReferences as { Motions?: unknown }).Motions ?? {}) as Record<string, unknown[]>
  const expressions = ((fileReferences as { Expressions?: unknown }).Expressions ?? []) as Array<{ Name?: string, File?: string }>
  const motionGroups = Object.entries(motions)
    .map(([name, list]) => {
      const normalizedName = String(name || '').trim()
      return {
        group: normalizedName,
        count: Math.max(1, Array.isArray(list) ? list.length : 1),
        displayName: normalizedName || 'Default',
      }
    })
    .filter(entry => entry.count > 0)
  const expressionNames = expressions
    .map((item) => normalizeExpressionName(String(item?.Name || item?.File || '').trim()))
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)

  return {
    source,
    motionGroups,
    expressions: expressionNames,
  }
}

function applyCurrentModelCapabilities(summary: ModelCapabilitySummary | null) {
  currentModelCapabilities.value = summary
  if (!summary) {
    return
  }

  const motionSummary = summary.motionGroups
    .map(item => `${item.displayName}:${item.count}`)
    .join(', ')
  const expressionSummary = summary.expressions
    .slice(0, 6)
    .join(', ')
  state.logs.push(`[stage] model capabilities source=${summary.source} motions=${motionSummary || 'none'} expressions=${summary.expressions.length}`)
  if (expressionSummary) {
    state.logs.push(`[stage] model expressions sample=${expressionSummary}`)
  }
}

async function inspectCurrentModelCapabilities(modelSource: string) {
  const resolvedModelSource = modelSource.startsWith('assets://')
    ? resolveLive2DModelSource(modelSource)
    : modelSource
  try {
    const response = await fetch(resolvedModelSource)
    if (!response.ok) {
      return
    }
    const payload = await response.json()
    const summary = parseModelCapabilitiesFromJson(payload, resolvedModelSource)
    applyCurrentModelCapabilities(summary)
  }
  catch {
    // ignore capability probe failures (file:// can be restricted in some runtimes)
  }
}

function applyModelSource(
  rawSource: string,
  options?: {
    persist?: boolean
    silent?: boolean
    presetId?: ModelPresetId
  },
) {
  const normalizedModelSource = normalizeModelSourceInput(rawSource)
  if (!normalizedModelSource) {
    return
  }

  const changed = activeModelSource.value !== normalizedModelSource
  activeModelSource.value = normalizedModelSource
  modelPresetId.value = options?.presetId ?? inferModelPresetIdBySource(normalizedModelSource)
  // Keep current window size during model switching; let the new model report bounds
  // and follow the same resize path as initial stage mount.
  avatarBounds.value = null
  lastRequestedWindowBounds.value = null
  currentModelCapabilities.value = null

  if (options?.persist !== false) {
    persistModelSourceCache(normalizedModelSource)
  }

  if (!options?.silent && changed) {
    state.logs.push(`[stage] model source switched -> ${normalizedModelSource}`)
  }

  void model.refreshStageWarnings({
    modelSource: normalizedModelSource,
  })
  void inspectCurrentModelCapabilities(normalizedModelSource)
}

function restoreModelSourceCache() {
  const cached = readModelSourceCache()
  if (!cached) {
    return
  }
  applyModelSource(cached.modelSource, {
    persist: false,
    silent: true,
  })
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

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, Math.max(1000, timeoutMs))
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timeout)
  }
}

async function readResponseSnippet(response: Response): Promise<string> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json') && !contentType.includes('text/')) {
    return ''
  }

  try {
    const text = (await response.text()).trim()
    if (!text) {
      return ''
    }
    return text.length > 180 ? `${text.slice(0, 180)}...` : text
  }
  catch {
    return ''
  }
}

async function probeHttpTtsService(): Promise<VoiceDiagnosticOutcome> {
  const endpoint = normalizeHttpTtsEndpoint(voiceHttpEndpoint.value)
  const preset = resolveVoicePreset(voicePresetId.value)
  const provider = resolveHttpTtsProviderId(voiceTtsProviderId.value)
  const cosyMode = resolveCosyVoiceModeId(voiceCosyVoiceModeId.value)

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: '语音服务诊断',
        provider,
        preset: {
          id: preset.id,
          lang: preset.lang,
          rate: preset.rate,
          pitch: preset.pitch,
          volume: preset.volume,
        },
        cosyvoice: {
          mode: cosyMode,
          baseUrl: voiceCosyVoiceBaseUrl.value.trim() || 'http://127.0.0.1:50000',
          speakerId: voiceCosyVoiceSpeakerId.value.trim() || '中文女',
          promptText: voiceCosyVoicePromptText.value.trim(),
          promptWavPath: voiceCosyVoicePromptWavPath.value.trim(),
          instructText: voiceCosyVoiceInstructText.value.trim(),
          sampleRate: voiceCosyVoiceSampleRate.value,
          speed: voiceCosyVoiceSpeed.value,
        },
      }),
    }, voiceHttpTimeoutMs.value)

    if (!response.ok) {
      const snippet = await readResponseSnippet(response)
      return {
        ok: false,
        reachable: response.status > 0 && response.status < 500,
        detail: `status=${response.status}${snippet ? ` body=${snippet}` : ''}`,
      }
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('audio/')) {
      const bytes = (await response.arrayBuffer()).byteLength
      return {
        ok: true,
        reachable: true,
        detail: `audio content-type=${contentType || 'unknown'} bytes=${bytes}`,
      }
    }

    if (contentType.includes('application/json')) {
      const payload = await response.json() as {
        audioBase64?: string
        durationMs?: number
      }
      if (typeof payload.audioBase64 === 'string' && payload.audioBase64.trim().length > 0) {
        return {
          ok: true,
          reachable: true,
          detail: `json audioBase64 durationMs=${payload.durationMs ?? '-'}`,
        }
      }

      return {
        ok: false,
        reachable: true,
        detail: 'json response missing audioBase64',
      }
    }

    return {
      ok: false,
      reachable: true,
      detail: `unexpected content-type=${contentType || 'unknown'}`,
    }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reachable: false,
      detail: reason,
    }
  }
}

async function probeHttpSttService(): Promise<VoiceDiagnosticOutcome> {
  const endpoint = normalizeHttpSttEndpoint(voiceHttpSttEndpoint.value)
  const payload = new FormData()
  const diagAudio = new Blob([new Uint8Array([82, 73, 70, 70])], { type: 'audio/wav' })
  payload.append('audio', diagAudio, 'diag.wav')
  payload.append('file', diagAudio, 'diag.wav')
  payload.append('lang', resolveVoicePreset(voicePresetId.value).lang)

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      body: payload,
    }, voiceHttpSttTimeoutMs.value)

    if (!response.ok) {
      const snippet = await readResponseSnippet(response)
      return {
        ok: false,
        reachable: response.status > 0 && response.status < 500,
        detail: `status=${response.status}${snippet ? ` body=${snippet}` : ''}`,
      }
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        reachable: true,
        detail: `unexpected content-type=${contentType || 'unknown'}`,
      }
    }

    const body = await response.json() as {
      text?: string
      transcript?: string
    }
    const text = String(body.text ?? body.transcript ?? '').trim()
    if (!text) {
      return {
        ok: false,
        reachable: true,
        detail: 'json response missing text/transcript',
      }
    }

    return {
      ok: true,
      reachable: true,
      detail: `text len=${text.length}`,
    }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reachable: false,
      detail: reason,
    }
  }
}

function buildDiagnosticSuggestions(params: {
  kind: 'tts' | 'stt'
  outcome: VoiceDiagnosticOutcome
  endpoint: string
}): string[] {
  const label = params.kind.toUpperCase()
  if (params.outcome.ok) {
    return [`${label}: service looks healthy.`]
  }

  if (!params.outcome.reachable) {
    return [
      `${label}: endpoint unreachable, check service process and address ${params.endpoint}.`,
      `${label}: if service runs on another port, update the endpoint in Chat settings.`,
    ]
  }

  if (params.kind === 'tts') {
    return [
      `TTS: endpoint is reachable, but response format is invalid.`,
      'TTS expected audio/* binary, or JSON with field `audioBase64`.',
    ]
  }

  return [
    'STT: endpoint is reachable, but response format is invalid.',
    'STT expected JSON with field `text` or `transcript`.',
  ]
}

function buildDiagnosticActions(params: {
  ttsOutcome: VoiceDiagnosticOutcome
  sttOutcome: VoiceDiagnosticOutcome
  ttsEngine: VoiceOutputEngineId
  sttEngine: VoiceInputEngineId
  ttsEndpoint: string
  sttEndpoint: string
}): VoiceDiagnosticAction[] {
  const actions: VoiceDiagnosticAction[] = []
  const normalizedTtsEndpoint = normalizeHttpTtsEndpoint(params.ttsEndpoint)
  const normalizedSttEndpoint = normalizeHttpSttEndpoint(params.sttEndpoint)

  if (!params.ttsOutcome.ok && params.ttsEngine === 'http_tts') {
    actions.push({
      id: 'tts-engine-web-speech',
      label: 'Switch TTS To Browser',
      description: 'Use Browser TTS temporarily so speech output continues.',
      changePreview: 'Change `Engine` from `Local HTTP TTS` to `Browser TTS`.',
      priority: 120,
    })
  }
  if (!params.sttOutcome.ok && params.sttEngine === 'http_stt') {
    actions.push({
      id: 'stt-engine-web-speech',
      label: 'Switch STT To Browser',
      description: 'Use Browser STT temporarily so voice input continues.',
      changePreview: 'Change `Input Engine` from `Local HTTP STT` to `Browser STT`.',
      priority: 120,
    })
  }

  if (!params.ttsOutcome.reachable && normalizedTtsEndpoint !== DEFAULT_HTTP_TTS_ENDPOINT) {
    actions.push({
      id: 'tts-endpoint-default',
      label: 'Reset TTS Endpoint',
      description: `Set TTS endpoint to ${DEFAULT_HTTP_TTS_ENDPOINT}.`,
      changePreview: `Set \`HTTP TTS Endpoint\` to \`${DEFAULT_HTTP_TTS_ENDPOINT}\`.`,
      priority: 80,
    })
  }
  if (!params.sttOutcome.reachable && normalizedSttEndpoint !== DEFAULT_HTTP_STT_ENDPOINT) {
    actions.push({
      id: 'stt-endpoint-default',
      label: 'Reset STT Endpoint',
      description: `Set STT endpoint to ${DEFAULT_HTTP_STT_ENDPOINT}.`,
      changePreview: `Set \`HTTP STT Endpoint\` to \`${DEFAULT_HTTP_STT_ENDPOINT}\`.`,
      priority: 80,
    })
  }

  if (
    (!params.ttsOutcome.ok || !params.sttOutcome.ok)
    && (
      normalizedTtsEndpoint !== DEFAULT_HTTP_TTS_ENDPOINT
      || normalizedSttEndpoint !== DEFAULT_HTTP_STT_ENDPOINT
    )
  ) {
    actions.push({
      id: 'both-endpoints-default',
      label: 'Reset Both Endpoints',
      description: 'Apply local default endpoints for both TTS and STT.',
      changePreview: (
        `Set \`HTTP TTS Endpoint\` to \`${DEFAULT_HTTP_TTS_ENDPOINT}\`, `
        + `and set \`HTTP STT Endpoint\` to \`${DEFAULT_HTTP_STT_ENDPOINT}\`.`
      ),
      priority: 90,
    })
  }

  const deduped: VoiceDiagnosticAction[] = []
  const seen = new Set<VoiceDiagnosticActionId>()
  for (const action of actions) {
    if (seen.has(action.id)) {
      continue
    }
    seen.add(action.id)
    deduped.push(action)
  }
  deduped.sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority
    }
    return left.label.localeCompare(right.label)
  })

  if (deduped.length > 0) {
    deduped[0].recommended = true
  }

  return deduped
}

function handleApplyVoiceDiagnosticAction(actionId: string) {
  let handled = true
  switch (actionId as VoiceDiagnosticActionId) {
    case 'tts-engine-web-speech':
      handleVoiceEngineUpdate('web_speech')
      break
    case 'stt-engine-web-speech':
      handleVoiceInputEngineUpdate('web_speech')
      break
    case 'tts-endpoint-default':
      handleVoiceHttpEndpointUpdate(DEFAULT_HTTP_TTS_ENDPOINT)
      break
    case 'stt-endpoint-default':
      handleVoiceHttpSttEndpointUpdate(DEFAULT_HTTP_STT_ENDPOINT)
      break
    case 'both-endpoints-default':
      handleVoiceHttpEndpointUpdate(DEFAULT_HTTP_TTS_ENDPOINT)
      handleVoiceHttpSttEndpointUpdate(DEFAULT_HTTP_STT_ENDPOINT)
      break
    default:
      handled = false
      appendVoiceLog(`[diag][apply] unknown action=${actionId}`)
      break
  }

  if (!handled) {
    return
  }

  appendVoiceLog(`[diag][apply] ${actionId}`)
  queueVoiceDiagnosticsAutoRerun(actionId)
}

function queueVoiceDiagnosticsAutoRerun(reason: string) {
  voiceDiagnosticRerunPending = true
  voiceDiagnosticRerunReason = reason
  appendVoiceLog(`[diag][apply] auto-rerun queued reason=${reason}`)

  if (voiceDiagnosticAutoRerunTimer) {
    clearTimeout(voiceDiagnosticAutoRerunTimer)
    voiceDiagnosticAutoRerunTimer = null
  }

  voiceDiagnosticAutoRerunTimer = setTimeout(() => {
    voiceDiagnosticAutoRerunTimer = null

    if (voiceDiagnosticStatus.value === 'running') {
      appendVoiceLog('[diag][apply] auto-rerun waiting for active diagnostics')
      return
    }

    if (!voiceDiagnosticRerunPending) {
      return
    }

    voiceDiagnosticRerunPending = false
    const rerunReason = voiceDiagnosticRerunReason
    voiceDiagnosticRerunReason = ''
    void handleRunVoiceDiagnostics({
      source: 'auto',
      reason: rerunReason,
    })
  }, 180)
}

async function handleRunVoiceDiagnostics(options?: {
  source?: VoiceDiagnosticRunSource
  reason?: string
}) {
  if (voiceDiagnosticStatus.value === 'running') {
    appendVoiceLog('[diag] diagnostics request ignored: already running')
    return
  }
  const runSource: VoiceDiagnosticRunSource = options?.source ?? 'manual'
  const runReason = (options?.reason ?? '').trim()

  voiceDiagnosticStatus.value = 'running'
  voiceDiagnosticSummary.value = 'Running voice diagnostics...'
  voiceDiagnosticSuggestions.value = []
  voiceDiagnosticActions.value = []

  try {
    appendVoiceLog(
      `[diag] voice diagnostics started source=${runSource}${runReason ? ` reason=${runReason}` : ''}`,
    )
    const sttEndpoint = normalizeHttpSttEndpoint(voiceHttpSttEndpoint.value)
    const ttsEndpoint = normalizeHttpTtsEndpoint(voiceHttpEndpoint.value)
    const ttsProvider = resolveHttpTtsProviderId(voiceTtsProviderId.value)
    const cosyMode = resolveCosyVoiceModeId(voiceCosyVoiceModeId.value)
    appendVoiceLog(
      `[diag] config sttEngine=${voiceInputEngineId.value} ttsEngine=${voiceOutputEngineId.value} ttsProvider=${ttsProvider} cosyMode=${cosyMode} stt=${sttEndpoint} tts=${ttsEndpoint}`,
    )

    const [ttsOutcome, sttOutcome] = await Promise.all([
      probeHttpTtsService(),
      probeHttpSttService(),
    ])

    const logOutcome = (kind: 'tts' | 'stt', outcome: VoiceDiagnosticOutcome) => {
      if (outcome.ok) {
        appendVoiceLog(`[diag] ${kind} ok: ${outcome.detail}`)
        return
      }

      if (outcome.reachable) {
        appendVoiceLog(`[diag] ${kind} reachable but invalid: ${outcome.detail}`)
        return
      }

      appendVoiceLog(`[diag] ${kind} failed: ${outcome.detail}`)
    }

    logOutcome('tts', ttsOutcome)
    logOutcome('stt', sttOutcome)

    const summary = ttsOutcome.ok && sttOutcome.ok
      ? 'ok'
      : (ttsOutcome.reachable || sttOutcome.reachable ? 'partial' : 'failed')
    voiceDiagnosticStatus.value = summary
    voiceDiagnosticSummary.value = (
      summary === 'ok'
        ? 'Voice diagnostics: all checks passed.'
        : summary === 'partial'
          ? 'Voice diagnostics: service reachable but protocol mismatch detected.'
          : 'Voice diagnostics: endpoint unreachable.'
    )
    voiceDiagnosticSuggestions.value = [
      ...buildDiagnosticSuggestions({
        kind: 'tts',
        outcome: ttsOutcome,
        endpoint: ttsEndpoint,
      }),
      ...buildDiagnosticSuggestions({
        kind: 'stt',
        outcome: sttOutcome,
        endpoint: sttEndpoint,
      }),
    ]
    voiceDiagnosticActions.value = buildDiagnosticActions({
      ttsOutcome,
      sttOutcome,
      ttsEngine: voiceOutputEngineId.value,
      sttEngine: voiceInputEngineId.value,
      ttsEndpoint,
      sttEndpoint,
    })
    for (const suggestion of voiceDiagnosticSuggestions.value) {
      appendVoiceLog(`[diag][suggest] ${suggestion}`)
    }
    for (const action of voiceDiagnosticActions.value) {
      appendVoiceLog(`[diag][action] ${action.id} ${action.label}`)
    }
    appendVoiceLog(
      `[diag][summary] source=${runSource}${runReason ? ` reason=${runReason}` : ''} status=${summary}`,
    )
    voiceDiagnosticLastRunSource.value = runSource
    voiceDiagnosticLastRunReason.value = runReason
    voiceDiagnosticLastRunAt.value = Date.now()
    appendVoiceLog(`[diag] voice diagnostics finished: ${summary}`)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    voiceDiagnosticStatus.value = 'failed'
    voiceDiagnosticSummary.value = 'Voice diagnostics: internal error.'
    voiceDiagnosticSuggestions.value = ['Diagnostics aborted due to an unexpected internal error.']
    voiceDiagnosticActions.value = []
    appendVoiceLog(
      `[diag][summary] source=${runSource}${runReason ? ` reason=${runReason}` : ''} status=failed internal-error`,
    )
    voiceDiagnosticLastRunSource.value = runSource
    voiceDiagnosticLastRunReason.value = runReason
    voiceDiagnosticLastRunAt.value = Date.now()
    appendVoiceLog(`[diag] diagnostics crashed: ${reason}`)
  }
  finally {
    if (voiceDiagnosticRerunPending && !voiceDiagnosticAutoRerunTimer) {
      appendVoiceLog('[diag] auto-rerun launching after active diagnostics finished')
      voiceDiagnosticRerunPending = false
      const rerunReason = voiceDiagnosticRerunReason
      voiceDiagnosticRerunReason = ''
      void handleRunVoiceDiagnostics({
        source: 'auto',
        reason: rerunReason,
      })
    }
  }
}

async function applyAvatarPresenceState(
  nextState: AvatarPresenceState,
  options?: {
    forceMotion?: boolean
  },
) {
  const profile = avatarPresenceProfiles[nextState]
  const now = Date.now()

  try {
    await stageDriver.setEmotion({
      emotion: profile.emotion,
      intensity: profile.intensity,
      reason: `ui-presence:${nextState}`,
      sessionKey: 'ui',
      runId: `ui-presence-${nextState}`,
      ts: now,
    })
  }
  catch {
    // ignore model emotion errors to keep presence loop resilient
  }

  if (
    profile.motion
    && (options?.forceMotion || now >= avatarPresenceMotionUntil)
  ) {
    try {
      await stageDriver.playMotion({
        motion: profile.motion,
        priority: profile.priority,
        durationMs: profile.durationMs,
        sessionKey: 'ui',
        runId: `ui-presence-${nextState}`,
        ts: now,
      })
      avatarPresenceMotionUntil = now + AVATAR_PRESENCE_MOTION_COOLDOWN_MS
    }
    catch {
      // ignore model motion errors to keep presence loop resilient
    }
  }
}

function clearAvatarPresenceHoldTimer() {
  if (!avatarPresenceHoldTimer) {
    return
  }
  clearTimeout(avatarPresenceHoldTimer)
  avatarPresenceHoldTimer = null
}

function clearAvatarPresenceTransitionRetryTimer() {
  if (!avatarPresenceTransitionRetryTimer) {
    return
  }
  clearTimeout(avatarPresenceTransitionRetryTimer)
  avatarPresenceTransitionRetryTimer = null
}

function clearAvatarIdleAmbientTimer() {
  if (!avatarIdleAmbientTimer) {
    return
  }
  clearTimeout(avatarIdleAmbientTimer)
  avatarIdleAmbientTimer = null
}

function scheduleAvatarPresenceResume() {
  clearAvatarPresenceHoldTimer()
  const elapsed = Date.now() - state.lastAvatarDirectiveAt
  const remaining = AVATAR_PRESENCE_SERVER_HOLD_MS - elapsed
  if (remaining <= 0) {
    return
  }

  avatarPresenceHoldTimer = setTimeout(() => {
    avatarPresenceHoldTimer = null
    syncAvatarPresence()
  }, Math.max(50, remaining + 16))
}

function scheduleAvatarPresenceTransitionRetry(waitMs: number) {
  clearAvatarPresenceTransitionRetryTimer()
  if (waitMs <= 0) {
    return
  }

  avatarPresenceTransitionRetryTimer = setTimeout(() => {
    avatarPresenceTransitionRetryTimer = null
    syncAvatarPresence()
  }, Math.max(36, waitMs + AVATAR_PRESENCE_TRANSITION_RETRY_PADDING_MS))
}

function pickAvatarIdleAmbientMotion() {
  const index = Math.floor(Math.random() * AVATAR_IDLE_AMBIENT_MOTIONS.length)
  return AVATAR_IDLE_AMBIENT_MOTIONS[Math.max(0, Math.min(index, AVATAR_IDLE_AMBIENT_MOTIONS.length - 1))]
}

function scheduleAvatarIdleAmbientMotion() {
  clearAvatarIdleAmbientTimer()
  if (avatarPresenceAppliedState.value !== 'idle') {
    return
  }

  const delay = AVATAR_IDLE_AMBIENT_MIN_MS + Math.floor(Math.random() * (AVATAR_IDLE_AMBIENT_MAX_MS - AVATAR_IDLE_AMBIENT_MIN_MS + 1))
  avatarIdleAmbientTimer = setTimeout(() => {
    avatarIdleAmbientTimer = null
    if (avatarPresenceAppliedState.value !== 'idle') {
      return
    }
    if (voiceInputListening.value || state.connectionStatus === 'speaking' || state.connectionStatus === 'thinking') {
      scheduleAvatarIdleAmbientMotion()
      return
    }

    const now = Date.now()
    if (now < avatarPresenceMotionUntil) {
      scheduleAvatarIdleAmbientMotion()
      return
    }

    const motion = pickAvatarIdleAmbientMotion()
    void stageDriver.playMotion({
      motion,
      priority: 0,
      durationMs: 1200,
      sessionKey: 'ui',
      runId: `ui-idle-ambient-${now}`,
      ts: now,
    }).catch(() => {
      // ignore model motion errors for ambient loop
    }).finally(() => {
      avatarPresenceMotionUntil = Date.now() + AVATAR_PRESENCE_MOTION_COOLDOWN_MS
      scheduleAvatarIdleAmbientMotion()
    })
  }, delay)
}

function syncAvatarPresence() {
  const now = Date.now()
  const nextState = resolveAvatarPresenceState({
    connectionStatus: state.connectionStatus,
    voiceInputListening: voiceInputListening.value,
  })
  const currentState = avatarPresenceAppliedState.value
  if (currentState === nextState) {
    clearAvatarPresenceTransitionRetryTimer()
    if (nextState === 'idle') {
      scheduleAvatarIdleAmbientMotion()
    }
    else {
      clearAvatarIdleAmbientTimer()
    }
    return
  }

  const holdFallback = shouldHoldPresenceFallback({
    state: nextState,
    lastServerDirectiveAt: state.lastAvatarDirectiveAt,
    now,
    holdMs: AVATAR_PRESENCE_SERVER_HOLD_MS,
  })
  if (holdFallback) {
    clearAvatarIdleAmbientTimer()
    scheduleAvatarPresenceResume()
    return
  }

  const transitionDecision = resolveAvatarPresenceTransition({
    currentState,
    nextState,
    stateEnteredAt: avatarPresenceStateEnteredAt.value,
    now,
  })
  if (!transitionDecision.shouldTransition) {
    clearAvatarIdleAmbientTimer()
    scheduleAvatarPresenceTransitionRetry(transitionDecision.waitMs)
    return
  }

  clearAvatarPresenceHoldTimer()
  clearAvatarPresenceTransitionRetryTimer()
  avatarPresenceAppliedState.value = nextState
  avatarPresenceStateEnteredAt.value = now
  void applyAvatarPresenceState(nextState, {
    forceMotion: true,
  })
  if (nextState === 'idle') {
    scheduleAvatarIdleAmbientMotion()
  }
  else {
    clearAvatarIdleAmbientTimer()
  }
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

function canUseHttpSttCapture() {
  return (
    typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

function isLikelyFetchFailure(error: unknown): boolean {
  if (!error) {
    return false
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false
  }
  const reason = error instanceof Error ? error.message : String(error)
  const normalized = reason.toLowerCase()
  return normalized.includes('failed to fetch')
    || normalized.includes('networkerror')
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

function decodeBase64Audio(base64: string): ArrayBuffer {
  const normalized = base64.includes(',') ? base64.split(',').at(-1) ?? '' : base64
  const binary = window.atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function encodeAudioBufferToWav(audioBuffer: AudioBuffer) {
  const frameCount = audioBuffer.length
  const channelCount = Math.max(1, audioBuffer.numberOfChannels)
  const pcm = new Int16Array(frameCount)

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let mixedSample = 0
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      mixedSample += audioBuffer.getChannelData(channelIndex)?.[frameIndex] ?? 0
    }
    mixedSample /= channelCount
    const clamped = Math.max(-1, Math.min(1, mixedSample))
    pcm[frameIndex] = clamped < 0
      ? Math.round(clamped * 32768)
      : Math.round(clamped * 32767)
  }

  const wavBuffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(wavBuffer)
  const writeAscii = (offset: number, content: string) => {
    for (let index = 0; index < content.length; index += 1) {
      view.setUint8(offset + index, content.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, audioBuffer.sampleRate, true)
  view.setUint32(28, audioBuffer.sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, pcm.length * 2, true)

  let offset = 44
  for (const sample of pcm) {
    view.setInt16(offset, sample, true)
    offset += 2
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

async function normalizeSttAudioBlob(inputBlob: Blob): Promise<Blob> {
  if (inputBlob.type.toLowerCase().includes('wav')) {
    return inputBlob
  }

  const AudioContextCtor = (
    window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  )
  if (!AudioContextCtor) {
    appendVoiceLog('[stt] wav conversion skipped: AudioContext unavailable')
    return inputBlob
  }

  let audioContext: AudioContext | null = null
  try {
    audioContext = new AudioContextCtor()
    const encoded = await inputBlob.arrayBuffer()
    const decoded = await audioContext.decodeAudioData(encoded.slice(0))
    const wavBlob = encodeAudioBufferToWav(decoded)
    appendVoiceLog(`[stt] audio normalized to wav bytes=${wavBlob.size} sampleRate=${decoded.sampleRate}`)
    return wavBlob
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[stt] wav conversion failed: ${reason}`)
    return inputBlob
  }
  finally {
    if (audioContext) {
      void audioContext.close().catch(() => {
        // ignore close failures
      })
    }
  }
}

async function playBlobAudio(params: {
  audioBuffer: ArrayBuffer
  mimeType: string
  timeoutMs: number
  playbackRate?: number
}) {
  const blob = new Blob([params.audioBuffer], {
    type: params.mimeType || 'audio/wav',
  })
  const sourceUrl = URL.createObjectURL(blob)
  try {
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(sourceUrl)
      if (typeof params.playbackRate === 'number' && Number.isFinite(params.playbackRate)) {
        audio.playbackRate = Math.max(0.7, Math.min(1.55, params.playbackRate))
      }
      let done = false
      const settle = (next: 'resolve' | 'reject', error?: Error) => {
        if (done) {
          return
        }
        done = true
        clearTimeout(timeout)
        audio.onended = null
        audio.onerror = null
        if (next === 'resolve') {
          resolve()
          return
        }
        reject(error ?? new Error('audio playback failed'))
      }

      const timeout = setTimeout(() => {
        settle('resolve')
      }, Math.max(1500, params.timeoutMs))

      audio.onended = () => settle('resolve')
      audio.onerror = () => settle('reject', new Error('audio element playback failed'))

      const playback = audio.play()
      if (playback && typeof playback.then === 'function') {
        playback.catch((error: unknown) => {
          const reason = error instanceof Error ? error : new Error(String(error))
          settle('reject', reason)
        })
      }
    })
  }
  finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

async function speakSentenceWithWebSpeech(sentence: string, options?: { tone?: string }) {
  const api = resolveSpeechSynthesisApi()
  if (!api) {
    appendVoiceLog('[tts] web_speech unavailable')
    return
  }

  await new Promise<void>((resolve) => {
    const utterance = new api.Utterance(sentence)
    const preset = resolveVoicePreset(voicePresetId.value)
    const toneModifiers = resolveToneSpeechModifiers(options?.tone)
    utterance.lang = preset.lang
    utterance.rate = Math.max(0.75, Math.min(1.5, preset.rate * toneModifiers.rateScale))
    utterance.pitch = Math.max(0.6, Math.min(1.7, preset.pitch + toneModifiers.pitchOffset))
    utterance.volume = preset.volume

    const availableVoices = api.synthesis.getVoices?.() ?? []
    const selectedVoice = selectSpeechSynthesisVoice(availableVoices, preset)
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    appendVoiceLog(
      `[tts] web_speech preset=${preset.id} tone=${options?.tone || '-'} voice=${selectedVoice?.name ?? 'default'} rate=${utterance.rate.toFixed(2)} pitch=${utterance.pitch.toFixed(2)}`,
    )

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

function resolveToneSpeechModifiers(tone?: string): {
  playbackRateScale: number
  rateScale: number
  pitchOffset: number
} {
  const normalized = String(tone ?? '').trim().toLowerCase()
  if (normalized === 'playful') {
    return { playbackRateScale: 1.08, rateScale: 1.05, pitchOffset: 0.08 }
  }
  if (normalized === 'energetic') {
    return { playbackRateScale: 1.12, rateScale: 1.08, pitchOffset: 0.04 }
  }
  if (normalized === 'gentle') {
    return { playbackRateScale: 0.96, rateScale: 0.95, pitchOffset: 0.05 }
  }
  if (normalized === 'calm') {
    return { playbackRateScale: 0.93, rateScale: 0.92, pitchOffset: -0.02 }
  }
  if (normalized === 'serious') {
    return { playbackRateScale: 0.95, rateScale: 0.94, pitchOffset: -0.04 }
  }
  return { playbackRateScale: 1, rateScale: 1, pitchOffset: 0 }
}

async function speakSentenceWithHttpTts(
  sentence: string,
  options?: { retried?: boolean, tone?: string },
): Promise<boolean> {
  const endpoint = normalizeHttpTtsEndpoint(voiceHttpEndpoint.value)
  const preset = resolveVoicePreset(voicePresetId.value)
  const toneModifiers = resolveToneSpeechModifiers(options?.tone)
  const provider = resolveHttpTtsProviderId(voiceTtsProviderId.value)
  const cosyMode = resolveCosyVoiceModeId(voiceCosyVoiceModeId.value)
  const cosySpeaker = voiceCosyVoiceSpeakerId.value.trim() || '中文女'
  const cosyBaseUrl = voiceCosyVoiceBaseUrl.value.trim() || 'http://127.0.0.1:50000'
  const cosyPromptText = voiceCosyVoicePromptText.value.trim()
  const cosyPromptWavPath = voiceCosyVoicePromptWavPath.value.trim()
  const cosyInstructTextRaw = voiceCosyVoiceInstructText.value.trim()
  const cosyInstructText = [cosyInstructTextRaw, options?.tone ? `tone:${options.tone}` : '']
    .filter(Boolean)
    .join(' ')
    .trim()
  appendVoiceLog(`[tts] http_tts request endpoint=${endpoint} provider=${provider} mode=${cosyMode} preset=${preset.id} tone=${options?.tone || '-'} spk=${cosySpeaker}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, Math.max(1000, voiceHttpTimeoutMs.value))

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: sentence,
        provider,
        preset: {
          id: preset.id,
          lang: preset.lang,
          rate: Math.max(0.75, Math.min(1.5, preset.rate * toneModifiers.rateScale)),
          pitch: Math.max(0.6, Math.min(1.7, preset.pitch + toneModifiers.pitchOffset)),
          volume: preset.volume,
        },
        style: {
          tone: options?.tone ?? null,
        },
        speakerId: cosySpeaker,
        cosyvoice: {
          mode: cosyMode,
          baseUrl: cosyBaseUrl,
          speakerId: cosySpeaker,
          promptText: cosyPromptText,
          promptWavPath: cosyPromptWavPath,
          instructText: cosyInstructText,
          sampleRate: voiceCosyVoiceSampleRate.value,
          speed: voiceCosyVoiceSpeed.value,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      appendVoiceLog(`[tts] http_tts failed status=${response.status}`)
      return false
    }

    const contentType = response.headers.get('content-type') || ''
    let audioBuffer: ArrayBuffer
    let mimeType = contentType || 'audio/wav'
    let durationMs: number | undefined

    if (contentType.includes('application/json')) {
      const payload = await response.json() as {
        audioBase64?: string
        mimeType?: string
        durationMs?: number
      }
      if (!payload.audioBase64) {
        appendVoiceLog('[tts] http_tts invalid json payload: missing audioBase64')
        return false
      }
      audioBuffer = decodeBase64Audio(payload.audioBase64)
      mimeType = payload.mimeType || 'audio/wav'
      durationMs = payload.durationMs
    }
    else {
      audioBuffer = await response.arrayBuffer()
    }

    await playBlobAudio({
      audioBuffer,
      mimeType,
      timeoutMs: durationMs ?? resolveBubbleDurationMs(sentence) + 2600,
      playbackRate: Math.max(
        0.76,
        Math.min(1.45, (preset.rate * (1 + ((preset.pitch - 1) * 0.22))) * toneModifiers.playbackRateScale),
      ),
    })
    appendVoiceLog(`[tts] http_tts played bytes=${audioBuffer.byteLength} rate=${preset.rate.toFixed(2)} pitch=${preset.pitch.toFixed(2)}`)
    return true
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[tts] http_tts error: ${reason}`)
    if (isLikelyFetchFailure(error) && !options?.retried) {
      const recovered = await recoverVoiceServiceAfterHttpFetchFailure({
        scope: 'tts',
        endpoint,
      })
      if (recovered) {
        appendVoiceLog('[tts] http_tts retry after service recover')
        return await speakSentenceWithHttpTts(sentence, {
          retried: true,
          tone: options?.tone,
        })
      }
    }
    return false
  }
  finally {
    clearTimeout(timeout)
  }
}

async function speakSentence(sentence: string, options?: { tone?: string }) {
  if (!voiceOutputEnabled.value) {
    appendVoiceLog('[tts] skipped sentence: output disabled')
    return
  }

  const speechText = sanitizeSpeechTextForPlayback(sentence)
  if (!speechText) {
    appendVoiceLog('[tts] skipped sentence: empty after sanitize')
    return
  }

  const engineId = resolveVoiceOutputEngineId(voiceOutputEngineId.value)
  if (engineId === 'http_tts') {
    const played = await speakSentenceWithHttpTts(speechText, {
      tone: options?.tone,
    })
    if (played) {
      return
    }
    appendVoiceLog('[tts] http_tts fallback -> web_speech')
  }

  await speakSentenceWithWebSpeech(speechText, {
    tone: options?.tone,
  })
}

const sentenceBoundaryChars = new Set(['。', '！', '？', '!', '?', '；', ';', '…'])
const sentenceSuffixChars = new Set(['”', '’', '\'', '"', '）', ')', ']', '】', '》', '〉', '」', '』', '。', '！', '？', '!', '?', '；', ';', '…'])

function isSentenceBoundaryChar(char: string) {
  return sentenceBoundaryChars.has(char)
}

function sanitizeSpeechTextForPlayback(text: string) {
  let normalized = text
    .replace(/<\s*emotion\s*:\s*[^>]+>/gi, ' ')
    .replace(/<\s*tone\s*:\s*[^>]+>/gi, ' ')
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/[&/*]+/g, ' ')

  const containsHan = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(normalized)
  if (containsHan) {
    normalized = normalized.replace(/[^\u3400-\u9FFF\uF900-\uFAFF，。！？；：、“”‘’「」『』《》〈〉（）\s]/g, '')
  }

  return normalized
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？!?；;：:、])/g, '$1')
    .trim()
}

function sanitizeBubbleSubtitleText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/```[\s\S]*?```/g, (block) => {
      const stripped = block
        .replace(/^```[^\n]*\n?/, '')
        .replace(/```$/, '')
      return stripped || ' '
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1')
    .replace(/[|#~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？!?；;：:、,.])/g, '$1')
    .trim()
}

function normalizeEmotionTag(raw: string): AvatarEmotionName | undefined {
  const normalized = raw.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  const aliasMap: Record<string, AvatarEmotionName> = {
    neutral: 'neutral',
    calm: 'neutral',
    happy: 'happy',
    joy: 'happy',
    shy: 'shy',
    embarrassed: 'shy',
    sad: 'sad',
    upset: 'sad',
    excited: 'excited',
    energetic: 'excited',
    thinking: 'thinking',
    think: 'thinking',
  }
  return aliasMap[normalized]
}

function extractSentenceDirectives(sentence: string): {
  text: string
  emotion?: AvatarEmotionName
  tone?: string
} {
  let emotion: AvatarEmotionName | undefined
  let tone: string | undefined

  const normalizedText = sentence.replace(/<\s*emotion\s*:\s*([^>]+)>/gi, (_match, rawEmotion) => {
    const parsed = normalizeEmotionTag(String(rawEmotion ?? ''))
    if (parsed) {
      emotion = parsed
    }
    return ' '
  }).replace(/<\s*tone\s*:\s*([^>]+)>/gi, (_match, rawTone) => {
    const parsedTone = String(rawTone ?? '').trim().toLowerCase()
    if (parsedTone) {
      tone = parsedTone
    }
    return ' '
  })

  return {
    text: sanitizeBubbleSubtitleText(normalizedText),
    emotion,
    tone,
  }
}

function buildOpenClawStyleInstruction(presetId: VoicePresetId) {
  const rule = voicePersonaRuleByPreset[presetId] ?? voicePersonaRuleByPreset.clear
  return [
    '【ClawMuse Runtime Rules】',
    `1) 回答风格：${rule.persona}。${rule.wording}。${rule.rhythm}。`,
    '2) 每个句子必须带显式标签，格式：<emotion:happy><tone:playful>句子内容',
    '3) emotion 仅可用：neutral/happy/shy/sad/excited/thinking',
    '4) tone 仅可用：gentle/playful/calm/serious/energetic',
    `5) 若不确定，默认使用 <emotion:neutral><tone:${rule.defaultTone}>`,
    '6) 只输出正常可读文本和上述标签，不要输出 markdown 代码块或规则解释',
  ].join('\n')
}

function installOpenClawStyleRuleTransform() {
  if (typeof model.setOutboundMessageTransform !== 'function') {
    return
  }

  model.setOutboundMessageTransform((params) => {
    const preset = resolveVoicePreset(voicePresetId.value)
    const instruction = buildOpenClawStyleInstruction(preset.id)
    return {
      message: `${instruction}\n\n【用户消息】${params.message}`,
      debugLabel: `voice-style:${preset.id}`,
    }
  })
}

function inferEmotionForAssistantSentence(text: string): AvatarEmotionName {
  const normalized = text.toLowerCase()
  if (/思考|分析|让我想|考虑|稍等|thinking|think|hmm/.test(normalized)) {
    return 'thinking'
  }
  if (/难过|抱歉|遗憾|sad|sorry|不好意思|沮丧/.test(normalized)) {
    return 'sad'
  }
  if (/害羞|羞|紧张|shy|blush/.test(normalized)) {
    return 'shy'
  }
  if (/太棒|好耶|哈哈|哇|惊喜|激动|兴奋|excited|awesome|wow|!|！/.test(normalized)) {
    return 'excited'
  }
  if (/你好|嗨|欢迎|谢谢|没问题|可以的|happy|smile|开心/.test(normalized)) {
    return 'happy'
  }
  return 'neutral'
}

function resolveExpressionForEmotion(
  emotion: AvatarEmotionName,
  expressions: string[],
): string | undefined {
  if (expressions.length === 0) {
    return undefined
  }

  const matchByPatterns = (patterns: RegExp[]) => (
    expressions.find((name) => {
      const normalized = name.toLowerCase()
      return patterns.some(pattern => pattern.test(normalized))
    })
  )

  const patternByEmotion: Record<AvatarEmotionName, RegExp[]> = {
    neutral: [/neutral/, /normal/, /default/, /^exp[_-]?0?0$/],
    happy: [/happy/, /smile/, /joy/, /开心/, /^exp[_-]?0?1$/, /^f0?1$/],
    shy: [/shy/, /blush/, /害羞/, /^exp[_-]?0?2$/, /^f0?2$/],
    sad: [/sad/, /down/, /cry/, /难过/, /^exp[_-]?0?3$/, /^f0?3$/],
    excited: [/excited/, /laugh/, /energetic/, /兴奋/, /激动/, /^exp[_-]?0?5$/, /^f0?5$/],
    thinking: [/think/, /thinking/, /思考/, /^exp[_-]?0?4$/, /^f0?4$/],
  }

  return matchByPatterns(patternByEmotion[emotion]) || expressions[0]
}

function resolveMotionForEmotion(
  emotion: AvatarEmotionName,
  capability: ModelCapabilitySummary | null,
): string {
  const fallbackByEmotion: Record<AvatarEmotionName, string> = {
    neutral: 'idle',
    happy: 'warm-wave',
    shy: 'shy-smile',
    sad: 'soft-down',
    excited: 'bright-bounce',
    thinking: 'thinking-idle',
  }
  if (!capability || capability.motionGroups.length === 0) {
    return fallbackByEmotion[emotion]
  }

  const encodeMotionRef = (group: string, count: number, index = 0) => {
    const safeIndex = Math.max(0, Math.min(index, Math.max(0, count - 1)))
    if (!group.trim()) {
      return `#${safeIndex}`
    }
    return count > 1 ? `${group}#${safeIndex}` : group
  }

  const preferredGroupByEmotion: Record<AvatarEmotionName, string[]> = {
    neutral: ['Idle'],
    happy: ['TapBody', 'Tap', 'FlickUp', 'Idle'],
    shy: ['TapBody', 'Tap', 'Idle'],
    sad: ['Idle'],
    excited: ['Flick3', 'FlickUp', 'TapBody', 'Tap', 'Idle'],
    thinking: ['Idle', 'Tap'],
  }

  const groups = capability.motionGroups
  for (const preferred of preferredGroupByEmotion[emotion]) {
    const matched = groups.find(item => item.group.toLowerCase() === preferred.toLowerCase())
      || groups.find(item => item.group.toLowerCase().includes(preferred.toLowerCase()))
    if (!matched) {
      continue
    }
    if (matched.count > 1 && matched.group.toLowerCase() === 'idle') {
      return encodeMotionRef(matched.group, matched.count, 1)
    }
    return encodeMotionRef(matched.group, matched.count, 0)
  }

  if (emotion === 'happy' || emotion === 'shy' || emotion === 'excited') {
    const lively = groups.find(item => item.group.trim().length === 0 || item.group.toLowerCase() !== 'idle')
    if (lively) {
      return encodeMotionRef(lively.group, lively.count, 0)
    }
  }

  const first = groups[0]
  return encodeMotionRef(first.group, first.count, 0)
}

async function applyAssistantSentenceAvatarCue(
  sentence: string,
  options?: { emotion?: AvatarEmotionName },
) {
  const normalized = sentence.trim()
  if (!normalized) {
    return
  }

  const now = Date.now()
  state.lastAvatarDirectiveAt = now
  const capability = currentModelCapabilities.value
  const emotion = options?.emotion ?? inferEmotionForAssistantSentence(normalized)
  const expression = resolveExpressionForEmotion(emotion, capability?.expressions ?? [])
  const motion = resolveMotionForEmotion(emotion, capability)

  try {
    await stageDriver.setEmotion({
      emotion,
      intensity: emotion === 'neutral' ? 0.35 : 0.65,
      reason: 'assistant-sentence',
      sessionKey: state.connection.sessionKey,
      runId: `assistant-cue-${now}`,
      ts: now,
    })
  }
  catch {
    // keep sentence playback resilient even when emotion write is unsupported
  }

  if (expression) {
    try {
      await stageDriver.setExpression(expression)
    }
    catch {
      // Some models expose expressions list but runtime expression call may still fail.
    }
  }

  if (now < assistantCueMotionUntil) {
    return
  }

  try {
    await stageDriver.playMotion({
      motion,
      priority: 1,
      durationMs: 1400,
      sessionKey: state.connection.sessionKey,
      runId: `assistant-cue-${now}`,
      ts: now,
    })
    assistantCueMotionUntil = now + 900
  }
  catch {
    // keep sentence playback resilient when a motion is unavailable.
  }
}

function extractThoughtAndSpeechText(rawText: string) {
  let speechText = rawText
  const thoughtChunks: string[] = []
  const collectThoughtChunk = (value: unknown) => {
    const normalized = String(value ?? '').trim()
    if (!normalized) {
      return
    }
    thoughtChunks.push(normalized)
  }

  speechText = speechText.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, inner) => {
    collectThoughtChunk(inner)
    return ' '
  })
  speechText = speechText.replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_match, inner) => {
    collectThoughtChunk(inner)
    return ' '
  })
  speechText = speechText.replace(/(?:^|\n)\s*(?:内心|思考|thinking|thought)\s*[:：]\s*([^\n]+)/gim, (_match, inner) => {
    collectThoughtChunk(inner)
    return '\n'
  })
  speechText = speechText.replace(/\[\s*(?:think|thinking|thought|内心|思考)\s*[:：]?\s*([^\]]+)\]/gim, (_match, inner) => {
    collectThoughtChunk(inner)
    return ' '
  })

  return {
    speechText,
    thoughtChunks,
  }
}

function splitBubbleSentences(text: string) {
  const normalized = text.replace(/\r/g, '').trim()
  if (!normalized) {
    return [] as string[]
  }

  const parts: string[] = []
  let buffer = ''

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === '\n') {
      const prevChar = buffer.trimEnd().at(-1) ?? ''
      const nextChar = normalized[index + 1] ?? ''
      const shouldSplitByNewline = nextChar === '\n' || (prevChar.length > 0 && isSentenceBoundaryChar(prevChar))

      if (shouldSplitByNewline) {
        const line = buffer.trim()
        if (line) {
          parts.push(line)
        }
        buffer = ''
        while (normalized[index + 1] === '\n') {
          index += 1
        }
      }
      else if (buffer && !buffer.endsWith(' ')) {
        buffer += ' '
      }
      continue
    }

    buffer += char

    if (isSentenceBoundaryChar(char)) {
      while (index + 1 < normalized.length && sentenceSuffixChars.has(normalized[index + 1])) {
        buffer += normalized[index + 1]
        index += 1
      }
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
  const extracted = extractThoughtAndSpeechText(text)
  const speechSentences = splitBubbleSentences(sanitizeBubbleSubtitleText(extracted.speechText))
  const thoughtSentences = extracted.thoughtChunks.flatMap(chunk =>
    splitBubbleSentences(sanitizeBubbleSubtitleText(chunk)),
  )

  if (speechSentences.length === 0 && thoughtSentences.length === 0) {
    return
  }

  subtitleQueue.value.push(
    ...speechSentences
      .map((sentence) => {
        const parsed = extractSentenceDirectives(sentence)
        if (!parsed.text) {
          return null
        }
        return {
          text: parsed.text,
          mode: 'speech' as const,
          emotion: parsed.emotion,
          tone: parsed.tone,
        }
      })
      .filter((item): item is BubbleQueueItem => Boolean(item)),
    ...thoughtSentences.map(sentence => ({
      text: `内心：${sentence}`,
      mode: 'thought' as const,
    })),
  )
  void runBubbleQueue()
}

async function runBubbleQueue() {
  if (isBubbleQueueRunning.value) {
    return
  }

  isBubbleQueueRunning.value = true
  while (subtitleQueue.value.length > 0) {
    const nextItem = subtitleQueue.value.shift()
    if (!nextItem) {
      continue
    }
    const sentence = nextItem.text

    speechBubbleMode.value = nextItem.mode
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

    if (nextItem.mode === 'speech') {
      await applyAssistantSentenceAvatarCue(sentence, {
        emotion: nextItem.emotion,
      })
      await Promise.all([
        visibleDelay,
        speakSentence(sentence, {
          tone: nextItem.tone,
        }),
      ])
    }
    else {
      await visibleDelay
    }
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

  speechBubbleMode.value = status === 'speaking' ? 'speech' : 'thought'
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

watch(
  () => [voiceTtsProviderId.value, voiceCosyVoiceBaseUrl.value] as const,
  ([provider, baseUrl], [prevProvider, prevBaseUrl]) => {
    if (resolveHttpTtsProviderId(provider) !== 'cosyvoice') {
      return
    }
    if (provider === prevProvider && baseUrl.trim() === prevBaseUrl.trim()) {
      return
    }
    scheduleRefreshCosyVoiceSpeakerOptions('provider/base-watch')
  },
)

watch(() => [openPanel.value, stageContextMenuVisible.value] as const, ([panel, contextVisible]) => {
  if (panel || contextVisible) {
    void setWindowInteractiveRegionActive(true)
    return
  }
  if (!stageMouseIsDown) {
    void setWindowInteractiveRegionActive(false)
  }
})

watch(
  () => [state.connectionStatus, voiceInputListening.value, state.lastAvatarDirectiveAt] as const,
  () => {
    syncAvatarPresence()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('pointerdown', handleStagePointerDown, true)
  window.addEventListener('pointerup', handleStagePointerUp, true)
  window.addEventListener('mousemove', handleStageMouseMove, true)
  window.addEventListener('contextmenu', handleStageContextMenu, true)
  // Default to click-through; only activate when cursor enters model hit region or UI panels.
  void setWindowInteractiveRegionActive(false)

  void (async () => {
    installOpenClawStyleRuleTransform()
    const bridge = window.clawmuse
    const wsBridgeReady = Boolean(
      bridge
      && typeof bridge.createNodeWebSocket === 'function'
      && typeof bridge.sendNodeWebSocket === 'function'
      && typeof bridge.closeNodeWebSocket === 'function'
      && typeof bridge.onNodeWebSocketEvent === 'function',
    )
    state.logs.push(`[env] hostPlatform=${bridge?.hostPlatform ?? 'unknown'} imeCompatMode=${bridge?.imeCompatMode ? '1' : '0'}`)
    state.logs.push(`[env] appVersion=${bridge?.version ?? 'unknown'} buildSignature=desktop-electron-stage-diag-v2-2026-04-03`)
    state.logs.push(`[env] wsBridgeReady=${wsBridgeReady ? '1' : '0'}`)
    if (!wsBridgeReady) {
      state.logs.push('[session] warning: desktop websocket bridge unavailable; browser websocket fallback disabled')
    }
    voiceInputSupported.value = Boolean(resolveSpeechRecognitionCtor() || canUseHttpSttCapture())
    appendVoiceLog(`[tts] supported=${resolveSpeechSynthesisApi() ? '1' : '0'}`)
    appendVoiceLog(`[stt] supported=${voiceInputSupported.value ? '1' : '0'}`)
    if (bridge?.hostPlatform && bridge.hostPlatform !== 'win32') {
      state.logs.push('[ime] hint: host platform is not win32, Windows IME switching hotkeys may not apply in this process.')
    }
    if (bridge && typeof bridge.onShellCommand === 'function') {
      shellCommandUnsubscribe = bridge.onShellCommand((event: ShellCommandLike) => {
        if (!event || typeof event !== 'object') {
          return
        }
        if (event.type === 'open-panel' && event.panel) {
          openPanelFromMenu(event.panel)
          return
        }
        if (event.type === 'window.always-on-top') {
          state.logs.push(`[window] alwaysOnTop=${event.enabled ? '1' : '0'}`)
          return
        }
        if (event.type === 'window.click-through') {
          state.logs.push(`[window] clickThrough=${event.enabled ? '1' : '0'}`)
          return
        }
        if (event.type === 'avatar.manual-motion' && event.motion) {
          state.logs.push(`[window] manualMotion=${event.motion}`)
          void handleManualMotion(event.motion)
          return
        }
        if (event.type === 'avatar.switch-model' && event.modelId) {
          state.logs.push(`[window] switchModel=${event.modelId}`)
          void handleModelPresetUpdate(event.modelId)
        }
      })
    }
    if (bridge && typeof bridge.onVoiceServiceEvent === 'function') {
      voiceServiceEventUnsubscribe = bridge.onVoiceServiceEvent((event: VoiceServiceEventLike) => {
        const line = (event?.line ?? '').trim()
        if (!line) {
          return
        }
        updateVoiceServicePhaseFromLogLine(line)
        appendVoiceLog(`[service][${event?.level ?? 'info'}] ${line}`)
      })
    }
    if (bridge && typeof bridge.startVoiceService === 'function') {
      try {
        const serviceStatus = await bridge.startVoiceService() as VoiceServiceStatusLike
        applyVoiceServiceStatus(serviceStatus)
        appendVoiceLog(`[service] ${voiceServiceSummary.value}`)
      }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        appendVoiceLog(`[service] start failed: ${reason}`)
      }
    }
    await refreshVoiceServiceStatus({
      silent: true,
    })

    restoreVoiceSettingsCache()
    if (resolveHttpTtsProviderId(voiceTtsProviderId.value) === 'cosyvoice') {
      scheduleRefreshCosyVoiceSpeakerOptions('startup-restore')
    }
    restoreModelSourceCache()
    await refreshDiscoveredModelCatalog({
      silent: true,
    })

    await model.mountStage({
      modelSource: activeModelSource.value,
    })
    await restoreCachedConnection()
  })()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleStagePointerDown, true)
  window.removeEventListener('pointerup', handleStagePointerUp, true)
  window.removeEventListener('mousemove', handleStageMouseMove, true)
  window.removeEventListener('contextmenu', handleStageContextMenu, true)
  clearStageTapTimer()
  if (shellCommandUnsubscribe) {
    shellCommandUnsubscribe()
    shellCommandUnsubscribe = null
  }
  if (voiceServiceEventUnsubscribe) {
    voiceServiceEventUnsubscribe()
    voiceServiceEventUnsubscribe = null
  }
  if (speechBubbleHideTimer) {
    clearTimeout(speechBubbleHideTimer)
    speechBubbleHideTimer = null
  }
  if (voiceDiagnosticAutoRerunTimer) {
    clearTimeout(voiceDiagnosticAutoRerunTimer)
    voiceDiagnosticAutoRerunTimer = null
  }
  if (voiceCosyVoiceSpeakerRefreshTimer) {
    clearTimeout(voiceCosyVoiceSpeakerRefreshTimer)
    voiceCosyVoiceSpeakerRefreshTimer = null
  }
  voiceDiagnosticRerunPending = false
  voiceDiagnosticRerunReason = ''
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
  if (httpSttMediaRecorder) {
    try {
      if (httpSttMediaRecorder.state !== 'inactive') {
        httpSttMediaRecorder.stop()
      }
    }
    catch {
      // ignore media recorder stop failures while destroying renderer
    }
    httpSttMediaRecorder = null
  }
  if (httpSttMediaStream) {
    for (const track of httpSttMediaStream.getTracks()) {
      track.stop()
    }
    httpSttMediaStream = null
  }
  subtitleQueue.value = []
  isBubbleQueueRunning.value = false
  stageMouseIsDown = false
  stageManualDragActive = false
  stageManualDragDistance = 0
  stageInteractiveRegionActive = false
  clearAvatarPresenceHoldTimer()
  clearAvatarPresenceTransitionRetryTimer()
  clearAvatarIdleAmbientTimer()
})

function closePanel() {
  openPanel.value = null
}

function openPanelFromMenu(panel: Exclude<ShellPanel, null>) {
  closeStageContextMenu()
  if (panel === 'chat' && !state.connected) {
    openPanel.value = 'connection'
    return
  }

  openPanel.value = panel
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
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 120))

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

async function transcribeWithHttpStt(audioBlob: Blob, options?: { retried?: boolean }): Promise<string | null> {
  const endpoint = normalizeHttpSttEndpoint(voiceHttpSttEndpoint.value)
  const normalizedBlob = await normalizeSttAudioBlob(audioBlob)
  appendVoiceLog(`[stt] http_stt request endpoint=${endpoint} bytes=${normalizedBlob.size}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, Math.max(1000, voiceHttpSttTimeoutMs.value))

  try {
    const formData = new FormData()
    const filename = normalizedBlob.type.toLowerCase().includes('wav') ? 'capture.wav' : 'capture.webm'
    formData.append('audio', normalizedBlob, filename)
    formData.append('file', normalizedBlob, filename)
    formData.append('lang', resolveVoicePreset(voicePresetId.value).lang)

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (!response.ok) {
      let reason = ''
      try {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.toLowerCase().includes('application/json')) {
          const payload = await response.json() as { error?: string, reason?: string, message?: string }
          reason = String(payload.reason ?? payload.error ?? payload.message ?? '').trim()
        }
        else {
          reason = (await response.text()).trim()
        }
      }
      catch {
        // ignore payload parse errors and keep status-only log
      }

      appendVoiceLog(`[stt] http_stt failed status=${response.status}${reason ? ` reason=${reason}` : ''}`)
      if (response.status === 503) {
        appendVoiceLog('[stt] http_stt hint: voice upstream is unavailable; check [voice] [service] logs for backend cwd/launch details.')
        appendVoiceLog('[stt] http_stt hint: set CLAWMUSE_VOICE_BACKEND_CWD to Open-LLM-VTuber path, then click "Restart Voice Service".')
      }
      return null
    }

    const payload = await response.json() as {
      text?: string
      transcript?: string
    }
    const text = String(payload.text ?? payload.transcript ?? '').trim()
    appendVoiceLog(`[stt] http_stt final len=${text.length}`)
    return text || null
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[stt] http_stt error: ${reason}`)
    if (isLikelyFetchFailure(error)) {
      appendVoiceLog('[stt] http_stt hint: endpoint unreachable or blocked (service not running / CORS / network route).')
      appendVoiceLog(`[stt] http_stt hint: verify endpoint is reachable from this app process -> ${endpoint}`)
      appendVoiceLog('[stt] http_stt hint: click "Diagnose Voice Service" to get structured checks and suggested actions.')
      queueVoiceDiagnosticsAutoRerun('http-stt-fetch-error')
      if (!options?.retried) {
        const recovered = await recoverVoiceServiceAfterHttpFetchFailure({
          scope: 'stt',
          endpoint,
        })
        if (recovered) {
          appendVoiceLog('[stt] http_stt retry after service recover')
          return await transcribeWithHttpStt(normalizedBlob, { retried: true })
        }
      }
    }
    return null
  }
  finally {
    clearTimeout(timeout)
  }
}

async function startHttpSttCapture() {
  if (!canUseHttpSttCapture()) {
    appendVoiceLog('[stt] http_stt unsupported: MediaRecorder/getUserMedia unavailable')
    return
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
  })
  const recorder = new MediaRecorder(mediaStream)
  const chunks: BlobPart[] = []

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data)
    }
  }

  recorder.onerror = (event: Event) => {
    const error = (event as Event & { error?: unknown }).error
    const reason = error instanceof Error ? error.message : String(error ?? 'unknown')
    voiceInputLastError.value = reason
    appendVoiceLog(`[stt] http_stt recorder error: ${reason}`)
    if (lastVoiceServiceStatus.value) {
      applyVoiceServiceStatus(lastVoiceServiceStatus.value)
    }
  }

  recorder.onstop = () => {
    voiceInputListening.value = false
    voiceInputInterimText.value = ''
    const blob = new Blob(chunks, {
      type: recorder.mimeType || 'audio/webm',
    })

    for (const track of mediaStream.getTracks()) {
      track.stop()
    }
    if (httpSttMediaStream === mediaStream) {
      httpSttMediaStream = null
    }
    if (httpSttMediaRecorder === recorder) {
      httpSttMediaRecorder = null
    }

    if (blob.size === 0) {
      appendVoiceLog('[stt] http_stt ignored empty recording')
      return
    }

    void (async () => {
      const text = await transcribeWithHttpStt(blob)
      if (!text) {
        return
      }
      await handleVoiceFinalText(text)
    })()
  }

  httpSttMediaStream = mediaStream
  httpSttMediaRecorder = recorder
  voiceInputLastError.value = ''
  if (lastVoiceServiceStatus.value) {
    applyVoiceServiceStatus(lastVoiceServiceStatus.value)
  }
  voiceInputListening.value = true
  voiceInputInterimText.value = '录音中...'
  appendVoiceLog('[stt] http_stt recording started')
  recorder.start()
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
  instance.lang = resolveVoicePreset(voicePresetId.value).lang
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
    if (errorReason === 'network') {
      appendVoiceLog('[stt] hint: Browser STT depends on online speech service and may fail in Electron/network-restricted environments.')
      appendVoiceLog('[stt] hint: switch Input Engine to "Local HTTP STT" and run "Diagnose Voice Service".')
      queueVoiceDiagnosticsAutoRerun('browser-stt-network-error')
    }
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
  const engine = resolveVoiceInputEngineId(voiceInputEngineId.value)
  if (engine === 'http_stt') {
    if (!voiceInputReady.value) {
      appendVoiceLog(`[stt] blocked: ${voiceInputBlockedReason.value || 'voice input is not ready yet'}`)
      return
    }
    if (voiceInputListening.value && httpSttMediaRecorder) {
      appendVoiceLog('[stt] http_stt stop requested')
      if (httpSttMediaRecorder.state !== 'inactive') {
        httpSttMediaRecorder.stop()
      }
      return
    }

    appendVoiceLog('[stt] http_stt start requested')
    void startHttpSttCapture().catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      voiceInputListening.value = false
      voiceInputInterimText.value = ''
      voiceInputLastError.value = reason
      appendVoiceLog(`[stt] http_stt start failed: ${reason}`)
      if (reason.toLowerCase().includes('requested device not found')) {
        appendVoiceLog('[stt] http_stt hint: selected/default microphone is unavailable; reconnect mic or switch system default input device.')
      }
      if (lastVoiceServiceStatus.value) {
        applyVoiceServiceStatus(lastVoiceServiceStatus.value)
      }
    })
    return
  }

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
  instance.lang = resolveVoicePreset(voicePresetId.value).lang
  appendVoiceLog(`[stt] lang=${instance.lang}`)
  try {
    instance.start()
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendVoiceLog(`[stt] start failed: ${reason}`)
  }
}

function handleVoiceOutputEnabledUpdate(value: boolean) {
  voiceOutputEnabled.value = value
  if (!value) {
    stopSpeechOutputPlayback()
  }
  appendVoiceLog(`[tts] output ${value ? 'enabled' : 'disabled'}`)
  persistVoiceSettingsCache()
}

function handleVoiceInputEngineUpdate(value: string) {
  const normalized = resolveVoiceInputEngineId(value)
  voiceInputEngineId.value = normalized
  if (normalized !== 'http_stt') {
    voiceInputLastError.value = ''
    if (lastVoiceServiceStatus.value) {
      applyVoiceServiceStatus(lastVoiceServiceStatus.value)
    }
  }
  appendVoiceLog(`[stt] engine=${normalized}`)
  persistVoiceSettingsCache()
}

function handleVoiceHttpSttEndpointUpdate(value: string) {
  voiceHttpSttEndpoint.value = value
  appendVoiceLog(`[stt] endpoint=${normalizeHttpSttEndpoint(value)}`)
  persistVoiceSettingsCache()
}

function handleVoiceEngineUpdate(value: string) {
  const normalized = resolveVoiceOutputEngineId(value)
  voiceOutputEngineId.value = normalized
  appendVoiceLog(`[tts] engine=${normalized}`)
  persistVoiceSettingsCache()
}

function handleVoiceTtsProviderUpdate(value: string) {
  const normalized = resolveHttpTtsProviderId(value)
  voiceTtsProviderId.value = normalized
  appendVoiceLog(`[tts] provider=${normalized}`)
  if (normalized === 'cosyvoice') {
    scheduleRefreshCosyVoiceSpeakerOptions('provider-changed')
  }
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceModeUpdate(value: string) {
  const normalized = resolveCosyVoiceModeId(value)
  voiceCosyVoiceModeId.value = normalized
  appendVoiceLog(`[tts] cosyvoice mode=${normalized}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceBaseUrlUpdate(value: string) {
  voiceCosyVoiceBaseUrl.value = value
  appendVoiceLog(`[tts] cosyvoice base=${value.trim() || '-'}`)
  if (resolveHttpTtsProviderId(voiceTtsProviderId.value) === 'cosyvoice') {
    scheduleRefreshCosyVoiceSpeakerOptions('base-url-changed')
  }
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceSpeakerIdUpdate(value: string) {
  voiceCosyVoiceSpeakerId.value = value
  appendVoiceLog(`[tts] cosyvoice spk_id=${value.trim() || '-'}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoicePromptTextUpdate(value: string) {
  voiceCosyVoicePromptText.value = value
  appendVoiceLog(`[tts] cosyvoice prompt_text len=${value.trim().length}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoicePromptWavPathUpdate(value: string) {
  voiceCosyVoicePromptWavPath.value = value
  appendVoiceLog(`[tts] cosyvoice prompt_wav=${value.trim() || '-'}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceInstructTextUpdate(value: string) {
  voiceCosyVoiceInstructText.value = value
  appendVoiceLog(`[tts] cosyvoice instruct len=${value.trim().length}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceSampleRateUpdate(value: number) {
  const normalized = Math.max(8000, Math.min(96000, Math.round(value)))
  voiceCosyVoiceSampleRate.value = normalized
  appendVoiceLog(`[tts] cosyvoice sampleRate=${normalized}`)
  persistVoiceSettingsCache()
}

function handleVoiceCosyVoiceSpeedUpdate(value: number) {
  const normalized = Math.max(0.5, Math.min(2.0, value))
  voiceCosyVoiceSpeed.value = Number(normalized.toFixed(2))
  appendVoiceLog(`[tts] cosyvoice speed=${voiceCosyVoiceSpeed.value.toFixed(2)}`)
  persistVoiceSettingsCache()
}

function handleRefreshVoiceCosyVoiceSpeakers() {
  void refreshCosyVoiceSpeakerOptions({
    source: 'manual',
  })
}

function handleVoicePresetUpdate(value: string) {
  const preset = resolveVoicePreset(value)
  voicePresetId.value = preset.id
  appendVoiceLog(`[tts] preset=${preset.id}`)
  if (speechRecognition) {
    speechRecognition.lang = preset.lang
  }
  persistVoiceSettingsCache()
}

function handleVoiceHttpEndpointUpdate(value: string) {
  voiceHttpEndpoint.value = value
  appendVoiceLog(`[tts] endpoint=${normalizeHttpTtsEndpoint(value)}`)
  persistVoiceSettingsCache()
}

function handleModelBoundsChange(bounds: { width: number, height: number }) {
  avatarBounds.value = bounds
  // Guardrail: do not auto-resize window from per-frame model bounds.
  // See docs/notes/2026-04-10-live2d-display-regression-guardrails.md
  // Past regressions showed this creates cumulative shrink loops across model switching.
}

function handleModelDebug(line: string) {
  const normalized = String(line ?? '').trim()
  if (!normalized) {
    return
  }
  state.logs.push(`[stage-fit] ${normalized}`)
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

async function handleManualMotion(motion: string) {
  try {
    await stageDriver.playMotion({
      motion,
      priority: 2,
      durationMs: 1600,
    })
  }
  catch {
    state.logs.push(`[window] manualMotion failed=${motion}`)
  }
}

async function handleManualExpression(expression: string) {
  try {
    await stageDriver.setExpression(expression)
  }
  catch {
    state.logs.push(`[window] manualExpression failed=${expression}`)
  }
}

function isStageCanvasEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  if (target.closest('.avatar-shell__panel')) {
    return false
  }
  if (target.closest('.avatar-shell__context-menu')) {
    return false
  }

  // Guardrail: only model hit region is interactive. Transparent area must stay click-through.
  // See docs/notes/2026-04-10-live2d-display-regression-guardrails.md
  return Boolean(target.closest('.avatar-shell__model-hit-region'))
}

async function setWindowInteractiveRegionActive(active: boolean) {
  if (stageInteractiveRegionActive === active) {
    return
  }
  stageInteractiveRegionActive = active
  const bridge = window.clawmuse as (typeof window.clawmuse & {
    setWindowInteractiveRegionActive?: (active: boolean) => Promise<boolean>
  }) | undefined
  if (!bridge || typeof bridge.setWindowInteractiveRegionActive !== 'function') {
    return
  }
  try {
    await bridge.setWindowInteractiveRegionActive(active)
  }
  catch {
    // ignore IPC failures; window stays in the last-known state
  }
}

async function dragWindowBy(deltaX: number, deltaY: number) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    return
  }
  if (Math.abs(deltaX) < 0.01 && Math.abs(deltaY) < 0.01) {
    return
  }

  // Guardrail: drag window via IPC delta move instead of CSS drag region.
  // This keeps transparent area non-draggable while model area remains draggable.
  const bridge = window.clawmuse as (typeof window.clawmuse & {
    dragWindowBy?: (delta: { x: number, y: number }) => Promise<boolean>
  }) | undefined
  if (!bridge || typeof bridge.dragWindowBy !== 'function') {
    return
  }
  try {
    await bridge.dragWindowBy({
      x: deltaX,
      y: deltaY,
    })
  }
  catch {
    // ignore drag IPC failures
  }
}

function resolveAvatarInteractiveRect() {
  const bounds = avatarBounds.value
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const left = (window.innerWidth - bounds.width) / 2
  const top = window.innerHeight - bounds.height - STAGE_MODEL_BOTTOM_PADDING
  const right = left + bounds.width
  const bottom = top + bounds.height

  return {
    left,
    top,
    right,
    bottom,
    width: bounds.width,
    height: bounds.height,
  }
}

const avatarModelHitRegionStyle = computed<Record<string, string>>(() => {
  const rect = resolveAvatarInteractiveRect()
  if (!rect) {
    return {
      display: 'none',
    }
  }

  return {
    left: `${Math.round(rect.left)}px`,
    top: `${Math.round(rect.top)}px`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`,
  }
})

function isPointWithinAvatarInteractiveRegion(clientX: number, clientY: number) {
  const rect = resolveAvatarInteractiveRect()
  if (!rect) {
    return false
  }

  return (
    clientX >= (rect.left - STAGE_INTERACTIVE_HIT_SLOP)
    && clientX <= (rect.right + STAGE_INTERACTIVE_HIT_SLOP)
    && clientY >= (rect.top - STAGE_INTERACTIVE_HIT_SLOP)
    && clientY <= (rect.bottom + STAGE_INTERACTIVE_HIT_SLOP)
  )
}

function shouldKeepWindowInteractiveByUiState(target: EventTarget | null) {
  if (openPanel.value || stageContextMenuVisible.value) {
    return true
  }
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(
    target.closest('.avatar-shell__panel')
    || target.closest('.avatar-shell__context-menu'),
  )
}

function handleStageMouseMove(event: MouseEvent) {
  let shouldActivate = shouldKeepWindowInteractiveByUiState(event.target)
  if (!shouldActivate) {
    shouldActivate = isPointWithinAvatarInteractiveRegion(event.clientX, event.clientY)
  }
  if (event.buttons !== 0 && stageMouseIsDown && stageInteractiveRegionActive) {
    shouldActivate = true
  }
  if (stageManualDragActive && stageMouseIsDown && event.buttons !== 0) {
    const deltaX = event.screenX - stageManualDragLastScreenX
    const deltaY = event.screenY - stageManualDragLastScreenY
    stageManualDragLastScreenX = event.screenX
    stageManualDragLastScreenY = event.screenY
    stageManualDragDistance += Math.hypot(deltaX, deltaY)
    void dragWindowBy(deltaX, deltaY)
    shouldActivate = true
  }
  void setWindowInteractiveRegionActive(shouldActivate)
}

function closeStageContextMenu() {
  stageContextMenuVisible.value = false
}

function openStageContextMenu(event: MouseEvent) {
  const menuWidth = 300
  const menuHeight = 380
  const nextX = Math.max(10, Math.min(event.clientX + 8, window.innerWidth - menuWidth))
  const nextY = Math.max(10, Math.min(event.clientY + 8, window.innerHeight - menuHeight))
  stageContextMenuX.value = nextX
  stageContextMenuY.value = nextY
  stageContextMenuVisible.value = true
}

function handleStageContextMenu(event: MouseEvent) {
  if (!isStageCanvasEventTarget(event.target)) {
    return
  }
  event.preventDefault()
  openStageContextMenu(event)
}

function handleContextMenuOpenPanel(panel: Exclude<ShellPanel, null>) {
  openPanelFromMenu(panel)
  closeStageContextMenu()
}

async function handleContextMenuModelSwitch(modelId: string) {
  await handleModelPresetUpdate(modelId)
  closeStageContextMenu()
}

async function handleContextMenuMotionTrigger(motion: string) {
  state.logs.push(`[window] manualMotion=${motion}`)
  state.lastAvatarDirectiveAt = Date.now()
  await handleManualMotion(motion)
}

async function handleContextMenuExpressionTrigger(expression: string) {
  state.logs.push(`[window] manualExpression=${expression}`)
  state.lastAvatarDirectiveAt = Date.now()
  await handleManualExpression(expression)
}

function clearStageTapTimer() {
  if (!stageTapTimer) {
    return
  }
  clearTimeout(stageTapTimer)
  stageTapTimer = null
}

function resolveStageCycleModelOptions() {
  return contextMenuModelOptions.value.filter(item => item.id !== 'custom')
}

async function runStageDoubleClickSwitchModel() {
  const options = resolveStageCycleModelOptions()
  if (options.length === 0) {
    appendImeLog('interaction gesture=double switch-model skipped: no available model')
    return
  }

  const currentId = String(modelPresetId.value)
  const currentIndex = options.findIndex(item => item.id === currentId)
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length
  const nextModel = options[nextIndex]
  if (!nextModel) {
    return
  }

  appendImeLog(`interaction gesture=double switch-model=${nextModel.id}`)
  await handleModelPresetUpdate(nextModel.id)
}

function runStageSingleClickOpenChat() {
  appendImeLog('interaction gesture=tap open-panel=chat')
  openPanelFromMenu('chat')
}

function handleStagePointerDown(event: PointerEvent) {
  stageMouseIsDown = event.button === 0
  if (
    stageContextMenuVisible.value
    && event.target instanceof Element
    && !event.target.closest('.avatar-shell__context-menu')
  ) {
    closeStageContextMenu()
  }

  if (!isStageCanvasEventTarget(event.target)) {
    stageDownOnCanvas = false
    return
  }

  if (event.button === 2) {
    event.preventDefault()
    void setWindowInteractiveRegionActive(true)
    openStageContextMenu(event)
    stageDownOnCanvas = false
    return
  }

  if (event.button === 0) {
    void setWindowInteractiveRegionActive(true)
    stageManualDragActive = true
    stageManualDragLastScreenX = event.screenX
    stageManualDragLastScreenY = event.screenY
    stageManualDragDistance = 0
  }
  stageDownOnCanvas = true
  stageLastDownAt = Date.now()
  stageLastDownX = event.clientX
  stageLastDownY = event.clientY
}

function handleStagePointerUp(event: PointerEvent) {
  stageMouseIsDown = false
  stageManualDragActive = false
  if (!stageDownOnCanvas) {
    return
  }
  stageDownOnCanvas = false
  if (!isStageCanvasEventTarget(event.target)) {
    return
  }

  const dx = event.clientX - stageLastDownX
  const dy = event.clientY - stageLastDownY
  const distance = Math.hypot(dx, dy)
  const durationMs = Date.now() - stageLastDownAt

  // Dragging the pet should not trigger interaction gestures.
  if (distance > 12 || stageManualDragDistance > 8) {
    return
  }

  // Press-and-hold is reserved for drag behavior; do not trigger click actions.
  if (durationMs >= 520) {
    clearStageTapTimer()
    appendImeLog(`interaction gesture=hold duration=${durationMs}`)
    return
  }

  const now = Date.now()
  const isDoubleTap = stageLastTapAt > 0 && (now - stageLastTapAt) <= 280
  if (isDoubleTap) {
    stageLastTapAt = 0
    clearStageTapTimer()
    void runStageDoubleClickSwitchModel()
    return
  }

  stageLastTapAt = now
  clearStageTapTimer()
  stageTapTimer = setTimeout(() => {
    stageTapTimer = null
    stageLastTapAt = 0
    runStageSingleClickOpenChat()
  }, 220)
}

async function handleRetryStageChecks() {
  await model.refreshStageWarnings({
    modelSource: activeModelSource.value,
  })
  void inspectCurrentModelCapabilities(activeModelSource.value)
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

async function handleModelPresetUpdate(value: string) {
  const presetIdValue = value.trim() || 'custom'
  modelPresetId.value = presetIdValue as ModelPresetId

  if (presetIdValue === 'custom') {
    modelPresetStatus.value = '已切换到自定义模型源'
    return
  }

  let discoveredSource = discoveredModelSourceByPresetId.value.get(presetIdValue)
  if (!discoveredSource && presetIdValue.startsWith('scan:')) {
    await refreshDiscoveredModelCatalog({
      silent: true,
    })
    discoveredSource = discoveredModelSourceByPresetId.value.get(presetIdValue)
  }
  if (discoveredSource) {
    applyModelSource(discoveredSource, {
      presetId: presetIdValue as ModelPresetId,
    })
    modelPresetStatus.value = '切换成功'
    return
  }

  if (!isBuiltinModelPresetId(presetIdValue)) {
    modelPresetStatus.value = '未知预设，请重新选择'
    return
  }

  const candidates = buildModelPresetCandidates(presetIdValue)
  modelPresetStatus.value = `切换中：${candidates.length} 个候选路径`
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeModelSourceInput(candidate)
    if (normalizedCandidate.startsWith('assets://')) {
      applyModelSource(normalizedCandidate, {
        presetId: presetIdValue as ModelPresetId,
      })
      modelPresetStatus.value = '切换成功'
      return
    }

    if (await isModelSourceReachable(normalizedCandidate)) {
      applyModelSource(normalizedCandidate, {
        presetId: presetIdValue as ModelPresetId,
      })
      modelPresetStatus.value = '切换成功'
      return
    }
  }

  const fallback = candidates[0]
  if (fallback) {
    applyModelSource(fallback, {
      presetId: presetIdValue as ModelPresetId,
    })
  }
  modelPresetStatus.value = '未探测到可访问路径，已尝试使用默认候选路径'
  state.logs.push(`[stage] preset fallback used: ${presetIdValue}`)
}
</script>

<template>
  <main class="avatar-shell">
    <section class="avatar-shell__stage">
      <Live2DStage
        :driver="stageDriver"
        :model-source="activeModelSource"
        :model-id="String(modelPresetId)"
        @model-bounds-change="handleModelBoundsChange"
        @model-debug="handleModelDebug"
      >
        <div class="avatar-shell__overlay">
          <div
            class="avatar-shell__model-hit-region"
            :style="avatarModelHitRegionStyle"
          />

          <Transition name="avatar-shell__speech-bubble-transition">
            <aside
              v-if="speechBubbleVisible && speechBubbleText"
              class="avatar-shell__speech-bubble"
              :class="{ 'avatar-shell__speech-bubble--thought': speechBubbleMode === 'thought' }"
              data-role="speech-bubble"
              aria-live="polite"
            >
              <p>{{ speechBubbleText }}</p>
            </aside>
          </Transition>

          <section
            v-if="stageContextMenuVisible"
            class="avatar-shell__context-menu"
            :style="{
              left: `${stageContextMenuX}px`,
              top: `${stageContextMenuY}px`,
            }"
            @click.stop
          >
            <header class="avatar-shell__context-menu-header">
              <h3>Core Menu</h3>
              <small>{{ state.connected ? 'Connected' : 'Disconnected' }}</small>
            </header>
            <div class="avatar-shell__context-menu-actions">
              <button type="button" @click="handleContextMenuOpenPanel('chat')">
                Chat
              </button>
              <button type="button" @click="handleContextMenuOpenPanel('connection')">
                Connection
              </button>
              <button type="button" @click="handleContextMenuOpenPanel('logs')">
                Logs
              </button>
            </div>
            <div class="avatar-shell__context-menu-models">
              <p>Models</p>
              <div class="avatar-shell__context-menu-model-list">
                <button
                  v-for="item in contextMenuModelOptions"
                  :key="item.id"
                  type="button"
                  :class="{ 'avatar-shell__context-menu-model--active': item.id === modelPresetId }"
                  @click="handleContextMenuModelSwitch(item.id)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div v-if="contextMenuMotionOptions.length > 0" class="avatar-shell__context-menu-models">
              <p>Motions</p>
              <div class="avatar-shell__context-menu-motion-list">
                <button
                  v-for="item in contextMenuMotionOptions"
                  :key="item.id"
                  type="button"
                  @click="handleContextMenuMotionTrigger(item.motion)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
            <div v-if="contextMenuExpressionOptions.length > 0" class="avatar-shell__context-menu-models">
              <p>Expressions</p>
              <div class="avatar-shell__context-menu-motion-list">
                <button
                  v-for="item in contextMenuExpressionOptions"
                  :key="item.id"
                  type="button"
                  @click="handleContextMenuExpressionTrigger(item.expression)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>
          </section>

          <section
            v-if="openPanel"
            class="avatar-shell__panel"
            :class="{
              'avatar-shell__panel--chat': openPanel === 'chat',
              'avatar-shell__panel--connection': openPanel === 'connection',
              'avatar-shell__panel--logs': openPanel === 'logs',
            }"
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
              :voice-diagnostics-running="voiceDiagnosticStatus === 'running'"
              :voice-diagnostic-badge="voiceDiagnosticBadge"
              :voice-diagnostic-badge-tone="voiceDiagnosticBadgeTone"
              :voice-diagnostic-badge-recheck="voiceDiagnosticBadgeRecheck"
              :voice-diagnostic-summary="voiceDiagnosticSummary"
              :voice-diagnostic-suggestions="voiceDiagnosticSuggestions"
              :voice-diagnostic-actions="voiceDiagnosticActions"
              :voice-input-engine-id="voiceInputEngineId"
              :voice-input-engine-options="voiceInputEngineOptions"
              :voice-http-stt-endpoint="voiceHttpSttEndpoint"
              :voice-http-stt-endpoint-error="voiceHttpSttEndpointError"
              :voice-output-enabled="voiceOutputEnabled"
              :voice-engine-id="voiceOutputEngineId"
              :voice-engine-options="voiceOutputEngineOptions"
              :voice-tts-provider-id="voiceTtsProviderId"
              :voice-tts-provider-options="voiceTtsProviderOptions"
              :voice-cosy-voice-mode-id="voiceCosyVoiceModeId"
              :voice-cosy-voice-mode-options="voiceCosyVoiceModeOptions"
              :voice-cosy-voice-base-url="voiceCosyVoiceBaseUrl"
              :voice-cosy-voice-speaker-id="voiceCosyVoiceSpeakerId"
              :voice-cosy-voice-speaker-options="voiceCosyVoiceSpeakerOptions"
              :voice-cosy-voice-speakers-loading="voiceCosyVoiceSpeakersLoading"
              :voice-cosy-voice-speakers-hint="voiceCosyVoiceSpeakersHint"
              :voice-cosy-voice-prompt-text="voiceCosyVoicePromptText"
              :voice-cosy-voice-prompt-wav-path="voiceCosyVoicePromptWavPath"
              :voice-cosy-voice-instruct-text="voiceCosyVoiceInstructText"
              :voice-cosy-voice-sample-rate="voiceCosyVoiceSampleRate"
              :voice-cosy-voice-speed="voiceCosyVoiceSpeed"
              :voice-preset-id="voicePresetId"
              :voice-preset-options="voicePresetOptions"
              :voice-http-endpoint="voiceHttpEndpoint"
              :voice-http-endpoint-error="voiceHttpEndpointError"
              :voice-service-summary="voiceServiceSummary"
              :voice-service-phase-label="voiceServicePhaseLabel"
              :voice-service-tone="voiceServiceTone"
              :voice-service-available="voiceServiceAvailable"
              :voice-service-busy="voiceServiceBusy"
              :voice-service-badges="voiceServiceBadges"
              :voice-service-notice="voiceServiceNotice"
              :voice-input-disabled="!voiceInputReady"
              :voice-input-disabled-reason="voiceInputBlockedReason"
              @update-draft="model.setDraftMessage"
              @send="handleSend"
              @toggle-voice-input="handleVoiceInputToggle"
              @set-voice-input-engine="handleVoiceInputEngineUpdate"
              @set-voice-http-stt-endpoint="handleVoiceHttpSttEndpointUpdate"
              @set-voice-output-enabled="handleVoiceOutputEnabledUpdate"
              @set-voice-engine="handleVoiceEngineUpdate"
              @set-voice-tts-provider="handleVoiceTtsProviderUpdate"
              @set-voice-cosy-voice-mode="handleVoiceCosyVoiceModeUpdate"
              @set-voice-cosy-voice-base-url="handleVoiceCosyVoiceBaseUrlUpdate"
              @set-voice-cosy-voice-speaker-id="handleVoiceCosyVoiceSpeakerIdUpdate"
              @set-voice-cosy-voice-prompt-text="handleVoiceCosyVoicePromptTextUpdate"
              @set-voice-cosy-voice-prompt-wav-path="handleVoiceCosyVoicePromptWavPathUpdate"
              @set-voice-cosy-voice-instruct-text="handleVoiceCosyVoiceInstructTextUpdate"
              @set-voice-cosy-voice-sample-rate="handleVoiceCosyVoiceSampleRateUpdate"
              @set-voice-cosy-voice-speed="handleVoiceCosyVoiceSpeedUpdate"
              @refresh-voice-cosy-voice-speakers="handleRefreshVoiceCosyVoiceSpeakers"
              @set-voice-preset="handleVoicePresetUpdate"
              @set-voice-http-endpoint="handleVoiceHttpEndpointUpdate"
              @run-voice-diagnostics="handleRunVoiceDiagnostics"
              @apply-voice-diagnostic-action="handleApplyVoiceDiagnosticAction"
              @refresh-voice-service="refreshVoiceServiceStatus"
              @restart-voice-service="restartVoiceService"
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
  pointer-events: none;
  -webkit-app-region: no-drag;
}

.avatar-shell :deep(.clawmuse-live2d-canvas canvas) {
  pointer-events: none;
  -webkit-app-region: no-drag;
}

.avatar-shell__overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.avatar-shell__model-hit-region {
  position: fixed;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  background: transparent;
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

.avatar-shell__speech-bubble--thought {
  border-style: dashed;
  background:
    radial-gradient(circle at 18% 18%, rgba(238, 249, 255, 0.94), transparent 52%),
    linear-gradient(164deg, rgba(234, 247, 255, 0.96) 0%, rgba(205, 231, 246, 0.96) 100%);
  color: #123246;
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

.avatar-shell__context-menu {
  position: fixed;
  width: min(320px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid rgba(255, 235, 207, 0.45);
  background: rgba(24, 16, 12, 0.85);
  box-shadow: 0 18px 38px rgba(12, 8, 5, 0.38);
  backdrop-filter: blur(10px);
  pointer-events: auto;
  -webkit-app-region: no-drag;
  user-select: none;
}

.avatar-shell__context-menu * {
  -webkit-app-region: no-drag;
}

.avatar-shell__context-menu-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.avatar-shell__context-menu-header h3 {
  margin: 0;
  color: #fff5e9;
  font-size: 0.9rem;
  letter-spacing: 0.03em;
}

.avatar-shell__context-menu-header small {
  color: rgba(255, 226, 193, 0.85);
  font-size: 0.72rem;
}

.avatar-shell__context-menu-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.avatar-shell__context-menu-actions button,
.avatar-shell__context-menu-model-list button,
.avatar-shell__context-menu-motion-list button {
  border: 1px solid rgba(255, 233, 204, 0.22);
  border-radius: 10px;
  padding: 0.44rem 0.55rem;
  background: rgba(255, 255, 255, 0.08);
  color: #fff4e7;
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
  text-align: left;
}

.avatar-shell__context-menu-models {
  display: grid;
  gap: 6px;
}

.avatar-shell__context-menu-models p {
  margin: 0;
  color: rgba(255, 233, 205, 0.9);
  font-size: 0.74rem;
}

.avatar-shell__context-menu-model-list {
  display: grid;
  gap: 6px;
  max-height: min(42vh, 320px);
  overflow: auto;
}

.avatar-shell__context-menu-motion-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  max-height: min(34vh, 260px);
  overflow: auto;
}

.avatar-shell__context-menu-model--active {
  border-color: rgba(255, 224, 181, 0.9) !important;
  background: linear-gradient(145deg, rgba(143, 88, 38, 0.88) 0%, rgba(195, 118, 49, 0.88) 100%) !important;
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
  right: 12px;
  top: 12px;
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 9px;
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
  bottom: 12px;
}

.avatar-shell__panel--connection {
  width: min(338px, calc(100vw - 24px));
  max-height: min(56vh, calc(100vh - 24px));
}

.avatar-shell__panel--logs {
  top: auto;
  bottom: 12px;
  width: min(380px, calc(100vw - 24px));
  max-height: min(44vh, 380px);
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

  .avatar-shell__context-menu {
    width: calc(100vw - 20px);
    left: 10px !important;
    right: 10px;
  }
}
</style>
