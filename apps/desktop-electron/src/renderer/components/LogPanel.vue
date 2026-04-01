<script setup lang="ts">
defineProps<{
  logs: string[]
}>()
</script>

<template>
  <section class="log-panel">
    <h2>Logs</h2>
    <ul class="log-panel__list">
      <li v-for="logLine in logs" :key="logLine">
        {{ logLine }}
      </li>
      <li v-if="logs.length === 0" class="log-panel__empty">
        Runtime events and warnings will appear here.
      </li>
    </ul>
  </section>
</template>

<style scoped>
.log-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(72, 50, 23, 0.14);
  border-radius: 22px;
  background: rgba(36, 28, 20, 0.92);
  color: #f5eadb;
  box-shadow: 0 16px 40px rgba(42, 25, 8, 0.16);
}

.log-panel h2 {
  margin: 0;
  font-size: 1.15rem;
}

.log-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.88rem;
  line-height: 1.45;
}

.log-panel__list li {
  padding: 0.7rem 0.8rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
}

.log-panel__empty {
  color: rgba(245, 234, 219, 0.72);
}
</style>
