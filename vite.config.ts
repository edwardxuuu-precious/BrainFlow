import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import {
  attachBridgeUnavailableProxyHandlers,
  BRIDGE_PROXY_TIMEOUT_MS,
} from './server/dev-proxy'

const require = createRequire(import.meta.url)
const decodeNamedCharacterReferenceEntry = require.resolve('decode-named-character-reference', {
  paths: [require.resolve('remark-parse')],
})

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Force the worker-safe decoder entry; the browser export relies on DOM globals
      // and breaks local Markdown parsing inside module workers.
      'decode-named-character-reference': decodeNamedCharacterReferenceEntry,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        proxyTimeout: BRIDGE_PROXY_TIMEOUT_MS,
        timeout: BRIDGE_PROXY_TIMEOUT_MS,
        configure(proxy) {
          attachBridgeUnavailableProxyHandlers(proxy)
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    restoreMocks: true,
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.{ts,tsx}', 'shared/**/*.test.{ts,tsx}'],
    exclude: ['src/test/e2e/**'],
  },
})
