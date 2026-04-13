import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { loadBrainFlowEnv } from '../server/load-env.js'

const DOCKER_DESKTOP_PATHS = [
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Programs\\Docker\\Docker\\Docker Desktop.exe`,
]
const COMPOSE_FILE = resolve(process.cwd(), 'deploy', 'docker-compose.local.yml')
const POSTGRES_SERVICE = 'postgres'
const DOCKER_READY_TIMEOUT_MS = 120_000
const POSTGRES_READY_TIMEOUT_MS = 90_000
const POLL_INTERVAL_MS = 2_000

interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

function resolveDockerDesktopPath(): string | null {
  for (const candidate of DOCKER_DESKTOP_PATHS) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', rejectPromise)
    child.on('close', (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      })
    })
  })
}

async function isDockerReady(): Promise<boolean> {
  try {
    const result = await runCommand('docker', ['info'])
    return result.exitCode === 0
  } catch {
    return false
  }
}

async function ensureDockerDaemon(): Promise<void> {
  if (await isDockerReady()) {
    return
  }

  if (process.platform === 'win32') {
    const dockerDesktop = resolveDockerDesktopPath()
    if (dockerDesktop) {
      spawn(dockerDesktop, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref()
    }
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < DOCKER_READY_TIMEOUT_MS) {
    if (await isDockerReady()) {
      return
    }
    await delay(POLL_INTERVAL_MS)
  }

  throw new Error('Docker daemon did not become ready. Please make sure Docker Desktop is running.')
}

async function waitForPostgres(databaseUrl: string): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < POSTGRES_READY_TIMEOUT_MS) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
    })

    try {
      await pool.query('select 1')
      return
    } catch {
      await delay(POLL_INTERVAL_MS)
    } finally {
      await pool.end().catch(() => undefined)
    }
  }

  throw new Error('Postgres container started, but the database did not become reachable in time.')
}

export async function ensureLocalPostgres(): Promise<void> {
  loadBrainFlowEnv()

  const databaseUrl = process.env.BRAINFLOW_SYNC_DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('BRAINFLOW_SYNC_DATABASE_URL is required to start local Postgres.')
  }

  await ensureDockerDaemon()

  const composeUp = await runCommand('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', POSTGRES_SERVICE])
  if (composeUp.exitCode !== 0) {
    throw new Error(composeUp.stderr.trim() || composeUp.stdout.trim() || 'Failed to start local Postgres.')
  }

  await waitForPostgres(databaseUrl)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await ensureLocalPostgres()
    console.log('Local Postgres is ready.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
