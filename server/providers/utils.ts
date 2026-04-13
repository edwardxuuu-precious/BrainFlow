/**
 * Provider 通用工具函数
 */

import type { AiExecutionObservation, AiStreamEvent } from './types.js'

/**
 * 创建 SSE 流读取器
 */
export async function* readSSEStream(
  response: Response,
): AsyncGenerator<string, void, unknown> {
  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6)
          if (data === '[DONE]') return
          yield data
        }
      }
    }

    // 处理剩余内容
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6)
        if (data !== '[DONE]') yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 解析 SSE 数据为 JSON
 */
export function parseSSEData<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

/**
 * 创建执行观察事件
 */
export function createObservation(
  phase: AiExecutionObservation['phase'],
  kind: AiExecutionObservation['kind'],
  promptLength: number,
  options?: {
    elapsedSinceLastEventMs?: number
    exitCode?: number
    hadJsonEvent?: boolean
  },
): AiExecutionObservation {
  return {
    phase,
    kind,
    timestampMs: Date.now(),
    promptLength,
    ...options,
  }
}

/**
 * 创建模拟的 Codex 风格事件
 * 用于将 HTTP API 响应转换为 Codex 兼容的流事件
 */
export function createCodexDeltaEvent(delta: string): AiStreamEvent {
  return {
    type: 'item.delta',
    item: {
      type: 'message',
      delta,
      text_delta: delta,
    },
  }
}

export function createCodexCompletedEvent(text: string): AiStreamEvent {
  return {
    type: 'item.completed',
    item: {
      type: 'agent_message',
      text,
    },
  }
}

export function createCodexErrorEvent(message: string): AiStreamEvent {
  return {
    type: 'error',
    error: { message },
  }
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 安全地解析 JSON，失败时返回 null
 */
export function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * 从文本中提取 JSON 块
 * 用于处理模型返回的非标准 JSON 输出
 */
export function extractJsonBlock(text: string): string | null {
  // 尝试直接解析
  const direct = safeParseJson(text)
  if (direct) return text

  // 尝试提取 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim()
    if (safeParseJson(extracted)) return extracted
  }

  // 尝试提取 { ... } 或 [ ... ] 块
  const objectMatch = text.match(/(\{[\s\S]*\})/)
  if (objectMatch) {
    const extracted = objectMatch[1].trim()
    if (safeParseJson(extracted)) return extracted
  }

  return null
}

/**
 * 构建 OpenAI 风格的消息列表
 */
export function buildOpenAIMessages(
  systemPrompt: string,
  userPrompt: string,
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * 带超时的 fetch
 */
export async function fetchWithTimeout(
  input: string | URL | globalThis.Request,
  init?: RequestInit,
  timeoutMs = 60000,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
