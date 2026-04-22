<script setup lang="ts">
defineProps<{
  url: string
  token: string
  password: string
  sessionKey: string
}>()

const emit = defineEmits<{
  updateField: [field: 'url' | 'token' | 'password' | 'sessionKey', value: string]
  connect: []
}>()
</script>

<template>
  <section class="connection-panel">
    <h2>Connection</h2>
    <p class="connection-panel__hint">Gateway session and shell credentials.</p>
    <div class="connection-panel__fields">
      <label class="connection-panel__field">
        <span>Gateway URL</span>
        <input
          :value="url"
          type="text"
          @input="emit('updateField', 'url', ($event.target as HTMLInputElement).value)"
        >
      </label>
      <label class="connection-panel__field">
        <span>Token</span>
        <input
          :value="token"
          type="text"
          @input="emit('updateField', 'token', ($event.target as HTMLInputElement).value)"
        >
      </label>
      <label class="connection-panel__field">
        <span>Password</span>
        <input
          :value="password"
          type="password"
          @input="emit('updateField', 'password', ($event.target as HTMLInputElement).value)"
        >
      </label>
      <label class="connection-panel__field">
        <span>Session Key</span>
        <input
          :value="sessionKey"
          type="text"
          @input="emit('updateField', 'sessionKey', ($event.target as HTMLInputElement).value)"
        >
      </label>
    </div>
    <div class="connection-panel__actions">
      <button
        class="connection-panel__button"
        data-action="connection-connect"
        type="button"
        @click="emit('connect')"
      >
        Connect
      </button>
    </div>
  </section>
</template>

<style scoped>
.connection-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(72, 50, 23, 0.14);
  border-radius: 22px;
  background: rgba(255, 250, 243, 0.94);
  box-shadow: 0 20px 44px rgba(82, 53, 21, 0.1);
  backdrop-filter: blur(14px);
}

.connection-panel h2 {
  margin: 0;
  font-size: 1.15rem;
}

.connection-panel__hint {
  margin: 0;
  color: #735439;
  font-size: 0.92rem;
}

.connection-panel__fields {
  display: grid;
  gap: 12px;
}

.connection-panel__field {
  display: grid;
  gap: 6px;
}

.connection-panel__field span {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #7a5531;
}

.connection-panel__field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(109, 76, 41, 0.18);
  border-radius: 14px;
  padding: 0.82rem 0.95rem;
  background: rgba(255, 255, 255, 0.92);
  color: #281d12;
  font: inherit;
}

.connection-panel__field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(109, 76, 41, 0.18);
  border-radius: 14px;
  padding: 0.82rem 0.95rem;
  background: rgba(255, 255, 255, 0.92);
  color: #281d12;
  font: inherit;
}

.connection-panel__button {
  border: 0;
  border-radius: 999px;
  padding: 0.85rem 1.1rem;
  background: linear-gradient(135deg, #8e5e2d 0%, #c9863a 100%);
  color: #fff8f1;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.connection-panel__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
