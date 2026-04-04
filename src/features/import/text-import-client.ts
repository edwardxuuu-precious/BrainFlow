import type {
  CodexApiError,
  TextImportRequest,
  TextImportStreamEvent,
} from '../../../shared/ai-contract'
import { CodexRequestError } from '../ai/ai-client'

const IMPORT_CONNECT_TIMEOUT_MS = 90000

function createRequestError(
  message: string,
  options?: { code?: CodexApiError['code']; rawMessage?: string },
): CodexRequestError {
  const error = new CodexRequestError(message)
  error.code = options?.code
  if (options?.rawMessage) {
    error.message = options.rawMessage
  }
  return error
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
      throw createRequestError(error.message)
    }

    throw createRequestError(error instanceof Error ? error.message : String(error))
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function streamCodexTextImportPreview(
  request: TextImportRequest,
  onEvent: (event: TextImportStreamEvent) => void,
): Promise<void> {
  const response = await fetchWithTimeout('/api/codex/import/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as CodexApiError | null
    throw createRequestError(payload?.rawMessage ?? payload?.message ?? 'Import request failed', {
      code: payload?.code,
      rawMessage: payload?.rawMessage,
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
        const event = JSON.parse(line) as TextImportStreamEvent
        if (event.type === 'error' && event.rawMessage) {
          onEvent({
            ...event,
            message: event.rawMessage,
          })
          return
        }
        onEvent(event)
      })
  }

  if (buffer.trim()) {
    const event = JSON.parse(buffer) as TextImportStreamEvent
    if (event.type === 'error' && event.rawMessage) {
      onEvent({
        ...event,
        message: event.rawMessage,
      })
      return
    }
    onEvent(event)
  }
}
