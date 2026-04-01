<script setup lang="ts">
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { onMounted, onUnmounted, ref } from 'vue'

const containerRef = ref<HTMLDivElement>()
const pixiApp = ref<Application>()
let resizeObserver: ResizeObserver | undefined
let tickerPluginInstalled = false

function resolveSize() {
  const width = containerRef.value?.clientWidth || 1
  const height = containerRef.value?.clientHeight || 1

  return { width, height }
}

function installRenderGuard(app: Application) {
  if (!app.ticker) {
    return
  }

  const guardedRender = () => {
    try {
      app.render()
    }
    catch (error) {
      console.error('[Live2D] Pixi render error.', error)
      app.ticker.stop()
    }
  }

  app.ticker.remove(app.render, app)
  app.ticker.add(guardedRender)
}

function ensureTickerPlugin() {
  if (tickerPluginInstalled) {
    return
  }

  extensions.add(TickerPlugin)
  tickerPluginInstalled = true
}

function syncCanvasSize() {
  if (!pixiApp.value) {
    return
  }

  const { width, height } = resolveSize()
  pixiApp.value.renderer.resize(width, height)
  pixiApp.value.render()
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }

  ensureTickerPlugin()

  const { width, height } = resolveSize()

  pixiApp.value = new Application({
    width,
    height,
    backgroundAlpha: 0,
    preserveDrawingBuffer: true,
  })

  installRenderGuard(pixiApp.value)

  pixiApp.value.view.style.width = '100%'
  pixiApp.value.view.style.height = '100%'
  pixiApp.value.view.style.display = 'block'

  containerRef.value.appendChild(pixiApp.value.view)
  syncCanvasSize()

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      syncCanvasSize()
    })
    resizeObserver.observe(containerRef.value)
  } else {
    window.addEventListener('resize', syncCanvasSize)
  }

  if (!window.Live2DCubismCore) {
    console.warn('[Live2D] Cubism runtime is missing. Canvas initialized without Live2D model support.')
    return
  }

  void import('pixi-live2d-display/cubism4').then(({ Live2DModel }) => {
    Live2DModel.registerTicker(Ticker)
  })
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  window.removeEventListener('resize', syncCanvasSize)
  pixiApp.value?.destroy()
  pixiApp.value = undefined
})
</script>

<template>
  <div ref="containerRef" class="clawmuse-live2d-canvas">
    <slot v-if="pixiApp" :app="pixiApp" />
  </div>
</template>

<style scoped>
.clawmuse-live2d-canvas {
  width: 100%;
  height: 100%;
}
</style>
