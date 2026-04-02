import type {
  AiChatRequest,
  AiStreamEvent,
  CodexApiError,
  CodexStatus,
} from '../../../shared/ai-contract'

async function parseApiError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as CodexApiError | null
  return new Error(payload?.message ?? 'Codex 请求失败')
}

export async function fetchCodexStatus(): Promise<CodexStatus> {
  const response = await fetch('/api/codex/status')
  if (!response.ok) {
    throw await parseApiError(response)
  }

  return response.json() as Promise<CodexStatus>
}

export async function revalidateCodexStatus(): Promise<CodexStatus> {
  const response = await fetch('/api/codex/revalidate', {
    method: 'POST',
  })

  if (!response.ok) {
    throw await parseApiError(response)
  }

  return response.json() as Promise<CodexStatus>
}

export async function streamCodexChat(
  request: AiChatRequest,
  onEvent: (event: AiStreamEvent) => void,
): Promise<void> {
  const response = await fetch('/api/codex/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
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
