<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  draftMessage: string
  voiceSupported?: boolean
  voiceListening?: boolean
  voiceInterimText?: string
  voiceInputEngineId?: string
  voiceInputEngineOptions?: Array<{ id: string, label: string }>
  voiceHttpSttEndpoint?: string
  voiceHttpSttEndpointError?: string
  voiceDiagnosticsRunning?: boolean
  voiceDiagnosticBadge?: string
  voiceDiagnosticBadgeTone?: 'idle' | 'running' | 'ok' | 'partial' | 'failed'
  voiceDiagnosticBadgeRecheck?: boolean
  voiceDiagnosticSummary?: string
  voiceDiagnosticSuggestions?: string[]
  voiceDiagnosticActions?: Array<{
    id: string
    label: string
    description: string
    changePreview?: string
    recommended?: boolean
  }>
  voiceOutputEnabled?: boolean
  voiceEngineId?: string
  voiceEngineOptions?: Array<{ id: string, label: string }>
  voiceTtsProviderId?: string
  voiceTtsProviderOptions?: Array<{ id: string, label: string }>
  voiceCosyVoiceModeId?: string
  voiceCosyVoiceModeOptions?: Array<{ id: string, label: string }>
  voiceCosyVoiceBaseUrl?: string
  voiceCosyVoiceSpeakerId?: string
  voiceCosyVoiceSpeakerOptions?: Array<{ id: string, label: string }>
  voiceCosyVoiceSpeakersLoading?: boolean
  voiceCosyVoiceSpeakersHint?: string
  voiceCosyVoicePromptText?: string
  voiceCosyVoicePromptWavPath?: string
  voiceCosyVoiceInstructText?: string
  voiceCosyVoiceSampleRate?: number
  voiceCosyVoiceSpeed?: number
  voicePresetId?: string
  voicePresetOptions?: Array<{ id: string, label: string }>
  voiceHttpEndpoint?: string
  voiceHttpEndpointError?: string
  voiceServiceSummary?: string
  voiceServicePhaseLabel?: string
  voiceServiceTone?: 'idle' | 'ok' | 'warn' | 'error'
  voiceServiceAvailable?: boolean | null
  voiceServiceBusy?: boolean
  voiceInputDisabled?: boolean
  voiceInputDisabledReason?: string
  voiceServiceBadges?: Array<{
    id: string
    label: string
    tone: 'idle' | 'ok' | 'warn' | 'error'
  }>
  voiceServiceNotice?: string
}>()

const emit = defineEmits<{
  updateDraft: [value: string]
  send: []
  toggleVoiceInput: []
  setVoiceInputEngine: [value: string]
  setVoiceHttpSttEndpoint: [value: string]
  setVoiceOutputEnabled: [value: boolean]
  setVoiceEngine: [value: string]
  setVoiceTtsProvider: [value: string]
  setVoiceCosyVoiceMode: [value: string]
  setVoiceCosyVoiceBaseUrl: [value: string]
  setVoiceCosyVoiceSpeakerId: [value: string]
  setVoiceCosyVoicePromptText: [value: string]
  setVoiceCosyVoicePromptWavPath: [value: string]
  setVoiceCosyVoiceInstructText: [value: string]
  setVoiceCosyVoiceSampleRate: [value: number]
  setVoiceCosyVoiceSpeed: [value: number]
  refreshVoiceCosyVoiceSpeakers: []
  setVoicePreset: [value: string]
  setVoiceHttpEndpoint: [value: string]
  runVoiceDiagnostics: []
  applyVoiceDiagnosticAction: [actionId: string]
  refreshVoiceService: []
  restartVoiceService: []
  imeDebug: [line: string]
}>()

const composerComposing = ref(false)
const composerCompositionLockUntil = ref(0)
const IME_COMPOSITION_GUARD_MS = 96
const localDraft = ref(props.draftMessage)
const pendingVoiceDiagnosticActionId = ref<string | null>(null)

watch(() => props.draftMessage, (nextDraft) => {
  if (composerComposing.value) {
    return
  }

  if (nextDraft === localDraft.value) {
    return
  }

  localDraft.value = nextDraft
})

function emitDraftUpdate(value: string) {
  emit('updateDraft', value)
}

function handleComposerBeforeInput(event: InputEvent) {
  emitImeDebug(`beforeinput type=${event.inputType} data=${event.data ?? ''} composing=${event.isComposing ? 1 : 0}`)
}

function isImeComposingKey(event: KeyboardEvent) {
  const native = event as KeyboardEvent & { keyCode?: number, which?: number }
  return event.isComposing
    || composerComposing.value
    || native.keyCode === 229
    || native.which === 229
    || Date.now() < composerCompositionLockUntil.value
}

function emitImeDebug(line: string) {
  emit('imeDebug', line)
}

function describeKeydown(event: KeyboardEvent) {
  const native = event as KeyboardEvent & { keyCode?: number, which?: number }
  return [
    `keydown key=${event.key}`,
    `code=${event.code || '-'}`,
    `shift=${event.shiftKey ? 1 : 0}`,
    `ctrl=${event.ctrlKey ? 1 : 0}`,
    `meta=${event.metaKey ? 1 : 0}`,
    `isComposing=${event.isComposing ? 1 : 0}`,
    `keyCode=${native.keyCode ?? -1}`,
    `which=${native.which ?? -1}`,
    `lock=${Date.now() < composerCompositionLockUntil.value ? 1 : 0}`,
  ].join(' ')
}

function handleComposerCompositionStart() {
  composerComposing.value = true
  emitImeDebug('compositionstart')
}

function handleComposerCompositionEnd() {
  composerComposing.value = false
  composerCompositionLockUntil.value = Date.now() + IME_COMPOSITION_GUARD_MS
  emitImeDebug(`compositionend lockMs=${IME_COMPOSITION_GUARD_MS}`)
  emitDraftUpdate(localDraft.value)
}

function handleComposerCompositionUpdate(event: CompositionEvent) {
  emitImeDebug(`compositionupdate data=${event.data ?? ''}`)
}

function handleComposerInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  localDraft.value = value
  emitImeDebug(`input len=${value.length}`)
  if (composerComposing.value) {
    emitImeDebug('input buffered while composing')
  }
}

function handleComposerBlur() {
  emitImeDebug('blur')
  emitDraftUpdate(localDraft.value)
}

function sendFromComposer() {
  emitImeDebug(`send click len=${localDraft.value.length}`)
  emitDraftUpdate(localDraft.value)
  emit('send')
}

function toggleVoiceInput() {
  emit('toggleVoiceInput')
}

function toggleVoiceOutput() {
  emit('setVoiceOutputEnabled', !(props.voiceOutputEnabled ?? true))
}

function handleVoicePresetChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('setVoicePreset', target.value)
}

function handleVoiceEngineChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('setVoiceEngine', target.value)
}

function handleVoiceTtsProviderChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('setVoiceTtsProvider', target.value)
}

function handleVoiceCosyVoiceModeChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('setVoiceCosyVoiceMode', target.value)
}

function handleVoiceCosyVoiceBaseUrlInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceCosyVoiceBaseUrl', target.value)
}

function handleVoiceCosyVoiceSpeakerIdInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceCosyVoiceSpeakerId', target.value)
}

function handleVoiceCosyVoicePromptTextInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceCosyVoicePromptText', target.value)
}

function handleVoiceCosyVoicePromptWavPathInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceCosyVoicePromptWavPath', target.value)
}

function handleVoiceCosyVoiceInstructTextInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceCosyVoiceInstructText', target.value)
}

function handleVoiceCosyVoiceSampleRateInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = Number(target.value)
  if (Number.isFinite(parsed)) {
    emit('setVoiceCosyVoiceSampleRate', parsed)
  }
}

function handleVoiceCosyVoiceSpeedInput(event: Event) {
  const target = event.target as HTMLInputElement
  const parsed = Number(target.value)
  if (Number.isFinite(parsed)) {
    emit('setVoiceCosyVoiceSpeed', parsed)
  }
}

function handleRefreshVoiceCosyVoiceSpeakers() {
  emit('refreshVoiceCosyVoiceSpeakers')
}

function handleVoiceHttpEndpointInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceHttpEndpoint', target.value)
}

function handleVoiceInputEngineChange(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('setVoiceInputEngine', target.value)
}

function handleVoiceHttpSttEndpointInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('setVoiceHttpSttEndpoint', target.value)
}

function runVoiceDiagnostics() {
  emit('runVoiceDiagnostics')
}

function refreshVoiceService() {
  emit('refreshVoiceService')
}

function restartVoiceService() {
  emit('restartVoiceService')
}

function checkVoiceService() {
  emit('refreshVoiceService')
  emit('runVoiceDiagnostics')
}

const voiceServiceStatusLabel = computed(() => {
  if (props.voiceDiagnosticsRunning || props.voiceServiceBusy) {
    return '检测中'
  }
  if (props.voiceServicePhaseLabel && props.voiceServicePhaseLabel !== '未知') {
    return props.voiceServicePhaseLabel
  }
  if (props.voiceServiceAvailable === true) {
    return '可用'
  }
  if (props.voiceServiceAvailable === false) {
    return '不可用'
  }
  return '未知'
})

function applyVoiceDiagnosticAction(actionId: string) {
  const targetAction = (props.voiceDiagnosticActions ?? []).find(action => action.id === actionId)
  if (!targetAction) {
    return
  }

  if (pendingVoiceDiagnosticActionId.value === actionId) {
    emit('applyVoiceDiagnosticAction', actionId)
    pendingVoiceDiagnosticActionId.value = null
    return
  }

  pendingVoiceDiagnosticActionId.value = actionId
}

function cancelPendingVoiceDiagnosticAction() {
  pendingVoiceDiagnosticActionId.value = null
}

function confirmPendingVoiceDiagnosticAction() {
  if (!pendingVoiceDiagnosticActionId.value) {
    return
  }
  emit('applyVoiceDiagnosticAction', pendingVoiceDiagnosticActionId.value)
  pendingVoiceDiagnosticActionId.value = null
}

watch(() => props.voiceDiagnosticActions, (nextActions) => {
  if (!pendingVoiceDiagnosticActionId.value) {
    return
  }

  const stillExists = (nextActions ?? []).some(
    action => action.id === pendingVoiceDiagnosticActionId.value,
  )
  if (!stillExists) {
    pendingVoiceDiagnosticActionId.value = null
  }
}, { deep: true })

watch(() => props.voiceDiagnosticsRunning, (running) => {
  if (running) {
    pendingVoiceDiagnosticActionId.value = null
  }
})

function handleComposerKeydown(event: KeyboardEvent) {
  emitImeDebug(describeKeydown(event))

  if (event.key !== 'Enter') {
    return
  }

  if (event.shiftKey) {
    return
  }

  if (isImeComposingKey(event)) {
    emitImeDebug('enter blocked by ime/composition guard')
    return
  }

  event.preventDefault()
  emitImeDebug('enter accepted -> send')
  sendFromComposer()
}
</script>

<template>
  <section class="chat-panel">
    <header class="chat-panel__header">
      <h2>Chat</h2>
      <span>Enter 发送 · Shift+Enter 换行</span>
    </header>
    <p class="chat-panel__hint">Assistant output is shown in the speech bubble near avatar.</p>
    <label class="chat-panel__composer">
      <span>Message</span>
      <textarea
        data-action="chat-input"
        :value="localDraft"
        rows="4"
        placeholder="输入消息，按 Enter 发送"
        autocomplete="off"
        spellcheck="false"
        lang="zh-CN"
        @input="handleComposerInput"
        @beforeinput="handleComposerBeforeInput"
        @compositionstart="handleComposerCompositionStart"
        @compositionupdate="handleComposerCompositionUpdate"
        @compositionend="handleComposerCompositionEnd"
        @compositioncancel="handleComposerCompositionEnd"
        @focus="emitImeDebug('focus')"
        @blur="handleComposerBlur"
        @keydown="handleComposerKeydown"
      />
    </label>
    <div class="chat-panel__quick-actions">
      <button class="chat-panel__button" data-action="chat-send" type="button" @click="sendFromComposer">
        Send
      </button>
      <button
        v-if="props.voiceSupported"
        :class="[
          'chat-panel__status-button',
          `chat-panel__status-button--${props.voiceServiceTone ?? 'idle'}`,
        ]"
        data-action="chat-voice-service-status"
        type="button"
        :disabled="props.voiceServiceBusy || props.voiceDiagnosticsRunning"
        :title="props.voiceServiceSummary || 'voice service'"
        @click="checkVoiceService"
      >
        语音服务 · {{ voiceServiceStatusLabel }}
      </button>
      <button
        v-if="props.voiceSupported"
        :class="[
          'chat-panel__mic-button',
          { 'chat-panel__mic-button--listening': props.voiceListening },
        ]"
        data-action="chat-voice-toggle"
        type="button"
        :aria-pressed="props.voiceListening ? 'true' : 'false'"
        :disabled="props.voiceInputDisabled"
        :title="props.voiceInputDisabledReason || ''"
        @click="toggleVoiceInput"
      >
        <span class="chat-panel__mic-icon" aria-hidden="true" />
      </button>
      <label
        v-if="props.voiceSupported"
        class="chat-panel__voice-preset-inline"
        title="切换语音声线"
      >
        <span>声线</span>
        <select
          data-action="chat-voice-preset-select"
          :value="props.voicePresetId"
          @change="handleVoicePresetChange"
        >
          <option
            v-for="preset in (props.voicePresetOptions ?? [])"
            :key="preset.id"
            :value="preset.id"
          >
            {{ preset.label }}
          </option>
        </select>
      </label>
    </div>
    <div v-if="props.voiceSupported" class="chat-panel__voice">
      <p
        v-if="props.voiceInputDisabledReason"
        class="chat-panel__voice-readiness"
        data-role="chat-voice-readiness"
      >
        {{ props.voiceInputDisabledReason }}
      </p>
      <p
        v-if="props.voiceServiceNotice"
        class="chat-panel__voice-service-notice"
        data-role="chat-voice-service-notice"
      >
        {{ props.voiceServiceNotice }}
      </p>
      <p
        :class="[
          'chat-panel__voice-service-summary',
          `chat-panel__voice-service-summary--${props.voiceServiceTone ?? 'idle'}`,
        ]"
      >
        {{ props.voiceServiceSummary || '语音服务：未知' }}
      </p>
      <p v-if="props.voiceInterimText" class="chat-panel__voice-preview" data-role="chat-voice-interim">
        {{ props.voiceInterimText }}
      </p>

      <details class="chat-panel__voice-settings" data-role="chat-settings">
        <summary>设置</summary>
        <div class="chat-panel__voice-settings-body">
          <p class="chat-panel__settings-section-title">语音</p>
          <div class="chat-panel__voice-row chat-panel__voice-row--actions">
            <button
              class="chat-panel__button chat-panel__button--voice-output"
              data-action="chat-voice-output-toggle"
              type="button"
              :aria-pressed="props.voiceOutputEnabled === false ? 'false' : 'true'"
              @click="toggleVoiceOutput"
            >
              {{ props.voiceOutputEnabled === false ? '开启语音输出' : '关闭语音输出' }}
            </button>
            <button
              class="chat-panel__button chat-panel__button--diag"
              data-action="chat-voice-diagnostics"
              type="button"
              :disabled="props.voiceDiagnosticsRunning"
              @click="runVoiceDiagnostics"
            >
              {{ props.voiceDiagnosticsRunning ? '诊断中...' : '诊断语音服务' }}
            </button>
            <button
              class="chat-panel__button chat-panel__button--diag"
              data-action="chat-voice-service-refresh"
              type="button"
              :disabled="props.voiceServiceBusy"
              @click="refreshVoiceService"
            >
              {{ props.voiceServiceBusy ? '刷新中...' : '刷新语音服务' }}
            </button>
            <button
              class="chat-panel__button chat-panel__button--diag"
              data-action="chat-voice-service-restart"
              type="button"
              :disabled="props.voiceServiceBusy"
              @click="restartVoiceService"
            >
              {{ props.voiceServiceBusy ? '重启中...' : '重启语音服务' }}
            </button>
          </div>
          <div class="chat-panel__voice-row chat-panel__voice-row--selectors">
            <label class="chat-panel__voice-preset">
              <span>输入引擎</span>
              <select
                data-action="chat-voice-input-engine-select"
                :value="props.voiceInputEngineId"
                @change="handleVoiceInputEngineChange"
              >
                <option
                  v-for="engine in (props.voiceInputEngineOptions ?? [])"
                  :key="engine.id"
                  :value="engine.id"
                >
                  {{ engine.label }}
                </option>
              </select>
            </label>
            <label class="chat-panel__voice-preset">
              <span>输出引擎</span>
              <select
                data-action="chat-voice-engine-select"
                :value="props.voiceEngineId"
                @change="handleVoiceEngineChange"
              >
                <option
                  v-for="engine in (props.voiceEngineOptions ?? [])"
                  :key="engine.id"
                  :value="engine.id"
                >
                  {{ engine.label }}
                </option>
              </select>
            </label>
            <label
              v-if="props.voiceEngineId === 'http_tts'"
              class="chat-panel__voice-preset"
            >
              <span>TTS Provider</span>
              <select
                data-action="chat-voice-tts-provider-select"
                :value="props.voiceTtsProviderId ?? 'openllm'"
                @change="handleVoiceTtsProviderChange"
              >
                <option
                  v-for="provider in (props.voiceTtsProviderOptions ?? [])"
                  :key="provider.id"
                  :value="provider.id"
                >
                  {{ provider.label }}
                </option>
              </select>
            </label>
          </div>
          <label
            v-if="props.voiceInputEngineId === 'http_stt'"
            class="chat-panel__voice-endpoint"
          >
            <span>HTTP STT 地址</span>
            <input
              data-action="chat-voice-input-endpoint-input"
              type="text"
              :value="props.voiceHttpSttEndpoint ?? ''"
              placeholder="http://127.0.0.1:8788/stt"
              :aria-invalid="props.voiceHttpSttEndpointError ? 'true' : 'false'"
              @input="handleVoiceHttpSttEndpointInput"
            >
          </label>
          <p
            v-if="props.voiceHttpSttEndpointError"
            class="chat-panel__voice-endpoint-error"
            data-role="chat-voice-input-endpoint-error"
          >
            {{ props.voiceHttpSttEndpointError }}
          </p>
          <label
            v-if="props.voiceEngineId === 'http_tts'"
            class="chat-panel__voice-endpoint"
          >
            <span>HTTP TTS 地址</span>
            <input
              data-action="chat-voice-endpoint-input"
              type="text"
              :value="props.voiceHttpEndpoint ?? ''"
              placeholder="http://127.0.0.1:8787/tts"
              :aria-invalid="props.voiceHttpEndpointError ? 'true' : 'false'"
              @input="handleVoiceHttpEndpointInput"
            >
          </label>
          <p
            v-if="props.voiceHttpEndpointError"
            class="chat-panel__voice-endpoint-error"
            data-role="chat-voice-endpoint-error"
          >
            {{ props.voiceHttpEndpointError }}
          </p>
          <div
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-row chat-panel__voice-row--selectors"
          >
            <label class="chat-panel__voice-preset">
              <span>CosyVoice 模式</span>
              <select
                data-action="chat-cosyvoice-mode-select"
                :value="props.voiceCosyVoiceModeId ?? 'sft'"
                @change="handleVoiceCosyVoiceModeChange"
              >
                <option
                  v-for="mode in (props.voiceCosyVoiceModeOptions ?? [])"
                  :key="mode.id"
                  :value="mode.id"
                >
                  {{ mode.label }}
                </option>
              </select>
            </label>
            <label class="chat-panel__voice-preset">
              <span>采样率</span>
              <input
                data-action="chat-cosyvoice-sample-rate-input"
                type="number"
                min="8000"
                max="96000"
                step="50"
                :value="props.voiceCosyVoiceSampleRate ?? 22050"
                @input="handleVoiceCosyVoiceSampleRateInput"
              >
            </label>
            <label class="chat-panel__voice-preset">
              <span>语速</span>
              <input
                data-action="chat-cosyvoice-speed-input"
                type="number"
                min="0.5"
                max="2.0"
                step="0.05"
                :value="props.voiceCosyVoiceSpeed ?? 1"
                @input="handleVoiceCosyVoiceSpeedInput"
              >
            </label>
          </div>
          <label
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-endpoint"
          >
            <span>CosyVoice Base URL</span>
            <input
              data-action="chat-cosyvoice-base-url-input"
              type="text"
              :value="props.voiceCosyVoiceBaseUrl ?? ''"
              placeholder="http://127.0.0.1:50000"
              @input="handleVoiceCosyVoiceBaseUrlInput"
            >
          </label>
          <label
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-endpoint"
          >
            <span>spk_id（可编辑）</span>
            <input
              data-action="chat-cosyvoice-speaker-id-input"
              type="text"
              :value="props.voiceCosyVoiceSpeakerId ?? ''"
              list="chat-cosyvoice-speakers"
              placeholder="中文女 / 中文男 / 自定义spk_id"
              @input="handleVoiceCosyVoiceSpeakerIdInput"
            >
            <datalist id="chat-cosyvoice-speakers">
              <option
                v-for="speaker in (props.voiceCosyVoiceSpeakerOptions ?? [])"
                :key="speaker.id"
                :value="speaker.id"
              >
                {{ speaker.label }}
              </option>
            </datalist>
          </label>
          <div
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-service-actions"
          >
            <button
              type="button"
              class="chat-panel__button chat-panel__button--diag"
              data-action="chat-cosyvoice-refresh-speakers"
              :disabled="props.voiceCosyVoiceSpeakersLoading"
              @click="handleRefreshVoiceCosyVoiceSpeakers"
            >
              {{ props.voiceCosyVoiceSpeakersLoading ? '读取中...' : '自动读取声线' }}
            </button>
            <p
              v-if="props.voiceCosyVoiceSpeakersHint"
              class="chat-panel__voice-readiness"
              data-role="chat-cosyvoice-speaker-hint"
            >
              {{ props.voiceCosyVoiceSpeakersHint }}
            </p>
          </div>
          <label
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-endpoint"
          >
            <span>prompt_text（zero-shot）</span>
            <input
              data-action="chat-cosyvoice-prompt-text-input"
              type="text"
              :value="props.voiceCosyVoicePromptText ?? ''"
              placeholder="与参考音频一致的一句话"
              @input="handleVoiceCosyVoicePromptTextInput"
            >
          </label>
          <label
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-endpoint"
          >
            <span>prompt_wav（本地路径或URL）</span>
            <input
              data-action="chat-cosyvoice-prompt-wav-input"
              type="text"
              :value="props.voiceCosyVoicePromptWavPath ?? ''"
              placeholder="D:\\voice\\sample.wav 或 http://..."
              @input="handleVoiceCosyVoicePromptWavPathInput"
            >
          </label>
          <label
            v-if="props.voiceEngineId === 'http_tts' && props.voiceTtsProviderId === 'cosyvoice'"
            class="chat-panel__voice-endpoint"
          >
            <span>instruct_text（可选）</span>
            <input
              data-action="chat-cosyvoice-instruct-text-input"
              type="text"
              :value="props.voiceCosyVoiceInstructText ?? ''"
              placeholder="例如：请用温柔的语气慢速说"
              @input="handleVoiceCosyVoiceInstructTextInput"
            >
          </label>
          <p
            v-if="props.voiceDiagnosticBadge"
            :class="[
              'chat-panel__diagnostics-badge',
              `chat-panel__diagnostics-badge--${props.voiceDiagnosticBadgeTone ?? 'idle'}`,
              { 'chat-panel__diagnostics-badge--recheck': props.voiceDiagnosticBadgeRecheck },
            ]"
            data-role="chat-voice-diagnostics-badge"
          >
            {{ props.voiceDiagnosticBadge }}
          </p>
          <section
            v-if="props.voiceDiagnosticSummary || (props.voiceDiagnosticSuggestions?.length ?? 0) > 0"
            class="chat-panel__diagnostics"
            data-role="chat-voice-diagnostics"
          >
            <p v-if="props.voiceDiagnosticSummary" class="chat-panel__diagnostics-summary">
              {{ props.voiceDiagnosticSummary }}
            </p>
            <ul v-if="(props.voiceDiagnosticSuggestions?.length ?? 0) > 0" class="chat-panel__diagnostics-list">
              <li v-for="item in (props.voiceDiagnosticSuggestions ?? [])" :key="item">
                {{ item }}
              </li>
            </ul>
            <div
              v-if="(props.voiceDiagnosticActions?.length ?? 0) > 0"
              class="chat-panel__diagnostics-actions"
            >
              <button
                v-for="(action, index) in (props.voiceDiagnosticActions ?? [])"
                :key="action.id"
                type="button"
                class="chat-panel__diag-action"
                :data-action="`chat-voice-diagnostic-action-${index}`"
                :data-action-id="action.id"
                :title="action.description"
                @click="applyVoiceDiagnosticAction(action.id)"
              >
                {{ action.recommended ? `推荐：${action.label}` : action.label }}
              </button>
            </div>
            <div
              v-if="pendingVoiceDiagnosticActionId"
              class="chat-panel__diag-confirm"
              data-role="chat-voice-diagnostic-confirm"
            >
              <p class="chat-panel__diag-confirm-title">
                确认应用诊断修复
              </p>
              <p class="chat-panel__diag-confirm-text">
                {{
                  (props.voiceDiagnosticActions ?? []).find(
                    action => action.id === pendingVoiceDiagnosticActionId,
                  )?.changePreview
                  ?? '此操作将更新聊天语音设置。'
                }}
              </p>
              <div class="chat-panel__diag-confirm-actions">
                <button
                  type="button"
                  class="chat-panel__diag-confirm-button"
                  data-action="chat-voice-diagnostic-confirm"
                  @click="confirmPendingVoiceDiagnosticAction"
                >
                  应用
                </button>
                <button
                  type="button"
                  class="chat-panel__diag-cancel-button"
                  data-action="chat-voice-diagnostic-cancel"
                  @click="cancelPendingVoiceDiagnosticAction"
                >
                  取消
                </button>
              </div>
            </div>
          </section>
        </div>
      </details>
    </div>
    <p v-else class="chat-panel__voice-unsupported">
      当前运行环境不支持语音输入。
    </p>
  </section>
</template>

<style scoped>
.chat-panel {
  display: grid;
  gap: 13px;
  padding: 15px;
  border: 1px solid rgba(79, 48, 18, 0.34);
  border-radius: 18px;
  background:
    radial-gradient(circle at 14% 10%, rgba(255, 255, 255, 0.88), transparent 50%),
    linear-gradient(168deg, rgba(253, 245, 232, 0.96) 0%, rgba(241, 224, 196, 0.97) 100%);
  box-shadow: 0 16px 30px rgba(66, 39, 17, 0.16);
}

.chat-panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.chat-panel__header h2 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.chat-panel__header span {
  font-size: 0.68rem;
  color: #6f4a27;
  font-weight: 700;
}

.chat-panel__composer span {
  margin: 0;
  font-size: 0.78rem;
}

.chat-panel__hint {
  margin: 0;
  color: #6b4927;
  font-size: 0.78rem;
  font-weight: 600;
}

.chat-panel__composer {
  display: grid;
  gap: 8px;
}

.chat-panel__composer span {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6a431f;
}

.chat-panel__composer textarea {
  width: 100%;
  min-height: 108px;
  box-sizing: border-box;
  resize: vertical;
  border: 1.5px solid rgba(96, 60, 24, 0.3);
  border-radius: 14px;
  padding: 0.86rem 0.95rem;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(253, 248, 240, 0.96) 100%);
  color: #281d12;
  font: inherit;
  line-height: 1.38;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.chat-panel__composer textarea::placeholder {
  color: rgba(86, 61, 37, 0.72);
}

.chat-panel__composer textarea:focus {
  outline: none;
  border-color: rgba(129, 83, 38, 0.64);
  box-shadow: 0 0 0 3px rgba(178, 124, 68, 0.2);
  background: rgba(255, 255, 255, 0.99);
}

.chat-panel__button {
  justify-self: start;
  border: 0;
  border-radius: 999px;
  padding: 0.72rem 1.05rem;
  background: linear-gradient(165deg, #74461a 0%, #ae6f30 100%);
  color: #fff8f1;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 14px rgba(86, 53, 20, 0.22);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
}

.chat-panel__quick-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-panel__voice-preset-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 0.58rem;
  border-radius: 999px;
  border: 1px solid rgba(67, 86, 103, 0.32);
  background: rgba(245, 249, 252, 0.86);
  color: #2a4154;
  font-size: 0.72rem;
  font-weight: 700;
}

.chat-panel__voice-preset-inline select {
  min-width: 84px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  cursor: pointer;
}

.chat-panel__status-button {
  border: 0;
  border-radius: 999px;
  padding: 0.62rem 0.94rem;
  color: #eff8ff;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  background: linear-gradient(165deg, #5f7282 0%, #7f93a3 100%);
  box-shadow: 0 8px 14px rgba(45, 61, 76, 0.24);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}

.chat-panel__status-button--ok {
  background: linear-gradient(165deg, #2f6f3b 0%, #4fae62 100%);
}

.chat-panel__status-button--warn {
  background: linear-gradient(165deg, #8a6329 0%, #c38e37 100%);
}

.chat-panel__status-button--error {
  background: linear-gradient(165deg, #8e3131 0%, #c84c4c 100%);
}

.chat-panel__status-button:hover {
  filter: brightness(1.03);
}

.chat-panel__status-button:disabled {
  cursor: default;
  filter: grayscale(0.2);
  opacity: 0.76;
}

.chat-panel__mic-button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: linear-gradient(165deg, #2e7f43 0%, #4ebd69 100%);
  box-shadow: 0 8px 14px rgba(34, 98, 53, 0.28);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}

.chat-panel__mic-button--listening {
  background: linear-gradient(165deg, #8c2f2f 0%, #c44b4b 100%);
  box-shadow: 0 8px 14px rgba(113, 35, 35, 0.32);
}

.chat-panel__mic-button:disabled {
  cursor: default;
  filter: grayscale(0.28);
  opacity: 0.74;
}

.chat-panel__mic-icon {
  width: 12px;
  height: 16px;
  position: relative;
  border: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-sizing: border-box;
}

.chat-panel__mic-icon::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -7px;
  width: 2px;
  height: 7px;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
}

.chat-panel__mic-icon::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  width: 10px;
  height: 6px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.95);
  border-radius: 0 0 8px 8px;
  transform: translateX(-50%);
}

.chat-panel__button--voice {
  background: linear-gradient(165deg, #1e556f 0%, #2f8fb7 100%);
}

.chat-panel__button--voice-output {
  background: linear-gradient(165deg, #3f5d2b 0%, #5e8a3e 100%);
}

.chat-panel__button--diag {
  background: linear-gradient(165deg, #6a3b7f 0%, #8d4cad 100%);
}

.chat-panel__voice {
  display: grid;
  gap: 8px;
}

.chat-panel__voice-settings {
  margin-top: 4px;
  border: 1px dashed rgba(93, 68, 36, 0.28);
  border-radius: 12px;
  padding: 0.46rem 0.58rem;
  background: linear-gradient(180deg, rgba(255, 252, 247, 0.75) 0%, rgba(251, 244, 234, 0.56) 100%);
}

.chat-panel__voice-settings > summary {
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 800;
  color: #6a4724;
  letter-spacing: 0.01em;
  user-select: none;
  list-style: none;
}

.chat-panel__voice-settings > summary::-webkit-details-marker {
  display: none;
}

.chat-panel__voice-settings > summary::after {
  content: '▾';
  margin-left: 8px;
  font-size: 0.7rem;
  color: rgba(103, 70, 34, 0.78);
}

.chat-panel__voice-settings[open] > summary::after {
  content: '▴';
}

.chat-panel__voice-settings-body {
  margin-top: 10px;
  display: grid;
  gap: 10px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chat-panel__settings-section-title {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  color: #6a4724;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.chat-panel__voice-row {
  display: grid;
  gap: 10px;
}

.chat-panel__voice-row--actions {
  grid-column: 1 / -1;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.chat-panel__voice-row--selectors {
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chat-panel__voice-preset {
  display: grid;
  gap: 4px;
  font-size: 0.72rem;
  color: #654321;
  font-weight: 700;
}

.chat-panel__voice-preset select {
  border: 1.5px solid rgba(96, 60, 24, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  color: #281d12;
  font: inherit;
  padding: 0.36rem 0.5rem;
}

.chat-panel__voice-preset input {
  border: 1.5px solid rgba(96, 60, 24, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  color: #281d12;
  font: inherit;
  padding: 0.36rem 0.5rem;
}

.chat-panel__voice-endpoint {
  display: grid;
  gap: 4px;
  grid-column: 1 / -1;
}

.chat-panel__voice-endpoint span {
  font-size: 0.72rem;
  color: #654321;
  font-weight: 700;
}

.chat-panel__voice-endpoint input {
  border: 1.5px solid rgba(96, 60, 24, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.95);
  color: #281d12;
  font: inherit;
  padding: 0.44rem 0.55rem;
}

.chat-panel__voice-endpoint-error {
  margin: -2px 0 0;
  color: #9b2f2f;
  font-size: 0.72rem;
  font-weight: 700;
}

.chat-panel__voice-readiness {
  margin: -2px 0 0;
  color: #7b531f;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.35;
}

.chat-panel__voice-service {
  display: grid;
  gap: 6px;
  padding: 0.55rem 0.64rem;
  border-radius: 10px;
  border: 1px solid rgba(34, 73, 104, 0.34);
  background: rgba(214, 234, 248, 0.54);
}

.chat-panel__voice-service-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-panel__voice-service-badge {
  border-radius: 999px;
  padding: 0.16rem 0.5rem;
  font-size: 0.66rem;
  line-height: 1.2;
  font-weight: 700;
  background: rgba(42, 83, 117, 0.14);
  border: 1px solid rgba(43, 91, 129, 0.24);
  color: #224863;
}

.chat-panel__voice-service-badge--ok {
  background: rgba(53, 140, 73, 0.16);
  border-color: rgba(40, 117, 57, 0.3);
  color: #1d6030;
}

.chat-panel__voice-service-badge--warn {
  background: rgba(209, 149, 32, 0.18);
  border-color: rgba(167, 118, 22, 0.34);
  color: #7f5216;
}

.chat-panel__voice-service-badge--error {
  background: rgba(191, 55, 55, 0.18);
  border-color: rgba(151, 40, 40, 0.34);
  color: #8b2424;
}

.chat-panel__voice-service-notice {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: #633d1b;
  font-weight: 700;
}

.chat-panel__voice-service-summary {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: #234a66;
  word-break: break-word;
}

.chat-panel__voice-service-summary--ok {
  color: #255d31;
}

.chat-panel__voice-service-summary--warn {
  color: #855b27;
}

.chat-panel__voice-service-summary--error {
  color: #9b2f2f;
}

.chat-panel__voice-service-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-panel__diagnostics {
  display: grid;
  gap: 6px;
  padding: 0.55rem 0.64rem;
  border-radius: 10px;
  border: 1px solid rgba(107, 74, 135, 0.34);
  background: rgba(241, 230, 250, 0.56);
  grid-column: 1 / -1;
}

.chat-panel__diagnostics-summary {
  margin: 0;
  color: #532f6d;
  font-size: 0.78rem;
  font-weight: 700;
}

.chat-panel__diagnostics-badge {
  margin: 0;
  font-size: 0.72rem;
  color: #5f3f78;
  font-weight: 700;
}

.chat-panel__diagnostics-badge--ok {
  color: #2a6d3b;
}

.chat-panel__diagnostics-badge--partial {
  color: #845922;
}

.chat-panel__diagnostics-badge--failed {
  color: #9b2f2f;
}

.chat-panel__diagnostics-badge--running {
  color: #3b6188;
}

.chat-panel__diagnostics-badge--recheck {
  background: rgba(82, 139, 206, 0.14);
  border: 1px solid rgba(62, 113, 173, 0.32);
  border-radius: 999px;
  padding: 0.18rem 0.5rem;
  justify-self: start;
}

.chat-panel__diagnostics-list {
  margin: 0;
  padding-left: 1.05rem;
  color: #5c3d73;
  font-size: 0.74rem;
  line-height: 1.35;
}

.chat-panel__diagnostics-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-panel__diag-action {
  border: 0;
  border-radius: 999px;
  padding: 0.42rem 0.66rem;
  background: linear-gradient(165deg, #58306e 0%, #7c4b96 100%);
  color: #f8efff;
  font: inherit;
  font-size: 0.73rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 12px rgba(61, 32, 78, 0.24);
}

.chat-panel__diag-action:hover {
  filter: brightness(1.04);
}

.chat-panel__diag-confirm {
  display: grid;
  gap: 6px;
  padding: 0.5rem 0.58rem;
  border-radius: 10px;
  border: 1px solid rgba(95, 60, 122, 0.4);
  background: rgba(255, 255, 255, 0.45);
}

.chat-panel__diag-confirm-title {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 800;
  color: #4c2f62;
}

.chat-panel__diag-confirm-text {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.32;
  color: #5e3e75;
}

.chat-panel__diag-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-panel__diag-confirm-button,
.chat-panel__diag-cancel-button {
  border: 0;
  border-radius: 999px;
  padding: 0.38rem 0.64rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.chat-panel__diag-confirm-button {
  background: linear-gradient(165deg, #58306e 0%, #7c4b96 100%);
  color: #f8efff;
}

.chat-panel__diag-cancel-button {
  background: rgba(102, 77, 128, 0.14);
  color: #5b3b71;
}

.chat-panel__voice-preview {
  margin: 0;
  padding: 0.5rem 0.64rem;
  border-radius: 10px;
  border: 1px dashed rgba(35, 102, 130, 0.45);
  background: rgba(207, 237, 247, 0.56);
  color: #144258;
  font-size: 0.82rem;
  line-height: 1.3;
  grid-column: 1 / -1;
}

.chat-panel__voice-unsupported {
  margin: 0;
  color: #765938;
  font-size: 0.74rem;
}

.chat-panel__button:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(86, 53, 20, 0.26);
}

.chat-panel__mic-button:hover,
.chat-panel__status-button:hover {
  transform: translateY(-1px);
}

@media (prefers-color-scheme: dark) {
  .chat-panel {
    border-color: rgba(255, 224, 189, 0.24);
    background:
      radial-gradient(circle at 14% 10%, rgba(255, 255, 255, 0.06), transparent 52%),
      linear-gradient(168deg, rgba(54, 39, 28, 0.92) 0%, rgba(43, 31, 22, 0.94) 100%);
    box-shadow: 0 18px 30px rgba(0, 0, 0, 0.34);
  }

  .chat-panel__header h2,
  .chat-panel__composer span {
    color: #f6dfc2;
  }

  .chat-panel__header span,
  .chat-panel__hint {
    color: rgba(241, 213, 181, 0.84);
  }

  .chat-panel__composer textarea {
    border-color: rgba(251, 217, 176, 0.3);
    background: linear-gradient(180deg, rgba(66, 48, 34, 0.95) 0%, rgba(53, 39, 28, 0.94) 100%);
    color: #fff3e3;
  }

  .chat-panel__composer textarea::placeholder {
    color: rgba(247, 219, 186, 0.64);
  }

  .chat-panel__composer textarea:focus {
    border-color: rgba(255, 211, 166, 0.72);
    box-shadow: 0 0 0 3px rgba(255, 193, 130, 0.18);
    background: rgba(76, 56, 39, 0.98);
  }

  .chat-panel__voice-preview {
    border-color: rgba(173, 229, 252, 0.38);
    background: rgba(29, 66, 86, 0.52);
    color: #d6f1ff;
  }

  .chat-panel__voice-preset {
    color: rgba(245, 219, 186, 0.9);
  }

  .chat-panel__voice-preset select {
    border-color: rgba(251, 217, 176, 0.3);
    background: rgba(66, 48, 34, 0.95);
    color: #fff3e3;
  }

  .chat-panel__voice-preset input {
    border-color: rgba(251, 217, 176, 0.3);
    background: rgba(66, 48, 34, 0.95);
    color: #fff3e3;
  }

  .chat-panel__voice-preset-inline {
    border-color: rgba(204, 226, 245, 0.28);
    background: rgba(45, 67, 84, 0.68);
    color: #d6ebfa;
  }

  .chat-panel__status-button {
    color: #f1f8ff;
    background: linear-gradient(165deg, #546879 0%, #738899 100%);
  }

  .chat-panel__status-button--ok {
    background: linear-gradient(165deg, #2c6f3a 0%, #49a860 100%);
  }

  .chat-panel__status-button--warn {
    background: linear-gradient(165deg, #845f29 0%, #bb8a38 100%);
  }

  .chat-panel__status-button--error {
    background: linear-gradient(165deg, #873232 0%, #bd4a4a 100%);
  }

  .chat-panel__voice-settings {
    border-color: rgba(246, 221, 188, 0.28);
    background: rgba(70, 52, 37, 0.5);
  }

  .chat-panel__voice-settings > summary {
    color: rgba(245, 219, 186, 0.9);
  }

  .chat-panel__settings-section-title {
    color: rgba(245, 219, 186, 0.9);
  }

  .chat-panel__voice-settings > summary::after {
    color: rgba(241, 213, 181, 0.74);
  }

  .chat-panel__voice-endpoint span {
    color: rgba(245, 219, 186, 0.9);
  }

  .chat-panel__voice-endpoint input {
    border-color: rgba(251, 217, 176, 0.3);
    background: rgba(66, 48, 34, 0.95);
    color: #fff3e3;
  }

  .chat-panel__voice-endpoint-error {
    color: #ffc6c6;
  }

  .chat-panel__diagnostics {
    border-color: rgba(220, 184, 245, 0.35);
    background: rgba(69, 45, 88, 0.52);
  }

  .chat-panel__diagnostics-summary {
    color: #e9d4ff;
  }

  .chat-panel__diagnostics-badge {
    color: #e6d3f9;
  }

  .chat-panel__diagnostics-badge--ok {
    color: #b8f2c6;
  }

  .chat-panel__diagnostics-badge--partial {
    color: #ffe2a9;
  }

  .chat-panel__diagnostics-badge--failed {
    color: #ffc6c6;
  }

  .chat-panel__diagnostics-badge--running {
    color: #d2e8ff;
  }

  .chat-panel__diagnostics-badge--recheck {
    background: rgba(126, 176, 235, 0.18);
    border-color: rgba(173, 205, 242, 0.38);
  }

  .chat-panel__diagnostics-list {
    color: #e4cff8;
  }

  .chat-panel__diag-action {
    background: linear-gradient(165deg, #704089 0%, #9c66b9 100%);
    color: #fff4ff;
  }

  .chat-panel__diag-confirm {
    border-color: rgba(220, 184, 245, 0.35);
    background: rgba(82, 56, 102, 0.46);
  }

  .chat-panel__diag-confirm-title,
  .chat-panel__diag-confirm-text {
    color: #e6d3f9;
  }

  .chat-panel__diag-cancel-button {
    background: rgba(221, 195, 245, 0.2);
    color: #f2e4ff;
  }

  .chat-panel__voice-unsupported {
    color: rgba(241, 213, 181, 0.84);
  }
}

@media (max-width: 760px) {
  .chat-panel__voice-settings-body {
    grid-template-columns: 1fr;
  }

  .chat-panel__voice-row--selectors {
    grid-template-columns: 1fr;
  }
}
</style>
