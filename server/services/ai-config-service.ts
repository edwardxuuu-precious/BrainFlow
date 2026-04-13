/**
 * AI Provider API Key 配置服务
 * 支持存储和获取用户配置的 API Key
 */

import type { Pool } from 'pg'

export interface AiProviderConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface AiConfigService {
  getProviderConfig(workspaceId: string, providerType: string): Promise<AiProviderConfig | null>
  setProviderConfig(workspaceId: string, providerType: string, config: AiProviderConfig): Promise<void>
  deleteProviderConfig(workspaceId: string, providerType: string): Promise<void>
}

export class PostgresAiConfigService implements AiConfigService {
  private pool: Pool
  
  constructor(pool: Pool) {
    this.pool = pool
  }

  async getProviderConfig(workspaceId: string, providerType: string): Promise<AiProviderConfig | null> {
    const result = await this.pool.query(
      `SELECT config FROM ai_provider_configs 
       WHERE workspace_id = $1 AND provider_type = $2`,
      [workspaceId, providerType]
    )
    
    if (result.rows.length === 0) {
      return null
    }
    
    return result.rows[0].config as AiProviderConfig
  }

  async setProviderConfig(workspaceId: string, providerType: string, config: AiProviderConfig): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_provider_configs (workspace_id, provider_type, config, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (workspace_id, provider_type) 
       DO UPDATE SET config = $3, updated_at = NOW()`,
      [workspaceId, providerType, JSON.stringify(config)]
    )
  }

  async deleteProviderConfig(workspaceId: string, providerType: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM ai_provider_configs 
       WHERE workspace_id = $1 AND provider_type = $2`,
      [workspaceId, providerType]
    )
  }
}

// 内存存储（用于测试或单用户本地模式）
export class MemoryAiConfigService implements AiConfigService {
  private configs = new Map<string, AiProviderConfig>()

  private key(workspaceId: string, providerType: string): string {
    return `${workspaceId}:${providerType}`
  }

  async getProviderConfig(workspaceId: string, providerType: string): Promise<AiProviderConfig | null> {
    return this.configs.get(this.key(workspaceId, providerType)) ?? null
  }

  async setProviderConfig(workspaceId: string, providerType: string, config: AiProviderConfig): Promise<void> {
    this.configs.set(this.key(workspaceId, providerType), config)
  }

  async deleteProviderConfig(workspaceId: string, providerType: string): Promise<void> {
    this.configs.delete(this.key(workspaceId, providerType))
  }
}
