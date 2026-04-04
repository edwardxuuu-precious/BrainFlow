import type {
  MarkdownImportRequest,
  MarkdownImportStreamEvent,
} from '../../../shared/ai-contract'
import { CodexRequestError } from '../ai/ai-client'

const IMPORT_CONNECT_TIMEOUT_MS = 90000
const IMPORT_TIMEOUT_MESSAGE = 'Markdown 导入预览等待超时，请检查本地 bridge 后重试。'
const IMPORT_BRIDGE_UNAVAILABLE_MESSAGE =
  '本地 Codex bridge 无响应，请确认 bridge 已启动后再重试导入。'

function createRequestError(message: string): CodexRequestError {
  return new CodexRequestError(message)
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), IMPORT_CONNECT_TIMEOUT_MS)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createRequestError(IMPORT_TIMEOUT_MESSAGE)
    }

    throw createRequestError(IMPORT_BRIDGE_UNAVAILABLE_MESSAGE)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function streamCodexMarkdownImportPreview(
  request: MarkdownImportRequest,
  onEvent: (event: MarkdownImportStreamEvent) => void,
): Promise<void> {
  const response = await fetchWithTimeout('/api/codex/import/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null
    throw createRequestError(payload?.message ?? 'Markdown 导入预览请求失败。')
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
        onEvent(JSON.parse(line) as MarkdownImportStreamEvent)
      })
  }

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as MarkdownImportStreamEvent)
  }
}
