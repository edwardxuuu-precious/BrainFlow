// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadBrainFlowEnv } from './load-env.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('loadBrainFlowEnv', () => {
  it('loads .env and .env.local without overriding existing env values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brainflow-env-'))
    tempDirs.push(dir)

    await writeFile(
      join(dir, '.env'),
      'BRAINFLOW_AUTH_MODE=external\nBRAINFLOW_SYNC_DATABASE_URL=postgres://from-dot-env\n',
      'utf8',
    )
    await writeFile(
      join(dir, '.env.local'),
      'BRAINFLOW_CANONICAL_ORIGIN=http://127.0.0.1:4173\nBRAINFLOW_SYNC_DATABASE_URL=postgres://from-dot-env-local\n',
      'utf8',
    )

    const env: NodeJS.ProcessEnv = {
      BRAINFLOW_SYNC_DATABASE_URL: 'postgres://already-set',
    }

    const result = loadBrainFlowEnv(dir, env)

    expect(result.loadedFiles).toEqual([join(dir, '.env'), join(dir, '.env.local')])
    expect(env.BRAINFLOW_AUTH_MODE).toBe('external')
    expect(env.BRAINFLOW_CANONICAL_ORIGIN).toBe('http://127.0.0.1:4173')
    expect(env.BRAINFLOW_SYNC_DATABASE_URL).toBe('postgres://already-set')
  })
})
