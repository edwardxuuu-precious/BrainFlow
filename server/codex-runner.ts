import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CodexBridgeIssue } from '../shared/ai-contract.js'

export interface CodexRunnerStatus {
  cliInstalled: boolean
  loggedIn: boolean
  authProvider: string | null
  ready: boolean
  issues: CodexBridgeIssue[]
}

export interface CodexRunner {
  getStatus(): Promise<CodexRunnerStatus>
  execute(prompt: string, schema: object): Promise<string>
}

interface CodexRunnerDependencies {
  runCommand?: typeof runCommand
  mkdtemp?: typeof mkdtemp
  writeFile?: typeof writeFile
  rm?: typeof rm
}

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

class CommandNotFoundError extends Error {
  constructor(command: string) {
    super(`Command not found: ${command}`)
    this.name = 'CommandNotFoundError'
  }
}

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if ('code' in error && error.code === 'ENOENT') {
        reject(new CommandNotFoundError(command))
        return
      }

      reject(error)
    })

    child.on('close', (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
      })
    })
  })
}

function normalizeStatusIssues(output: string, authProvider: string | null): CodexBridgeIssue[] {
  const text = output.toLowerCase()

  if (authProvider === 'ChatGPT') {
    return []
  }

  if (authProvider) {
    return [
      {
        code: 'verification_required',
        message: '当前 Codex 需要使用 ChatGPT 订阅账号重新验证，请尽快重新运行 codex login --device-auth。',
      },
    ]
  }

  if (text.includes('entitlement') || text.includes('subscription')) {
    return [
      {
        code: 'subscription_required',
        message: '当前 Codex 验证信息缺少可用订阅或权限，请尽快重新验证。',
      },
    ]
  }

  return [
    {
      code: 'login_required',
      message: '当前未检测到可用的 Codex 登录状态，请运行 codex login --device-auth 完成验证。',
    },
  ]
}

function parseAuthProvider(output: string): string | null {
  const match = output.match(/Logged in using (.+)/i)
  return match?.[1]?.trim() ?? null
}

function normalizeExecutionError(message: string): CodexBridgeIssue {
  const text = message.toLowerCase()

  if (
    text.includes('invalid_json_schema') ||
    text.includes('text.format.schema') ||
    text.includes('response_format') ||
    text.includes('output-schema') ||
    text.includes("schema must have a 'type' key")
  ) {
    return {
      code: 'schema_invalid',
      message: '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。这不是登录问题，重新验证不会解决，请修复应用端格式后再试。',
    }
  }

  if (text.includes('entitlement') || text.includes('subscription')) {
    return {
      code: 'subscription_required',
      message: '当前 Codex 验证信息缺少可用订阅或权限，请尽快重新验证。',
    }
  }

  if (text.includes('login') || text.includes('auth') || text.includes('verification')) {
    return {
      code: 'verification_required',
      message: '当前 Codex 验证信息不可用，请尽快重新验证。',
    }
  }

  return {
    code: 'request_failed',
    message: 'Codex 执行失败，请稍后重试；如果持续失败，请检查本地 bridge 日志。',
  }
}

export function createCodexRunner(dependencies?: CodexRunnerDependencies): CodexRunner {
  const executeCommand = dependencies?.runCommand ?? runCommand
  const makeTempDirectory = dependencies?.mkdtemp ?? mkdtemp
  const writeTempFile = dependencies?.writeFile ?? writeFile
  const removeDirectory = dependencies?.rm ?? rm

  return {
    async getStatus() {
      try {
        await executeCommand('codex', ['--version'])
      } catch (error) {
        if (error instanceof CommandNotFoundError || ('code' in Object(error) && (error as { code?: string }).code === 'ENOENT')) {
          return {
            cliInstalled: false,
            loggedIn: false,
            authProvider: null,
            ready: false,
            issues: [
              {
                code: 'cli_missing',
                message: '未检测到本机 codex CLI，请先安装或修复 codex 命令。',
              },
            ],
          }
        }

        throw error
      }

      const status = await executeCommand('codex', ['login', 'status'])
      const output = `${status.stdout}\n${status.stderr}`.trim()
      const authProvider = parseAuthProvider(output)
      const issues = normalizeStatusIssues(output, authProvider)

      return {
        cliInstalled: true,
        loggedIn: authProvider === 'ChatGPT',
        authProvider,
        ready: status.exitCode === 0 && authProvider === 'ChatGPT' && issues.length === 0,
        issues,
      }
    },

    async execute(prompt, schema) {
      const workingDirectory = await makeTempDirectory(join(tmpdir(), 'brainflow-codex-'))
      const schemaPath = join(workingDirectory, 'output-schema.json')

      try {
        await writeTempFile(schemaPath, JSON.stringify(schema), 'utf8')
        const result = await executeCommand(
          'codex',
          [
            'exec',
            '--sandbox',
            'read-only',
            '--ephemeral',
            '--json',
            '--skip-git-repo-check',
            '--output-schema',
            schemaPath,
            prompt,
          ],
          { cwd: workingDirectory },
        )

        let finalText = ''
        let eventError: string | null = null

        result.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            try {
              const event = JSON.parse(line) as {
                type?: string
                message?: string
                error?: { message?: string }
                item?: { type?: string; text?: string }
              }

              if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
                finalText = event.item.text
              }

              if (event.type === 'error' && event.message) {
                eventError = event.message
              }

              if (event.type === 'turn.failed' && event.error?.message) {
                eventError = event.error.message
              }
            } catch {
              // ignore non-JSON lines
            }
          })

        if (eventError) {
          throw new Error(eventError)
        }

        if (result.exitCode !== 0) {
          throw new Error(result.stderr.trim() || 'Codex CLI exited with a non-zero status.')
        }

        if (!finalText.trim()) {
          throw new Error('Codex CLI returned an empty response.')
        }

        return finalText
      } catch (error) {
        const issue = normalizeExecutionError(error instanceof Error ? error.message : String(error))
        throw Object.assign(new Error(issue.message), {
          issue,
        })
      } finally {
        await removeDirectory(workingDirectory, { recursive: true, force: true })
      }
    },
  }
}
