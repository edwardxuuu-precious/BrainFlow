import { Hono } from 'hono'
import type { Context } from 'hono'
import type {
  AiChatRequest,
  AiRunStage,
  AiStreamEvent,
  CodexApiError,
  MarkdownImportRequest,
  MarkdownImportStreamEvent,
} from '../shared/ai-contract.js'
import {
  createCodexBridge,
  CodexBridgeError,
  type CodexBridge,
} from './codex-bridge.js'

interface CreateAppOptions {
  bridge?: CodexBridge
  logError?: (message: string, error: unknown) => void
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

function validateImportRequest(payload: unknown): MarkdownImportRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的 Markdown 导入请求体。')
  }

  const request = payload as Partial<MarkdownImportRequest>
  if (
    typeof request.documentId !== 'string' ||
    typeof request.documentTitle !== 'string' ||
    typeof request.fileName !== 'string' ||
    typeof request.markdown !== 'string' ||
    typeof request.baseDocumentUpdatedAt !== 'number'
  ) {
    throw new CodexBridgeError('invalid_request', 'Markdown 导入请求缺少必要字段。')
  }

  if (!request.context || typeof request.context !== 'object') {
    throw new CodexBridgeError('invalid_request', 'Markdown 导入请求缺少脑图上下文。')
  }

  if (!Array.isArray(request.preprocessedTree)) {
    throw new CodexBridgeError('invalid_request', 'Markdown 导入请求缺少预处理结构。')
  }

  return request as MarkdownImportRequest
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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

function toApiStatusCode(error: unknown): number {
  if (error instanceof CodexBridgeError && error.code === 'invalid_request') {
    return 400
  }

  return 500
}

function shouldLogApiError(error: unknown): boolean {
  return !(error instanceof CodexBridgeError && error.code === 'invalid_request')
}

function emitErrorEvent(
  emit: (event: AiStreamEvent) => void,
  error: unknown,
  stage?: Exclude<AiRunStage, 'idle' | 'completed'>,
): void {
  const apiError = toApiError(error)
  emit({
    type: 'error',
    stage,
    code: apiError.code,
    message: apiError.message,
    issues: apiError.issues,
  })
}

function emitImportErrorEvent(
  emit: (event: MarkdownImportStreamEvent) => void,
  error: unknown,
  stage?: 'parsing_markdown' | 'analyzing_import' | 'resolving_conflicts' | 'building_preview',
): void {
  const apiError = toApiError(error)
  emit({
    type: 'error',
    stage,
    code: apiError.code,
    message: apiError.message,
    issues: apiError.issues,
  })
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

function createImportNdjsonResponse(
  handler: (emit: (event: MarkdownImportStreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (event: MarkdownImportStreamEvent) => {
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
  const logError =
    options?.logError ??
    ((message: string, error: unknown) => {
      console.error(message, error)
    })

  const jsonRoute =
    <T>(routeName: string, handler: (c: Context) => Promise<T>) =>
    async (c: Context) => {
      try {
        const payload = await handler(c)
        return c.json(payload)
      } catch (error) {
        if (shouldLogApiError(error)) {
          logError(`[codex] ${routeName} failed`, error)
        }

        const statusCode = toApiStatusCode(error) as 400 | 500
        return c.json(toApiError(error), statusCode)
      }
    }

  app.get('/api/codex/status', jsonRoute('GET /api/codex/status', async () => {
    const status = await bridge.getStatus()
    return status
  }))

  app.post('/api/codex/revalidate', jsonRoute('POST /api/codex/revalidate', async () => {
    const status = await bridge.revalidate()
    return status
  }))

  app.get('/api/codex/settings', jsonRoute('GET /api/codex/settings', async () => {
    const settings = await bridge.getSettings()
    return settings
  }))

  app.put('/api/codex/settings', jsonRoute('PUT /api/codex/settings', async (c) => {
    const payload = validateSettingsPayload(await c.req.json().catch(() => null))
    const settings = await bridge.saveSettings(payload.businessPrompt)
    return settings
  }))

  app.post('/api/codex/settings/reset', jsonRoute('POST /api/codex/settings/reset', async () => {
    const settings = await bridge.resetSettings()
    return settings
  }))

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
        message: 'Codex 正在生成自然语言回答…',
      })
      let assistantMessage = ''
      let emittedStreamingStatus = false

      try {
        const streamResult = await bridge.streamChat(request, {
          onAssistantDelta: (delta) => {
            if (!emittedStreamingStatus) {
              emittedStreamingStatus = true
              emit({
                type: 'status',
                stage: 'streaming',
                message: 'Codex 正在输出回答…',
              })
            }
            emit({
              type: 'assistant_delta',
              delta,
            })
          },
        })
        assistantMessage = streamResult.assistantMessage

        if (!streamResult.emittedDelta) {
          emit({
            type: 'status',
            stage: 'streaming',
            message: 'Codex 已生成回答，正在写入消息…',
          })

          for (const chunk of chunkText(assistantMessage)) {
            emit({
              type: 'assistant_delta',
              delta: chunk,
            })
            await delay(12)
          }
        }
      } catch (error) {
        emitErrorEvent(emit, error, 'starting_codex')
        return
      }

      emit({
        type: 'status',
        stage: 'planning_changes',
        message: '正在生成可直接落图的脑图改动…',
      })

      try {
        const result = await bridge.planChanges(request, assistantMessage)
        emit({
          type: 'result',
          data: result,
        })
      } catch (error) {
        emitErrorEvent(emit, error, 'planning_changes')
      }
    })
  })

  app.post('/api/codex/import/preview', async (c) => {
    const request = validateImportRequest(await c.req.json().catch(() => null))

    return createImportNdjsonResponse(async (emit) => {
      emit({
        type: 'status',
        stage: 'parsing_markdown',
        message: '正在检查 Markdown 预处理结果…',
      })
      emit({
        type: 'status',
        stage: 'analyzing_import',
        message: '正在结合整张脑图进行语义识别与去重…',
      })

      try {
        const result = await bridge.previewMarkdownImport(request)
        emit({
          type: 'status',
          stage: 'resolving_conflicts',
          message: '正在整理冲突与风险分级…',
        })
        emit({
          type: 'status',
          stage: 'building_preview',
          message: '正在生成可审阅的导入预览…',
        })
        emit({
          type: 'result',
          data: result,
        })
      } catch (error) {
        emitImportErrorEvent(emit, error, 'building_preview')
      }
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
