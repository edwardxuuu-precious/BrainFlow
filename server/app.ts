import { Hono } from 'hono'
import type { Context } from 'hono'
import type {
  AiChatRequest,
  AiRunStage,
  AiStreamEvent,
  CodexApiError,
  TextImportSemanticAdjudicationRequest,
  TextImportRequest,
  TextImportRunStage,
  TextImportStreamEvent,
} from '../shared/ai-contract.js'
import {
  createCodexBridge,
  CodexBridgeError,
  type CodexBridge,
} from './codex-bridge.js'
import { resolveAuthContext } from './auth/context.js'
import { readSyncServerConfig } from './sync-config.js'
import { createSyncRepository } from './repos/create-sync-repository.js'
import { SyncApiError, SyncConflictError, SyncService } from './services/sync-service.js'
import type {
  SyncAnalyzeConflictRequest,
  SyncBootstrapRequest,
  SyncPushRequest,
  SyncResolveConflictRequest,
  WorkspaceRestoreRequest,
} from '../shared/sync-contract.js'

interface CreateAppOptions {
  bridge?: CodexBridge
  syncService?: SyncService<unknown>
  logInfo?: (message: string) => void
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

function validateImportRequest(payload: unknown): TextImportRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的智能导入请求体。')
  }

  const request = payload as Partial<TextImportRequest>
  if (
    typeof request.documentId !== 'string' ||
    typeof request.documentTitle !== 'string' ||
    typeof request.sourceName !== 'string' ||
    (request.sourceType !== 'file' && request.sourceType !== 'paste') ||
    typeof request.rawText !== 'string' ||
    typeof request.baseDocumentUpdatedAt !== 'number'
  ) {
    throw new CodexBridgeError('invalid_request', '智能导入请求缺少必要字段。')
  }

  if (!request.context || typeof request.context !== 'object') {
    throw new CodexBridgeError('invalid_request', '智能导入请求缺少脑图上下文。')
  }

  if (!Array.isArray(request.preprocessedHints)) {
    throw new CodexBridgeError('invalid_request', '智能导入请求缺少预处理线索。')
  }

  return {
    ...request,
    intent: request.intent === 'preserve_structure' ? 'preserve_structure' : 'distill_structure',
    archetypeMode: request.archetypeMode === 'manual' ? 'manual' : 'auto',
    semanticHints: Array.isArray(request.semanticHints) ? request.semanticHints : [],
  } as TextImportRequest
}

function validateImportAdjudicationRequest(payload: unknown): TextImportSemanticAdjudicationRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的语义裁决请求体。')
  }

  const request = payload as Partial<TextImportSemanticAdjudicationRequest>
  if (
    typeof request.jobId !== 'string' ||
    typeof request.documentId !== 'string' ||
    typeof request.documentTitle !== 'string' ||
    !Array.isArray(request.candidates)
  ) {
    throw new CodexBridgeError('invalid_request', '语义裁决请求缺少必要字段。')
  }

  for (const candidate of request.candidates) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.candidateId !== 'string' ||
      (candidate.scope !== 'existing_topic' && candidate.scope !== 'cross_file') ||
      !candidate.source ||
      !candidate.target
    ) {
      throw new CodexBridgeError('invalid_request', '语义裁决候选对格式无效。')
    }
  }

  return request as TextImportSemanticAdjudicationRequest
}

function validateAnalyzeConflictRequest(payload: unknown): SyncAnalyzeConflictRequest<unknown> {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的冲突分析请求体。')
  }

  const request = payload as Partial<SyncAnalyzeConflictRequest<unknown>>
  if (!request.conflict || typeof request.conflict !== 'object') {
    throw new CodexBridgeError('invalid_request', '冲突分析请求缺少 conflict。')
  }

  const conflict = request.conflict as Partial<SyncAnalyzeConflictRequest<unknown>['conflict']>
  if (
    typeof conflict.id !== 'string' ||
    typeof conflict.workspaceId !== 'string' ||
    typeof conflict.entityId !== 'string' ||
    (conflict.entityType !== 'document' && conflict.entityType !== 'conversation')
  ) {
    throw new CodexBridgeError('invalid_request', '冲突分析请求中的 conflict 格式无效。')
  }

  return request as SyncAnalyzeConflictRequest<unknown>
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
  const requestId =
    typeof error === 'object' && error && 'requestId' in error
      ? ((error as { requestId?: string | null }).requestId ?? undefined)
      : undefined

  if (error instanceof CodexBridgeError) {
    return {
      code: error.code,
      message: error.message,
      issues: error.issues,
      rawMessage: error.rawMessage,
      requestId,
    }
  }

  return {
    code: 'request_failed',
    message: error instanceof Error ? error.message : 'Codex 请求失败。',
    rawMessage: error instanceof Error ? error.message : undefined,
    requestId,
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
    rawMessage: apiError.rawMessage,
  })
}

function emitImportErrorEvent(
  emit: (event: TextImportStreamEvent) => void,
  error: unknown,
  stage?: TextImportRunStage,
): void {
  const apiError = toApiError(error)
  const errorStage =
    stage ??
    (error instanceof CodexBridgeError
      ? error.stage
      : undefined)
  emit({
    type: 'error',
    stage: errorStage as TextImportRunStage | undefined,
    code: apiError.code,
    message: apiError.message,
    issues: apiError.issues,
    rawMessage: apiError.rawMessage,
    requestId: apiError.requestId,
  })
}

function createImportRequestId(): string {
  return `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function summarizeLogText(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function formatImportLog(
  requestId: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
  return payload ? `[import][requestId=${requestId}] ${payload}` : `[import][requestId=${requestId}]`
}

function formatSemanticLog(
  jobId: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
  return payload ? `[semantic][jobId=${jobId}] ${payload}` : `[semantic][jobId=${jobId}]`
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
            rawMessage: apiError.rawMessage,
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
  handler: (emit: (event: TextImportStreamEvent) => void) => Promise<void>,
  requestId?: string,
): Response {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (event: TextImportStreamEvent) => {
          controller.enqueue(
            encoder.encode(`${JSON.stringify(requestId ? { ...event, requestId } : event)}\n`),
          )
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
            rawMessage: apiError.rawMessage,
            requestId: apiError.requestId ?? requestId,
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
  const logInfo = options?.logInfo ?? console.log
  const logError =
    options?.logError ??
    ((message: string, error: unknown) => {
      console.error(message, error)
    })
  const bridge =
    options?.bridge ??
    createCodexBridge({
      logInfo,
      logError: (message) => logError(message, undefined),
    })
  const syncService =
    options?.syncService ??
    new SyncService<unknown>(
      createSyncRepository<unknown>(readSyncServerConfig()),
      readSyncServerConfig().pullLimit,
    )
  const syncReady = syncService.initialize()

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

  const jsonRouteWithStatus =
    <T>(handler: (c: Context) => Promise<T>) =>
    async (c: Context) => {
      try {
        await syncReady
        const payload = await handler(c)
        return c.json(payload)
      } catch (error) {
        if (error instanceof SyncConflictError) {
          return c.json(error.payload, 409)
        }
        if (error instanceof SyncApiError) {
          return c.json({ message: error.message }, error.status as 400 | 404 | 500)
        }
        const message = error instanceof Error ? error.message : 'Request failed.'
        return c.json({ message }, 500)
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
    const requestId = createImportRequestId()
    const requestStartedAt = Date.now()
    logInfo(
      formatImportLog(requestId, {
        event: 'request_started',
        sourceName: request.sourceName,
        rawTextLength: request.rawText.length,
        preprocessedHintCount: request.preprocessedHints.length,
        topicCount: request.context.topicCount,
      }),
    )

    return createImportNdjsonResponse(async (emit) => {
      emit({
        type: 'status',
        stage: 'extracting_input',
        message: '正在提取文本线索并准备导入上下文…',
      })
      emit({
        type: 'status',
        stage: 'analyzing_source',
        message: '正在结合整张脑图整理导入上下文…',
      })

      try {
        const result = await bridge.previewTextImport(request, {
          requestId,
          onStatus: ({ stage, message }) => {
            emit({
              type: 'status',
              stage,
              message,
            })
          },
        })
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
        logInfo(
          formatImportLog(requestId, {
            event: 'request_completed',
            status: 'success',
            durationMs: Date.now() - requestStartedAt,
            previewNodeCount: result.previewNodes.length,
            operationCount: result.operations.length,
            conflictCount: result.conflicts.length,
            warningCount: result.warnings?.length ?? 0,
          }),
        )
      } catch (error) {
        logError(
          formatImportLog(requestId, {
            event: 'request_failed',
            status: 'error',
            durationMs: Date.now() - requestStartedAt,
            stage:
              error instanceof CodexBridgeError
                ? error.stage
                : 'building_preview',
            code: error instanceof CodexBridgeError ? error.code : 'request_failed',
            message:
              error instanceof CodexBridgeError
                ? summarizeLogText(error.message)
                : summarizeLogText(error instanceof Error ? error.message : String(error)),
            rawMessage:
              error instanceof CodexBridgeError
                ? summarizeLogText(error.rawMessage)
                : undefined,
          }),
          error,
        )
        emitImportErrorEvent(emit, error)
      }
    }, requestId)
  })

  app.post('/api/codex/import/adjudicate', jsonRoute('POST /api/codex/import/adjudicate', async (c) => {
    const request = validateImportAdjudicationRequest(await c.req.json().catch(() => null))
    const startedAt = Date.now()
    logInfo(
      formatSemanticLog(request.jobId, {
        event: 'request_started',
        candidateCount: request.candidates.length,
        batchTitle: request.batchTitle ?? null,
      }),
    )

    try {
      const result = await bridge.adjudicateTextImportCandidates(request)
      logInfo(
        formatSemanticLog(request.jobId, {
          event: 'request_completed',
          durationMs: Date.now() - startedAt,
          decisionCount: result.decisions.length,
          warningCount: result.warnings?.length ?? 0,
        }),
      )
      return result
    } catch (error) {
      if (shouldLogApiError(error)) {
        logError(
          formatSemanticLog(request.jobId, {
            event: 'request_failed',
            durationMs: Date.now() - startedAt,
            code: error instanceof CodexBridgeError ? error.code : 'request_failed',
            message:
              error instanceof CodexBridgeError
                ? summarizeLogText(error.message)
                : summarizeLogText(error instanceof Error ? error.message : String(error)),
            rawMessage:
              error instanceof CodexBridgeError ? summarizeLogText(error.rawMessage) : undefined,
          }),
          error,
        )
      }
      throw error
    }
  }))

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

  app.post('/api/sync/bootstrap', jsonRouteWithStatus(async (c) => {
    const auth = resolveAuthContext(c)
    const request = await c.req.json() as SyncBootstrapRequest<unknown>
    return syncService.bootstrap(auth.userId, request)
  }))

  app.post('/api/sync/push', jsonRouteWithStatus(async (c) => {
    const auth = resolveAuthContext(c)
    const request = await c.req.json() as SyncPushRequest<unknown>
    return syncService.push(auth.userId, request)
  }))

  app.get('/api/sync/pull', jsonRouteWithStatus(async (c) => {
    const workspaceId = c.req.query('workspaceId')
    const afterCursor = Number(c.req.query('afterCursor') ?? 0)
    const limit = Number(c.req.query('limit') ?? readSyncServerConfig().pullLimit)
    if (!workspaceId) {
      throw new Error('workspaceId is required.')
    }
    return syncService.pull(workspaceId, afterCursor, limit)
  }))

  app.post('/api/sync/resolve-conflict', jsonRouteWithStatus(async (c) => {
    const auth = resolveAuthContext(c)
    const request = await c.req.json() as SyncResolveConflictRequest<unknown>
    return syncService.resolveConflict(auth.userId, request)
  }))

  app.post('/api/sync/analyze-conflict', jsonRouteWithStatus(async (c) => {
    const request = validateAnalyzeConflictRequest(await c.req.json().catch(() => null))
    return bridge.analyzeSyncConflict(request)
  }))

  app.get('/api/workspace/full', jsonRouteWithStatus(async (c) => {
    const workspaceId = c.req.query('workspaceId')
    if (!workspaceId) {
      throw new Error('workspaceId is required.')
    }
    return syncService.getWorkspaceFull(workspaceId)
  }))

  app.post('/api/workspace/restore', jsonRouteWithStatus(async (c) => {
    const auth = resolveAuthContext(c)
    const request = await c.req.json() as WorkspaceRestoreRequest<unknown>
    return syncService.restoreWorkspace(auth.userId, request)
  }))

  return app
}
