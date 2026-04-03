import type { ClientRequest, IncomingMessage, ServerResponse } from 'node:http'

export const BRIDGE_PROXY_TIMEOUT_MS = 4_000
export const BRIDGE_UNAVAILABLE_MESSAGE =
  '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。'

export interface ProxyLike {
  on(
    event: 'error',
    listener: (error: Error, req: IncomingMessage, res?: ServerResponse) => void,
  ): this
  on(event: 'proxyReq', listener: (proxyReq: ClientRequest) => void): this
}

export function writeBridgeUnavailableResponse(
  response?: ServerResponse,
  message = BRIDGE_UNAVAILABLE_MESSAGE,
): void {
  if (!response || response.headersSent || response.writableEnded) {
    return
  }

  response.statusCode = 503
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(
    JSON.stringify({
      code: 'request_failed',
      message,
    }),
  )
}

export function attachBridgeUnavailableProxyHandlers(proxy: ProxyLike): void {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setTimeout(BRIDGE_PROXY_TIMEOUT_MS)
  })

  proxy.on('error', (_error, _request, response) => {
    writeBridgeUnavailableResponse(response)
  })
}
