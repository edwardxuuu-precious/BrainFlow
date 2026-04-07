import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TextImportRequest } from '../../../shared/ai-contract'
import { streamCodexTextImportPreview } from './text-import-client'

function createRequest(): TextImportRequest {
  return {
    documentId: 'doc_1',
    documentTitle: 'Import doc',
    baseDocumentUpdatedAt: 1,
    context: {
      documentTitle: 'Import doc',
      rootTopicId: 'root',
      scope: 'full_document',
      topicCount: 1,
      topics: [
        {
          topicId: 'root',
          title: 'Root',
          note: '',
          metadata: {
            labels: [],
            markers: [],
          },
          style: {},
          parentTopicId: null,
          childTopicIds: [],
          aiLocked: false,
        },
      ],
      focus: {
        activeTopicId: 'root',
        selectedTopicIds: ['root'],
        relationSummary: [],
      },
    },
    anchorTopicId: 'root',
    sourceName: 'GTM_step1.md',
    sourceType: 'file',
    intent: 'distill_structure',
    rawText: '# GTM Step 1',
    preprocessedHints: [],
    semanticHints: [],
  }
}

describe('text-import-client transport handling', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('maps gateway errors to a bridge unavailable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Bad Gateway', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      ),
    )

    await expect(streamCodexTextImportPreview(createRequest(), () => {})).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_unavailable',
      status: 503,
      message:
        'The local Codex bridge is unavailable. Confirm it is running on port 8787 and retry the import.',
    })
  })

  it('preserves structured 500 errors as raw diagnostics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'request_failed',
            message: '系统 Prompt 加载失败：ENOENT',
            requestId: 'import_123',
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

    await expect(streamCodexTextImportPreview(createRequest(), () => {})).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_internal_error',
      status: 500,
      message: 'The import preview failed inside the local Codex bridge. Review the bridge logs and retry.',
      rawMessage: '系统 Prompt 加载失败：ENOENT',
      requestId: 'import_123',
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

    await expect(streamCodexTextImportPreview(createRequest(), () => {})).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_internal_error',
      status: 500,
      message:
        'The local Codex bridge returned an invalid import response. Review the bridge logs and retry.',
    })
  })

  it('aborts long-running import requests with a timeout message', async () => {
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

    const request = expect(
      streamCodexTextImportPreview(createRequest(), () => {}),
    ).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_unavailable',
      message:
        'The import preview timed out while waiting for the local Codex bridge. Retry after the bridge finishes the current request.',
    })

    await vi.advanceTimersByTimeAsync(180000)
    await request
  })

  it('normalizes stream read interruptions after the response starts', async () => {
    const encoder = new TextEncoder()
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: encoder.encode(
          `${JSON.stringify({
            type: 'status',
            stage: 'waiting_codex_primary',
            message: 'Codex is analyzing the full import context.',
            requestId: 'import_stream_1',
          })}\n`,
        ),
      })
      .mockRejectedValueOnce(new TypeError('network error'))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read,
          }),
        },
      }),
    )

    const onEvent = vi.fn()

    await expect(streamCodexTextImportPreview(createRequest(), onEvent)).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_unavailable',
      stage: 'waiting_codex_primary',
      requestId: 'import_stream_1',
      message:
        'The import preview stream was interrupted before completion. Retry after the local Codex bridge finishes the current request.',
      rawMessage: 'Stream read failed: network error',
    })

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        stage: 'waiting_codex_primary',
        requestId: 'import_stream_1',
      }),
    )
  })

  it('maps a truncated NDJSON tail to a structured internal error', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: encoder.encode(
                  `${JSON.stringify({
                    type: 'status',
                    stage: 'waiting_codex_primary',
                    message: 'Codex is analyzing the full import context.',
                    requestId: 'import_stream_2',
                  })}\n{"type":"result"`,
                ),
              })
              .mockResolvedValueOnce({
                done: true,
                value: undefined,
              }),
          }),
        },
      }),
    )

    await expect(streamCodexTextImportPreview(createRequest(), () => {})).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_internal_error',
      stage: 'waiting_codex_primary',
      requestId: 'import_stream_2',
      message:
        'The local Codex bridge returned an invalid import stream. Review the bridge logs and retry.',
    })
  })


  it('maps generic fetch failures to a bridge unavailable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(streamCodexTextImportPreview(createRequest(), () => {})).rejects.toMatchObject({
      code: 'request_failed',
      kind: 'bridge_unavailable',
      message:
        'The local Codex bridge is unavailable. Confirm it is running on port 8787 and retry the import.',
    })
  })
})
