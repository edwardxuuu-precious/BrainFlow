// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

interface MockChild {
  stdout: PassThrough
  stderr: PassThrough
  on: (event: string, listener: (...args: unknown[]) => void) => MockChild
  emit: (event: string, ...args: unknown[]) => boolean
}

async function loadModule() {
  return import('./postgres-backup.js')
}

function createMockChild(options?: {
  exitCode?: number
  stdoutText?: string
  stderrText?: string
  startupError?: Error
}): MockChild {
  const child = new EventEmitter() as unknown as MockChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()

  setTimeout(() => {
    if (options?.startupError) {
      child.emit('error', options.startupError)
      return
    }

    if (options?.stdoutText) {
      child.stdout.write(options.stdoutText)
    }
    if (options?.stderrText) {
      child.stderr.write(options.stderrText)
    }
    child.stdout.end()
    child.stderr.end()
    child.emit('exit', options?.exitCode ?? 0)
    child.emit('close', options?.exitCode ?? 0)
  }, 0)

  return child
}

afterEach(() => {
  spawnMock.mockReset()
  vi.resetModules()
})

describe('postgres-backup', () => {
  it('falls back to docker when local pg_dump is unavailable', async () => {
    spawnMock
      .mockImplementationOnce(() => createMockChild({ startupError: new Error('ENOENT') }))
      .mockImplementationOnce(() => createMockChild())

    const { checkDatabaseBackupAvailability } = await loadModule()
    const result = await checkDatabaseBackupAvailability({
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:5432/brainflow',
      outputDir: 'backups/postgres',
      format: 'custom',
      pgDumpBinary: 'pg_dump',
      dockerBinary: 'docker',
      dockerContainerName: 'brainflow-postgres',
    })

    expect(result).toEqual({
      available: true,
      runner: 'docker_exec',
      error: null,
    })
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'pg_dump',
      ['--version'],
      expect.objectContaining({
        windowsHide: true,
      }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      'docker',
      ['exec', 'brainflow-postgres', 'pg_dump', '--version'],
      expect.objectContaining({
        windowsHide: true,
      }),
    )
  })

  it('writes backup data through docker fallback when local pg_dump is missing', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'brainflow-postgres-backup-'))
    spawnMock
      .mockImplementationOnce(() => createMockChild({ startupError: new Error('ENOENT') }))
      .mockImplementationOnce(() => createMockChild())
      .mockImplementationOnce(() => createMockChild({ stdoutText: 'backup-payload' }))

    try {
      const { createDatabaseBackup } = await loadModule()
      const backup = await createDatabaseBackup({
        databaseUrl: 'postgres://postgres:postgres@127.0.0.1:5432/brainflow',
        outputDir,
        format: 'custom',
        pgDumpBinary: 'pg_dump',
        dockerBinary: 'docker',
        dockerContainerName: 'brainflow-postgres',
      })

      expect(backup.fileName).toMatch(/^brainflow-\d{8}-\d{6}\.dump$/)
      expect(backup.format).toBe('custom')
      expect(await readFile(backup.filePath, 'utf8')).toBe('backup-payload')
      expect(spawnMock).toHaveBeenNthCalledWith(
        3,
        'docker',
        [
          'exec',
          'brainflow-postgres',
          'pg_dump',
          '--format=custom',
          '--dbname=postgres://postgres:postgres@127.0.0.1:5432/brainflow',
        ],
        expect.objectContaining({
          windowsHide: true,
        }),
      )
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  })
})
