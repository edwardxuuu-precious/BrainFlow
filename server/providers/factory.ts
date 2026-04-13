/**
 * AI Provider factory
 */

import type { AiProvider, ProviderType } from './types.js'
import { createCodexProvider } from './codex-provider.js'
import { createDeepSeekProvider } from './deepseek-provider.js'
import { createKimiProvider, createKimiCodeProvider } from './kimi-provider.js'

export type { ProviderType }
export type { AiProvider }

export interface CreateProviderOptions {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export function createProvider(type: ProviderType, options?: CreateProviderOptions): AiProvider {
  switch (type) {
    case 'codex':
      return createCodexProvider()
    case 'deepseek':
      return createDeepSeekProvider(
        options?.apiKey
          ? {
              apiKey: options.apiKey,
              model: options.model,
              baseUrl: options.baseUrl,
            }
          : undefined,
      )
    case 'kimi':
      return createKimiProvider(
        options?.apiKey
          ? {
              apiKey: options.apiKey,
              model: options.model,
              baseUrl: options.baseUrl,
            }
          : undefined,
      )
    case 'kimi-code':
      return createKimiCodeProvider(
        options?.apiKey
          ? {
              apiKey: options.apiKey,
              model: options.model,
              baseUrl: options.baseUrl,
            }
          : undefined,
      )
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

export function createProviderFromEnv(): AiProvider {
  const providerType = (process.env.BRAINFLOW_AI_PROVIDER ?? 'codex') as ProviderType

  if (!['codex', 'deepseek', 'kimi', 'kimi-code'].includes(providerType)) {
    console.warn(`Unknown provider type: ${providerType}, falling back to codex`)
    return createCodexProvider()
  }

  return createProvider(providerType)
}

export function getConfiguredProviderType(): ProviderType {
  return (process.env.BRAINFLOW_AI_PROVIDER ?? 'codex') as ProviderType
}

export function isProviderAvailable(type: ProviderType): boolean {
  switch (type) {
    case 'codex':
      return true
    case 'deepseek':
      return !!process.env.DEEPSEEK_API_KEY
    case 'kimi':
      return !!process.env.KIMI_API_KEY
    case 'kimi-code':
      return !!process.env.KIMI_CODE_API_KEY || !!process.env.KIMI_API_KEY
    default:
      return false
  }
}

export function isProviderAvailableWithConfig(
  type: ProviderType,
  config?: { apiKey?: string },
): boolean {
  switch (type) {
    case 'codex':
      return true
    case 'deepseek':
      return !!(config?.apiKey || process.env.DEEPSEEK_API_KEY)
    case 'kimi':
      return !!(config?.apiKey || process.env.KIMI_API_KEY)
    case 'kimi-code':
      return !!(config?.apiKey || process.env.KIMI_CODE_API_KEY || process.env.KIMI_API_KEY)
    default:
      return false
  }
}

export interface ProviderInfo {
  type: ProviderType
  name: string
  description: string
  ready: boolean
}

export function getAvailableProviders(): ProviderInfo[] {
  return [
    {
      type: 'codex',
      name: 'OpenAI Codex',
      description: '本地 CLI 运行，需要安装 codex 并登录',
      ready: isProviderAvailable('codex'),
    },
    {
      type: 'deepseek',
      name: 'DeepSeek',
      description: 'DeepSeek API，支持 deepseek-chat 和 deepseek-reasoner',
      ready: isProviderAvailable('deepseek'),
    },
    {
      type: 'kimi-code',
      name: 'Kimi Code',
      description: '月之暗面代码模型 API，专为代码生成优化',
      ready: isProviderAvailable('kimi-code'),
    },
  ]
}
