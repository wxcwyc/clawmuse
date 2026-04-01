import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const rendererRoot = resolve(appRoot, 'src/renderer')

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(appRoot, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(appRoot, 'src/preload/index.ts'),
        },
        output: {
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: rendererRoot,
    build: {
      rollupOptions: {
        input: resolve(rendererRoot, 'index.html'),
      },
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@renderer': resolve(appRoot, 'src/renderer'),
      },
    },
  },
})
