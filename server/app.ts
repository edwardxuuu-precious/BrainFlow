import { Hono } from 'hono'
import type { Context } from 'hono'
import { readFile } from 'node:fs/promises'
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
import {
  createProvider,
  type ProviderType,
  type CreateProviderOptions,
} from './providers/index.js'
import { resolveAuthContext } from './auth/context.js'
import { getAuthenticatedUserId, readAuthServerConfig } from './auth/config.js'
import { verifyPasswordHash } from './auth/password.js'
import { clearSessionCookie, setSessionCookie } from './auth/session.js'
import { readSyncServerConfig } from './sync-config.js'
import { createSyncRepository } from './repos/create-sync-repository.js'
import { createDbSystemPromptStore } from './services/system-prompt-db-store.js'
import type { SystemPromptStore } from './system-prompt.js'
import { Pool } from 'pg'
import {
  LocalStorageAdminService,
  StorageAdminError,
  type StorageAdminService,
} from './storage-admin-service.js'
import { SyncApiError, SyncConflictError, SyncService } from './services/sync-service.js'
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthSessionResponse,
} from '../shared/auth-contract.js'
import type {
  CreateWorkspaceRequest,
  DatabaseBackupMeta,
  RenameWorkspaceRequest,
} from '../shared/storage-admin-contract.js'
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
  storageAdminService?: StorageAdminService
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

function validateAuthLoginPayload(payload: unknown): AuthLoginRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', '无效的登录请求体。')
  }

  const request = payload as Partial<AuthLoginRequest>
  if (typeof request.username !== 'string' || typeof request.password !== 'string') {
    throw new CodexBridgeError('invalid_request', '登录请求缺少用户名或密码。')
  }
  if (!request.username.trim() || !request.password) {
    throw new CodexBridgeError('invalid_request', '用户名和密码不能为空。')
  }

  return {
    username: request.username.trim(),
    password: request.password,
  }
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

function validateWorkspaceNamePayload(
  payload: unknown,
): CreateWorkspaceRequest | RenameWorkspaceRequest {
  if (!payload || typeof payload !== 'object') {
    throw new CodexBridgeError('invalid_request', 'Invalid workspace payload.')
  }

  const request = payload as Partial<CreateWorkspaceRequest>
  if (typeof request.name !== 'string') {
    throw new CodexBridgeError('invalid_request', 'Workspace name is required.')
  }

  return {
    name: request.name.trim(),
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

  if (error instanceof SyncApiError) {
    return error.status
  }

  if (error instanceof StorageAdminError) {
    return error.status
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
          const payload =
            requestId && (event.type === 'progress' || event.type === 'trace')
              ? {
                  ...event,
                  requestId,
                  entry: {
                    ...event.entry,
                    requestId: event.entry.requestId ?? requestId,
                  },
                }
              : requestId
                ? { ...event, requestId }
                : event
          controller.enqueue(
            encoder.encode(`${JSON.stringify(payload)}\n`),
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
  
  // Bridge 缓存，支持多 Provider 热切换
  // 缓存 key: `${providerType}:${workspaceId || 'default'}`
  const bridgeCache = new Map<string, CodexBridge>()
  
  const getBridgeCacheKey = (providerType: string, workspaceId?: string): string => {
    return workspaceId ? `${providerType}:${workspaceId}` : `${providerType}:default`
  }
  
  const getWorkspaceIdFromHeader = (c: Context): string | undefined => {
    return c.req.header('X-Workspace-Id') ?? undefined
  }

  const supportedProviderTypes = ['codex', 'deepseek', 'kimi-code'] as const
  const supportedConfigurableProviderTypes = ['deepseek', 'kimi-code'] as const

  const isSupportedProviderType = (value: string | undefined): value is ProviderType => {
    return !!value && supportedProviderTypes.includes(value as (typeof supportedProviderTypes)[number])
  }

  const getRequestedProviderType = (c: Context): ProviderType | undefined => {
    const providerType = c.req.header('X-AI-Provider') ?? undefined
    return isSupportedProviderType(providerType) ? providerType : undefined
  }

  const getProviderDisplayName = (providerType?: string): string => {
    switch (providerType) {
      case 'deepseek':
        return 'DeepSeek'
      case 'kimi-code':
        return 'Kimi Code'
      case 'codex':
      default:
        return 'OpenAI Codex'
    }
  }
  
  const getAiProviderConfig = async (workspaceId: string, providerType: string): Promise<CreateProviderOptions | undefined> => {
    try {
      const service = getSyncService()
      const repo = (service as unknown as { repository: { getAiProviderConfig: (workspaceId: string, providerType: string) => Promise<{ apiKey?: string; model?: string; baseUrl?: string } | null> } }).repository
      if (!repo?.getAiProviderConfig) return undefined
      
      const config = await repo.getAiProviderConfig(workspaceId, providerType)
      if (!config?.apiKey) return undefined
      
      return {
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      }
    } catch {
      return undefined
    }
  }
  
  const getBridge = async (providerType?: string, workspaceId?: string): Promise<CodexBridge> => {
    const type = providerType || 'default'
    const cacheKey = getBridgeCacheKey(type, workspaceId)
    
    // 如果缓存中有，直接返回
    if (bridgeCache.has(cacheKey)) {
      return bridgeCache.get(cacheKey)!
    }
    
    // 创建新的 bridge
    if (providerType && providerType !== 'codex') {
      // 对于需要 API Key 的 provider，尝试获取用户配置
      let providerOptions: CreateProviderOptions | undefined
      if (workspaceId) {
        providerOptions = await getAiProviderConfig(workspaceId, providerType)
      }
      
      const provider = createProvider(providerType as ProviderType, providerOptions)
      const newBridge = createCodexBridge({
        provider,
        promptStore: getPromptStore(),
        logInfo,
        logError: (message) => logError(message, undefined),
      })
      bridgeCache.set(cacheKey, newBridge)
      return newBridge
    }
    
    // 默认或 codex provider
    const newBridge = options?.bridge ?? createCodexBridge({
      promptStore: getPromptStore(),
      logInfo,
      logError: (message) => logError(message, undefined),
    })
    bridgeCache.set(cacheKey, newBridge)
    return newBridge
  }
  
  // 清除特定 workspace 的 provider 缓存（当 API Key 变更时调用）
  const clearBridgeCache = (workspaceId: string, providerType?: string) => {
    if (providerType) {
      bridgeCache.delete(getBridgeCacheKey(providerType, workspaceId))
    } else {
      // 清除该 workspace 的所有缓存
      for (const key of bridgeCache.keys()) {
        if (key.endsWith(`:${workspaceId}`)) {
          bridgeCache.delete(key)
        }
      }
    }
  }
  
  // 兼容旧代码的 bridge 变量（懒加载，因为 getBridge 现在是异步的）
  let defaultBridge: CodexBridge | null = null
  const getDefaultBridge = async (): Promise<CodexBridge> => {
    if (!defaultBridge) {
      defaultBridge = await getBridge()
    }
    return defaultBridge
  }
  
  let syncService = options?.syncService ?? null
  let syncReady = syncService?.initialize() ?? null
  const storageAdminService = options?.storageAdminService ?? new LocalStorageAdminService()
  
  // 数据库连接池（用于 System Prompt 存储）
  let dbPool: Pool | null = null
  let promptStore: SystemPromptStore | null = null
  
  const getDbPool = (): Pool => {
    if (!dbPool) {
      const syncConfig = readSyncServerConfig()
      dbPool = new Pool({
        connectionString: syncConfig.databaseUrl,
        ssl: syncConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
      })
    }
    return dbPool
  }
  
  const getPromptStore = (): SystemPromptStore => {
    if (!promptStore) {
      promptStore = createDbSystemPromptStore({ pool: getDbPool() })
    }
    return promptStore
  }

  const getSyncService = () => {
    if (!syncService) {
      const syncConfig = readSyncServerConfig()
      syncService = new SyncService<unknown>(
        createSyncRepository<unknown>(syncConfig),
        syncConfig.pullLimit,
      )
      syncReady = syncService.initialize()
    }

    return syncService
  }

  const ensureSyncReady = async () => {
    getSyncService()
    await syncReady
    return syncService as SyncService<unknown>
  }

  const buildAuthSessionResponse = (c: Context): AuthSessionResponse => {
    const auth = resolveAuthContext(c)
    const config = readAuthServerConfig()
    return {
      authMode: auth.authMode,
      authenticated: auth.authenticated,
      userId: auth.userId,
      username: auth.username,
      canonicalOrigin: config.canonicalOrigin,
    }
  }

  const requireAuthenticatedUser = (c: Context) => {
    const auth = resolveAuthContext(c)
    if (!auth.authenticated || !auth.userId) {
      throw new SyncApiError('Authentication required.', 401)
    }
    return auth
  }

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

        const statusCode = toApiStatusCode(error) as 400 | 401 | 500
        return c.json(toApiError(error), statusCode)
      }
    }

  const jsonRouteWithStatus =
    <T>(handler: (c: Context) => Promise<T>) =>
    async (c: Context) => {
      try {
        await ensureSyncReady()
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

  app.get('/api/auth/session', jsonRoute('GET /api/auth/session', async (c) => {
    return buildAuthSessionResponse(c)
  }))

  app.post('/api/auth/login', jsonRoute('POST /api/auth/login', async (c) => {
    const config = readAuthServerConfig()
    if (config.authMode !== 'external') {
      throw new SyncApiError('Login is only available when external auth is enabled.', 400)
    }

    const payload = validateAuthLoginPayload(await c.req.json().catch(() => null))
    const usernameMatches = payload.username === config.adminUsername
    const passwordMatches = config.adminPasswordHash
      ? verifyPasswordHash(payload.password, config.adminPasswordHash)
      : false

    if (!usernameMatches || !passwordMatches) {
      throw new SyncApiError('Invalid username or password.', 401)
    }

    const userId = getAuthenticatedUserId(config)
    setSessionCookie(c, config, {
      userId,
      username: config.adminUsername,
      expiresAt: Date.now() + config.sessionTtlSeconds * 1000,
    })

    const response: AuthLoginResponse = {
      session: {
        authMode: config.authMode,
        authenticated: true,
        userId,
        username: config.adminUsername,
        canonicalOrigin: config.canonicalOrigin,
      },
    }
    return response
  }))

  app.post('/api/auth/logout', jsonRoute('POST /api/auth/logout', async (c) => {
    const config = readAuthServerConfig()
    clearSessionCookie(c)
    return {
      session: {
        authMode: config.authMode,
        authenticated: config.authMode === 'stub',
        userId: config.authMode === 'stub' ? config.stubUserId : null,
        username: config.authMode === 'stub' ? config.adminUsername : null,
        canonicalOrigin: config.canonicalOrigin,
      },
    } satisfies AuthLoginResponse
  }))

  app.get('/api/storage/status', jsonRoute('GET /api/storage/status', async (c) => {
    const auth = requireAuthenticatedUser(c)
    return storageAdminService.getStatus(auth)
  }))

  app.post('/api/storage/backup/database', async (c) => {
    try {
      const auth = requireAuthenticatedUser(c)
      const backup = await storageAdminService.createDatabaseBackup(auth)
      const file = await readFile(backup.filePath)
      applyBackupHeaders(c, backup)
      return new Response(file, {
        status: 200,
        headers: c.res.headers,
      })
    } catch (error) {
      if (shouldLogApiError(error)) {
        logError('[codex] POST /api/storage/backup/database failed', error)
      }
      const statusCode = toApiStatusCode(error) as 400 | 401 | 500
      return c.json(toApiError(error), statusCode)
    }
  })

  app.post('/api/storage/workspaces', jsonRoute('POST /api/storage/workspaces', async (c) => {
    const auth = requireAuthenticatedUser(c)
    const payload = validateWorkspaceNamePayload(await c.req.json().catch(() => null))
    return storageAdminService.createWorkspace(auth, payload.name)
  }))

  app.patch('/api/storage/workspaces/:workspaceId', jsonRoute('PATCH /api/storage/workspaces/:workspaceId', async (c) => {
    const auth = requireAuthenticatedUser(c)
    const workspaceId = c.req.param('workspaceId')
    if (!workspaceId) {
      throw new StorageAdminError('workspaceId is required.', 400)
    }

    const payload = validateWorkspaceNamePayload(await c.req.json().catch(() => null))
    return storageAdminService.renameWorkspace(auth, workspaceId, payload.name)
  }))

  app.delete('/api/storage/workspaces/:workspaceId', jsonRoute('DELETE /api/storage/workspaces/:workspaceId', async (c) => {
    const auth = requireAuthenticatedUser(c)
    const workspaceId = c.req.param('workspaceId')
    if (!workspaceId) {
      throw new StorageAdminError('workspaceId is required.', 400)
    }

    return storageAdminService.deleteWorkspace(auth, workspaceId)
  }))

  const handleAiStatus = jsonRoute('GET /api/ai/status', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = getRequestedProviderType(c)
    const bridge = providerType ? await getBridge(providerType, workspaceId) : await getDefaultBridge()
    const status = await bridge.getStatus()
    return status
  })

  const handleAiRevalidate = jsonRoute('POST /api/ai/revalidate', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = getRequestedProviderType(c)
    const bridge = providerType ? await getBridge(providerType, workspaceId) : await getDefaultBridge()
    const status = await bridge.revalidate()
    return status
  })

  app.get('/api/codex/status', handleAiStatus)
  app.get('/api/ai/status', handleAiStatus)

  app.post('/api/codex/revalidate', handleAiRevalidate)
  app.post('/api/ai/revalidate', handleAiRevalidate)

  app.get('/api/codex/settings', jsonRoute('GET /api/codex/settings', async (c) => {
    requireAuthenticatedUser(c)
    const defaultBridge = await getDefaultBridge()
    const settings = await defaultBridge.getSettings()
    return settings
  }))

  app.put('/api/codex/settings', jsonRoute('PUT /api/codex/settings', async (c) => {
    requireAuthenticatedUser(c)
    const defaultBridge = await getDefaultBridge()
    const payload = validateSettingsPayload(await c.req.json().catch(() => null))
    const settings = await defaultBridge.saveSettings(payload.businessPrompt)
    return settings
  }))

  app.post('/api/codex/settings/reset', jsonRoute('POST /api/codex/settings/reset', async (c) => {
    requireAuthenticatedUser(c)
    const defaultBridge = await getDefaultBridge()
    const settings = await defaultBridge.resetSettings()
    return settings
  }))

  // ============================================
  // AI Provider 管理端点（新增）
  // ============================================
  
  app.get('/api/ai/providers', jsonRoute('GET /api/ai/providers', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    
    // Provider 基础信息
    const providerDefinitions = [
      { 
        type: 'codex', 
        name: 'OpenAI Codex', 
        description: '本地 CLI 运行，需要安装 codex 并登录',
        requiresApiKey: false,
      },
      { 
        type: 'deepseek', 
        name: 'DeepSeek', 
        description: 'DeepSeek API，支持 deepseek-chat 和 deepseek-reasoner',
        requiresApiKey: true,
      },
      { 
        type: 'kimi-code', 
        name: 'Kimi Code', 
        description: 'Moonshot 代码模型；会员 Key 需通过受支持的 Coding Agent 或 CLI 使用',
        requiresApiKey: true,
      },
    ] as const
    
    const providersWithStatus = await Promise.all(
      providerDefinitions.map(async (info) => {
        try {
          const providerBridge = await getBridge(info.type, workspaceId)
          const status = await providerBridge.getStatus()
          return {
            type: info.type,
            name: info.name,
            description: info.description,
            ready: status.ready,
            requiresApiKey: info.requiresApiKey,
            features: {
              streaming: true,
              structuredOutput: true,
              contextInjection: true,
            },
          }
        } catch (error) {
          return {
            type: info.type,
            name: info.name,
            description: info.description,
            ready: false,
            requiresApiKey: info.requiresApiKey,
            features: {
              streaming: true,
              structuredOutput: true,
              contextInjection: true,
            },
          }
        }
      })
    )
    
    return providersWithStatus
  }))
  
  app.post('/api/ai/validate', jsonRoute('POST /api/ai/validate', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const body = await c.req.json().catch(() => ({}))
    const providerType = body?.type
    
    if (!providerType || !supportedProviderTypes.includes(providerType)) {
      throw new CodexBridgeError('invalid_request', 'Invalid provider type')
    }
    
    try {
      const providerBridge = await getBridge(providerType, workspaceId)
      const status = await providerBridge.getStatus()
      
      return {
        valid: status.ready,
        error: status.issues[0]?.message,
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }))
  
  // 获取指定 Provider 的配置（不包含敏感信息如 API Key）
  app.get('/api/ai/config', jsonRoute('GET /api/ai/config', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = c.req.query('provider')
    
    if (!workspaceId) {
      throw new CodexBridgeError('invalid_request', 'X-Workspace-Id header is required')
    }
    if (!providerType) {
      throw new CodexBridgeError('invalid_request', 'provider query param is required')
    }
    
    const service = getSyncService()
    const repo = (service as unknown as { repository: { getAiProviderConfig: (workspaceId: string, providerType: string) => Promise<{ apiKey?: string; model?: string; baseUrl?: string } | null> } }).repository
    
    if (!repo?.getAiProviderConfig) {
      return { hasConfig: false, model: null, baseUrl: null }
    }
    
    const config = await repo.getAiProviderConfig(workspaceId, providerType)
    
    return {
      hasConfig: !!config?.apiKey,
      model: config?.model || null,
      baseUrl: config?.baseUrl || null,
    }
  }))
  
  // 设置 Provider 配置（包括 API Key）
  app.post('/api/ai/config', jsonRoute('POST /api/ai/config', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const body = await c.req.json().catch(() => ({}))
    const { provider: providerType, apiKey, model, baseUrl } = body
    
    if (!workspaceId) {
      throw new CodexBridgeError('invalid_request', 'X-Workspace-Id header is required')
    }
    if (!providerType || !supportedConfigurableProviderTypes.includes(providerType)) {
      throw new CodexBridgeError('invalid_request', 'Invalid provider type. Only deepseek and kimi-code are supported.')
    }
    
    const service = getSyncService()
    const repo = (service as unknown as { repository: { setAiProviderConfig: (workspaceId: string, providerType: string, config: { apiKey?: string; model?: string; baseUrl?: string }) => Promise<void> } }).repository
    
    if (!repo?.setAiProviderConfig) {
      throw new CodexBridgeError('invalid_request', 'AI provider config storage is not available')
    }
    
    // 保存配置
    await repo.setAiProviderConfig(workspaceId, providerType, {
      apiKey: apiKey || undefined,
      model: model || undefined,
      baseUrl: baseUrl || undefined,
    })
    
    // 清除缓存，使新配置立即生效
    clearBridgeCache(workspaceId, providerType)
    
    // 验证新配置
    try {
      const providerBridge = await getBridge(providerType, workspaceId)
      const status = await providerBridge.getStatus()
      
      return {
        success: true,
        valid: status.ready,
        error: status.issues[0]?.message || null,
      }
    } catch (error) {
      return {
        success: true,
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to validate configuration',
      }
    }
  }))
  
  // 删除 Provider 配置
  app.delete('/api/ai/config', jsonRoute('DELETE /api/ai/config', async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = c.req.query('provider')
    
    if (!workspaceId) {
      throw new CodexBridgeError('invalid_request', 'X-Workspace-Id header is required')
    }
    if (!providerType) {
      throw new CodexBridgeError('invalid_request', 'provider query param is required')
    }
    
    const service = getSyncService()
    const repo = (service as unknown as { repository: { deleteAiProviderConfig: (workspaceId: string, providerType: string) => Promise<void> } }).repository
    
    if (repo?.deleteAiProviderConfig) {
      await repo.deleteAiProviderConfig(workspaceId, providerType)
    }
    
    // 清除缓存
    clearBridgeCache(workspaceId, providerType)
    
    return { success: true }
  }))

  const handleAiChat = async (c: Context) => {
    let request: AiChatRequest
    try {
      requireAuthenticatedUser(c)
      request = validateChatRequest(await c.req.json().catch(() => null))
    } catch (error) {
      const statusCode = toApiStatusCode(error) as 400 | 401 | 500
      return c.json(toApiError(error), statusCode)
    }

    // 从 header 获取指定的 provider，否则使用默认
    const providerType = getRequestedProviderType(c)
    const workspaceId = getWorkspaceIdFromHeader(c)
    const chatBridge = providerType 
      ? await getBridge(providerType, workspaceId) 
      : await getDefaultBridge()
    const providerName = getProviderDisplayName(providerType)

    return createNdjsonResponse(async (emit) => {
      emit({
        type: 'status',
        stage: 'starting_codex',
        message: `正在调用 ${providerName}…`,
      })
      emit({
        type: 'status',
        stage: 'waiting_first_token',
        message: `${providerName} 正在生成自然语言回答…`,
      })
      let assistantMessage = ''
      let emittedStreamingStatus = false

      try {
        const streamResult = await chatBridge.streamChat(request, {
          onAssistantDelta: (delta) => {
            if (!emittedStreamingStatus) {
              emittedStreamingStatus = true
              emit({
                type: 'status',
                stage: 'streaming',
                message: `${providerName} 正在输出回答…`,
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
            message: `${providerName} 已生成回答，正在写入消息…`,
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
        const result = await chatBridge.planChanges(request, assistantMessage)
        emit({
          type: 'result',
          data: result,
        })
      } catch (error) {
        emitErrorEvent(emit, error, 'planning_changes')
      }
    })
  }

  app.post('/api/codex/chat', handleAiChat)
  app.post('/api/ai/chat', handleAiChat)

  app.post('/api/codex/import/preview', async (c) => {
    let request: TextImportRequest
    try {
      requireAuthenticatedUser(c)
      request = validateImportRequest(await c.req.json().catch(() => null))
    } catch (error) {
      const statusCode = toApiStatusCode(error) as 400 | 401 | 500
      return c.json(toApiError(error), statusCode)
    }
    const requestId = createImportRequestId()
    const requestStartedAt = Date.now()
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = getRequestedProviderType(c)
    const importBridge = providerType
      ? await getBridge(providerType, workspaceId)
      : await getDefaultBridge()
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
        const result = await importBridge.previewTextImport(request, {
          requestId,
          onStatus: ({ stage, message }) => {
            emit({
              type: 'status',
              stage,
              message,
            })
          },
          onTrace: (entry) => {
            emit({
              type: 'trace',
              entry,
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
    requireAuthenticatedUser(c)
    const request = validateImportAdjudicationRequest(await c.req.json().catch(() => null))
    const startedAt = Date.now()
    const workspaceId = getWorkspaceIdFromHeader(c)
    const providerType = getRequestedProviderType(c)
    const adjudicationBridge = providerType
      ? await getBridge(providerType, workspaceId)
      : await getDefaultBridge()
    logInfo(
      formatSemanticLog(request.jobId, {
        event: 'request_started',
        candidateCount: request.candidates.length,
        batchTitle: request.batchTitle ?? null,
      }),
    )

    try {
      const result = await adjudicationBridge.adjudicateTextImportCandidates(request)
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
        message: '该接口已废弃，请改用 /api/ai/status 和 /api/ai/chat。',
      },
      410,
    ),
  )

  app.post('/api/sync/bootstrap', jsonRouteWithStatus(async (c) => {
    const auth = requireAuthenticatedUser(c)
    const request = await c.req.json() as SyncBootstrapRequest<unknown>
    const service = getSyncService()
    return service.bootstrap(auth.userId!, request)
  }))

  app.post('/api/sync/push', jsonRouteWithStatus(async (c) => {
    const auth = requireAuthenticatedUser(c)
    const request = await c.req.json() as SyncPushRequest<unknown>
    const service = getSyncService()
    return service.push(auth.userId!, request)
  }))

  app.get('/api/sync/pull', jsonRouteWithStatus(async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = c.req.query('workspaceId')
    const afterCursor = Number(c.req.query('afterCursor') ?? 0)
    const limit = Number(c.req.query('limit') ?? readSyncServerConfig().pullLimit)
    if (!workspaceId) {
      throw new Error('workspaceId is required.')
    }
    const service = getSyncService()
    return service.pull(workspaceId, afterCursor, limit)
  }))

  app.post('/api/sync/resolve-conflict', jsonRouteWithStatus(async (c) => {
    const auth = requireAuthenticatedUser(c)
    const request = await c.req.json() as SyncResolveConflictRequest<unknown>
    const service = getSyncService()
    return service.resolveConflict(auth.userId!, request)
  }))

  app.post('/api/sync/analyze-conflict', jsonRoute('POST /api/sync/analyze-conflict', async (c) => {
    requireAuthenticatedUser(c)
    const request = validateAnalyzeConflictRequest(await c.req.json().catch(() => null))
    return (await getDefaultBridge()).analyzeSyncConflict(request)
  }))

  app.get('/api/workspace/full', jsonRouteWithStatus(async (c) => {
    requireAuthenticatedUser(c)
    const workspaceId = c.req.query('workspaceId')
    if (!workspaceId) {
      throw new Error('workspaceId is required.')
    }
    const service = getSyncService()
    return service.getWorkspaceFull(workspaceId)
  }))

  app.post('/api/workspace/restore', jsonRouteWithStatus(async (c) => {
    const auth = requireAuthenticatedUser(c)
    const request = await c.req.json() as WorkspaceRestoreRequest<unknown>
    const service = getSyncService()
    return service.restoreWorkspace(auth.userId!, request)
  }))

  return app
}

function applyBackupHeaders(c: Context, backup: DatabaseBackupMeta): void {
  c.header('Content-Type', backup.contentType)
  c.header('Content-Disposition', `attachment; filename="${backup.fileName}"`)
  c.header('Cache-Control', 'no-store')
  c.header('X-BrainFlow-Backup-Created-At', String(backup.createdAt))
}
