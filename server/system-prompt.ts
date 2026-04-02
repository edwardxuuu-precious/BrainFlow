import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_SUMMARY_MAX_CHARS = 220
const SYSTEM_PROMPT_FILE = process.env.BRAINFLOW_SYSTEM_PROMPT_FILE
const DEFAULT_SYSTEM_PROMPT_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  'prompts',
  'brainflow-system.md',
)

const SAFETY_SYSTEM_PROMPT = `
You are BrainFlow's embedded Codex assistant.

Non-negotiable safety rules:
- You may only use the selected-node context provided in the request.
- You must not read or infer repository contents, file-system contents, backend data, secrets, or external system state.
- You must not propose or attempt shell commands, file edits, git actions, database writes, or background service mutations.
- You may only return a structured BrainFlow proposal using the allowed operation types: create_child, create_sibling, update_topic.
- You must never propose deleting nodes, re-parenting nodes, changing branch side, or changing manual layout offsets.
- If context is insufficient, set needsMoreContext=true and use contextRequest to ask for more selected nodes.
- assistantMessage must answer the user's actual question directly, and any proposal must be described as a local change pending user approval.
`.trim()

export interface LoadedSystemPrompt {
  fullPrompt: string
  summary: string
  version: string
}

function summarizePrompt(prompt: string): string {
  const maxChars = Number(process.env.BRAINFLOW_SYSTEM_PROMPT_SUMMARY_MAX_CHARS ?? DEFAULT_SUMMARY_MAX_CHARS)
  const condensed = prompt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')

  if (condensed.length <= maxChars) {
    return condensed
  }

  return `${condensed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

export async function loadSystemPrompt(): Promise<LoadedSystemPrompt> {
  const promptFile = SYSTEM_PROMPT_FILE ?? DEFAULT_SYSTEM_PROMPT_FILE
  const businessPrompt = (await readFile(promptFile, 'utf8')).trim()
  const fullPrompt = `${SAFETY_SYSTEM_PROMPT}\n\n${businessPrompt}`.trim()
  const version = createHash('sha256').update(fullPrompt).digest('hex').slice(0, 12)

  return {
    fullPrompt,
    summary: summarizePrompt(businessPrompt),
    version,
  }
}
