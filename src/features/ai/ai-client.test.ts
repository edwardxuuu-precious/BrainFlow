import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexStatus } from './ai-client'

describe('ai-client transport handling', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('maps gateway errors to a bridge unavailable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Bad Gateway', {
          status: 502,
          statusText: 'Bad Gateway',
        }),
      ),
    )

    await expect(fetchCodexStatus()).rejects.toMatchObject({
      code: 'request_failed',
      message: '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。',
    })
  })

  it('maps structured 503 proxy responses to the same bridge unavailable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'request_failed',
            message: '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。',
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(fetchCodexStatus()).rejects.toMatchObject({
      code: 'request_failed',
      message: '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。',
    })
  })

  it('aborts long-running status requests with a timeout message', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    )

    const request = expect(fetchCodexStatus()).rejects.toMatchObject({
      code: 'request_failed',
      message: '本机 Codex bridge 响应超时，请确认本机 bridge 已启动后再试。',
    })

    await vi.advanceTimersByTimeAsync(8000)
    await request
  })
})
