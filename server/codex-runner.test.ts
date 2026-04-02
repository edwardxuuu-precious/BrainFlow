// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createCodexRunner } from './codex-runner.js'

describe('createCodexRunner', () => {
  it('returns a verification issue when codex is missing', async () => {
    const runCommand = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    const runner = createCodexRunner({ runCommand })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: false,
      ready: false,
      issues: [expect.objectContaining({ code: 'cli_missing' })],
    })
  })

  it('returns verification required when login provider is not ChatGPT', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ stdout: 'codex 1.0.0', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'Logged in using API key', stderr: '', exitCode: 0 })
    const runner = createCodexRunner({ runCommand })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: true,
      loggedIn: false,
      authProvider: 'API key',
      ready: false,
      issues: [expect.objectContaining({ code: 'verification_required' })],
    })
  })

  it('executes codex with the required safety flags in an empty temp directory', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValue({
        stdout: JSON.stringify({
          type: 'item.completed',
          item: {
            type: 'agent_message',
            text: '{"assistantMessage":"ok","needsMoreContext":false,"contextRequest":[],"proposal":null}',
          },
        }),
        stderr: '',
        exitCode: 0,
      })
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, mkdtemp, writeFile, rm })

    const result = await runner.execute('prompt text', { type: 'object' })

    expect(result).toContain('"assistantMessage":"ok"')
    expect(runCommand).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining([
        'exec',
        '--sandbox',
        'read-only',
        '--json',
        '--ephemeral',
        '--skip-git-repo-check',
      ]),
      expect.objectContaining({
        cwd: 'C:\\temp\\brainflow-codex-test',
      }),
    )
    expect(writeFile).toHaveBeenCalled()
    expect(rm).toHaveBeenCalledWith('C:\\temp\\brainflow-codex-test', {
      recursive: true,
      force: true,
    })
  })
})
