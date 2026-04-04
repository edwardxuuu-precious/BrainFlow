import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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

export interface CodexJsonEvent {
  type?: string
  message?: string
  delta?: string
  error?: { message?: string }
  item?: {
    type?: string
    text?: string
    delta?: string
    text_delta?: string
    message?: string
  }
  [key: string]: unknown
}

export interface CodexRunner {
  getStatus(): Promise<CodexRunnerStatus>
  execute(prompt: string, schema: object): Promise<string>
  executeMessage(
    prompt: string,
    options?: { onEvent?: (event: CodexJsonEvent) => void },
  ): Promise<string>
}

interface CodexRunnerDependencies {
  runCommand?: typeof runCommand
  runStreamingCommand?: typeof runStreamingCommand
  mkdtemp?: typeof mkdtemp
  writeFile?: typeof writeFile
  rm?: typeof rm
  readdir?: typeof readdir
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
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

const VSCODE_CODEX_EXTENSION_PREFIX = 'openai.chatgpt-'
const VSCODE_CODEX_EXTENSION_SUFFIX = '-win32-x64'

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

async function runStreamingCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; onStdoutLine?: (line: string) => void },
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
    let stdoutBuffer = ''

    const flushStdoutLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }

      options?.onStdoutLine?.(trimmed)
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      stdoutBuffer += text
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() ?? ''
      lines.forEach(flushStdoutLine)
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
      if (stdoutBuffer.trim()) {
        flushStdoutLine(stdoutBuffer)
      }

      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
      })
    })
  })
}

function isCommandNotFoundError(error: unknown): boolean {
  return (
    error instanceof CommandNotFoundError ||
    ('code' in Object(error) && (error as { code?: string }).code === 'ENOENT')
  )
}

function isWindowsSpawnFallbackError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = 'code' in error ? (error as { code?: string }).code : undefined
  return code === 'EINVAL' || code === 'EFTYPE'
}

function buildCliMissingIssue(): CodexBridgeIssue {
  return {
    code: 'cli_missing',
    message:
      'bridge 未能从 PATH 或常见本机路径解析到 codex CLI。请确认本机已安装 Codex CLI，并在安装或更新 PATH 后重新运行 pnpm dev、pnpm dev:web 或 pnpm dev:server。',
  }
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
        message:
          '当前 Codex 需要使用 ChatGPT 订阅账号重新验证，请尽快重新运行 codex login --device-auth。',
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

function normalizeExecutionError(error: unknown): CodexBridgeIssue {
  if (isCommandNotFoundError(error)) {
    return buildCliMissingIssue()
  }

  const message = error instanceof Error ? error.message : String(error)
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
      message:
        '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。这不是登录问题，重新验证不会解决，请修复应用端格式后再试。',
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

function parseJsonEvent(line: string): CodexJsonEvent | null {
  try {
    return JSON.parse(line) as CodexJsonEvent
  } catch {
    return null
  }
}

function extractRawExecutionMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return undefined
}

function extractEventError(event: CodexJsonEvent): string | null {
  if (event.type === 'error' && typeof event.message === 'string') {
    return event.message
  }

  if (event.type === 'turn.failed' && typeof event.error?.message === 'string') {
    return event.error.message
  }

  return null
}

function extractFinalText(event: CodexJsonEvent): string | null {
  if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
    return event.item.text
  }

  return null
}

function parseVsCodeCodexExtensionVersion(entryName: string): number[] | null {
  if (
    !entryName.startsWith(VSCODE_CODEX_EXTENSION_PREFIX) ||
    !entryName.endsWith(VSCODE_CODEX_EXTENSION_SUFFIX)
  ) {
    return null
  }

  const versionText = entryName.slice(
    VSCODE_CODEX_EXTENSION_PREFIX.length,
    entryName.length - VSCODE_CODEX_EXTENSION_SUFFIX.length,
  )

  if (!/^\d+(?:\.\d+)*$/.test(versionText)) {
    return null
  }

  return versionText.split('.').map((segment) => Number(segment))
}

function compareVsCodeCodexExtensionEntries(a: string, b: string): number {
  const versionA = parseVsCodeCodexExtensionVersion(a)
  const versionB = parseVsCodeCodexExtensionVersion(b)

  if (versionA && versionB) {
    const length = Math.max(versionA.length, versionB.length)
    for (let index = 0; index < length; index += 1) {
      const difference = (versionB[index] ?? 0) - (versionA[index] ?? 0)
      if (difference !== 0) {
        return difference
      }
    }
  } else if (versionA) {
    return -1
  } else if (versionB) {
    return 1
  }

  return b.localeCompare(a)
}

async function listWindowsCodexFallbackCommands(
  readDirectory: typeof readdir,
  env: NodeJS.ProcessEnv,
): Promise<string[]> {
  const commands = new Set<string>()

  if (env.USERPROFILE) {
    const vscodeExtensionRoot = join(env.USERPROFILE, '.vscode', 'extensions')

    try {
      const extensionEntries = await readDirectory(vscodeExtensionRoot)
      const matchingEntries = extensionEntries
        .filter((entryName) => parseVsCodeCodexExtensionVersion(entryName) !== null)
        .sort(compareVsCodeCodexExtensionEntries)

      for (const entryName of matchingEntries) {
        commands.add(join(vscodeExtensionRoot, entryName, 'bin', 'windows-x86_64', 'codex.exe'))
      }
    } catch {
      // Ignore missing extension folders and continue to npm global fallbacks.
    }
  }

  if (env.APPDATA) {
    commands.add(join(env.APPDATA, 'npm', 'codex.cmd'))
  }

  return Array.from(commands)
}

async function resolveCodexCommand(
  executeCommand: typeof runCommand,
  options: {
    platform: NodeJS.Platform
    env: NodeJS.ProcessEnv
    readDirectory: typeof readdir
  },
): Promise<string> {
  try {
    await executeCommand('codex', ['--version'])
    return 'codex'
  } catch (error) {
    if (!isCommandNotFoundError(error)) {
      throw error
    }
  }

  if (options.platform !== 'win32') {
    throw new CommandNotFoundError('codex')
  }

  const fallbackCommands = await listWindowsCodexFallbackCommands(options.readDirectory, options.env)
  for (const fallbackCommand of fallbackCommands) {
    try {
      await executeCommand(fallbackCommand, ['--version'])
      return fallbackCommand
    } catch (error) {
      if (!isCommandNotFoundError(error) && !isWindowsSpawnFallbackError(error)) {
        throw error
      }
    }
  }

  throw new CommandNotFoundError('codex')
}

async function executeCodexJsonCommand(
  executeStreamingCommand: typeof runStreamingCommand,
  codexCommand: string,
  prompt: string,
  options: {
    cwd: string
    schemaPath?: string
    onEvent?: (event: CodexJsonEvent) => void
  },
): Promise<string> {
  let finalText = ''
  let eventError: string | null = null

  const args = [
    'exec',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--json',
    '--skip-git-repo-check',
  ]

  if (options.schemaPath) {
    args.push('--output-schema', options.schemaPath)
  }

  args.push(prompt)

  const result = await executeStreamingCommand(codexCommand, args, {
    cwd: options.cwd,
    onStdoutLine: (line) => {
      const event = parseJsonEvent(line)
      if (!event) {
        return
      }

      options.onEvent?.(event)

      const maybeFinalText = extractFinalText(event)
      if (maybeFinalText) {
        finalText = maybeFinalText
      }

      const maybeError = extractEventError(event)
      if (maybeError) {
        eventError = maybeError
      }
    },
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
}

export function createCodexRunner(dependencies?: CodexRunnerDependencies): CodexRunner {
  const executeCommand = dependencies?.runCommand ?? runCommand
  const executeStreamingCommand = dependencies?.runStreamingCommand ?? runStreamingCommand
  const makeTempDirectory = dependencies?.mkdtemp ?? mkdtemp
  const writeTempFile = dependencies?.writeFile ?? writeFile
  const removeDirectory = dependencies?.rm ?? rm
  const readDirectory = dependencies?.readdir ?? readdir
  const platform = dependencies?.platform ?? process.platform
  const env = dependencies?.env ?? process.env

  return {
    async getStatus() {
      try {
        const codexCommand = await resolveCodexCommand(executeCommand, {
          platform,
          env,
          readDirectory,
        })
        const status = await executeCommand(codexCommand, ['login', 'status'])
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
      } catch (error) {
        if (isCommandNotFoundError(error)) {
          return {
            cliInstalled: false,
            loggedIn: false,
            authProvider: null,
            ready: false,
            issues: [buildCliMissingIssue()],
          }
        }

        throw error
      }
    },

    async execute(prompt, schema) {
      let workingDirectory: string | null = null

      try {
        const codexCommand = await resolveCodexCommand(executeCommand, {
          platform,
          env,
          readDirectory,
        })
        workingDirectory = await makeTempDirectory(join(tmpdir(), 'brainflow-codex-'))
        const schemaPath = join(workingDirectory, 'output-schema.json')
        await writeTempFile(schemaPath, JSON.stringify(schema), 'utf8')
        return await executeCodexJsonCommand(executeStreamingCommand, codexCommand, prompt, {
          cwd: workingDirectory,
          schemaPath,
        })
      } catch (error) {
        const issue = normalizeExecutionError(error)
        throw Object.assign(new Error(issue.message), {
          issue,
          rawMessage: extractRawExecutionMessage(error),
        })
      } finally {
        if (workingDirectory) {
          await removeDirectory(workingDirectory, { recursive: true, force: true })
        }
      }
    },

    async executeMessage(prompt, options) {
      let workingDirectory: string | null = null

      try {
        const codexCommand = await resolveCodexCommand(executeCommand, {
          platform,
          env,
          readDirectory,
        })
        workingDirectory = await makeTempDirectory(join(tmpdir(), 'brainflow-codex-'))
        return await executeCodexJsonCommand(executeStreamingCommand, codexCommand, prompt, {
          cwd: workingDirectory,
          onEvent: options?.onEvent,
        })
      } catch (error) {
        const issue = normalizeExecutionError(error)
        throw Object.assign(new Error(issue.message), {
          issue,
          rawMessage: extractRawExecutionMessage(error),
        })
      } finally {
        if (workingDirectory) {
          await removeDirectory(workingDirectory, { recursive: true, force: true })
        }
      }
    },
  }
}
