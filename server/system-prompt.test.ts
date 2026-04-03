// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSystemPromptStore, resolveDefaultPromptFile } from './system-prompt.js'

describe('system prompt store', () => {
  let tempRoot: string | null = null

  afterEach(async () => {
    delete process.env.BRAINFLOW_SYSTEM_PROMPT_FILE

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true })
      tempRoot = null
    }
  })

  it('resolves the repo prompt file for built server modules', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'brainflow-system-prompt-'))

    const distServerDir = join(tempRoot, 'server', 'dist', 'server')
    const promptDir = join(tempRoot, 'server', 'prompts')
    const promptFile = join(promptDir, 'brainflow-system.md')

    await mkdir(distServerDir, { recursive: true })
    await mkdir(promptDir, { recursive: true })
    await writeFile(promptFile, 'prompt from repo', 'utf8')

    expect(resolveDefaultPromptFile(join(distServerDir, 'system-prompt.js'))).toBe(promptFile)
  })

  it('loads the fallback repo prompt for built server modules', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'brainflow-system-prompt-'))

    const distServerDir = join(tempRoot, 'server', 'dist', 'server')
    const promptDir = join(tempRoot, 'server', 'prompts')
    const promptFile = join(promptDir, 'brainflow-system.md')
    const settingsFile = join(tempRoot, 'settings.json')

    await mkdir(distServerDir, { recursive: true })
    await mkdir(promptDir, { recursive: true })
    await writeFile(promptFile, 'prompt from repo', 'utf8')

    const store = createSystemPromptStore({
      moduleFilePath: join(distServerDir, 'system-prompt.js'),
      settingsFile,
    })

    await expect(store.getSettings()).resolves.toMatchObject({
      businessPrompt: 'prompt from repo',
      updatedAt: 0,
    })
  })
})
