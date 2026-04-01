<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  draftMessage: string
  voiceSupported?: boolean
  voiceListening?: boolean
  voiceInterimText?: string
}>()

const emit = defineEmits<{
  updateDraft: [value: string]
  send: []
  toggleVoiceInput: []
  imeDebug: [line: string]
}>()

const composerComposing = ref(false)
const composerCompositionLockUntil = ref(0)
const IME_COMPOSITION_GUARD_MS = 96
const localDraft = ref(props.draftMessage)

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
    <button class="chat-panel__button" data-action="chat-send" type="button" @click="sendFromComposer">
      Send
    </button>
    <div v-if="props.voiceSupported" class="chat-panel__voice">
      <button
        class="chat-panel__button chat-panel__button--voice"
        data-action="chat-voice-toggle"
        type="button"
        :aria-pressed="props.voiceListening ? 'true' : 'false'"
        @click="toggleVoiceInput"
      >
        {{ props.voiceListening ? 'Stop Voice Input' : 'Start Voice Input' }}
      </button>
      <p v-if="props.voiceInterimText" class="chat-panel__voice-preview" data-role="chat-voice-interim">
        {{ props.voiceInterimText }}
      </p>
    </div>
    <p v-else class="chat-panel__voice-unsupported">
      Voice input is unavailable in this runtime.
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

.chat-panel__button--voice {
  background: linear-gradient(165deg, #1e556f 0%, #2f8fb7 100%);
}

.chat-panel__voice {
  display: grid;
  gap: 8px;
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

  .chat-panel__voice-unsupported {
    color: rgba(241, 213, 181, 0.84);
  }
}
</style>
