import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import type { CodexSettings } from '../shared/ai-contract.js'

const DEFAULT_SUMMARY_MAX_CHARS = 220
const DEFAULT_SYSTEM_PROMPT_FILENAME = 'brainflow-system.md'

const SAFETY_SYSTEM_PROMPT = `
You are BrainFlow's embedded Codex assistant.

Non-negotiable safety rules:
- You may use the full mind-map context provided in the request, and treat the current selection only as a focus hint.
- You must not read or infer repository contents, file-system contents, backend data, secrets, or external system state.
- You must not propose or attempt shell commands, file edits, git actions, database writes, or background service mutations.
- You may only return structured BrainFlow mind-map operations.
- Allowed operations are create_child, create_sibling, update_topic, move_topic, and delete_topic.
- Metadata and style changes are allowed only as local topic-field updates inside those operations.
- You must never propose changing branch side, manual layout offsets, export settings, or any repo/backend behavior.
- Prefer preserving the user's original framing; do not force a methodology unless the user explicitly asks for one.
- Only delete or restructure existing nodes when the user explicitly asks to delete, replace, regroup, or reorganize content.
- If the request is too ambiguous to apply safely, ask one minimal clarification question instead of guessing.
- assistantMessage should answer the user's actual request directly, and proposal should represent local canvas changes only.
`.trim()

export interface LoadedSystemPrompt {
  fullPrompt: string
  summary: string
  version: string
  settings: CodexSettings
}

export interface SystemPromptStore {
  loadPrompt(): Promise<LoadedSystemPrompt>
  getSettings(): Promise<CodexSettings>
  saveSettings(businessPrompt: string): Promise<CodexSettings>
  resetSettings(): Promise<CodexSettings>
}

interface CreateSystemPromptStoreOptions {
  moduleFilePath?: string
  settingsFile?: string
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

export function resolveDefaultPromptFile(moduleFilePath = fileURLToPath(import.meta.url)): string {
  const configured = process.env.BRAINFLOW_SYSTEM_PROMPT_FILE
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
  }

  for (const candidate of resolveDefaultPromptCandidates(moduleFilePath)) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return resolveDefaultPromptCandidates(moduleFilePath)[0]
}

function resolveSettingsFile(): string {
  const configured = process.env.BRAINFLOW_AI_SETTINGS_FILE
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, 'BrainFlow', 'ai-settings.json')
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'BrainFlow', 'ai-settings.json')
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(xdgConfigHome, 'BrainFlow', 'ai-settings.json')
}

async function loadDefaultBusinessPrompt(defaultPromptFile: string): Promise<string> {
  return (await readFile(defaultPromptFile, 'utf8')).trim()
}

async function readStoredPrompt(
  settingsFile: string,
): Promise<{ businessPrompt: string; updatedAt: number } | null> {
  try {
    const raw = await readFile(settingsFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<{
      businessPrompt: unknown
      updatedAt: unknown
    }>

    if (typeof parsed.businessPrompt !== 'string') {
      return null
    }

    return {
      businessPrompt: parsed.businessPrompt,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

function toSettings(businessPrompt: string, updatedAt: number): CodexSettings {
  return {
    businessPrompt,
    updatedAt,
    version: hashPrompt(businessPrompt),
  }
}

export function createSystemPromptStore(
  options: CreateSystemPromptStoreOptions = {},
): SystemPromptStore {
  const defaultPromptFile = resolveDefaultPromptFile(options.moduleFilePath)
  const settingsFile = options.settingsFile ?? resolveSettingsFile()

  return {
    async getSettings() {
      const stored = await readStoredPrompt(settingsFile)
      if (stored) {
        return toSettings(stored.businessPrompt, stored.updatedAt)
      }

      const defaultPrompt = await loadDefaultBusinessPrompt(defaultPromptFile)
      return toSettings(defaultPrompt, 0)
    },

    async saveSettings(businessPrompt) {
      const nextPrompt = businessPrompt.trim()
      const updatedAt = Date.now()

      await mkdir(dirname(settingsFile), { recursive: true })
      await writeFile(
        settingsFile,
        JSON.stringify(
          {
            businessPrompt: nextPrompt,
            updatedAt,
          },
          null,
          2,
        ),
        'utf8',
      )

      return toSettings(nextPrompt, updatedAt)
    },

    async resetSettings() {
      await rm(settingsFile, { force: true })
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
      }
    },
  }
}

const defaultSystemPromptStore = createSystemPromptStore()

export async function loadSystemPrompt(): Promise<LoadedSystemPrompt> {
  return defaultSystemPromptStore.loadPrompt()
}

export async function getCodexSettings(): Promise<CodexSettings> {
  return defaultSystemPromptStore.getSettings()
}

export async function saveCodexSettings(businessPrompt: string): Promise<CodexSettings> {
  return defaultSystemPromptStore.saveSettings(businessPrompt)
}

export async function resetCodexSettings(): Promise<CodexSettings> {
  return defaultSystemPromptStore.resetSettings()
}
