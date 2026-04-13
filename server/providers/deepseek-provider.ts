/**
 * DeepSeek Provider
 * 支持 DeepSeek API (https://api.deepseek.com)
 * 模型: deepseek-chat, deepseek-reasoner
 */

import type {
  AiMessage,
  AiProvider,
  AiProviderStatus,
  ExecuteStreamOptions,
  ExecuteStructuredOptions,
} from './types.js'
import {
  readSSEStream,
  parseSSEData,
  createObservation,
  extractJsonBlock,
  fetchWithTimeout,
} from './utils.js'

export interface DeepSeekProviderOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

interface DeepSeekConfig {
  apiKey: string
  model: string
  baseUrl: string
  timeoutMs: number
}

// DeepSeek API 响应类型
interface DeepSeekStreamResponse {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index?: number
    delta: {
      role?: string
      content?: string
      reasoning_content?: string
    }
    finish_reason?: string | null
  }>
  error?: {
    message: string
    type?: string
    code?: string
  }
}

interface DeepSeekChatResponse {
  id?: string
  choices?: Array<{
    message?: {
      role?: string
      content?: string
      reasoning_content?: string
    }
    finish_reason?: string
  }>
  error?: {
    message: string
    type?: string
    code?: string
  }
}

function getConfig(options?: DeepSeekProviderOptions): DeepSeekConfig {
  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required')
  }

  return {
    apiKey,
    model: options?.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    baseUrl: options?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    timeoutMs: options?.timeoutMs ?? 180000,
  }
}

export function createDeepSeekProvider(options?: DeepSeekProviderOptions): AiProvider {
  const config = getConfig(options)

  return {
    name: 'deepseek',

    async getStatus(): Promise<AiProviderStatus> {
      try {
        // 简单验证 API Key 是否有效
        const response = await fetchWithTimeout(
          `${config.baseUrl}/models`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
          },
          10000,
        )

        if (!response.ok) {
          if (response.status === 401) {
            return {
              ready: false,
              issues: [
                {
                  code: 'authentication_failed',
                  message: 'DeepSeek API Key 无效或已过期',
                },
              ],
              metadata: { httpStatus: response.status },
            }
          }

          return {
            ready: false,
            issues: [
              {
                code: 'provider_unavailable',
                message: `DeepSeek API 返回错误: ${response.status}`,
              },
            ],
            metadata: { httpStatus: response.status },
          }
        }

        return {
          ready: true,
          issues: [],
          metadata: { model: config.model },
        }
      } catch (error) {
        return {
          ready: false,
          issues: [
            {
              code: 'provider_unavailable',
              message: `无法连接到 DeepSeek API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          metadata: {},
        }
      }
    },

    async executeStructured(
      prompt: string,
      schema: object,
      options?: ExecuteStructuredOptions,
    ): Promise<string> {
      const messages: AiMessage[] = [
        { role: 'system', content: buildSystemPromptWithSchema(schema) },
        { role: 'user', content: prompt },
      ]

      options?.onObservation?.(
        createObservation('spawn_started', 'structured', prompt.length),
      )

      const response = await fetchWithTimeout(
        `${config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            response_format: { type: 'json_object' },
            stream: false,
          }),
        },
        config.timeoutMs,
      )

      if (!response.ok) {
        const error = await parseErrorResponse(response)
        throw new Error(`DeepSeek API error: ${error.message}`)
      }

      const data = (await response.json()) as DeepSeekChatResponse

      if (data.error) {
        throw new Error(`DeepSeek API error: ${data.error.message}`)
      }

      const content = data.choices?.[0]?.message?.content
      if (!content) {
        throw new Error('DeepSeek API returned empty content')
      }

      // 提取 JSON 块
      const jsonBlock = extractJsonBlock(content)
      if (!jsonBlock) {
        throw new Error('Failed to extract JSON from DeepSeek response')
      }

      options?.onObservation?.(
        createObservation('completed', 'structured', prompt.length, {
          hadJsonEvent: true,
          exitCode: 0,
        }),
      )

      return jsonBlock
    },

    async executeStream(
      messages: AiMessage[],
      options?: ExecuteStreamOptions,
    ): Promise<string> {
      options?.onObservation?.(
        createObservation('spawn_started', 'stream', JSON.stringify(messages).length),
      )

      const response = await fetchWithTimeout(
        `${config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: true,
          }),
        },
        config.timeoutMs,
      )

      if (!response.ok) {
        const error = await parseErrorResponse(response)
        throw new Error(`DeepSeek API error: ${error.message}`)
      }

      let fullText = ''
      let firstTokenReceived = false

      for await (const data of readSSEStream(response)) {
        const parsed = parseSSEData<DeepSeekStreamResponse>(data)
        if (!parsed) continue

        if (parsed.error) {
          throw new Error(`DeepSeek stream error: ${parsed.error.message}`)
        }

        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue

        // 处理思维链内容（仅 deepseek-reasoner）
        const reasoningContent = delta.reasoning_content
        const content = delta.content

        // 如果有思维链内容，可以先输出（可选）
        if (reasoningContent) {
          // 这里可以选择是否输出思维链
          // 暂时只输出最终内容
        }

        if (content) {
          if (!firstTokenReceived) {
            firstTokenReceived = true
            options?.onObservation?.(
              createObservation('first_token', 'stream', JSON.stringify(messages).length, {
                hadJsonEvent: true,
              }),
            )
          }

          fullText += content
          options?.onDelta?.(content)
        }

        // 检查是否完成
        if (parsed.choices?.[0]?.finish_reason) {
          break
        }
      }

      options?.onObservation?.(
        createObservation('completed', 'stream', JSON.stringify(messages).length, {
          hadJsonEvent: true,
          exitCode: 0,
        }),
      )

      return fullText
    },
  }
}

/**
 * 构建带 schema 的系统提示词
 * DeepSeek 支持 json_object 模式，但不直接支持 JSON Schema 约束
 * 我们通过 prompt engineering 来实现 schema 指导
 */
function buildSystemPromptWithSchema(schema: object): string {
  return `You are a helpful assistant that always responds with valid JSON.

Your response must follow this JSON Schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

Important:
1. Respond ONLY with valid JSON, no markdown formatting, no explanations
2. Ensure all required fields are present
3. Use null for optional fields that are not applicable
4. Do not include any text outside the JSON object`
}

async function parseErrorResponse(response: Response): Promise<{ message: string; code?: string }> {
  try {
    const data = (await response.json()) as { error?: { message: string; code?: string } }
    return {
      message: data.error?.message ?? `HTTP ${response.status}`,
      code: data.error?.code,
    }
  } catch {
    return { message: `HTTP ${response.status}` }
  }
}
