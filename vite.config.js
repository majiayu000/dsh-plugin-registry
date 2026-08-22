import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        notFound: resolve(import.meta.dirname, '404.html'),
        registry: resolve(import.meta.dirname, 'index.html'),
        detail: resolve(import.meta.dirname, 'plugin-detail.html'),
        publish: resolve(import.meta.dirname, 'publish.html'),
        policy: resolve(import.meta.dirname, 'policy.html'),
        dashboard: resolve(import.meta.dirname, 'dashboard.html'),
      },
    },
  },
})
