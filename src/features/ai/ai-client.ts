import type {
  AiChatRequest,
  AiProviderInfo,
  AiProviderValidationResult,
  AiStreamEvent,
  CodexApiError,
  CodexSettings,
  CodexStatus,
} from '../../../shared/ai-contract'
import { readJsonStorage } from '../storage/utils/storage-helpers'

const STATUS_REQUEST_TIMEOUT_MS = 8000
const CHAT_CONNECT_TIMEOUT_MS = 180000
const BRIDGE_UNAVAILABLE_MESSAGE =
  '本机 AI bridge 无响应，请确认本地 bridge 已启动，并检查 8787 端口服务。'
const BRIDGE_TIMEOUT_MESSAGE = '本机 AI bridge 响应超时，请确认本地 bridge 已启动后再试。'
const BRIDGE_INTERNAL_ERROR_MESSAGE =
  '本机 AI bridge 在线，但状态检查失败，请查看 bridge 日志后重试。'
const BRIDGE_REQUEST_FAILED_MESSAGE =
  '本机 AI bridge 处理请求失败，请查看 bridge 日志后重试。'
const CHAT_CONNECT_TIMEOUT_MESSAGE =
  'AI 对话等待响应超时，可能是本机 bridge 正在处理较久；请稍后重试，如持续失败请检查本地 bridge 日志。'

const PROVIDER_STORAGE_KEY = 'brainflow:selected-provider'
const WORKSPACE_ID_STORAGE_KEY = 'brainflow-cloud-workspace-id'
const SUPPORTED_PROVIDER_TYPES = new Set(['codex', 'deepseek', 'kimi-code'])

export type CodexRequestFailureKind = 'bridge_unavailable' | 'bridge_internal_error'

export class CodexRequestError extends Error {
  code?: CodexApiError['code']
  issues?: CodexApiError['issues']
  kind?: CodexRequestFailureKind
  status?: number
  rawMessage?: string
  requestId?: string
}

function createRequestError(
  message: string,
  code?: CodexApiError['code'],
  issues?: CodexApiError['issues'],
  options?: {
    kind?: CodexRequestFailureKind
    status?: number
  },
): CodexRequestError {
  const error = new CodexRequestError()
  error.message = message
  error.code = code
  error.issues = issues
  error.kind = options?.kind
  error.status = options?.status
  return error
}

async function parseApiError(
  response: Response,
  options?: { internalErrorMessage?: string },
): Promise<CodexRequestError> {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return createRequestError(BRIDGE_UNAVAILABLE_MESSAGE, 'request_failed', undefined, {
      kind: 'bridge_unavailable',
      status: response.status,
    })
  }

  const payload = (await response.json().catch(() => null)) as CodexApiError | null
  return createRequestError(
    payload?.message ?? options?.internalErrorMessage ?? BRIDGE_REQUEST_FAILED_MESSAGE,
    payload?.code ?? 'request_failed',
    payload?.issues,
    {
      kind: 'bridge_internal_error',
      status: response.status,
    },
  )
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { timeoutMs?: number; timeoutMessage?: string },
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? STATUS_REQUEST_TIMEOUT_MS,
  )

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createRequestError(
        options?.timeoutMessage ?? BRIDGE_TIMEOUT_MESSAGE,
        'request_failed',
        undefined,
        { kind: 'bridge_unavailable' },
      )
    }

    throw createRequestError(BRIDGE_UNAVAILABLE_MESSAGE, 'request_failed', undefined, {
      kind: 'bridge_unavailable',
    })
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { internalErrorMessage?: string },
): Promise<T> {
  const response = await fetchWithTimeout(input, init)
  if (!response.ok) {
    throw await parseApiError(response, options)
  }

  return response.json() as Promise<T>
}

function normalizeProviderType(type: string | null | undefined): string {
  if (type === 'kimi') {
    return 'kimi-code'
  }

  return type && SUPPORTED_PROVIDER_TYPES.has(type) ? type : 'codex'
}

function buildWorkspaceHeaders(workspaceId?: string): Record<string, string> {
  const headers: Record<string, string> = {}
  const resolvedWorkspaceId = workspaceId ?? getStoredWorkspaceId()
  if (resolvedWorkspaceId) {
    headers['X-Workspace-Id'] = resolvedWorkspaceId
  }
  return headers
}

function buildProviderHeaders(options?: {
  providerType?: string
  workspaceId?: string
}): Record<string, string> {
  return {
    'X-AI-Provider': normalizeProviderType(options?.providerType ?? getStoredProvider()),
    ...buildWorkspaceHeaders(options?.workspaceId),
  }
}

export function getStoredProvider(): string {
  if (typeof localStorage === 'undefined') {
    return 'codex'
  }

  const raw = localStorage.getItem(PROVIDER_STORAGE_KEY)
  const normalized = normalizeProviderType(raw)
  if (raw !== normalized) {
    localStorage.setItem(PROVIDER_STORAGE_KEY, normalized)
  }
  return normalized
}

export function setStoredProvider(type: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  localStorage.setItem(PROVIDER_STORAGE_KEY, normalizeProviderType(type))
}

export function getStoredWorkspaceId(): string | undefined {
  return readJsonStorage<string>(WORKSPACE_ID_STORAGE_KEY) ?? undefined
}

export async function fetchCodexStatus(options?: {
  providerType?: string
  workspaceId?: string
}): Promise<CodexStatus> {
  return fetchJson<CodexStatus>(
    '/api/ai/status',
    {
      headers: buildProviderHeaders(options),
    },
    {
      internalErrorMessage: BRIDGE_INTERNAL_ERROR_MESSAGE,
    },
  )
}

export async function revalidateCodexStatus(options?: {
  providerType?: string
  workspaceId?: string
}): Promise<CodexStatus> {
  return fetchJson<CodexStatus>(
    '/api/ai/revalidate',
    {
      method: 'POST',
      headers: buildProviderHeaders(options),
    },
    {
      internalErrorMessage: BRIDGE_INTERNAL_ERROR_MESSAGE,
    },
  )
}

export async function fetchCodexSettings(): Promise<CodexSettings> {
  return fetchJson<CodexSettings>('/api/codex/settings')
}

export async function saveCodexSettings(businessPrompt: string): Promise<CodexSettings> {
  return fetchJson<CodexSettings>('/api/codex/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ businessPrompt }),
  })
}

export async function resetCodexSettings(): Promise<CodexSettings> {
  return fetchJson<CodexSettings>('/api/codex/settings/reset', {
    method: 'POST',
  })
}

export async function fetchAvailableProviders(workspaceId?: string): Promise<AiProviderInfo[]> {
  return fetchJson<AiProviderInfo[]>('/api/ai/providers', {
    headers: buildWorkspaceHeaders(workspaceId),
  })
}

export async function validateProvider(
  type: string,
  workspaceId?: string,
): Promise<AiProviderValidationResult> {
  return fetchJson<AiProviderValidationResult>('/api/ai/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildWorkspaceHeaders(workspaceId),
    },
    body: JSON.stringify({ type }),
  })
}

export interface AiProviderConfig {
  hasConfig: boolean
  model: string | null
  baseUrl: string | null
}

export interface SetAiProviderConfigRequest {
  provider: string
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface SetAiProviderConfigResult {
  success: boolean
  valid: boolean
  error: string | null
}

export async function getAiProviderConfig(
  provider: string,
  workspaceId: string,
): Promise<AiProviderConfig> {
  return fetchJson<AiProviderConfig>(`/api/ai/config?provider=${encodeURIComponent(provider)}`, {
    headers: {
      'X-Workspace-Id': workspaceId,
    },
  })
}

export async function setAiProviderConfig(
  config: SetAiProviderConfigRequest,
  workspaceId: string,
): Promise<SetAiProviderConfigResult> {
  return fetchJson<SetAiProviderConfigResult>('/api/ai/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workspace-Id': workspaceId,
    },
    body: JSON.stringify(config),
  })
}

export async function deleteAiProviderConfig(
  provider: string,
  workspaceId: string,
): Promise<{ success: boolean }> {
  return fetchJson<{ success: boolean }>(
    `/api/ai/config?provider=${encodeURIComponent(provider)}`,
    {
      method: 'DELETE',
      headers: {
        'X-Workspace-Id': workspaceId,
      },
    },
  )
}

export async function streamCodexChat(
  request: AiChatRequest,
  onEvent: (event: AiStreamEvent) => void,
  options?: {
    providerType?: string
  },
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...buildWorkspaceHeaders(),
    'X-AI-Provider': normalizeProviderType(options?.providerType ?? getStoredProvider()),
  }

  const response = await fetchWithTimeout(
    '/api/ai/chat',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    },
    {
      timeoutMs: CHAT_CONNECT_TIMEOUT_MS,
      timeoutMessage: CHAT_CONNECT_TIMEOUT_MESSAGE,
    },
  )

  if (!response.ok || !response.body) {
    throw await parseApiError(response, {
      internalErrorMessage: BRIDGE_REQUEST_FAILED_MESSAGE,
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    lines
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const event = JSON.parse(line) as AiStreamEvent
        onEvent(event)
      })
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as AiStreamEvent)
  }
}
