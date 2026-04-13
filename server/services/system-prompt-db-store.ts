/**
 * System Prompt 数据库存储实现
 * 将业务 Prompt 存储在 Postgres 中，便于 Docker 备份
 */

import type { Pool } from 'pg'
import type { LoadedSystemPrompt, SystemPromptStore } from '../system-prompt.js'
import type { CodexSettings } from '../../shared/ai-contract.js'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import {
  DEFAULT_BUSINESS_PROMPT,
  DEFAULT_SYSTEM_PROMPT_FILENAME,
  SAFETY_SYSTEM_PROMPT,
  migrateLegacyPromptBranding,
} from '../system-prompt-defaults.js'

const DEFAULT_SUMMARY_MAX_CHARS = 220

interface CreateDbSystemPromptStoreOptions {
  pool: Pool
  defaultPromptFile?: string
}

function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12)
}

function summarizePrompt(prompt: string): string {
  const maxChars = Number(
    process.env.BRAINFLOW_SYSTEM_PROMPT_SUMMARY_MAX_CHARS ?? DEFAULT_SUMMARY_MAX_CHARS,
  )
  const condensed = prompt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')

  if (condensed.length <= maxChars) {
    return condensed
  }

  const sliceLength = Math.max(0, maxChars - 3)
  return `${condensed.slice(0, sliceLength).trimEnd()}...`
}

function resolveDefaultPromptCandidates(moduleFilePath: string): string[] {
  const moduleDir = dirname(moduleFilePath)

  return [
    join(moduleDir, 'prompts', DEFAULT_SYSTEM_PROMPT_FILENAME),
    join(moduleDir, '..', 'prompts', DEFAULT_SYSTEM_PROMPT_FILENAME),
    join(moduleDir, '..', '..', 'prompts', DEFAULT_SYSTEM_PROMPT_FILENAME),
    resolve(process.cwd(), 'server', 'prompts', DEFAULT_SYSTEM_PROMPT_FILENAME),
  ]
}

function resolveDefaultPromptFile(moduleFilePath = fileURLToPath(import.meta.url)): string {
  const configured = process.env.BRAINFLOW_SYSTEM_PROMPT_FILE
  if (configured) {
    return resolve(process.cwd(), configured)
  }

  for (const candidate of resolveDefaultPromptCandidates(moduleFilePath)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return resolveDefaultPromptCandidates(moduleFilePath)[0]
}

async function loadDefaultBusinessPrompt(defaultPromptFile: string): Promise<string> {
  try {
    return migrateLegacyPromptBranding((await readFile(defaultPromptFile, 'utf8')).trim())
  } catch {
    return DEFAULT_BUSINESS_PROMPT
  }
}

function toSettings(businessPrompt: string, updatedAt: number): CodexSettings {
  return {
    businessPrompt,
    updatedAt,
    version: hashPrompt(businessPrompt),
  }
}

export function createDbSystemPromptStore(options: CreateDbSystemPromptStoreOptions): SystemPromptStore {
  const { pool } = options
  const defaultPromptFile = options.defaultPromptFile ?? resolveDefaultPromptFile()

  return {
    async getSettings() {
      const result = await pool.query(
        `SELECT business_prompt, updated_at FROM system_prompts WHERE id = 'default'`,
      )

      if (result.rows.length > 0) {
        const storedPrompt = String(result.rows[0].business_prompt ?? '')
        const migratedPrompt = migrateLegacyPromptBranding(storedPrompt)
        const updatedAt = Number(result.rows[0].updated_at)

        if (migratedPrompt !== storedPrompt) {
          await pool.query(
            `UPDATE system_prompts
             SET business_prompt = $1
             WHERE id = 'default'`,
            [migratedPrompt],
          )
        }

        return toSettings(migratedPrompt, updatedAt)
      }

      const defaultPrompt = await loadDefaultBusinessPrompt(defaultPromptFile)
      return toSettings(defaultPrompt, 0)
    },

    async saveSettings(businessPrompt) {
      const nextPrompt = businessPrompt.trim()
      const updatedAt = Date.now()

      await pool.query(
        `INSERT INTO system_prompts (id, business_prompt, updated_at)
         VALUES ('default', $1, $2)
         ON CONFLICT (id)
         DO UPDATE SET business_prompt = $1, updated_at = $2`,
        [nextPrompt, updatedAt],
      )

      return toSettings(nextPrompt, updatedAt)
    },

    async resetSettings() {
      await pool.query(`DELETE FROM system_prompts WHERE id = 'default'`)

      const defaultPrompt = await loadDefaultBusinessPrompt(defaultPromptFile)
      return toSettings(defaultPrompt, 0)
    },

    async loadPrompt() {
      const settings = await this.getSettings()
      const fullPrompt = `${SAFETY_SYSTEM_PROMPT}\n\n${settings.businessPrompt}`.trim()

      return {
        fullPrompt,
        summary: summarizePrompt(fullPrompt),
        version: hashPrompt(fullPrompt),
        settings,
      } as LoadedSystemPrompt
    },
  }
}
