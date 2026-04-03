// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createCodexRunner } from './codex-runner.js'

describe('createCodexRunner', () => {
  it('returns a verification issue when codex is missing', async () => {
    const runCommand = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
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
        stdout: '',
        stderr: '',
        exitCode: 0,
      })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (_command, _args, options?: { onStdoutLine?: (line: string) => void }) => {
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: '{"assistantMessage":"ok","needsMoreContext":false,"contextRequest":[],"proposal":null}',
            },
          }),
        )

        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })

    const result = await runner.execute('prompt text', { type: 'object' })

    expect(result).toContain('"assistantMessage":"ok"')
    expect(runStreamingCommand).toHaveBeenCalledWith(
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

  it('forwards jsonl events while collecting the final assistant message', async () => {
    const runCommand = vi.fn()
    const runStreamingCommand = vi.fn().mockImplementation(
      async (_command, _args, options?: { onStdoutLine?: (line: string) => void }) => {
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.delta',
            item: {
              text_delta: '片段',
            },
          }),
        )
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: '完整回答',
            },
          }),
        )

        return {
          stdout: '',
          stderr: '',
          exitCode: 0,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, rm })
    const onEvent = vi.fn()

    const result = await runner.executeMessage('prompt text', { onEvent })

    expect(result).toBe('完整回答')
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'item.delta',
      }),
    )
  })

  it('maps invalid response schema failures to schema_invalid', async () => {
    const runCommand = vi.fn()
    const runStreamingCommand = vi.fn().mockImplementation(
      async (_command, _args, options?: { onStdoutLine?: (line: string) => void }) => {
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'error',
            message:
              '{"type":"error","error":{"type":"invalid_request_error","code":"invalid_json_schema","message":"Invalid schema for response_format \\"codex_output_schema\\": schema must have a \\"type\\" key.","param":"text.format.schema"},"status":400}',
          }),
        )

        return {
          stdout: '',
          stderr: '',
          exitCode: 1,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, rm })

    await expect(runner.execute('prompt text', { type: 'object' })).rejects.toMatchObject({
      issue: expect.objectContaining({
        code: 'schema_invalid',
      }),
    })
  })
})
