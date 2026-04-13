import type {
  CodexApiError,
  TextImportSemanticAdjudicationRequest,
  TextImportSemanticAdjudicationResponse,
  TextImportRequest,
  TextImportRunStage,
  TextImportStreamEvent,
} from '../../../shared/ai-contract'
import {
  CodexRequestError,
  getStoredProvider,
  getStoredWorkspaceId,
  type CodexRequestFailureKind,
} from '../ai/ai-client'

const IMPORT_CONNECT_TIMEOUT_MS = 180000
const IMPORT_BRIDGE_UNAVAILABLE_MESSAGE =
  'The local Codex bridge is unavailable. Confirm it is running on port 8787 and retry the import.'
const IMPORT_CONNECT_TIMEOUT_MESSAGE =
  'The import preview timed out while waiting for the local Codex bridge. Retry after the bridge finishes the current request.'
const IMPORT_BRIDGE_INTERNAL_ERROR_MESSAGE =
  'The local Codex bridge returned an invalid import response. Review the bridge logs and retry.'
const IMPORT_REQUEST_FAILED_MESSAGE =
  'The import preview failed inside the local Codex bridge. Review the bridge logs and retry.'
const IMPORT_INVALID_REQUEST_MESSAGE =
  'The import request was rejected before preview generation.'
const IMPORT_STREAM_INTERRUPTED_MESSAGE =
  'The import preview stream was interrupted before completion. Retry after the local Codex bridge finishes the current request.'
const IMPORT_STREAM_INVALID_MESSAGE =
  'The local Codex bridge returned an invalid import stream. Review the bridge logs and retry.'

function buildAiRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-AI-Provider': getStoredProvider(),
  }

  const workspaceId = getStoredWorkspaceId()
  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId
  }

  return headers
}

interface ImportRequestError extends CodexRequestError {
  stage?: TextImportRunStage
}

function createRequestError(
  message: string,
  options?: {
    code?: CodexApiError['code']
    issues?: CodexApiError['issues']
    kind?: CodexRequestFailureKind
    status?: number
    rawMessage?: string
    requestId?: string
    stage?: TextImportRunStage
  },
): ImportRequestError {
  const error = new CodexRequestError(message) as ImportRequestError
  error.code = options?.code
  error.issues = options?.issues
  error.kind = options?.kind
  error.status = options?.status
  error.rawMessage = options?.rawMessage
  error.requestId = options?.requestId
  error.stage = options?.stage
  return error
}

async function parseImportApiError(response: Response): Promise<CodexRequestError> {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return createRequestError(IMPORT_BRIDGE_UNAVAILABLE_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_unavailable',
      status: response.status,
    })
  }

  const payload = (await response.json().catch(() => null)) as CodexApiError | null
  if (!payload) {
    return createRequestError(IMPORT_BRIDGE_INTERNAL_ERROR_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_internal_error',
      status: response.status,
    })
  }

  return createRequestError(
    payload.code === 'invalid_request'
      ? IMPORT_INVALID_REQUEST_MESSAGE
      : IMPORT_REQUEST_FAILED_MESSAGE,
    {
      code: payload.code ?? 'request_failed',
      issues: payload.issues,
      kind: 'bridge_internal_error',
      status: response.status,
      rawMessage: payload.rawMessage ?? payload.message,
      requestId: payload.requestId,
    },
  )
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const externalSignal = init?.signal
  let timedOut = false
  let abortedExternally = false
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, IMPORT_CONNECT_TIMEOUT_MS)
  const abortFromExternalSignal = () => {
    abortedExternally = true
    controller.abort()
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (timedOut) {
        throw createRequestError(IMPORT_CONNECT_TIMEOUT_MESSAGE, {
          code: 'request_failed',
          kind: 'bridge_unavailable',
        })
      }
      if (abortedExternally) {
        throw createRequestError('The import request was cancelled.', {
          code: 'request_failed',
          kind: 'bridge_unavailable',
        })
      }
    }

    throw createRequestError(IMPORT_BRIDGE_UNAVAILABLE_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_unavailable',
    })
  } finally {
    globalThis.clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
}

function buildStreamRawMessage(
  prefix: string,
  detail: string | undefined,
): string {
  return detail ? `${prefix}: ${detail}` : prefix
}

function summarizeStreamChunk(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '(empty chunk)'
  }

  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized
}

function parseStreamEventLine(
  line: string,
  context: {
    requestId?: string
    stage?: TextImportRunStage
  },
): TextImportStreamEvent {
  try {
    const event = JSON.parse(line) as TextImportStreamEvent
    if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
      throw new Error('Missing event type')
    }
    return event
  } catch (error) {
    throw createRequestError(IMPORT_STREAM_INVALID_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_internal_error',
      rawMessage: buildStreamRawMessage(
        'Failed to parse NDJSON event',
        error instanceof Error
          ? `${error.message}; chunk=${summarizeStreamChunk(line)}`
          : summarizeStreamChunk(line),
      ),
      requestId: context.requestId,
      stage: context.stage,
    })
  }
}

function normalizeStreamEvent(event: TextImportStreamEvent): TextImportStreamEvent {
  if (event.type === 'progress') {
    return {
      ...event,
      entry: {
        ...event.entry,
        requestId: event.entry.requestId ?? event.requestId,
      },
    }
  }

  if (event.type === 'trace') {
    return {
      ...event,
      entry: {
        ...event.entry,
        requestId: event.entry.requestId ?? event.requestId,
      },
    }
  }

  return event
}

export async function adjudicateTextImportCandidates(
  request: TextImportSemanticAdjudicationRequest,
  options?: { signal?: AbortSignal },
): Promise<TextImportSemanticAdjudicationResponse> {
  const response = await fetchWithTimeout('/api/codex/import/adjudicate', {
    method: 'POST',
    headers: buildAiRequestHeaders(),
    body: JSON.stringify(request),
    signal: options?.signal,
  })

  if (!response.ok) {
    throw await parseImportApiError(response)
  }

  const payload = (await response.json().catch(() => null)) as
    | TextImportSemanticAdjudicationResponse
    | CodexApiError
    | null

  if (!payload || !('decisions' in payload) || !Array.isArray(payload.decisions)) {
    throw createRequestError(IMPORT_BRIDGE_INTERNAL_ERROR_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_internal_error',
    })
  }

  return payload
}

export async function streamCodexTextImportPreview(
  request: TextImportRequest,
  onEvent: (event: TextImportStreamEvent) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetchWithTimeout('/api/codex/import/preview', {
    method: 'POST',
    headers: buildAiRequestHeaders(),
    body: JSON.stringify(request),
    signal: options?.signal,
  })

  if (!response.ok || !response.body) {
    throw await parseImportApiError(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let lastRequestId: string | undefined
  let lastStage: TextImportRunStage | undefined
  let receivedTerminalEvent = false

  const applyEventContext = (event: TextImportStreamEvent): void => {
    lastRequestId =
      event.type === 'progress' || event.type === 'trace'
        ? event.entry.requestId ?? event.requestId ?? lastRequestId
        : event.requestId ?? lastRequestId
    if ('stage' in event && typeof event.stage === 'string') {
      lastStage = event.stage
    }
    if (event.type === 'progress') {
      lastStage = event.entry.stage
    }
    if (event.type === 'result' || event.type === 'error') {
      receivedTerminalEvent = true
    }
  }

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (error) {
      throw createRequestError(IMPORT_STREAM_INTERRUPTED_MESSAGE, {
        code: 'request_failed',
        kind: 'bridge_unavailable',
        rawMessage:
          error instanceof Error
            ? buildStreamRawMessage('Stream read failed', error.message)
            : 'Stream read failed.',
        requestId: lastRequestId,
        stage: lastStage,
      })
    }

    const { done, value } = chunk
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
        const event = normalizeStreamEvent(parseStreamEventLine(line, {
          requestId: lastRequestId,
          stage: lastStage,
        }))
        applyEventContext(event)
        onEvent(event)
      })
  }

  if (buffer.trim()) {
    const event = normalizeStreamEvent(parseStreamEventLine(buffer, {
      requestId: lastRequestId,
      stage: lastStage,
    }))
    applyEventContext(event)
    onEvent(event)
  }

  if (!receivedTerminalEvent) {
    throw createRequestError(IMPORT_STREAM_INTERRUPTED_MESSAGE, {
      code: 'request_failed',
      kind: 'bridge_unavailable',
      rawMessage: 'Stream ended before a result or error event was emitted.',
      requestId: lastRequestId,
      stage: lastStage,
    })
  }
}
