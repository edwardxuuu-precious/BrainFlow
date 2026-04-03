// @vitest-environment node

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  attachBridgeUnavailableProxyHandlers,
  BRIDGE_PROXY_TIMEOUT_MS,
  BRIDGE_UNAVAILABLE_MESSAGE,
  writeBridgeUnavailableResponse,
} from './dev-proxy.js'

class FakeProxy extends EventEmitter {}

describe('dev proxy helpers', () => {
  it('writes a structured 503 response when the local bridge is unavailable', () => {
    const setHeader = vi.fn()
    const end = vi.fn()

    writeBridgeUnavailableResponse({
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader,
      end,
    } as unknown as Parameters<typeof writeBridgeUnavailableResponse>[0])

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8')
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(end).toHaveBeenCalledWith(
      JSON.stringify({
        code: 'request_failed',
        message: BRIDGE_UNAVAILABLE_MESSAGE,
      }),
    )
  })

  it('attaches timeout and fallback handlers to the vite proxy', () => {
    const proxy = new FakeProxy()
    const proxyReq = {
      setTimeout: vi.fn(),
    }
    const setHeader = vi.fn()
    const end = vi.fn()

    attachBridgeUnavailableProxyHandlers(proxy)
    proxy.emit('proxyReq', proxyReq)
    proxy.emit('error', new Error('ECONNREFUSED'), {}, {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      setHeader,
      end,
    })

    expect(proxyReq.setTimeout).toHaveBeenCalledWith(BRIDGE_PROXY_TIMEOUT_MS)
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8')
    expect(end).toHaveBeenCalled()
  })
})
