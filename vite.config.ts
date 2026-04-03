import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import {
  attachBridgeUnavailableProxyHandlers,
  BRIDGE_PROXY_TIMEOUT_MS,
} from './server/dev-proxy'

export default defineConfig({
  plugins: [react()],
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
