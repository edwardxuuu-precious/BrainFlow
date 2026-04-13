// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKimiCodeProvider } from './kimi-provider.js'

describe('createKimiCodeProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('marks membership-key direct access as unsupported for the BrainFlow bridge', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const provider = createKimiCodeProvider({
      apiKey: 'sk-kimi-example',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: false,
      issues: [
        {
          code: 'provider_unavailable',
          message: expect.stringContaining('Kimi CLI'),
        },
      ],
      metadata: {
        directAccessMode: 'unsupported_membership_api',
        model: 'kimi-for-coding',
      },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats /v1 membership endpoints as the same unsupported direct-access mode', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const provider = createKimiCodeProvider({
      apiKey: 'sk-kimi-example',
      baseUrl: 'https://api.kimi.com/coding/v1',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: false,
      issues: [
        {
          code: 'provider_unavailable',
          message: expect.stringContaining('受支持的 Coding Agent'),
        },
      ],
      metadata: {
        baseUrl: 'https://api.kimi.com/coding/v1',
        directAccessMode: 'unsupported_membership_api',
      },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('explains when a membership key is forced onto the Moonshot open-platform base URL', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const provider = createKimiCodeProvider({
      apiKey: 'sk-kimi-example',
      baseUrl: 'https://api.moonshot.cn',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: false,
      issues: [
        {
          code: 'authentication_failed',
          message: expect.stringContaining('https://api.moonshot.cn'),
        },
      ],
      metadata: {
        baseUrl: 'https://api.moonshot.cn',
        model: 'kimi-for-coding',
        keyFormat: 'kimi-code-membership',
      },
    })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces the Moonshot authentication error instead of a generic expired-key message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: 'invalid api key',
              code: 'invalid_api_key',
            },
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    const provider = createKimiCodeProvider({
      apiKey: 'test-key',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: false,
      issues: [
        {
          code: 'authentication_failed',
          message: 'Kimi Code 鉴权失败：invalid api key',
        },
      ],
    })
  })

  it('fails validation when the configured model is not in the available model list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'kimi-k2.5' }, { id: 'kimi-k2-thinking' }],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    const provider = createKimiCodeProvider({
      apiKey: 'test-key',
      model: 'kimi-code',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: false,
      issues: [
        {
          code: 'provider_unavailable',
          message: 'Kimi Code 当前模型 "kimi-code" 不在可用模型列表中，建议改为 "kimi-k2.5"。',
        },
      ],
    })
  })

  it('uses kimi-k2.5 as the default model for Kimi Code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ id: 'kimi-k2.5' }],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )

    const provider = createKimiCodeProvider({
      apiKey: 'test-key',
    })

    await expect(provider.getStatus()).resolves.toMatchObject({
      ready: true,
      metadata: {
        model: 'kimi-k2.5',
      },
    })
  })
})
