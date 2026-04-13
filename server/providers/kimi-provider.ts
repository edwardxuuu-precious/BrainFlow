/**
 * Kimi Provider (Moonshot AI)
 * 支持 Moonshot AI API (https://api.moonshot.cn)
 * 模型: moonshot-v1-8k, moonshot-v1-32k, moonshot-v1-128k
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

export interface KimiProviderOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

interface KimiConfig {
  apiKey: string
  model: string
  baseUrl: string
  timeoutMs: number
}

// Kimi API 响应类型
interface KimiStreamResponse {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index?: number
    delta: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  error?: {
    message: string
    type?: string
    code?: string
  }
}

interface KimiChatResponse {
  id?: string
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string
  }>
  error?: {
    message: string
    type?: string
    code?: string
  }
}

interface KimiModelsResponse {
  data?: Array<{
    id?: string
  }>
  error?: {
    message?: string
    code?: string
  }
}

function getConfig(options?: KimiProviderOptions): KimiConfig {
  const apiKey = options?.apiKey ?? process.env.KIMI_API_KEY
  if (!apiKey) {
    throw new Error('KIMI_API_KEY is required')
  }

  return {
    apiKey,
    model: options?.model ?? process.env.KIMI_MODEL ?? 'moonshot-v1-32k',
    baseUrl: options?.baseUrl ?? process.env.KIMI_BASE_URL ?? 'https://api.moonshot.cn',
    timeoutMs: options?.timeoutMs ?? 180000,
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function toOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  return normalized.toLowerCase().endsWith('/v1') ? normalized : `${normalized}/v1`
}

function buildKimiApiUrl(baseUrl: string, path: string): string {
  const apiBaseUrl = toOpenAiCompatibleBaseUrl(baseUrl)
  const normalizedPath = path.replace(/^\/+/, '')
  return `${apiBaseUrl}/${normalizedPath}`
}

function usesMoonshotOpenPlatformBaseUrl(baseUrl: string): boolean {
  return toOpenAiCompatibleBaseUrl(baseUrl).toLowerCase() === 'https://api.moonshot.cn/v1'
}

function usesKimiCodeMembershipBaseUrl(baseUrl: string): boolean {
  return toOpenAiCompatibleBaseUrl(baseUrl).toLowerCase() === 'https://api.kimi.com/coding/v1'
}

function looksLikeKimiCodeMembershipKey(apiKey: string): boolean {
  return apiKey.startsWith('sk-kimi-')
}

function getKimiCodeDefaultModel(apiKey: string, baseUrl: string): string {
  if (looksLikeKimiCodeMembershipKey(apiKey) || usesKimiCodeMembershipBaseUrl(baseUrl)) {
    return 'kimi-for-coding'
  }

  return 'kimi-k2.5'
}

function getAuthenticationFallbackMessage(
  providerLabel: string,
  config: KimiConfig,
): string {
  if (usesKimiCodeMembershipBaseUrl(config.baseUrl) || looksLikeKimiCodeMembershipKey(config.apiKey)) {
    return `${providerLabel} API Key 无效、已过期，或不是 Kimi Code 会员 API Key。`
  }

  return `${providerLabel} API Key 无效、已过期，或不是 Moonshot 开放平台 Key。`
}

function detectKimiCodeAuthMismatch(config: KimiConfig): string | null {
  if (!looksLikeKimiCodeMembershipKey(config.apiKey)) {
    return null
  }

  if (!usesMoonshotOpenPlatformBaseUrl(config.baseUrl)) {
    return null
  }

  return '当前配置默认走 Moonshot 开放平台 https://api.moonshot.cn，但你填写的 key 看起来像 Kimi Code 会员 API Key（sk-kimi-...）。这两套鉴权不通用；请改用开放平台 Key，或把 Base URL 改为 https://api.kimi.com/coding 且将模型改为 kimi-for-coding。'
}

function usesKimiCodeMembershipAccess(config: KimiConfig): boolean {
  return (
    looksLikeKimiCodeMembershipKey(config.apiKey) ||
    usesKimiCodeMembershipBaseUrl(config.baseUrl)
  )
}

function getKimiCodeDirectAccessUnsupportedMessage(): string {
  return 'Kimi Code 会员接口当前仅支持 Kimi CLI、Claude Code、Roo Code 等受支持的 Coding Agent。BrainFlow 目前不是官方支持的直连接入方；请改用 Kimi CLI/受支持 Agent 做本地桥接，或改用 Moonshot 开放平台 Key + https://api.moonshot.cn + kimi-k2.5。'
}

function detectUnsupportedKimiCodeDirectAccess(config: KimiConfig): string | null {
  if (!usesKimiCodeMembershipAccess(config)) {
    return null
  }

  return getKimiCodeDirectAccessUnsupportedMessage()
}

async function checkMoonshotStatus(
  config: KimiConfig,
  providerLabel: string,
): Promise<AiProviderStatus> {
  const recommendedModel = getKimiCodeDefaultModel(config.apiKey, config.baseUrl)

  try {
    const response = await fetchWithTimeout(
      buildKimiApiUrl(config.baseUrl, 'models'),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
      },
      10000,
    )

    if (!response.ok) {
      const error = await parseErrorResponse(response)

      if (response.status === 401) {
        return {
          ready: false,
          issues: [
            {
              code: 'authentication_failed',
              message: error.message
                ? `${providerLabel} 鉴权失败：${error.message}`
                : getAuthenticationFallbackMessage(providerLabel, config),
            },
          ],
          metadata: { httpStatus: response.status, rawCode: error.code },
        }
      }

      return {
        ready: false,
        issues: [
          {
            code: 'provider_unavailable',
            message: error.message
              ? `${providerLabel} API 返回错误：${error.message}`
              : `${providerLabel} API 返回错误: ${response.status}`,
          },
        ],
        metadata: { httpStatus: response.status, rawCode: error.code },
      }
    }

    const data = (await response.json().catch(() => null)) as KimiModelsResponse | null
    const modelIds = data?.data?.flatMap((item) => (item.id ? [item.id] : [])) ?? []

    if (modelIds.length > 0 && !modelIds.includes(config.model)) {
      return {
        ready: false,
        issues: [
          {
            code: 'provider_unavailable',
            message: `${providerLabel} 当前模型 "${config.model}" 不在可用模型列表中，建议改为 "${recommendedModel}"。`,
          },
        ],
        metadata: {
          model: config.model,
          availableModels: modelIds,
        },
      }
    }

    return {
      ready: true,
      issues: [],
      metadata: {
        model: config.model,
        availableModels: modelIds,
      },
    }
  } catch (error) {
    return {
      ready: false,
      issues: [
        {
          code: 'provider_unavailable',
          message: `无法连接到 ${providerLabel} API: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      metadata: {},
    }
  }
}

export function createKimiProvider(options?: KimiProviderOptions): AiProvider {
  const config = getConfig(options)

  return {
    name: 'kimi',

    async getStatus(): Promise<AiProviderStatus> {
      return checkMoonshotStatus(config, 'Kimi')
    },

    async executeStructured(
      prompt: string,
      schema: object,
      options?: ExecuteStructuredOptions,
    ): Promise<string> {
      // Kimi 支持工具调用，我们用工具调用来实现结构化输出
      const toolName = 'structured_output'
      const toolDefinition = {
        type: 'function' as const,
        function: {
          name: toolName,
          description: 'Output structured data according to the schema',
          parameters: schema,
        },
      }

      const messages: AiMessage[] = [
        { role: 'system', content: buildSystemPromptWithSchema(schema) },
        { role: 'user', content: prompt },
      ]

      options?.onObservation?.(
        createObservation('spawn_started', 'structured', prompt.length),
      )

      const response = await fetchWithTimeout(
        buildKimiApiUrl(config.baseUrl, 'chat/completions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            tools: [toolDefinition],
            tool_choice: { type: 'function', function: { name: toolName } },
            stream: false,
          }),
        },
        config.timeoutMs,
      )

      if (!response.ok) {
        const error = await parseErrorResponse(response)
        throw new Error(`Kimi API error: ${error.message}`)
      }

      const data = (await response.json()) as KimiChatResponse

      if (data.error) {
        throw new Error(`Kimi API error: ${data.error.message}`)
      }

      // 尝试从 tool_calls 获取结果
      const toolCalls = data.choices?.[0]?.message?.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        const args = toolCalls[0].function?.arguments
        if (args) {
          // 验证是有效 JSON
          const parsed = JSON.parse(args)
          options?.onObservation?.(
            createObservation('completed', 'structured', prompt.length, {
              hadJsonEvent: true,
              exitCode: 0,
            }),
          )
          return JSON.stringify(parsed)
        }
      }

      // 回退：从 content 提取
      const content = data.choices?.[0]?.message?.content
      if (content) {
        const jsonBlock = extractJsonBlock(content)
        if (jsonBlock) {
          options?.onObservation?.(
            createObservation('completed', 'structured', prompt.length, {
              hadJsonEvent: true,
              exitCode: 0,
            }),
          )
          return jsonBlock
        }
      }

      throw new Error('Failed to extract structured output from Kimi response')
    },

    async executeStream(
      messages: AiMessage[],
      options?: ExecuteStreamOptions,
    ): Promise<string> {
      options?.onObservation?.(
        createObservation('spawn_started', 'stream', JSON.stringify(messages).length),
      )

      const response = await fetchWithTimeout(
        buildKimiApiUrl(config.baseUrl, 'chat/completions'),
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
        throw new Error(`Kimi API error: ${error.message}`)
      }

      let fullText = ''
      let firstTokenReceived = false

      for await (const data of readSSEStream(response)) {
        const parsed = parseSSEData<KimiStreamResponse>(data)
        if (!parsed) continue

        if (parsed.error) {
          throw new Error(`Kimi stream error: ${parsed.error.message}`)
        }

        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue

        const content = delta.content
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

/**
 * Kimi Code Provider
 * 专为代码生成优化的 Moonshot AI 模型
 */
export function createKimiCodeProvider(options?: KimiProviderOptions): AiProvider {
  // 使用 Kimi Code 特定的环境变量，或者回退到普通 Kimi 的配置
  const apiKey = options?.apiKey ?? process.env.KIMI_CODE_API_KEY ?? process.env.KIMI_API_KEY
  if (!apiKey) {
    throw new Error('KIMI_CODE_API_KEY or KIMI_API_KEY is required')
  }

  const defaultBaseUrl = looksLikeKimiCodeMembershipKey(apiKey)
    ? 'https://api.kimi.com/coding'
    : 'https://api.moonshot.cn'
  const resolvedBaseUrl =
    options?.baseUrl ?? process.env.KIMI_CODE_BASE_URL ?? process.env.KIMI_BASE_URL ?? defaultBaseUrl

  const config: KimiConfig = {
    apiKey,
    model: options?.model ?? process.env.KIMI_CODE_MODEL ?? getKimiCodeDefaultModel(apiKey, resolvedBaseUrl),
    baseUrl: resolvedBaseUrl,
    timeoutMs: options?.timeoutMs ?? 180000,
  }

  return {
    name: 'kimi-code',

    async getStatus(): Promise<AiProviderStatus> {
      const authMismatchMessage = detectKimiCodeAuthMismatch(config)
      if (authMismatchMessage) {
        return {
          ready: false,
          issues: [
            {
              code: 'authentication_failed',
              message: authMismatchMessage,
            },
          ],
          metadata: {
            baseUrl: config.baseUrl,
            model: config.model,
            keyFormat: 'kimi-code-membership',
          },
        }
      }

      const unsupportedDirectAccessMessage = detectUnsupportedKimiCodeDirectAccess(config)
      if (unsupportedDirectAccessMessage) {
        return {
          ready: false,
          issues: [
            {
              code: 'provider_unavailable',
              message: unsupportedDirectAccessMessage,
            },
          ],
          metadata: {
            baseUrl: config.baseUrl,
            model: config.model,
            directAccessMode: 'unsupported_membership_api',
          },
        }
      }

      return checkMoonshotStatus(config, 'Kimi Code')
    },

    async executeStructured(
      prompt: string,
      schema: object,
      options?: ExecuteStructuredOptions,
    ): Promise<string> {
      const unsupportedDirectAccessMessage = detectUnsupportedKimiCodeDirectAccess(config)
      if (unsupportedDirectAccessMessage) {
        throw new Error(unsupportedDirectAccessMessage)
      }

      // Kimi Code 使用与 Kimi 相同的实现
      const toolName = 'structured_output'
      const toolDefinition = {
        type: 'function' as const,
        function: {
          name: toolName,
          description: 'Output structured data according to the schema',
          parameters: schema,
        },
      }

      const messages: AiMessage[] = [
        { role: 'system', content: buildSystemPromptWithSchema(schema) },
        { role: 'user', content: prompt },
      ]

      options?.onObservation?.(
        createObservation('spawn_started', 'structured', prompt.length),
      )

      const response = await fetchWithTimeout(
        buildKimiApiUrl(config.baseUrl, 'chat/completions'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            tools: [toolDefinition],
            tool_choice: { type: 'function', function: { name: toolName } },
            stream: false,
          }),
        },
        config.timeoutMs,
      )

      if (!response.ok) {
        const error = await parseErrorResponse(response)
        throw new Error(`Kimi Code API error: ${error.message}`)
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            tool_calls?: Array<{
              function?: { arguments?: string }
            }>
            content?: string | null
          }
        }>
        error?: { message: string }
      }

      if (data.error) {
        throw new Error(`Kimi Code API error: ${data.error.message}`)
      }

      const toolCalls = data.choices?.[0]?.message?.tool_calls
      if (toolCalls && toolCalls.length > 0) {
        const args = toolCalls[0].function?.arguments
        if (args) {
          const parsed = JSON.parse(args)
          options?.onObservation?.(
            createObservation('completed', 'structured', prompt.length, {
              hadJsonEvent: true,
              exitCode: 0,
            }),
          )
          return JSON.stringify(parsed)
        }
      }

      const content = data.choices?.[0]?.message?.content
      if (content) {
        const jsonBlock = extractJsonBlock(content)
        if (jsonBlock) {
          options?.onObservation?.(
            createObservation('completed', 'structured', prompt.length, {
              hadJsonEvent: true,
              exitCode: 0,
            }),
          )
          return jsonBlock
        }
      }

      throw new Error('Failed to extract structured output from Kimi Code response')
    },

    async executeStream(
      messages: AiMessage[],
      options?: ExecuteStreamOptions,
    ): Promise<string> {
      const unsupportedDirectAccessMessage = detectUnsupportedKimiCodeDirectAccess(config)
      if (unsupportedDirectAccessMessage) {
        throw new Error(unsupportedDirectAccessMessage)
      }

      options?.onObservation?.(
        createObservation('spawn_started', 'stream', JSON.stringify(messages).length),
      )

      const response = await fetchWithTimeout(
        buildKimiApiUrl(config.baseUrl, 'chat/completions'),
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
        throw new Error(`Kimi Code API error: ${error.message}`)
      }

      let fullText = ''
      let firstTokenReceived = false

      for await (const data of readSSEStream(response)) {
        const parsed = parseSSEData<{
          choices?: Array<{
            delta?: { content?: string }
            finish_reason?: string | null
          }>
          error?: { message: string }
        }>(data)
        if (!parsed) continue

        if (parsed.error) {
          throw new Error(`Kimi Code stream error: ${parsed.error.message}`)
        }

        const content = parsed.choices?.[0]?.delta?.content
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
