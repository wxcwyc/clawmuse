import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'

export type DesktopElectronVoiceServiceState = 'stopped' | 'starting' | 'running' | 'error'

export interface DesktopElectronVoiceServiceEvent {
  level: 'info' | 'warn' | 'error'
  line: string
  ts: number
}

export interface DesktopElectronVoiceServiceStatus {
  state: DesktopElectronVoiceServiceState
  adapter: {
    sttEndpoint: string
    ttsEndpoint: string
    sttMode: 'owned' | 'external' | 'failed'
    ttsMode: 'owned' | 'external' | 'failed'
  }
  upstream: {
    baseUrl: string
    healthy: boolean
    autoLaunch: boolean
    launchCommand: string
    launchCwd: string
    launchAttempted: boolean
    pid?: number
  }
  cosyvoice: {
    baseUrl: string
    healthy: boolean
    autoLaunch: boolean
    launchCommand: string
    launchCwd: string
    launchAttempted: boolean
    pid?: number
  }
  lastError: string
}

export interface DesktopElectronVoiceSpeakerListRequest {
  provider?: 'cosyvoice' | 'openllm'
  baseUrl?: string
}

export interface DesktopElectronVoiceSpeakerListResult {
  provider: 'cosyvoice' | 'openllm'
  baseUrl: string
  speakers: string[]
  source: 'endpoint' | 'fallback' | 'none'
  endpoint?: string
  reason?: string
}

export interface DesktopElectronVoiceServiceController {
  start(): Promise<DesktopElectronVoiceServiceStatus>
  stop(): Promise<DesktopElectronVoiceServiceStatus>
  getStatus(): DesktopElectronVoiceServiceStatus
  listSpeakers(request?: DesktopElectronVoiceSpeakerListRequest): Promise<DesktopElectronVoiceSpeakerListResult>
}

type VoiceServiceControllerOptions = {
  env?: Record<string, string | undefined>
  emitEvent?: (event: DesktopElectronVoiceServiceEvent) => void
}

type VoiceServiceRuntimeConfig = {
  sttHost: string
  ttsHost: string
  sttPort: number
  ttsPort: number
  upstreamBaseUrl: string
  upstreamAutoLaunch: boolean
  upstreamLaunchCommand: string
  upstreamLaunchCwd: string
  upstreamLaunchCwdProbeList: string[]
  upstreamLaunchWaitMs: number
  cosyvoiceBaseUrl: string
  cosyvoiceAutoLaunch: boolean
  cosyvoiceLaunchCommand: string
  cosyvoiceLaunchCwd: string
  cosyvoiceLaunchCwdProbeList: string[]
  cosyvoiceLaunchWaitMs: number
}

type TtsProviderType = 'openllm' | 'cosyvoice'

type TtsRequestPayload = Record<string, unknown>

type CosyVoiceMode = 'sft' | 'zero_shot' | 'cross_lingual' | 'instruct' | 'instruct2'

type CosyVoiceRequestConfig = {
  baseUrl: string
  mode: CosyVoiceMode
  text: string
  speakerId: string
  promptText: string
  instructText: string
  promptWavPath: string
  promptWavUrl: string
  sampleRate: number
  speed?: number
}

const DEFAULT_COSYVOICE_SPEAKERS = [
  '中文女',
  '中文男',
  '粤语女',
  '粤语男',
  '英文女',
  '英文男',
  '日语女',
  '韩语女',
]

const DEFAULT_STT_HOST = '127.0.0.1'
const DEFAULT_TTS_HOST = '127.0.0.1'
const DEFAULT_STT_PORT = 8788
const DEFAULT_TTS_PORT = 8787
const DEFAULT_UPSTREAM_BASE_URL = 'http://127.0.0.1:12393'
const DEFAULT_COSYVOICE_BASE_URL = 'http://127.0.0.1:50000'
const DEFAULT_COSYVOICE_PORT = 50000
const DEFAULT_COSYVOICE_MODEL_DIR = 'pretrained_models/CosyVoice-300M'
const DEFAULT_PROXY_TIMEOUT_MS = 25000
const DEFAULT_UPSTREAM_LAUNCH_WAIT_MS = 5 * 60 * 1000
const DEFAULT_COSYVOICE_SAMPLE_RATE = 22050
const COSYVOICE_SPEAKER_DISCOVERY_PATHS = [
  '/speakers',
  '/speaker/list',
  '/spks',
  '/list_available_spks',
  '/config',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickStringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = record[key]
    if (typeof raw !== 'string') {
      continue
    }
    const normalized = raw.trim()
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function pickNumberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key]
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(parsed)) {
      continue
    }
    return parsed
  }
  return undefined
}

function parseTtsRequestPayload(requestBody: Buffer): {
  payload: TtsRequestPayload
  text: string
} {
  const rawText = requestBody.toString('utf8').trim()
  if (!rawText) {
    throw new Error('tts request body is empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  }
  catch {
    parsed = {
      text: rawText,
    }
  }

  if (typeof parsed === 'string') {
    parsed = {
      text: parsed,
    }
  }

  if (!isRecord(parsed)) {
    throw new Error('tts request body must be a json object')
  }

  const payload: TtsRequestPayload = {
    ...parsed,
  }
  const text = String(payload.text ?? '').trim()
  if (!text) {
    throw new Error('text is required')
  }
  payload.text = text

  return {
    payload,
    text,
  }
}

function normalizeSpeakerList(input: string[]) {
  const normalized = input
    .map(item => String(item ?? '').trim())
    .filter(Boolean)
  return Array.from(new Set(normalized))
}

function parseSpeakerListFromUnknown(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    const values: string[] = []
    for (const item of payload) {
      if (typeof item === 'string') {
        values.push(item)
        continue
      }
      if (Array.isArray(item) && typeof item[0] === 'string') {
        values.push(item[0])
        continue
      }
      if (isRecord(item)) {
        const id = pickStringField(item, ['id', 'speaker', 'speakerId', 'spk_id', 'spkId', 'name', 'value', 'label'])
        if (id) {
          values.push(id)
        }
      }
    }
    return normalizeSpeakerList(values)
  }

  if (!isRecord(payload)) {
    return []
  }

  const directKeys = ['speakers', 'speakerIds', 'speaker_ids', 'spks', 'voices', 'items', 'data']
  for (const key of directKeys) {
    if (!(key in payload)) {
      continue
    }
    const parsed = parseSpeakerListFromUnknown(payload[key])
    if (parsed.length > 0) {
      return parsed
    }
  }

  if (Array.isArray(payload.components)) {
    const fromGradio: string[] = []
    for (const component of payload.components) {
      if (!isRecord(component)) {
        continue
      }
      const props = isRecord(component.props) ? component.props : null
      if (!props) {
        continue
      }
      const label = pickStringField(props, ['label']).toLowerCase()
      if (!(label.includes('音色') || label.includes('speaker') || label.includes('spk'))) {
        continue
      }
      const choices = parseSpeakerListFromUnknown(props.choices)
      fromGradio.push(...choices)
    }
    const normalized = normalizeSpeakerList(fromGradio)
    if (normalized.length > 0) {
      return normalized
    }
  }

  return []
}

function parseSpeakerListFromText(body: string): string[] {
  const trimmed = body.trim()
  if (!trimmed) {
    return []
  }
  const lines = trimmed
    .split(/\r?\n/g)
    .flatMap(line => line.split(/[，,]/g))
    .map(item => item.trim())
    .filter(Boolean)
  return normalizeSpeakerList(lines)
}

function resolveTtsProvider(payload: TtsRequestPayload): TtsProviderType {
  const provider = pickStringField(payload, ['provider', 'voiceProvider', 'ttsProvider']).toLowerCase()
  if (provider === 'openllm' || provider === 'open_llm' || provider === 'open-llm-vtuber') {
    return 'openllm'
  }
  if (provider === 'cosyvoice' || provider === 'cosy_voice') {
    return 'cosyvoice'
  }

  if (!provider && isRecord(payload.cosyvoice)) {
    return 'cosyvoice'
  }

  return 'openllm'
}

function resolveCosyVoiceMode(input: string): CosyVoiceMode {
  const normalized = input.trim().toLowerCase()
  if (normalized === 'zero-shot' || normalized === 'zero_shot') {
    return 'zero_shot'
  }
  if (normalized === 'cross-lingual' || normalized === 'cross_lingual') {
    return 'cross_lingual'
  }
  if (normalized === 'instruct2') {
    return 'instruct2'
  }
  if (normalized === 'instruct') {
    return 'instruct'
  }
  return 'sft'
}

function resolveCosyVoiceConfig(payload: TtsRequestPayload, cosyvoiceBaseUrl: string): CosyVoiceRequestConfig {
  const cosyvoice = isRecord(payload.cosyvoice) ? payload.cosyvoice : {}
  const text = String(payload.text ?? '').trim()
  const baseUrl = normalizeBaseUrlWithFallback(
    pickStringField(cosyvoice, ['baseUrl'])
    || pickStringField(payload, ['cosyvoiceBaseUrl', 'baseUrl'])
    || cosyvoiceBaseUrl,
    cosyvoiceBaseUrl,
  )
  const mode = resolveCosyVoiceMode(
    pickStringField(cosyvoice, ['mode'])
    || pickStringField(payload, ['mode']),
  )
  const speakerId = (
    pickStringField(cosyvoice, ['speakerId', 'spkId', 'spk_id'])
    || pickStringField(payload, ['speakerId', 'spkId', 'spk_id'])
    || '中文女'
  )
  const promptText = (
    pickStringField(cosyvoice, ['promptText', 'prompt_text'])
    || pickStringField(payload, ['promptText', 'prompt_text'])
  )
  const instructText = (
    pickStringField(cosyvoice, ['instructText', 'instruct_text'])
    || pickStringField(payload, ['instructText', 'instruct_text'])
  )
  const promptWavPath = (
    pickStringField(cosyvoice, ['promptWavPath', 'promptAudioPath', 'prompt_wav_path'])
    || pickStringField(payload, ['promptWavPath', 'promptAudioPath', 'prompt_wav_path'])
  )
  const promptWavUrl = (
    pickStringField(cosyvoice, ['promptWavUrl', 'promptAudioUrl', 'prompt_wav_url'])
    || pickStringField(payload, ['promptWavUrl', 'promptAudioUrl', 'prompt_wav_url'])
  )
  const sampleRateRaw = (
    pickNumberField(cosyvoice, ['sampleRate', 'sample_rate'])
    ?? pickNumberField(payload, ['sampleRate', 'sample_rate'])
    ?? DEFAULT_COSYVOICE_SAMPLE_RATE
  )
  const sampleRate = Math.max(8000, Math.min(96000, Math.round(sampleRateRaw)))
  const speedRaw = (
    pickNumberField(cosyvoice, ['speed'])
    ?? pickNumberField(payload, ['speed'])
  )
  const speed = typeof speedRaw === 'number' && Number.isFinite(speedRaw)
    ? Math.max(0.5, Math.min(2.0, speedRaw))
    : undefined

  return {
    baseUrl,
    mode,
    text,
    speakerId,
    promptText,
    instructText,
    promptWavPath,
    promptWavUrl,
    sampleRate,
    speed,
  }
}

function resolveMimeTypeByExtension(pathLike: string) {
  const extension = extname(pathLike).toLowerCase()
  if (extension === '.mp3') {
    return 'audio/mpeg'
  }
  if (extension === '.ogg') {
    return 'audio/ogg'
  }
  if (extension === '.flac') {
    return 'audio/flac'
  }
  if (extension === '.m4a') {
    return 'audio/mp4'
  }
  return 'audio/wav'
}

async function resolveCosyVoicePromptWav(config: CosyVoiceRequestConfig): Promise<{
  bytes: Buffer
  fileName: string
  mimeType: string
}> {
  if (config.promptWavPath) {
    const absolutePath = resolve(config.promptWavPath)
    const bytes = await readFile(absolutePath)
    return {
      bytes,
      fileName: basename(absolutePath),
      mimeType: resolveMimeTypeByExtension(absolutePath),
    }
  }

  if (config.promptWavUrl) {
    const response = await fetchWithTimeout(config.promptWavUrl, {
      method: 'GET',
    }, DEFAULT_PROXY_TIMEOUT_MS)
    if (!response.ok) {
      throw new Error(`cosyvoice prompt_wav fetch failed status=${response.status}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    let fileName = 'prompt.wav'
    try {
      fileName = basename(new URL(config.promptWavUrl).pathname) || fileName
    }
    catch {
      // noop
    }
    const mimeType = response.headers.get('content-type') || resolveMimeTypeByExtension(fileName)
    return {
      bytes,
      fileName,
      mimeType,
    }
  }

  throw new Error('cosyvoice prompt_wav is required for the selected mode')
}

function buildWavFromPcm16(params: {
  pcm: Buffer
  sampleRate: number
  channels?: number
}) {
  const pcmBytes = params.pcm.length % 2 === 0 ? params.pcm : params.pcm.subarray(0, params.pcm.length - 1)
  const channels = Math.max(1, Math.min(2, params.channels ?? 1))
  const bitsPerSample = 16
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = params.sampleRate * blockAlign
  const dataSize = pcmBytes.length
  const wav = Buffer.allocUnsafe(44 + dataSize)

  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(params.sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataSize, 40)
  pcmBytes.copy(wav, 44)
  return wav
}

function resolveDefaultUpstreamLaunchCommand(platform: string) {
  if (platform === 'win32') {
    const localVenvPython = '.clawmuse-venv\\Scripts\\python.exe'
    const bundledPython = 'python\\python.exe'
    const bundledInstallDeps = `(${bundledPython} -m pip --version >NUL 2>&1 && (if exist wheelhouse (${bundledPython} -m pip install --no-index --find-links wheelhouse -r requirements.txt) else (${bundledPython} -m pip install -r requirements.txt)))`
    const runWithBundledPython = [
      bundledInstallDeps,
      `${bundledPython} run_server.py`,
    ].join(' && ')
    const installDeps = `(if exist wheelhouse (${localVenvPython} -m pip install --no-index --find-links wheelhouse -r requirements.txt) else (${localVenvPython} -m pip install -r requirements.txt))`
    const bootstrapWith = (launcher: string) => [
      `${launcher} -m venv .clawmuse-venv`,
      `${localVenvPython} -m pip install -U pip`,
      installDeps,
      `${localVenvPython} run_server.py`,
    ].join(' && ')
    const runWithLocalVenv = (launcher: string) => `(if exist ${localVenvPython} (${localVenvPython} run_server.py) else (${bootstrapWith(launcher)}))`
    const runWithoutBundledPython = [
      'uv run run_server.py',
      runWithLocalVenv('py -3'),
      runWithLocalVenv('python'),
    ].join(' || ')
    return `(if exist ${bundledPython} (${runWithBundledPython}) else (${runWithoutBundledPython}))`
  }
  const localVenvPython = '.clawmuse-venv/bin/python3'
  const bundledPython = 'python/bin/python3'
  const installDeps = `(test -d wheelhouse && ${localVenvPython} -m pip install --no-index --find-links wheelhouse -r requirements.txt) || (${localVenvPython} -m pip install -r requirements.txt)`
  const bootstrapWith = (launcher: string) => [
    `${launcher} -m venv .clawmuse-venv`,
    `${localVenvPython} -m pip install -U pip`,
    installDeps,
    `${localVenvPython} run_server.py`,
  ].join(' && ')
  const runWithLocalVenv = (launcher: string) => `(test -x ${localVenvPython} && ${localVenvPython} run_server.py) || (${bootstrapWith(launcher)})`
  return [
    'uv run run_server.py',
    `(test -x ${bundledPython} && (${runWithLocalVenv(bundledPython)}))`,
    runWithLocalVenv('python3'),
    runWithLocalVenv('python'),
  ].join(' || ')
}

function parseInteger(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback
  }
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback
  }
  return parsed
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number, max = 24 * 60 * 60 * 1000) {
  if (!rawValue) {
    return fallback
  }
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    return fallback
  }
  return parsed
}

function normalizeBaseUrlWithFallback(rawBaseUrl: string | undefined, fallback: string) {
  const candidate = (rawBaseUrl ?? '').trim()
  if (!candidate) {
    return fallback
  }
  try {
    return new URL(candidate).toString().replace(/\/+$/, '')
  }
  catch {
    return fallback
  }
}

function normalizeBaseUrl(rawBaseUrl: string | undefined) {
  return normalizeBaseUrlWithFallback(rawBaseUrl, DEFAULT_UPSTREAM_BASE_URL)
}

function parsePortFromBaseUrl(baseUrl: string, fallback: number) {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.port) {
      return parseInteger(parsed.port, fallback)
    }
    if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') {
      return 443
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'ws:') {
      return 80
    }
    return fallback
  }
  catch {
    return fallback
  }
}

function resolveDefaultCosyVoiceLaunchCommand(platform: string, port: number, modelDir: string) {
  const safePort = parseInteger(String(port), DEFAULT_COSYVOICE_PORT)
  if (platform === 'win32') {
    const localVenvPython = '.clawmuse-cosyvoice-venv\\Scripts\\python.exe'
    const bundledPython = 'python\\python.exe'
    const scriptPath = 'runtime\\python\\fastapi\\server.py'
    const normalizedModelDir = modelDir.replaceAll('/', '\\')
    const runCosyVoiceWith = (pythonExecutable: string) => `${pythonExecutable} ${scriptPath} --port ${safePort} --model_dir "${normalizedModelDir}"`
    const installDepsWith = (pythonExecutable: string) => `(${pythonExecutable} -m pip --version >NUL 2>&1 && (if exist wheelhouse (${pythonExecutable} -m pip install --no-index --find-links wheelhouse -r requirements.txt) else (${pythonExecutable} -m pip install -r requirements.txt)))`
    const runWithBundledPython = [
      installDepsWith(bundledPython),
      runCosyVoiceWith(bundledPython),
    ].join(' && ')
    const installDepsWithLocalVenv = `(if exist wheelhouse (${localVenvPython} -m pip install --no-index --find-links wheelhouse -r requirements.txt) else (${localVenvPython} -m pip install -r requirements.txt))`
    const bootstrapWith = (launcher: string) => [
      `${launcher} -m venv .clawmuse-cosyvoice-venv`,
      `${localVenvPython} -m pip install -U pip`,
      installDepsWithLocalVenv,
      runCosyVoiceWith(localVenvPython),
    ].join(' && ')
    const runWithLocalVenv = (launcher: string) => `(if exist ${localVenvPython} (${runCosyVoiceWith(localVenvPython)}) else (${bootstrapWith(launcher)}))`
    const runWithoutBundledPython = [
      `uv run ${scriptPath} --port ${safePort} --model_dir "${normalizedModelDir}"`,
      runWithLocalVenv('py -3'),
      runWithLocalVenv('python'),
    ].join(' || ')
    return `(if exist ${bundledPython} (${runWithBundledPython}) else (${runWithoutBundledPython}))`
  }

  const localVenvPython = '.clawmuse-cosyvoice-venv/bin/python3'
  const bundledPython = 'python/bin/python3'
  const scriptPath = 'runtime/python/fastapi/server.py'
  const runCosyVoiceWith = (pythonExecutable: string) => `${pythonExecutable} ${scriptPath} --port ${safePort} --model_dir "${modelDir}"`
  const installDeps = `(test -d wheelhouse && ${localVenvPython} -m pip install --no-index --find-links wheelhouse -r requirements.txt) || (${localVenvPython} -m pip install -r requirements.txt)`
  const bootstrapWith = (launcher: string) => [
    `${launcher} -m venv .clawmuse-cosyvoice-venv`,
    `${localVenvPython} -m pip install -U pip`,
    installDeps,
    runCosyVoiceWith(localVenvPython),
  ].join(' && ')
  const runWithLocalVenv = (launcher: string) => `(test -x ${localVenvPython} && ${runCosyVoiceWith(localVenvPython)}) || (${bootstrapWith(launcher)})`
  return [
    `uv run ${scriptPath} --port ${safePort} --model_dir "${modelDir}"`,
    `(test -x ${bundledPython} && (${runCosyVoiceWith(bundledPython)}))`,
    runWithLocalVenv('python3'),
    runWithLocalVenv('python'),
  ].join(' || ')
}

function buildDefaultCosyVoiceLaunchCwdCandidates(env: Record<string, string | undefined>) {
  const home = homedir()
  const userProfile = (env.USERPROFILE ?? '').trim()
  const candidates = [
    join(home, 'projects', 'sst&tts', 'CosyVoice'),
    join(home, 'Desktop', 'sst&tts', 'CosyVoice'),
    join(process.cwd(), 'sst&tts', 'CosyVoice'),
    join(process.cwd(), '..', 'sst&tts', 'CosyVoice'),
    join(process.cwd(), 'voice-backend', 'CosyVoice'),
    join(process.cwd(), '..', 'voice-backend', 'CosyVoice'),
  ]

  if (userProfile) {
    candidates.push(
      join(userProfile, 'projects', 'sst&tts', 'CosyVoice'),
      join(userProfile, 'Desktop', 'sst&tts', 'CosyVoice'),
    )
  }

  const resourcesPath = ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '').trim()
  if (resourcesPath) {
    candidates.push(
      join(resourcesPath, 'voice-backend', 'CosyVoice'),
      join(resourcesPath, 'app.asar.unpacked', 'voice-backend', 'CosyVoice'),
    )
  }

  const execDir = dirname(process.execPath)
  candidates.push(
    join(execDir, 'voice-backend', 'CosyVoice'),
    join(execDir, '..', 'voice-backend', 'CosyVoice'),
  )

  return Array.from(new Set(candidates.map(candidate => resolve(candidate.trim())).filter(Boolean)))
}

function resolveDefaultCosyVoiceLaunchCwd(env: Record<string, string | undefined>) {
  const candidates = buildDefaultCosyVoiceLaunchCwdCandidates(env)
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        cwd: candidate,
        probes: candidates,
      }
    }
  }
  return {
    cwd: '',
    probes: candidates,
  }
}

function buildDefaultUpstreamLaunchCwdCandidates(env: Record<string, string | undefined>) {
  const home = homedir()
  const userProfile = (env.USERPROFILE ?? '').trim()
  const candidates = [
    join(home, 'projects', 'sst&tts', 'Open-LLM-VTuber'),
    join(home, 'Desktop', 'sst&tts', 'Open-LLM-VTuber'),
    join(process.cwd(), 'sst&tts', 'Open-LLM-VTuber'),
    join(process.cwd(), '..', 'sst&tts', 'Open-LLM-VTuber'),
  ]

  if (userProfile) {
    candidates.push(
      join(userProfile, 'projects', 'sst&tts', 'Open-LLM-VTuber'),
      join(userProfile, 'Desktop', 'sst&tts', 'Open-LLM-VTuber'),
    )
  }

  const resourcesPath = ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '').trim()
  if (resourcesPath) {
    candidates.push(
      join(resourcesPath, 'voice-backend', 'Open-LLM-VTuber'),
      join(resourcesPath, 'app.asar.unpacked', 'voice-backend', 'Open-LLM-VTuber'),
    )
  }

  const execDir = dirname(process.execPath)
  candidates.push(
    join(execDir, 'voice-backend', 'Open-LLM-VTuber'),
    join(execDir, '..', 'voice-backend', 'Open-LLM-VTuber'),
  )

  const deduped = Array.from(new Set(candidates.map(candidate => resolve(candidate.trim())).filter(Boolean)))
  return deduped
}

function resolveDefaultUpstreamLaunchCwd(env: Record<string, string | undefined>) {
  const candidates = buildDefaultUpstreamLaunchCwdCandidates(env)
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        cwd: candidate,
        probes: candidates,
      }
    }
  }
  return {
    cwd: '',
    probes: candidates,
  }
}

function resolveRuntimeConfig(env: Record<string, string | undefined>): VoiceServiceRuntimeConfig {
  const platform = (env.CLAWMUSE_PLATFORM ?? process.platform ?? '').trim() || process.platform
  const defaultUpstreamLaunchCommand = resolveDefaultUpstreamLaunchCommand(platform)
  const upstreamLaunchCwdCandidate = (env.CLAWMUSE_VOICE_BACKEND_CWD ?? '').trim()
  const resolvedDefaultUpstreamLaunchCwd = resolveDefaultUpstreamLaunchCwd(env)
  const upstreamLaunchCwd = upstreamLaunchCwdCandidate.length > 0
    ? resolve(upstreamLaunchCwdCandidate)
    : resolvedDefaultUpstreamLaunchCwd.cwd
  const cosyvoiceBaseUrl = normalizeBaseUrlWithFallback(
    env.CLAWMUSE_COSYVOICE_URL,
    DEFAULT_COSYVOICE_BASE_URL,
  )
  const cosyvoiceModelDir = (env.CLAWMUSE_COSYVOICE_MODEL_DIR ?? DEFAULT_COSYVOICE_MODEL_DIR).trim() || DEFAULT_COSYVOICE_MODEL_DIR
  const cosyvoicePort = parseInteger(
    env.CLAWMUSE_COSYVOICE_PORT,
    parsePortFromBaseUrl(cosyvoiceBaseUrl, DEFAULT_COSYVOICE_PORT),
  )
  const defaultCosyVoiceLaunchCommand = resolveDefaultCosyVoiceLaunchCommand(
    platform,
    cosyvoicePort,
    cosyvoiceModelDir,
  )
  const cosyvoiceLaunchCwdCandidate = (env.CLAWMUSE_COSYVOICE_CWD ?? '').trim()
  const resolvedDefaultCosyVoiceLaunchCwd = resolveDefaultCosyVoiceLaunchCwd(env)
  const cosyvoiceLaunchCwd = cosyvoiceLaunchCwdCandidate.length > 0
    ? resolve(cosyvoiceLaunchCwdCandidate)
    : resolvedDefaultCosyVoiceLaunchCwd.cwd

  return {
    sttHost: (env.CLAWMUSE_VOICE_STT_HOST ?? DEFAULT_STT_HOST).trim() || DEFAULT_STT_HOST,
    ttsHost: (env.CLAWMUSE_VOICE_TTS_HOST ?? DEFAULT_TTS_HOST).trim() || DEFAULT_TTS_HOST,
    sttPort: parseInteger(env.CLAWMUSE_VOICE_STT_PORT, DEFAULT_STT_PORT),
    ttsPort: parseInteger(env.CLAWMUSE_VOICE_TTS_PORT, DEFAULT_TTS_PORT),
    upstreamBaseUrl: normalizeBaseUrl(env.CLAWMUSE_VOICE_BACKEND_URL),
    upstreamAutoLaunch: env.CLAWMUSE_VOICE_BACKEND_AUTO_LAUNCH !== '0' && env.CLAWMUSE_VOICE_BACKEND_AUTO_LAUNCH !== 'false',
    upstreamLaunchCommand: (env.CLAWMUSE_VOICE_BACKEND_CMD ?? defaultUpstreamLaunchCommand).trim() || defaultUpstreamLaunchCommand,
    upstreamLaunchCwd,
    upstreamLaunchCwdProbeList: resolvedDefaultUpstreamLaunchCwd.probes,
    upstreamLaunchWaitMs: parsePositiveInteger(env.CLAWMUSE_VOICE_BACKEND_STARTUP_TIMEOUT_MS, DEFAULT_UPSTREAM_LAUNCH_WAIT_MS),
    cosyvoiceBaseUrl,
    cosyvoiceAutoLaunch: env.CLAWMUSE_COSYVOICE_AUTO_LAUNCH !== '0' && env.CLAWMUSE_COSYVOICE_AUTO_LAUNCH !== 'false',
    cosyvoiceLaunchCommand: (env.CLAWMUSE_COSYVOICE_CMD ?? defaultCosyVoiceLaunchCommand).trim() || defaultCosyVoiceLaunchCommand,
    cosyvoiceLaunchCwd,
    cosyvoiceLaunchCwdProbeList: resolvedDefaultCosyVoiceLaunchCwd.probes,
    cosyvoiceLaunchWaitMs: parsePositiveInteger(env.CLAWMUSE_COSYVOICE_STARTUP_TIMEOUT_MS, DEFAULT_UPSTREAM_LAUNCH_WAIT_MS),
  }
}

function buildWsUrl(baseUrl: string, path: string) {
  const parsed = new URL(baseUrl)
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  parsed.pathname = path
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

function applyCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function sendJson(response: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  applyCorsHeaders(response)
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function sendMethodNotAllowed(response: ServerResponse) {
  sendJson(response, 405, {
    error: 'method not allowed',
  })
}

async function readRequestBody(request: IncomingMessage, maxBytes = 20 * 1024 * 1024): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalLength = 0

    request.on('data', (chunk: unknown) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalLength += buffer.length
      if (totalLength > maxBytes) {
        reject(new Error('request body exceeds size limit'))
        request.destroy()
        return
      }
      chunks.push(buffer)
    })

    request.on('end', () => {
      resolve(Buffer.concat(chunks))
    })

    request.on('error', reject)
  })
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort()
  }, Math.max(500, timeoutMs))

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  }
  finally {
    clearTimeout(timer)
  }
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function parseWebSocketPayload(rawData: unknown): Promise<string> {
  if (rawData && typeof rawData === 'object' && 'data' in rawData) {
    return await parseWebSocketPayload((rawData as { data?: unknown }).data)
  }
  if (typeof rawData === 'string') {
    return rawData
  }
  if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
    return Buffer.from(await rawData.arrayBuffer()).toString('utf8')
  }
  if (rawData instanceof ArrayBuffer) {
    return Buffer.from(rawData).toString('utf8')
  }
  if (ArrayBuffer.isView(rawData)) {
    return Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength).toString('utf8')
  }
  return String(rawData ?? '')
}

async function waitForServerListen(server: Server, port: number, host: string): Promise<'owned' | 'external' | 'failed'> {
  return await new Promise((resolve) => {
    const cleanup = () => {
      server.removeListener('error', onError)
      server.removeListener('listening', onListening)
    }
    const onListening = () => {
      cleanup()
      resolve('owned')
    }
    const onError = (error: unknown) => {
      const typed = error as { code?: string }
      cleanup()
      if (typed?.code === 'EADDRINUSE') {
        resolve('external')
        return
      }
      resolve('failed')
    }

    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

async function closeServer(server: Server | null) {
  if (!server) {
    return
  }
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve()
    })
  })
}

export function createDesktopElectronVoiceServiceController(
  options: VoiceServiceControllerOptions = {},
): DesktopElectronVoiceServiceController {
  const env = options.env ?? process.env
  const config = resolveRuntimeConfig(env)

  let sttServer: Server | null = null
  let ttsServer: Server | null = null
  let upstreamProcess: ChildProcessWithoutNullStreams | null = null
  let cosyvoiceProcess: ChildProcessWithoutNullStreams | null = null
  let upstreamLaunchPromise: Promise<void> | null = null
  let cosyvoiceLaunchPromise: Promise<void> | null = null
  let healthMonitorTimer: ReturnType<typeof setInterval> | null = null
  let startPromise: Promise<DesktopElectronVoiceServiceStatus> | null = null

  const status: DesktopElectronVoiceServiceStatus = {
    state: 'stopped',
    adapter: {
      sttEndpoint: `http://${config.sttHost}:${config.sttPort}/stt`,
      ttsEndpoint: `http://${config.ttsHost}:${config.ttsPort}/tts`,
      sttMode: 'failed',
      ttsMode: 'failed',
    },
    upstream: {
      baseUrl: config.upstreamBaseUrl,
      healthy: false,
      autoLaunch: config.upstreamAutoLaunch,
      launchCommand: config.upstreamLaunchCommand,
      launchCwd: config.upstreamLaunchCwd,
      launchAttempted: false,
    },
    cosyvoice: {
      baseUrl: config.cosyvoiceBaseUrl,
      healthy: false,
      autoLaunch: config.cosyvoiceAutoLaunch,
      launchCommand: config.cosyvoiceLaunchCommand,
      launchCwd: config.cosyvoiceLaunchCwd,
      launchAttempted: false,
    },
    lastError: '',
  }

  const emit = (level: DesktopElectronVoiceServiceEvent['level'], line: string) => {
    options.emitEvent?.({
      level,
      line,
      ts: Date.now(),
    })
  }

  const setLastError = (message: string) => {
    status.lastError = message
    if (message) {
      emit('error', message)
    }
  }

  const checkUpstreamHealth = async () => {
    try {
      const response = await fetchWithTimeout(`${config.upstreamBaseUrl}/web-tool`, {
        method: 'GET',
      }, 2500)
      status.upstream.healthy = response.status < 500
      return status.upstream.healthy
    }
    catch {
      status.upstream.healthy = false
      return false
    }
  }

  const checkCosyVoiceHealth = async () => {
    try {
      const response = await fetchWithTimeout(`${config.cosyvoiceBaseUrl}/docs`, {
        method: 'GET',
      }, 2500)
      status.cosyvoice.healthy = response.status < 500
      return status.cosyvoice.healthy
    }
    catch {
      status.cosyvoice.healthy = false
      return false
    }
  }

  const maybeLaunchUpstream = async () => {
    if (status.upstream.healthy || upstreamProcess) {
      return
    }
    if (upstreamLaunchPromise) {
      return await upstreamLaunchPromise
    }
    upstreamLaunchPromise = (async () => {
      if (!config.upstreamAutoLaunch) {
        emit('warn', `[voice-service] upstream unhealthy and auto-launch is disabled (base=${config.upstreamBaseUrl})`)
        return
      }
      if (!config.upstreamLaunchCwd || !existsSync(config.upstreamLaunchCwd)) {
        emit('warn', `[voice-service] upstream launch skipped: cwd not found (${config.upstreamLaunchCwd || 'empty'})`)
        if (config.upstreamLaunchCwdProbeList.length > 0) {
          emit('info', `[voice-service] backend cwd probes: ${config.upstreamLaunchCwdProbeList.join(' | ')}`)
        }
        emit('warn', '[voice-service] set CLAWMUSE_VOICE_BACKEND_CWD to your Open-LLM-VTuber directory')
        return
      }

      status.upstream.launchAttempted = true
      emit('info', `[voice-service] launching upstream command: ${config.upstreamLaunchCommand}`)
      emit('info', `[voice-service] upstream cwd: ${config.upstreamLaunchCwd}`)
      const hasWheelhouse = existsSync(join(config.upstreamLaunchCwd, 'wheelhouse'))
      const hasBundledPython = existsSync(join(config.upstreamLaunchCwd, 'python', 'python.exe'))
        || existsSync(join(config.upstreamLaunchCwd, 'python', 'bin', 'python3'))
      if (hasBundledPython) {
        emit('info', '[voice-service] detected bundled python runtime')
      }
      if (hasWheelhouse) {
        emit('info', '[voice-service] detected offline wheelhouse')
      }
      emit('info', '[voice-service] first launch may bootstrap python deps (venv + pip install), this can take minutes.')

      const child = spawn(config.upstreamLaunchCommand, {
        cwd: config.upstreamLaunchCwd,
        stdio: 'pipe',
        shell: true,
        env: {
          ...process.env,
          PIP_BREAK_SYSTEM_PACKAGES: 'true',
        },
      })
      upstreamProcess = child
      status.upstream.pid = child.pid

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (!text) {
          return
        }
        for (const line of text.split(/\r?\n/g)) {
          const normalized = line.trim()
          if (!normalized) {
            continue
          }
          emit('info', `[voice-upstream] ${normalized}`)
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (!text) {
          return
        }
        for (const line of text.split(/\r?\n/g)) {
          const normalized = line.trim()
          if (!normalized) {
            continue
          }
          emit('warn', `[voice-upstream] ${normalized}`)
        }
      })

      child.on('exit', (code, signal) => {
        emit('warn', `[voice-service] upstream process exited (code=${code ?? '-'} signal=${signal ?? '-'})`)
        if (upstreamProcess === child) {
          upstreamProcess = null
          status.upstream.pid = undefined
        }
        status.upstream.healthy = false
      })

      const deadline = Date.now() + config.upstreamLaunchWaitMs
      while (Date.now() < deadline) {
        const healthy = await checkUpstreamHealth()
        if (healthy) {
          emit('info', `[voice-service] upstream healthy at ${config.upstreamBaseUrl}`)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1200))
      }

      emit('warn', `[voice-service] upstream launch timeout: still unhealthy at ${config.upstreamBaseUrl}`)
    })().finally(() => {
      upstreamLaunchPromise = null
    })
    return await upstreamLaunchPromise
  }

  const ensureUpstreamReady = async () => {
    if (await checkUpstreamHealth()) {
      return true
    }
    await maybeLaunchUpstream()
    return await checkUpstreamHealth()
  }

  const maybeLaunchCosyVoice = async () => {
    if (status.cosyvoice.healthy || cosyvoiceProcess) {
      return
    }
    if (cosyvoiceLaunchPromise) {
      return await cosyvoiceLaunchPromise
    }
    cosyvoiceLaunchPromise = (async () => {
      if (!config.cosyvoiceAutoLaunch) {
        emit('warn', `[voice-service] cosyvoice unhealthy and auto-launch is disabled (base=${config.cosyvoiceBaseUrl})`)
        return
      }
      if (!config.cosyvoiceLaunchCwd || !existsSync(config.cosyvoiceLaunchCwd)) {
        emit('warn', `[voice-service] cosyvoice launch skipped: cwd not found (${config.cosyvoiceLaunchCwd || 'empty'})`)
        if (config.cosyvoiceLaunchCwdProbeList.length > 0) {
          emit('info', `[voice-service] cosyvoice cwd probes: ${config.cosyvoiceLaunchCwdProbeList.join(' | ')}`)
        }
        emit('warn', '[voice-service] set CLAWMUSE_COSYVOICE_CWD to your CosyVoice directory')
        return
      }

      status.cosyvoice.launchAttempted = true
      emit('info', `[voice-service] launching cosyvoice command: ${config.cosyvoiceLaunchCommand}`)
      emit('info', `[voice-service] cosyvoice cwd: ${config.cosyvoiceLaunchCwd}`)
      const hasWheelhouse = existsSync(join(config.cosyvoiceLaunchCwd, 'wheelhouse'))
      const hasBundledPython = existsSync(join(config.cosyvoiceLaunchCwd, 'python', 'python.exe'))
        || existsSync(join(config.cosyvoiceLaunchCwd, 'python', 'bin', 'python3'))
      if (hasBundledPython) {
        emit('info', '[voice-service] cosyvoice detected bundled python runtime')
      }
      if (hasWheelhouse) {
        emit('info', '[voice-service] cosyvoice detected offline wheelhouse')
      }
      emit('info', '[voice-service] cosyvoice first launch may bootstrap python deps, this can take minutes.')

      const child = spawn(config.cosyvoiceLaunchCommand, {
        cwd: config.cosyvoiceLaunchCwd,
        stdio: 'pipe',
        shell: true,
        env: {
          ...process.env,
          PIP_BREAK_SYSTEM_PACKAGES: 'true',
        },
      })
      cosyvoiceProcess = child
      status.cosyvoice.pid = child.pid

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (!text) {
          return
        }
        for (const line of text.split(/\r?\n/g)) {
          const normalized = line.trim()
          if (!normalized) {
            continue
          }
          emit('info', `[cosyvoice-upstream] ${normalized}`)
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trim()
        if (!text) {
          return
        }
        for (const line of text.split(/\r?\n/g)) {
          const normalized = line.trim()
          if (!normalized) {
            continue
          }
          emit('warn', `[cosyvoice-upstream] ${normalized}`)
        }
      })

      child.on('exit', (code, signal) => {
        emit('warn', `[voice-service] cosyvoice process exited (code=${code ?? '-'} signal=${signal ?? '-'})`)
        if (cosyvoiceProcess === child) {
          cosyvoiceProcess = null
          status.cosyvoice.pid = undefined
        }
        status.cosyvoice.healthy = false
      })

      const deadline = Date.now() + config.cosyvoiceLaunchWaitMs
      while (Date.now() < deadline) {
        const healthy = await checkCosyVoiceHealth()
        if (healthy) {
          emit('info', `[voice-service] cosyvoice healthy at ${config.cosyvoiceBaseUrl}`)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 1200))
      }

      emit('warn', `[voice-service] cosyvoice launch timeout: still unhealthy at ${config.cosyvoiceBaseUrl}`)
    })().finally(() => {
      cosyvoiceLaunchPromise = null
    })
    return await cosyvoiceLaunchPromise
  }

  const ensureCosyVoiceReady = async () => {
    if (await checkCosyVoiceHealth()) {
      return true
    }
    await maybeLaunchCosyVoice()
    return await checkCosyVoiceHealth()
  }

  const startHealthMonitor = () => {
    if (healthMonitorTimer) {
      clearInterval(healthMonitorTimer)
      healthMonitorTimer = null
    }
    healthMonitorTimer = setInterval(() => {
      void (async () => {
        if (status.state !== 'running') {
          return
        }
        if (!config.cosyvoiceAutoLaunch) {
          await checkCosyVoiceHealth()
          return
        }
        const healthy = await checkCosyVoiceHealth()
        if (!healthy) {
          await maybeLaunchCosyVoice()
          await checkCosyVoiceHealth()
        }
      })()
    }, 15_000)
  }

  const forwardSttRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'OPTIONS') {
      applyCorsHeaders(response)
      response.statusCode = 204
      response.end()
      return
    }
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response)
      return
    }

    if (!(await ensureUpstreamReady())) {
      sendJson(response, 503, {
        error: 'voice upstream unavailable',
        reason: `cannot reach ${config.upstreamBaseUrl}`,
      })
      return
    }

    try {
      const requestBody = await readRequestBody(request)
      const contentType = typeof request.headers['content-type'] === 'string'
        ? request.headers['content-type']
        : ''

      const upstreamResponse = await fetchWithTimeout(`${config.upstreamBaseUrl}/asr`, {
        method: 'POST',
        headers: contentType
          ? {
              'content-type': contentType,
            }
          : undefined,
        body: new Uint8Array(requestBody),
      }, DEFAULT_PROXY_TIMEOUT_MS)

      const responseBody = Buffer.from(await upstreamResponse.arrayBuffer())
      applyCorsHeaders(response)
      response.statusCode = upstreamResponse.status
      const upstreamContentType = upstreamResponse.headers.get('content-type')
      if (upstreamContentType) {
        response.setHeader('content-type', upstreamContentType)
      }
      response.end(responseBody)
    }
    catch (error) {
      const reason = stringifyError(error)
      sendJson(response, 502, {
        error: 'stt proxy failed',
        reason,
      })
    }
  }

  const requestTtsAudioFromOpenLlmUpstream = async (payload: TtsRequestPayload): Promise<{ audio: Buffer, mimeType: string }> => {
    if (!(await ensureUpstreamReady())) {
      throw new Error(`voice upstream unavailable at ${config.upstreamBaseUrl}`)
    }

    const wsUrl = buildWsUrl(config.upstreamBaseUrl, '/tts-ws')
    const audioPath = await new Promise<string>((resolve, reject) => {
      const socket = new WebSocket(wsUrl)
      let settled = false
      const settle = (next: 'resolve' | 'reject', payload: string | Error) => {
        if (settled) {
          return
        }
        settled = true
        try {
          socket.close()
        }
        catch {
          // noop
        }
        if (next === 'resolve') {
          resolve(String(payload))
          return
        }
        reject(payload)
      }

      const timeout = setTimeout(() => {
        settle('reject', new Error('tts websocket timeout'))
      }, DEFAULT_PROXY_TIMEOUT_MS)

      socket.addEventListener('open', () => {
        socket.send(JSON.stringify(payload))
      })

      socket.addEventListener('message', (event) => {
        void (async () => {
          try {
            const raw = await parseWebSocketPayload(event)
            const parsed = JSON.parse(raw) as {
              status?: string
              audioPath?: string
              message?: string
            }

            if (parsed.status === 'error') {
              clearTimeout(timeout)
              settle('reject', new Error(parsed.message || 'upstream tts error'))
              return
            }

            if (parsed.status === 'partial' && typeof parsed.audioPath === 'string' && parsed.audioPath.trim().length > 0) {
              clearTimeout(timeout)
              settle('resolve', parsed.audioPath)
            }
          }
          catch (error) {
            clearTimeout(timeout)
            settle('reject', new Error(stringifyError(error)))
          }
        })()
      })

      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        settle('reject', new Error('tts websocket request failed'))
      })

      socket.addEventListener('close', () => {
        if (!settled) {
          clearTimeout(timeout)
          settle('reject', new Error('tts websocket closed before audio payload'))
        }
      })
    })

    const audioUrl = (() => {
      try {
        return new URL(audioPath, config.upstreamBaseUrl).toString()
      }
      catch {
        return `${config.upstreamBaseUrl.replace(/\/+$/, '')}/${audioPath.replace(/^\/+/, '')}`
      }
    })()

    const audioResponse = await fetchWithTimeout(audioUrl, {
      method: 'GET',
    }, DEFAULT_PROXY_TIMEOUT_MS)

    if (!audioResponse.ok) {
      throw new Error(`upstream audio fetch failed status=${audioResponse.status}`)
    }

    return {
      audio: Buffer.from(await audioResponse.arrayBuffer()),
      mimeType: audioResponse.headers.get('content-type') || 'audio/wav',
    }
  }

  const requestTtsAudioFromCosyVoiceUpstream = async (payload: TtsRequestPayload): Promise<{ audio: Buffer, mimeType: string }> => {
    const cosyvoice = resolveCosyVoiceConfig(payload, config.cosyvoiceBaseUrl)
    const requestedBase = normalizeBaseUrlWithFallback(cosyvoice.baseUrl, config.cosyvoiceBaseUrl)
    const managedBase = normalizeBaseUrlWithFallback(config.cosyvoiceBaseUrl, DEFAULT_COSYVOICE_BASE_URL)
    if (requestedBase === managedBase) {
      if (!(await ensureCosyVoiceReady())) {
        throw new Error(`cosyvoice upstream unavailable at ${config.cosyvoiceBaseUrl}`)
      }
    }

    const endpoint = `${requestedBase}/inference_${cosyvoice.mode}`
    const formData = new FormData()
    formData.append('tts_text', cosyvoice.text)
    if (typeof cosyvoice.speed === 'number' && Number.isFinite(cosyvoice.speed)) {
      formData.append('speed', String(cosyvoice.speed))
    }

    if (cosyvoice.mode === 'sft' || cosyvoice.mode === 'instruct') {
      if (!cosyvoice.speakerId) {
        throw new Error('cosyvoice spk_id is required for sft/instruct mode')
      }
      formData.append('spk_id', cosyvoice.speakerId)
    }
    if (cosyvoice.mode === 'zero_shot') {
      if (!cosyvoice.promptText) {
        throw new Error('cosyvoice prompt_text is required for zero_shot mode')
      }
      formData.append('prompt_text', cosyvoice.promptText)
    }
    if (cosyvoice.mode === 'instruct' || cosyvoice.mode === 'instruct2') {
      formData.append('instruct_text', cosyvoice.instructText || '')
    }
    if (cosyvoice.mode === 'zero_shot' || cosyvoice.mode === 'cross_lingual' || cosyvoice.mode === 'instruct2') {
      const promptWav = await resolveCosyVoicePromptWav(cosyvoice)
      formData.append(
        'prompt_wav',
        new Blob([promptWav.bytes], {
          type: promptWav.mimeType,
        }),
        promptWav.fileName || 'prompt.wav',
      )
    }

    const upstreamResponse = await fetchWithTimeout(endpoint, {
      method: 'POST',
      body: formData,
    }, DEFAULT_PROXY_TIMEOUT_MS)
    if (!upstreamResponse.ok) {
      let reason = `status=${upstreamResponse.status}`
      try {
        const snippet = (await upstreamResponse.text()).trim()
        if (snippet) {
          reason += ` body=${snippet.slice(0, 220)}`
        }
      }
      catch {
        // noop
      }
      throw new Error(`cosyvoice upstream request failed: ${reason}`)
    }

    const upstreamMimeType = (upstreamResponse.headers.get('content-type') || '').toLowerCase()
    const rawBytes = Buffer.from(await upstreamResponse.arrayBuffer())
    if (upstreamMimeType.includes('audio/wav') || upstreamMimeType.includes('audio/x-wav')) {
      return {
        audio: rawBytes,
        mimeType: upstreamMimeType,
      }
    }

    const wrappedWav = buildWavFromPcm16({
      pcm: rawBytes,
      sampleRate: cosyvoice.sampleRate,
      channels: 1,
    })
    return {
      audio: wrappedWav,
      mimeType: 'audio/wav',
    }
  }

  const requestTtsAudioFromUpstream = async (payload: TtsRequestPayload): Promise<{ audio: Buffer, mimeType: string }> => {
    const provider = resolveTtsProvider(payload)
    if (provider === 'cosyvoice') {
      emit('info', `[voice-service] tts provider=cosyvoice mode=${resolveCosyVoiceConfig(payload, config.cosyvoiceBaseUrl).mode}`)
      return await requestTtsAudioFromCosyVoiceUpstream(payload)
    }

    emit('info', '[voice-service] tts provider=openllm')
    return await requestTtsAudioFromOpenLlmUpstream(payload)
  }

  const handleTtsRequest = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'OPTIONS') {
      applyCorsHeaders(response)
      response.statusCode = 204
      response.end()
      return
    }
    if (request.method !== 'POST') {
      sendMethodNotAllowed(response)
      return
    }

    try {
      const body = await readRequestBody(request)
      const parsed = parseTtsRequestPayload(body)
      const ttsResult = await requestTtsAudioFromUpstream(parsed.payload)
      applyCorsHeaders(response)
      response.statusCode = 200
      response.setHeader('content-type', ttsResult.mimeType)
      response.end(ttsResult.audio)
    }
    catch (error) {
      const reason = stringifyError(error)
      if (
        reason === 'text is required'
        || reason.includes('tts request body is empty')
        || reason.includes('tts request body must be a json object')
      ) {
        sendJson(response, 400, {
          error: reason,
        })
        return
      }
      sendJson(response, 502, {
        error: 'tts proxy failed',
        reason,
      })
    }
  }

  const listSpeakers = async (
    request: DesktopElectronVoiceSpeakerListRequest = {},
  ): Promise<DesktopElectronVoiceSpeakerListResult> => {
    const provider = request.provider === 'openllm' ? 'openllm' : 'cosyvoice'
    const requestedBase = (request.baseUrl ?? '').trim()
    const baseUrl = normalizeBaseUrlWithFallback(
      requestedBase || (provider === 'cosyvoice' ? config.cosyvoiceBaseUrl : config.upstreamBaseUrl),
      provider === 'cosyvoice' ? config.cosyvoiceBaseUrl : config.upstreamBaseUrl,
    )

    if (provider !== 'cosyvoice') {
      return {
        provider,
        baseUrl,
        speakers: [],
        source: 'none',
        reason: 'speaker discovery is only implemented for cosyvoice provider',
      }
    }

    const managedBase = normalizeBaseUrlWithFallback(config.cosyvoiceBaseUrl, DEFAULT_COSYVOICE_BASE_URL)
    if (baseUrl === managedBase) {
      await ensureCosyVoiceReady()
    }

    const discoveryErrors: string[] = []
    for (const path of COSYVOICE_SPEAKER_DISCOVERY_PATHS) {
      const endpoint = (() => {
        try {
          return new URL(path, baseUrl).toString()
        }
        catch {
          return `${baseUrl.replace(/\/+$/, '')}${path}`
        }
      })()

      try {
        const response = await fetchWithTimeout(endpoint, {
          method: 'GET',
        }, 4000)
        if (!response.ok) {
          discoveryErrors.push(`${path}: status=${response.status}`)
          continue
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase()
        let speakers: string[] = []
        if (contentType.includes('application/json') || contentType.includes('text/json') || path === '/config') {
          const raw = await response.text()
          let parsed: unknown = null
          try {
            parsed = JSON.parse(raw)
          }
          catch {
            parsed = raw
          }
          speakers = parseSpeakerListFromUnknown(parsed)
        }
        else {
          const rawText = await response.text()
          speakers = parseSpeakerListFromText(rawText)
        }

        const normalized = normalizeSpeakerList(speakers)
        if (normalized.length > 0) {
          emit('info', `[voice-service] cosyvoice speakers discovered count=${normalized.length} endpoint=${endpoint}`)
          return {
            provider,
            baseUrl,
            speakers: normalized,
            source: 'endpoint',
            endpoint,
          }
        }

        discoveryErrors.push(`${path}: empty`)
      }
      catch (error) {
        discoveryErrors.push(`${path}: ${stringifyError(error)}`)
      }
    }

    emit('warn', `[voice-service] cosyvoice speaker discovery failed base=${baseUrl} reason=${discoveryErrors.join(' | ') || 'unknown'}`)
    return {
      provider,
      baseUrl,
      speakers: [...DEFAULT_COSYVOICE_SPEAKERS],
      source: 'fallback',
      reason: discoveryErrors.join(' | ') || 'speaker discovery failed',
    }
  }

  const startServers = async () => {
    if (!sttServer) {
      sttServer = createServer((request, response) => {
        if ((request.url || '').split('?')[0] !== '/stt') {
          sendJson(response, 404, {
            error: 'not found',
          })
          return
        }
        void forwardSttRequest(request, response)
      })
    }
    if (!ttsServer) {
      ttsServer = createServer((request, response) => {
        if ((request.url || '').split('?')[0] !== '/tts') {
          sendJson(response, 404, {
            error: 'not found',
          })
          return
        }
        void handleTtsRequest(request, response)
      })
    }

    const [sttMode, ttsMode] = await Promise.all([
      waitForServerListen(sttServer, config.sttPort, config.sttHost),
      waitForServerListen(ttsServer, config.ttsPort, config.ttsHost),
    ])

    status.adapter.sttMode = sttMode
    status.adapter.ttsMode = ttsMode

    if (sttMode === 'failed' || ttsMode === 'failed') {
      throw new Error(`voice adapter bind failed stt=${sttMode} tts=${ttsMode}`)
    }

    if (sttMode === 'external') {
      emit('warn', `[voice-service] STT endpoint already occupied, keeping external service: ${status.adapter.sttEndpoint}`)
      await closeServer(sttServer)
      sttServer = null
    }
    else {
      emit('info', `[voice-service] STT proxy ready: ${status.adapter.sttEndpoint}`)
    }

    if (ttsMode === 'external') {
      emit('warn', `[voice-service] TTS endpoint already occupied, keeping external service: ${status.adapter.ttsEndpoint}`)
      await closeServer(ttsServer)
      ttsServer = null
    }
    else {
      emit('info', `[voice-service] TTS proxy ready: ${status.adapter.ttsEndpoint}`)
    }
  }

  const start = async () => {
    if (startPromise) {
      return await startPromise
    }

    startPromise = (async () => {
      status.state = 'starting'
      status.lastError = ''
      status.upstream.launchAttempted = false
      status.cosyvoice.launchAttempted = false
      emit('info', '[voice-service] starting integrated voice service')

      try {
        await startServers()
        startHealthMonitor()
        void ensureUpstreamReady().then((healthy) => {
          if (healthy) {
            emit('info', `[voice-service] upstream ready: ${config.upstreamBaseUrl}`)
          }
          else {
            emit('warn', `[voice-service] upstream unavailable: ${config.upstreamBaseUrl}`)
          }
        })
        void ensureCosyVoiceReady().then((healthy) => {
          if (healthy) {
            emit('info', `[voice-service] cosyvoice ready: ${config.cosyvoiceBaseUrl}`)
          }
          else {
            emit('warn', `[voice-service] cosyvoice unavailable: ${config.cosyvoiceBaseUrl}`)
          }
        })
        status.state = 'running'
        return status
      }
      catch (error) {
        status.state = 'error'
        const reason = stringifyError(error)
        setLastError(reason)
        return status
      }
      finally {
        startPromise = null
      }
    })()

    return await startPromise
  }

  const stop = async () => {
    if (healthMonitorTimer) {
      clearInterval(healthMonitorTimer)
      healthMonitorTimer = null
    }
    await Promise.all([
      closeServer(sttServer),
      closeServer(ttsServer),
    ])
    sttServer = null
    ttsServer = null

    if (upstreamProcess) {
      try {
        upstreamProcess.kill('SIGTERM')
      }
      catch {
        // noop
      }
      upstreamProcess = null
      status.upstream.pid = undefined
    }
    if (cosyvoiceProcess) {
      try {
        cosyvoiceProcess.kill('SIGTERM')
      }
      catch {
        // noop
      }
      cosyvoiceProcess = null
      status.cosyvoice.pid = undefined
    }

    status.state = 'stopped'
    status.upstream.healthy = false
    status.cosyvoice.healthy = false
    upstreamLaunchPromise = null
    cosyvoiceLaunchPromise = null
    status.lastError = ''
    emit('info', '[voice-service] stopped integrated voice service')

    return status
  }

  return {
    start,
    stop,
    listSpeakers,
    getStatus() {
      return {
        ...status,
        adapter: {
          ...status.adapter,
        },
        upstream: {
          ...status.upstream,
        },
        cosyvoice: {
          ...status.cosyvoice,
        },
      }
    },
  }
}
