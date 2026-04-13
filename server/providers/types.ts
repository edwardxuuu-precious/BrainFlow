/**
 * AI Provider 抽象接口
 * 支持 Codex (本地 CLI)、DeepSeek、Kimi 等多种后端
 */

import type { CodexBridgeIssue } from '../../shared/ai-contract.js'

export interface AiProviderIssue {
  code: string
  message: string
}

export interface AiProviderStatus {
  ready: boolean
  issues: AiProviderIssue[]
  metadata: Record<string, unknown>
}

export interface AiExecutionObservation {
  phase: 'spawn_started' | 'heartbeat' | 'first_token' | 'completed'
  kind: 'structured' | 'stream'
  timestampMs: number
  promptLength: number
  elapsedSinceLastEventMs?: number
  exitCode?: number
  hadJsonEvent?: boolean
  stdoutLength?: number
  stderrLength?: number
}

export interface AiStreamEvent {
  type?: string
  delta?: string
  message?: string
  error?: { message?: string }
  item?: {
    type?: string
    text?: string
    delta?: string
    text_delta?: string
    message?: string
  }
  [key: string]: unknown
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ExecuteStructuredOptions {
  onEvent?: (event: AiStreamEvent) => void
  onStderrLine?: (line: string) => void
  onObservation?: (event: AiExecutionObservation) => void
}

export interface ExecuteStreamOptions {
  onDelta?: (delta: string) => void
  onStderrLine?: (line: string) => void
  onObservation?: (event: AiExecutionObservation) => void
  onEvent?: (event: AiStreamEvent) => void
}

export interface AiProvider {
  readonly name: string

  /**
   * 检查 Provider 是否就绪
   */
  getStatus(): Promise<AiProviderStatus>

  /**
   * 执行结构化输出请求（带 JSON Schema）
   * @param prompt 完整提示词
   * @param schema JSON Schema 定义
   * @param options 回调选项
   * @returns 返回 JSON 字符串
   */
  executeStructured(
    prompt: string,
    schema: object,
    options?: ExecuteStructuredOptions,
  ): Promise<string>

  /**
   * 执行流式对话
   * @param messages 消息列表
   * @param options 回调选项
   * @returns 返回完整响应文本
   */
  executeStream(
    messages: AiMessage[],
    options?: ExecuteStreamOptions,
  ): Promise<string>
}

/**
 * Provider 配置类型
 */
export type ProviderType = 'codex' | 'deepseek' | 'kimi' | 'kimi-code'

export interface ProviderConfig {
  type: ProviderType
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

/**
 * Provider 错误类型
 */
export class AiProviderError extends Error {
  code: string
  issues?: AiProviderIssue[]
  rawMessage?: string
  requestId?: string

  constructor(
    code: string,
    message: string,
    options?: {
      issues?: AiProviderIssue[]
      rawMessage?: string
      requestId?: string
    },
  ) {
    super(message)
    this.name = 'AiProviderError'
    this.code = code
    this.issues = options?.issues
    this.rawMessage = options?.rawMessage
    this.requestId = options?.requestId
  }
}

/**
 * 从 Provider 错误转换为 CodexBridgeIssue
 */
export function providerErrorToBridgeIssue(error: unknown): CodexBridgeIssue {
  if (error instanceof AiProviderError) {
    return {
      code: error.code as CodexBridgeIssue['code'],
      message: error.message,
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return {
    code: 'request_failed',
    message,
  }
}
