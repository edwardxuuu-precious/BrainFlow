// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexRunner } from './codex-runner.js'

describe('createCodexRunner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a cli_missing issue when codex cannot be resolved', async () => {
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

  it('falls back to the Windows npm global codex path when PATH is missing', async () => {
    const fallbackCommand = 'C:\\Users\\edwar\\AppData\\Roaming\\npm\\codex.cmd'
    const runCommand = vi.fn().mockImplementation(async (command: string, args: string[]) => {
      if (command === 'codex') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }

      if (command === fallbackCommand && args[0] === '--version') {
        return { stdout: 'codex-cli 0.118.0', stderr: '', exitCode: 0 }
      }

      if (command === fallbackCommand && args[0] === 'login') {
        return { stdout: 'Logged in using ChatGPT', stderr: '', exitCode: 0 }
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
    })
    const runner = createCodexRunner({
      runCommand,
      platform: 'win32',
      env: {
        APPDATA: 'C:\\Users\\edwar\\AppData\\Roaming',
      },
      readdir: vi.fn().mockRejectedValue(new Error('no vscode extensions')),
    })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: true,
      loggedIn: true,
      ready: true,
      authProvider: 'ChatGPT',
    })

    expect(runCommand).toHaveBeenNthCalledWith(1, 'codex', ['--version'])
    expect(runCommand).toHaveBeenNthCalledWith(2, fallbackCommand, ['--version'])
    expect(runCommand).toHaveBeenNthCalledWith(3, fallbackCommand, ['login', 'status'])
  })

  it('falls back to the latest VS Code bundled codex executable on Windows', async () => {
    const latestBundledCommand =
      'C:\\Users\\edwar\\.vscode\\extensions\\openai.chatgpt-26.5401.11717-win32-x64\\bin\\windows-x86_64\\codex.exe'
    const runCommand = vi.fn().mockImplementation(async (command: string, args: string[]) => {
      if (command === 'codex') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }

      if (command === latestBundledCommand && args[0] === '--version') {
        return { stdout: 'codex-cli 0.118.0', stderr: '', exitCode: 0 }
      }

      if (command === latestBundledCommand && args[0] === 'login') {
        return { stdout: 'Logged in using ChatGPT', stderr: '', exitCode: 0 }
      }

      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    const readdir = vi.fn().mockResolvedValue([
      'openai.chatgpt-25.100.1-win32-x64',
      'openai.chatgpt-26.5401.11717-win32-x64',
    ])
    const runner = createCodexRunner({
      runCommand,
      readdir,
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\edwar',
      },
    })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: true,
      loggedIn: true,
      ready: true,
      authProvider: 'ChatGPT',
    })

    expect(readdir).toHaveBeenCalledWith('C:\\Users\\edwar\\.vscode\\extensions')
    expect(runCommand).toHaveBeenNthCalledWith(2, latestBundledCommand, ['--version'])
  })

  it('skips an invalid npm shim and continues to the bundled VS Code codex executable', async () => {
    const npmShimCommand = 'C:\\Users\\edwar\\AppData\\Roaming\\npm\\codex.cmd'
    const latestBundledCommand =
      'C:\\Users\\edwar\\.vscode\\extensions\\openai.chatgpt-26.5401.11717-win32-x64\\bin\\windows-x86_64\\codex.exe'
    const runCommand = vi.fn().mockImplementation(async (command: string, args: string[]) => {
      if (command === 'codex') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }

      if (command === latestBundledCommand && args[0] === '--version') {
        return { stdout: 'codex-cli 0.118.0', stderr: '', exitCode: 0 }
      }

      if (command === latestBundledCommand && args[0] === 'login') {
        return { stdout: 'Logged in using ChatGPT', stderr: '', exitCode: 0 }
      }

      if (command === npmShimCommand) {
        throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' })
      }

      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    const readdir = vi.fn().mockResolvedValue([
      'openai.chatgpt-26.5401.11717-win32-x64',
    ])
    const runner = createCodexRunner({
      runCommand,
      readdir,
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\edwar',
        APPDATA: 'C:\\Users\\edwar\\AppData\\Roaming',
      },
    })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: true,
      loggedIn: true,
      ready: true,
      authProvider: 'ChatGPT',
    })

    expect(runCommand).toHaveBeenNthCalledWith(2, latestBundledCommand, ['--version'])
    expect(runCommand).not.toHaveBeenCalledWith(npmShimCommand, ['login', 'status'])
  })

  it('returns cli_missing when all Windows fallback candidates are not directly executable', async () => {
    const npmShimCommand = 'C:\\Users\\edwar\\AppData\\Roaming\\npm\\codex.cmd'
    const runCommand = vi.fn().mockImplementation(async (command: string) => {
      if (command === 'codex') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }

      if (command === npmShimCommand) {
        throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' })
      }

      throw Object.assign(new Error('spawn EFTYPE'), { code: 'EFTYPE' })
    })
    const readdir = vi.fn().mockResolvedValue([
      'openai.chatgpt-26.5401.11717-win32-x64',
    ])
    const runner = createCodexRunner({
      runCommand,
      readdir,
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\edwar',
        APPDATA: 'C:\\Users\\edwar\\AppData\\Roaming',
      },
    })

    await expect(runner.getStatus()).resolves.toMatchObject({
      cliInstalled: false,
      loggedIn: false,
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
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
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
        '-',
      ]),
      expect.objectContaining({
        cwd: 'C:\\temp\\brainflow-codex-test',
        inputText: 'prompt text',
      }),
    )
    expect(runStreamingCommand.mock.calls[0]?.[1]).not.toContain('prompt text')
    expect(runStreamingCommand.mock.calls[0]?.[1].at(-1)).toBe('-')
    expect(writeFile).toHaveBeenCalled()
    expect(rm).toHaveBeenCalledWith('C:\\temp\\brainflow-codex-test', {
      recursive: true,
      force: true,
    })
  })

  it('reports runner observations for spawn, first json event, and completion', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.delta',
            item: {
              text_delta: 'partial',
            },
          }),
        )
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: '{"assistantMessage":"ok"}',
            },
          }),
        )

        return {
          stdout: 'jsonl',
          stderr: '',
          exitCode: 0,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })
    const onObservation = vi.fn()

    await runner.execute('prompt text', { type: 'object' }, { onObservation })

    expect(onObservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'spawn_started',
        kind: 'structured',
        promptLength: 'prompt text'.length,
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: 'first_json_event',
        kind: 'structured',
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        phase: 'completed',
        kind: 'structured',
        exitCode: 0,
        hadJsonEvent: true,
      }),
    )
  })

  it('forwards structured stdout JSON events while executing imports', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
        options?.onStdoutLine?.(JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }))
        options?.onStdoutLine?.(JSON.stringify({ type: 'turn.started', turn_id: 'turn_1' }))
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: '{"summary":"Compact preview ready"}',
            },
          }),
        )

        return {
          stdout: 'jsonl',
          stderr: '',
          exitCode: 0,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })
    const onEvent = vi.fn()

    await runner.execute('prompt text', { type: 'object' }, { onEvent })

    expect(onEvent).toHaveBeenCalledTimes(3)
    expect(onEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'thread.started',
      }),
    )
    expect(onEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'turn.started',
      }),
    )
    expect(onEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: 'item.completed',
      }),
    )
  })

  it('emits heartbeat observations while waiting for codex output', async () => {
    vi.useFakeTimers()

    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 12_000)
        })
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: '{"assistantMessage":"ok"}',
            },
          }),
        )

        return {
          stdout: 'jsonl',
          stderr: '',
          exitCode: 0,
        }
      },
    )
    const mkdtemp = vi.fn().mockResolvedValue('C:\\temp\\brainflow-codex-test')
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })
    const onObservation = vi.fn()

    const execution = runner.execute('prompt text', { type: 'object' }, { onObservation })
    await vi.advanceTimersByTimeAsync(12_000)
    await execution

    expect(onObservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: 'spawn_started',
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phase: 'heartbeat',
        hadJsonEvent: false,
        elapsedSinceLastEventMs: 5_000,
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        phase: 'heartbeat',
        hadJsonEvent: false,
        elapsedSinceLastEventMs: 10_000,
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        phase: 'first_json_event',
        hadJsonEvent: true,
      }),
    )
    expect(onObservation).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        phase: 'completed',
        hadJsonEvent: true,
      }),
    )
  })

  it('uses the resolved fallback codex command when streaming execution', async () => {
    const fallbackCommand = 'C:\\Users\\edwar\\AppData\\Roaming\\npm\\codex.cmd'
    const runCommand = vi.fn().mockImplementation(async (command: string, args: string[]) => {
      if (command === 'codex') {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }

      if (command === fallbackCommand && args[0] === '--version') {
        return { stdout: 'codex-cli 0.118.0', stderr: '', exitCode: 0 }
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
        options?.onStdoutLine?.(
          JSON.stringify({
            type: 'item.completed',
            item: {
              type: 'agent_message',
              text: 'ok',
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
    const runner = createCodexRunner({
      runCommand,
      runStreamingCommand,
      mkdtemp,
      rm,
      platform: 'win32',
      env: {
        APPDATA: 'C:\\Users\\edwar\\AppData\\Roaming',
      },
      readdir: vi.fn().mockRejectedValue(new Error('no vscode extensions')),
    })

    await expect(runner.executeMessage('prompt text')).resolves.toBe('ok')

    expect(runStreamingCommand).toHaveBeenCalledWith(
      fallbackCommand,
      expect.arrayContaining(['exec', '--sandbox', 'read-only', '--json', '-']),
      expect.objectContaining({
        cwd: 'C:\\temp\\brainflow-codex-test',
        inputText: 'prompt text',
      }),
    )
    expect(runStreamingCommand.mock.calls[0]?.[1]).not.toContain('prompt text')
  })

  it('forwards jsonl events while collecting the final assistant message', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
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
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })
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
    expect(runStreamingCommand).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['-']),
      expect.objectContaining({
        inputText: 'prompt text',
      }),
    )
  })

  it('maps invalid response schema failures to schema_invalid', async () => {
    const runCommand = vi.fn().mockResolvedValue({
      stdout: 'codex-cli 0.118.0',
      stderr: '',
      exitCode: 0,
    })
    const runStreamingCommand = vi.fn().mockImplementation(
      async (
        _command,
        _args,
        options?: { inputText?: string; onStdoutLine?: (line: string) => void },
      ) => {
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
    const writeFile = vi.fn().mockResolvedValue(undefined)
    const rm = vi.fn().mockResolvedValue(undefined)
    const runner = createCodexRunner({ runCommand, runStreamingCommand, mkdtemp, writeFile, rm })

    await expect(runner.execute('prompt text', { type: 'object' })).rejects.toMatchObject({
      issue: expect.objectContaining({
        code: 'schema_invalid',
      }),
    })
    expect(runStreamingCommand).toHaveBeenCalledWith(
      'codex',
      expect.arrayContaining(['-']),
      expect.objectContaining({
        inputText: 'prompt text',
      }),
    )
  })
})
