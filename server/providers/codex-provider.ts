/**
 * Codex Provider - 包装 Codex CLI
 * 将现有的 CodexRunner 适配为 AiProvider 接口
 */

import type { CodexRunner, CodexJsonEvent } from '../codex-runner.js'
import { createCodexRunner } from '../codex-runner.js'
import {
  createCodexCompletedEvent,
  createCodexDeltaEvent,
  createObservation,
} from './utils.js'
import type {
  AiMessage,
  AiProvider,
  AiProviderStatus,
  ExecuteStreamOptions,
  ExecuteStructuredOptions,
} from './types.js'

export interface CodexProviderOptions {
  runner?: CodexRunner
}

/**
 * 将 Codex JSON 事件转换为标准 AiStreamEvent
 */
function convertCodexEvent(event: CodexJsonEvent): unknown {
  // 直接透传，保持与原有格式兼容
  return event
}

/**
 * 从 messages 构建提示词
 */
function buildPromptFromMessages(messages: AiMessage[]): string {
  return messages
    .map((m) => {
      if (m.role === 'system') {
        return `<system>\n${m.content}\n</system>`
      }
      if (m.role === 'user') {
        return m.content
      }
      return m.content
    })
    .join('\n\n')
}

export function createCodexProvider(options?: CodexProviderOptions): AiProvider {
  const runner = options?.runner ?? createCodexRunner()

  return {
    name: 'codex',

    async getStatus(): Promise<AiProviderStatus> {
      const status = await runner.getStatus()

      return {
        ready: status.ready,
        issues: status.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
        })),
        metadata: {
          cliInstalled: status.cliInstalled,
          loggedIn: status.loggedIn,
          authProvider: status.authProvider,
        },
      }
    },

    async executeStructured(
      prompt: string,
      schema: object,
      options?: ExecuteStructuredOptions,
    ): Promise<string> {
      let finalText = ''

      await runner.execute(prompt, schema, {
        onEvent: (event) => {
          options?.onEvent?.(convertCodexEvent(event) as typeof event)

          // 提取最终文本
          if (event.type === 'item.completed' && event.item?.text) {
            finalText = event.item.text
          }
        },
        onStderrLine: options?.onStderrLine,
        onObservation: (event) => {
          options?.onObservation?.({
            phase: event.phase === 'first_json_event' ? 'first_token' : event.phase,
            kind: event.kind === 'message' ? 'stream' : 'structured',
            timestampMs: event.timestampMs,
            promptLength: event.promptLength,
            elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
            exitCode: event.exitCode,
            hadJsonEvent: event.hadJsonEvent,
          })
        },
      })

      return finalText
    },

    async executeStream(
      messages: AiMessage[],
      options?: ExecuteStreamOptions,
    ): Promise<string> {
      const prompt = buildPromptFromMessages(messages)
      let fullText = ''
      let firstTokenObserved = false

      await runner.executeMessage(prompt, {
        onEvent: (event) => {
          const converted = convertCodexEvent(event) as CodexJsonEvent

          // 提取 delta 并回调
          const delta =
            converted.item?.delta ??
            converted.item?.text_delta ??
            converted.delta

          if (delta) {
            if (!firstTokenObserved) {
              firstTokenObserved = true
              options?.onObservation?.(
                createObservation('first_token', 'stream', prompt.length, {
                  hadJsonEvent: true,
                }),
              )
            }
            fullText += delta
            options?.onDelta?.(delta)
            options?.onEvent?.(createCodexDeltaEvent(delta))
          }
        },
        onStderrLine: options?.onStderrLine,
        onObservation: (obs) => {
          // 转换观察事件
          options?.onObservation?.({
            phase: obs.phase === 'first_json_event' ? 'first_token' : obs.phase,
            kind: obs.kind === 'message' ? 'stream' : 'structured',
            timestampMs: obs.timestampMs,
            promptLength: obs.promptLength,
            elapsedSinceLastEventMs: obs.elapsedSinceLastEventMs,
            exitCode: obs.exitCode,
            hadJsonEvent: obs.hadJsonEvent,
          })
        },
      })

      // 发送完成事件
      options?.onEvent?.(createCodexCompletedEvent(fullText))

      return fullText
    },
  }
}
