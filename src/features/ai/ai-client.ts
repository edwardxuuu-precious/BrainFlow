import type {
  AiChatRequest,
  AiStreamEvent,
  CodexApiError,
  CodexSettings,
  CodexStatus,
} from '../../../shared/ai-contract'

const STATUS_REQUEST_TIMEOUT_MS = 8000
const CHAT_CONNECT_TIMEOUT_MS = 90000
const BRIDGE_UNAVAILABLE_MESSAGE =
  '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。'
const BRIDGE_TIMEOUT_MESSAGE = '本机 Codex bridge 响应超时，请确认本机 bridge 已启动后再试。'
const CHAT_CONNECT_TIMEOUT_MESSAGE =
  'Codex 对话等待响应超时，可能是本机 Codex 正在处理较久；请稍后重试，如果持续失败请检查本地 bridge 日志。'

export class CodexRequestError extends Error {
  code?: CodexApiError['code']
  issues?: CodexApiError['issues']
}

function createRequestError(
  message: string,
  code?: CodexApiError['code'],
  issues?: CodexApiError['issues'],
): CodexRequestError {
  const error = new CodexRequestError(message)
  error.code = code
  error.issues = issues
  return error
}

async function parseApiError(response: Response): Promise<CodexRequestError> {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return createRequestError(BRIDGE_UNAVAILABLE_MESSAGE, 'request_failed')
  }

  const payload = (await response.json().catch(() => null)) as CodexApiError | null
  return createRequestError(payload?.message ?? 'Codex 请求失败', payload?.code, payload?.issues)
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { timeoutMs?: number; timeoutMessage?: string },
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(
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
      throw createRequestError(options?.timeoutMessage ?? BRIDGE_TIMEOUT_MESSAGE, 'request_failed')
    }

    throw createRequestError(BRIDGE_UNAVAILABLE_MESSAGE, 'request_failed')
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(input, init)
  if (!response.ok) {
    throw await parseApiError(response)
  }

  return response.json() as Promise<T>
}

export async function fetchCodexStatus(): Promise<CodexStatus> {
  return fetchJson<CodexStatus>('/api/codex/status')
}

export async function revalidateCodexStatus(): Promise<CodexStatus> {
  return fetchJson<CodexStatus>('/api/codex/revalidate', {
    method: 'POST',
  })
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

export async function streamCodexChat(
  request: AiChatRequest,
  onEvent: (event: AiStreamEvent) => void,
): Promise<void> {
  const response = await fetchWithTimeout('/api/codex/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  }, {
    timeoutMs: CHAT_CONNECT_TIMEOUT_MS,
    timeoutMessage: CHAT_CONNECT_TIMEOUT_MESSAGE,
  })

  if (!response.ok || !response.body) {
    throw await parseApiError(response)
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
