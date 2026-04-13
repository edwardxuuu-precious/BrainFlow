import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, rmSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { DatabaseBackupFormat, DatabaseBackupMeta } from '../shared/storage-admin-contract.js'

export type DatabaseBackupRunner = 'local_pg_dump' | 'docker_exec'

export interface DatabaseBackupConfig {
  databaseUrl: string
  outputDir: string
  format: DatabaseBackupFormat
  pgDumpBinary: string
  dockerBinary: string
  dockerContainerName: string
}

export interface DatabaseBackupAvailability {
  available: boolean
  runner: DatabaseBackupRunner | null
  error: string | null
}

interface BackupCommandSpec {
  command: string
  args: string[]
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function createTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function readBackupFormat(value: string | undefined): DatabaseBackupFormat {
  return value === 'plain' ? 'plain' : 'custom'
}

function contentTypeForFormat(format: DatabaseBackupFormat): string {
  return format === 'plain' ? 'application/sql' : 'application/octet-stream'
}

function createBackupCommandArgs(config: DatabaseBackupConfig): string[] {
  const args = [`--dbname=${config.databaseUrl}`]
  if (config.format === 'custom') {
    args.unshift('--format=custom')
  }

  return args
}

function createLocalCommand(config: DatabaseBackupConfig, args: string[]): BackupCommandSpec {
  return {
    command: config.pgDumpBinary,
    args,
  }
}

function createDockerCommand(config: DatabaseBackupConfig, args: string[]): BackupCommandSpec {
  return {
    command: config.dockerBinary,
    args: ['exec', config.dockerContainerName, 'pg_dump', ...args],
  }
}

function runCommandCheck(
  command: string,
  args: string[],
  failureMessage: string,
): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })

    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', () => {
      resolvePromise(failureMessage)
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(null)
        return
      }

      resolvePromise(stderr.trim() || `${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`)
    })
  })
}

async function selectBackupRunner(config: DatabaseBackupConfig): Promise<DatabaseBackupAvailability> {
  const localError = await runCommandCheck(
    config.pgDumpBinary,
    ['--version'],
    `Failed to start ${config.pgDumpBinary}. Ensure pg_dump is installed and available in PATH.`,
  )
  if (!localError) {
    return {
      available: true,
      runner: 'local_pg_dump',
      error: null,
    }
  }

  const dockerError = await runCommandCheck(
    config.dockerBinary,
    ['exec', config.dockerContainerName, 'pg_dump', '--version'],
    `Failed to start ${config.dockerBinary}. Ensure Docker is installed and the daemon is running.`,
  )
  if (!dockerError) {
    return {
      available: true,
      runner: 'docker_exec',
      error: null,
    }
  }

  return {
    available: false,
    runner: null,
    error: [
      `Local pg_dump unavailable: ${localError}`,
      `Docker fallback unavailable: ${dockerError}`,
    ].join(' '),
  }
}

function createBackupCommand(config: DatabaseBackupConfig, runner: DatabaseBackupRunner): BackupCommandSpec {
  const args = createBackupCommandArgs(config)
  return runner === 'local_pg_dump'
    ? createLocalCommand(config, args)
    : createDockerCommand(config, args)
}

async function executeBackupCommand(
  command: string,
  args: string[],
  filePath: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output = createWriteStream(filePath)

    let stderr = ''
    let finished = false
    let exitCode: number | null = null
    let outputFinished = false

    const rejectWithCleanup = (error: Error) => {
      if (finished) {
        return
      }

      finished = true
      output.destroy()
      rmSync(filePath, { force: true })
      rejectPromise(error)
    }

    const resolveWhenReady = () => {
      if (finished) {
        return
      }

      if (exitCode === 0 && outputFinished) {
        finished = true
        resolvePromise()
      }
    }

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.stdout.on('error', (error) => {
      rejectWithCleanup(new Error(`Backup stream failed while reading from ${command}.`, { cause: error }))
    })
    output.on('error', (error) => {
      rejectWithCleanup(new Error(`Failed to write backup file ${filePath}.`, { cause: error }))
    })
    output.on('finish', () => {
      outputFinished = true
      resolveWhenReady()
    })
    child.on('error', (error) => {
      rejectWithCleanup(new Error(`Failed to start backup command ${command}.`, { cause: error }))
    })
    child.on('close', (code) => {
      exitCode = code ?? 0
      if (exitCode !== 0) {
        rejectWithCleanup(
          new Error(
            stderr.trim() || `${command} ${args.join(' ')} exited with code ${exitCode ?? 'unknown'}.`,
          ),
        )
        return
      }

      resolveWhenReady()
    })

    child.stdout.pipe(output)
  })
}

export function readDatabaseBackupConfig(env: NodeJS.ProcessEnv = process.env): DatabaseBackupConfig {
  const databaseUrl = env.BRAINFLOW_SYNC_DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('BRAINFLOW_SYNC_DATABASE_URL is required to create a Postgres backup.')
  }

  return {
    databaseUrl,
    outputDir: resolve(process.cwd(), env.BRAINFLOW_POSTGRES_BACKUP_DIR?.trim() || 'backups/postgres'),
    format: readBackupFormat(env.BRAINFLOW_POSTGRES_BACKUP_FORMAT?.trim()),
    pgDumpBinary: env.BRAINFLOW_PG_DUMP_BIN?.trim() || 'pg_dump',
    dockerBinary: env.BRAINFLOW_DOCKER_BIN?.trim() || 'docker',
    dockerContainerName: env.BRAINFLOW_POSTGRES_BACKUP_CONTAINER?.trim() || 'brainflow-postgres',
  }
}

export async function checkDatabaseBackupAvailability(
  config: DatabaseBackupConfig,
): Promise<DatabaseBackupAvailability> {
  return selectBackupRunner(config)
}

export async function getLatestDatabaseBackupMeta(
  config: DatabaseBackupConfig,
): Promise<DatabaseBackupMeta | null> {
  try {
    const entries = await readdir(config.outputDir)
    const matching = entries.filter((entry) => entry.startsWith('brainflow-'))
    if (matching.length === 0) {
      return null
    }

    const stats = await Promise.all(
      matching.map(async (entry) => {
        const filePath = resolve(config.outputDir, entry)
        const fileStat = await stat(filePath)
        return {
          filePath,
          fileName: entry,
          createdAt: fileStat.mtimeMs,
        }
      }),
    )

    const latest = stats.sort((left, right) => right.createdAt - left.createdAt)[0]
    if (!latest) {
      return null
    }

    return {
      fileName: latest.fileName,
      createdAt: latest.createdAt,
      format: config.format,
      contentType: contentTypeForFormat(config.format),
    }
  } catch {
    return null
  }
}

export async function createDatabaseBackup(
  config: DatabaseBackupConfig,
): Promise<DatabaseBackupMeta & { filePath: string }> {
  mkdirSync(config.outputDir, { recursive: true })

  const availability = await selectBackupRunner(config)
  if (!availability.available || !availability.runner) {
    throw new Error(availability.error ?? 'No backup runner is available.')
  }

  const extension = config.format === 'plain' ? 'sql' : 'dump'
  const createdAt = Date.now()
  const filePath = resolve(config.outputDir, `brainflow-${createTimestamp(new Date(createdAt))}.${extension}`)
  const command = createBackupCommand(config, availability.runner)

  await executeBackupCommand(command.command, command.args, filePath)

  return {
    filePath,
    fileName: basename(filePath),
    createdAt,
    format: config.format,
    contentType: contentTypeForFormat(config.format),
  }
}
