import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_ENV_FILES = ['.env', '.env.local']

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseEnvFile(contents: string): Record<string, string> {
  const entries: Record<string, string> = {}

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim())
    if (!key) {
      continue
    }

    entries[key] = value
  }

  return entries
}

export interface LoadBrainFlowEnvResult {
  loadedFiles: string[]
}

export function loadBrainFlowEnv(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): LoadBrainFlowEnvResult {
  const loadedFiles: string[] = []

  for (const relativePath of DEFAULT_ENV_FILES) {
    const filePath = resolve(cwd, relativePath)
    if (!existsSync(filePath)) {
      continue
    }

    const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) {
        env[key] = value
      }
    }
    loadedFiles.push(filePath)
  }

  return { loadedFiles }
}
