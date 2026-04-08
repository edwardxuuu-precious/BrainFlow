import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

export const API_STABLE_UPTIME_MS = 30_000
export const API_RESTART_BASE_DELAY_MS = 1_000
export const API_RESTART_MAX_DELAY_MS = 10_000
export const API_HEALTHCHECK_INITIAL_DELAY_MS = 10_000
export const API_HEALTHCHECK_INTERVAL_MS = 5_000
export const API_HEALTHCHECK_TIMEOUT_MS = 4_000
export const API_HEALTHCHECK_FAILURE_THRESHOLD = 2

type ChildRole = 'web' | 'api'
type ChildScript = 'dev:web-only' | 'dev:server'

interface ManagedChild {
  role: ChildRole
  process: ChildProcessWithoutNullStreams
  startedAt: number
}

interface ChildCommandSpec {
  command: string
  args: string[]
  options: SpawnOptions
  label: string
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcessWithoutNullStreams

interface DevSupervisorDependencies {
  spawnProcess?: SpawnProcess
  terminateProcess?: (child: ChildProcessWithoutNullStreams) => Promise<void>
  log?: (message: string) => void
  error?: (message: string) => void
  now?: () => number
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
  exitProcess?: (code: number) => void
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  fetchStatus?: typeof fetch
}

export function buildChildCommandSpec(
  platform: NodeJS.Platform,
  script: ChildScript,
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildCommandSpec {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `npm run ${script}`],
      options: {
        cwd,
        env,
        windowsHide: false,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'] as const,
      },
      label: `cmd.exe /d /s /c "npm run ${script}"`,
    }
  }

  return {
    command: 'npm',
    args: ['run', script],
    options: {
      cwd,
      env,
      windowsHide: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'] as const,
    },
    label: `npm run ${script}`,
  }
}

function formatExitMessage(
  role: ChildRole,
  code: number | null,
  signal: NodeJS.Signals | null,
): string {
  if (signal) {
    return `[${role}] exited via signal ${signal}`
  }

  return `[${role}] exited with code ${code ?? 0}`
}

export function calculateApiRestartDelay(attempt: number): number {
  return Math.min(
    API_RESTART_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    API_RESTART_MAX_DELAY_MS,
  )
}

async function terminateProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) {
    return
  }

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })

      killer.on('error', () => resolve())
      killer.on('close', () => resolve())
    })
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // Ignore cleanup failures during shutdown.
    }
  }
}

function pipeOutput(
  child: ChildProcessWithoutNullStreams,
  role: ChildRole,
  log: (message: string) => void,
  error: (message: string) => void,
): void {
  const stdoutReader = createInterface({ input: child.stdout })
  stdoutReader.on('line', (line) => {
    log(`[${role}] ${line}`)
  })

  const stderrReader = createInterface({ input: child.stderr })
  stderrReader.on('line', (line) => {
    error(`[${role}] ${line}`)
  })

  const disposeReaders = () => {
    stdoutReader.close()
    stderrReader.close()
  }

  child.on('exit', disposeReaders)
  child.on('close', disposeReaders)
}

export class DevSupervisor {
  private readonly spawnProcess: SpawnProcess
  private readonly terminateProcess: (child: ChildProcessWithoutNullStreams) => Promise<void>
  private readonly fetchStatus: typeof fetch
  private readonly log: (message: string) => void
  private readonly error: (message: string) => void
  private readonly now: () => number
  private readonly setTimer: typeof setTimeout
  private readonly clearTimer: typeof clearTimeout
  private readonly exitProcess: (code: number) => void
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv

  private webChild: ManagedChild | null = null
  private apiChild: ManagedChild | null = null
  private apiRestartAttempt = 0
  private apiRestartTimer: ReturnType<typeof setTimeout> | null = null
  private apiHealthTimer: ReturnType<typeof setTimeout> | null = null
  private apiHealthFailureCount = 0
  private apiRestartingPids = new Set<number>()
  private shuttingDown = false
  private shutdownPromise: Promise<void> | null = null
  private exitCode = 0

  constructor(dependencies: DevSupervisorDependencies = {}) {
    this.spawnProcess =
      dependencies.spawnProcess ??
      ((command, args, options) =>
        spawn(command, args, options) as ChildProcessWithoutNullStreams)
    this.terminateProcess = dependencies.terminateProcess ?? terminateProcessTree
    this.fetchStatus = dependencies.fetchStatus ?? fetch
    this.log = dependencies.log ?? console.log
    this.error = dependencies.error ?? console.error
    this.now = dependencies.now ?? Date.now
    this.setTimer = dependencies.setTimer ?? setTimeout
    this.clearTimer = dependencies.clearTimer ?? clearTimeout
    this.exitProcess = dependencies.exitProcess ?? ((code) => process.exit(code))
    this.platform = dependencies.platform ?? process.platform
    this.env = dependencies.env ?? process.env
  }

  start(): void {
    this.startWeb()
    this.startApi()
  }

  async shutdown(code = 0): Promise<void> {
    if (this.shutdownPromise) {
      this.exitCode = Math.max(this.exitCode, code)
      return this.shutdownPromise
    }

    this.shuttingDown = true
    this.exitCode = Math.max(this.exitCode, code)

    if (this.apiRestartTimer) {
      this.clearTimer(this.apiRestartTimer)
      this.apiRestartTimer = null
    }
    this.clearApiHealthTimer()

    this.shutdownPromise = (async () => {
      const children = [this.webChild, this.apiChild]
        .filter((child): child is ManagedChild => child !== null)
        .map((child) =>
          this.terminateProcess(child.process).catch((error) => {
            this.error(
              `[${child.role}] failed to terminate cleanly: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }),
        )

      await Promise.all(children)
      this.exitProcess(this.exitCode)
    })()

    return this.shutdownPromise
  }

  private clearApiHealthTimer(): void {
    if (this.apiHealthTimer) {
      this.clearTimer(this.apiHealthTimer)
      this.apiHealthTimer = null
    }
  }

  private scheduleApiHealthCheck(delayMs: number): void {
    if (this.shuttingDown || !this.apiChild) {
      return
    }

    this.clearApiHealthTimer()
    this.apiHealthTimer = this.setTimer(() => {
      this.apiHealthTimer = null
      void this.runApiHealthCheck()
    }, delayMs)
  }

  private async checkApiHealth(): Promise<{ healthy: boolean; reason?: string }> {
    const controller = new AbortController()
    const timeoutId = this.setTimer(() => controller.abort(), API_HEALTHCHECK_TIMEOUT_MS)

    try {
      const response = await this.fetchStatus('http://127.0.0.1:8787/api/codex/status', {
        signal: controller.signal,
      })

      if (response.status === 200) {
        return { healthy: true }
      }

      return {
        healthy: false,
        reason: `health check returned ${response.status}`,
      }
    } catch (error) {
      return {
        healthy: false,
        reason: error instanceof Error ? error.message : String(error),
      }
    } finally {
      this.clearTimer(timeoutId)
    }
  }

  private async runApiHealthCheck(): Promise<void> {
    if (this.shuttingDown || !this.apiChild || this.apiRestartTimer) {
      return
    }

    const child = this.apiChild
    const result = await this.checkApiHealth()

    if (this.shuttingDown || this.apiChild?.process !== child.process) {
      return
    }

    if (result.healthy) {
      this.apiHealthFailureCount = 0
      this.scheduleApiHealthCheck(API_HEALTHCHECK_INTERVAL_MS)
      return
    }

    this.apiHealthFailureCount += 1
    this.error(
      `[api] health check failed (${this.apiHealthFailureCount}/${API_HEALTHCHECK_FAILURE_THRESHOLD}): ${
        result.reason ?? 'unknown error'
      }`,
    )

    if (this.apiHealthFailureCount >= API_HEALTHCHECK_FAILURE_THRESHOLD) {
      await this.restartApiAfterHealthFailure(
        `[api] health check failed ${this.apiHealthFailureCount} times; restarting bridge.`,
      )
      return
    }

    this.scheduleApiHealthCheck(API_HEALTHCHECK_INTERVAL_MS)
  }

  private async restartApiAfterHealthFailure(message: string): Promise<void> {
    if (!this.apiChild || this.shuttingDown) {
      return
    }

    const child = this.apiChild
    this.apiHealthFailureCount = 0
    this.clearApiHealthTimer()

    if (child.process.pid) {
      this.apiRestartingPids.add(child.process.pid)
    }

    this.apiChild = null
    this.error(message)

    try {
      await this.terminateProcess(child.process)
    } catch (error) {
      this.error(
        `[api] failed to terminate unhealthy bridge: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    this.scheduleApiRestart('[api] restarting bridge after failed health checks.', false)
  }

  private startWeb(): void {
    let child: ManagedChild
    try {
      child = this.spawnChild('web', 'dev:web-only')
    } catch (error) {
      this.error(`[web] failed to start: ${error instanceof Error ? error.message : String(error)}`)
      void this.shutdown(1)
      return
    }

    this.webChild = child

    child.process.on('error', (error) => {
      this.error(`[web] failed to start: ${error.message}`)
      void this.shutdown(1)
    })

    child.process.on('exit', (code, signal) => {
      this.webChild = null

      if (this.shuttingDown) {
        return
      }

      this.error(`${formatExitMessage('web', code, signal)}; shutting down dev supervisor.`)
      void this.shutdown(code ?? 1)
    })
  }

  private startApi(): void {
    let child: ManagedChild
    try {
      child = this.spawnChild('api', 'dev:server')
    } catch (error) {
      this.handleApiStartFailure(error)
      return
    }

    this.apiChild = child
    this.apiHealthFailureCount = 0
    this.scheduleApiHealthCheck(API_HEALTHCHECK_INITIAL_DELAY_MS)

    child.process.on('error', (error) => {
      this.error(`[api] failed to start: ${error.message}`)
    })

    child.process.on('exit', (code, signal) => {
      const uptime = this.now() - child.startedAt
      const wasExpectedRestart = child.process.pid
        ? this.apiRestartingPids.delete(child.process.pid)
        : false
      this.clearApiHealthTimer()
      if (this.apiChild?.process === child.process) {
        this.apiChild = null
      }

      if (this.shuttingDown) {
        return
      }

      if (wasExpectedRestart) {
        return
      }

      this.scheduleApiRestart(
        `${formatExitMessage('api', code, signal)}; restarting bridge.`,
        uptime >= API_STABLE_UPTIME_MS,
      )
    })
  }

  private handleApiStartFailure(error: unknown): void {
    this.scheduleApiRestart(
      `[api] failed to start: ${error instanceof Error ? error.message : String(error)}`,
      false,
    )
  }

  private scheduleApiRestart(message: string, resetAttempts: boolean): void {
    if (this.shuttingDown) {
      return
    }

    this.clearApiHealthTimer()
    this.apiHealthFailureCount = 0
    this.apiRestartAttempt = resetAttempts ? 1 : this.apiRestartAttempt + 1
    const delay = calculateApiRestartDelay(this.apiRestartAttempt)
    this.error(`${message} Restarting in ${delay}ms.`)

    if (this.apiRestartTimer) {
      this.clearTimer(this.apiRestartTimer)
    }

    this.apiRestartTimer = this.setTimer(() => {
      this.apiRestartTimer = null
      this.startApi()
    }, delay)
  }

  private spawnChild(role: ChildRole, script: ChildScript): ManagedChild {
    const spec = buildChildCommandSpec(this.platform, script, process.cwd(), this.env)
    const childProcess = this.spawnProcess(spec.command, spec.args, spec.options)

    pipeOutput(childProcess, role, this.log, this.error)
    this.log(`[${role}] starting ${spec.label}`)

    return {
      role,
      process: childProcess,
      startedAt: this.now(),
    }
  }
}

export function createDevSupervisor(dependencies?: DevSupervisorDependencies): DevSupervisor {
  return new DevSupervisor(dependencies)
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return !!entry && import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  const supervisor = createDevSupervisor()

  process.on('SIGINT', () => {
    void supervisor.shutdown(0)
  })

  process.on('SIGTERM', () => {
    void supervisor.shutdown(0)
  })

  supervisor.start()
}
