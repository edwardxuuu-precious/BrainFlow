import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexStatus, getStoredProvider } from './ai-client'

describe('ai-client transport handling', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
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
      kind: 'bridge_unavailable',
      status: 502,
      message: '本机 AI bridge 无响应，请确认本地 bridge 已启动，并检查 8787 端口服务。',
    })
  })

  it('maps structured 500 status failures to a bridge internal error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'request_failed',
            message: '系统 Prompt 加载失败：ENOENT',
          }),
          {
            status: 500,
            statusText: 'Internal Server Error',
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      ),
    )

    await expect(fetchCodexStatus()).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_internal_error',
      status: 500,
      message: '系统 Prompt 加载失败：ENOENT',
    })
  })

  it('falls back to a fixed internal error message when a 500 response is not json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      ),
    )

    await expect(fetchCodexStatus()).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_internal_error',
      status: 500,
      message: '本机 AI bridge 在线，但状态检查失败，请查看 bridge 日志后重试。',
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
      kind: 'bridge_unavailable',
      message: '本机 AI bridge 响应超时，请确认本地 bridge 已启动后再试。',
    })

    await vi.advanceTimersByTimeAsync(8000)
    await request
  })

  it('normalizes the stored provider and forwards provider/workspace headers', async () => {
    localStorage.setItem('brainflow:selected-provider', 'kimi')
    localStorage.setItem('brainflow-cloud-workspace-id', JSON.stringify('workspace_1'))

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cliInstalled: true,
          loggedIn: true,
          authProvider: 'kimi-code',
          ready: true,
          issues: [],
          systemPromptSummary: 'summary',
          systemPromptVersion: 'v1',
          systemPrompt: 'prompt',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchCodexStatus()

    expect(getStoredProvider()).toBe('kimi-code')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/status',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-AI-Provider': 'kimi-code',
          'X-Workspace-Id': 'workspace_1',
        }),
      }),
    )
  })
})
