import { Hono } from 'hono'
import type { AiChatRequest, AiStreamEvent, CodexApiError } from '../shared/ai-contract.js'
import {
  createCodexBridge,
  CodexBridgeError,
  type CodexBridge,
} from './codex-bridge.js'

interface CreateAppOptions {
  bridge?: CodexBridge
}

function validateChatRequest(payload: unknown): AiChatRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的 Codex 请求体。')
  }

  const request = payload as Partial<AiChatRequest>
  if (typeof request.documentId !== 'string' || typeof request.sessionId !== 'string') {
    throw new CodexBridgeError('invalid_request', '缺少会话标识。')
  }

  if (!Array.isArray(request.messages) || typeof request.baseDocumentUpdatedAt !== 'number') {
    throw new CodexBridgeError('invalid_request', 'Codex 请求缺少必要字段。')
  }

  if (!request.context || typeof request.context !== 'object') {
    throw new CodexBridgeError('invalid_request', 'Codex 请求缺少脑图上下文。')
  }

  return request as AiChatRequest
}

function validateSettingsPayload(payload: unknown): { businessPrompt: string } {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的 AI 设置请求体。')
  }

  const request = payload as Partial<{ businessPrompt: unknown }>
  if (typeof request.businessPrompt !== 'string' || !request.businessPrompt.trim()) {
    throw new CodexBridgeError('invalid_request', '业务 Prompt 不能为空。')
  }

  return {
    businessPrompt: request.businessPrompt,
  }
}

function chunkText(text: string): string[] {
  if (!text.trim()) {
    return []
  }

  const chunks: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + 32))
    cursor += 32
  }

  return chunks
}

function toApiError(error: unknown): CodexApiError {
  if (error instanceof CodexBridgeError) {
    return {
      code: error.code,
      message: error.message,
      issues: error.issues,
    }
  }

  return {
    code: 'request_failed',
    message: error instanceof Error ? error.message : 'Codex 请求失败。',
  }
}

function createNdjsonResponse(
  handler: (emit: (event: AiStreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (event: AiStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        }

        try {
          await handler(emit)
        } catch (error) {
          const apiError = toApiError(error)
          emit({
            type: 'error',
            code: apiError.code,
            message: apiError.message,
            issues: apiError.issues,
          })
        } finally {
          controller.close()
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  )
}

export function createApp(options?: CreateAppOptions) {
  const app = new Hono()
  const bridge = options?.bridge ?? createCodexBridge()

  app.get('/api/codex/status', async (c) => {
    const status = await bridge.getStatus()
    return c.json(status)
  })

  app.post('/api/codex/revalidate', async (c) => {
    const status = await bridge.revalidate()
    return c.json(status)
  })

  app.get('/api/codex/settings', async (c) => {
    const settings = await bridge.getSettings()
    return c.json(settings)
  })

  app.put('/api/codex/settings', async (c) => {
    const payload = validateSettingsPayload(await c.req.json().catch(() => null))
    const settings = await bridge.saveSettings(payload.businessPrompt)
    return c.json(settings)
  })

  app.post('/api/codex/settings/reset', async (c) => {
    const settings = await bridge.resetSettings()
    return c.json(settings)
  })

  app.post('/api/codex/chat', async (c) => {
    const request = validateChatRequest(await c.req.json().catch(() => null))

    return createNdjsonResponse(async (emit) => {
      emit({
        type: 'status',
        stage: 'starting_codex',
        message: '正在调用本机 Codex…',
      })
      emit({
        type: 'status',
        stage: 'waiting_first_token',
        message: 'Codex 正在整理回答与脑图提案…',
      })

      const result = await bridge.chat(request)
      chunkText(result.assistantMessage).forEach((chunk) => {
        emit({
          type: 'assistant_delta',
          delta: chunk,
        })
      })

      emit({
        type: 'result',
        data: result,
      })
    })
  })

  app.post('/api/ai/session', (c) =>
    c.json(
      {
        code: 'invalid_request',
        message: '该接口已废弃，请改用 /api/codex/status 和 /api/codex/chat。',
      },
      410,
    ),
  )

  app.post('/api/ai/chat', (c) =>
    c.json(
      {
        code: 'invalid_request',
        message: '该接口已废弃，请改用 /api/codex/chat。',
      },
      410,
    ),
  )

  return app
}
