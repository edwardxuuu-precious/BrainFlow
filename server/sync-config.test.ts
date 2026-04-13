// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import { readSyncServerConfig } from './sync-config.js'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('readSyncServerConfig', () => {
  it('requires BRAINFLOW_SYNC_DATABASE_URL', () => {
    delete process.env.BRAINFLOW_SYNC_DATABASE_URL

    expect(() => readSyncServerConfig()).toThrow(
      'BRAINFLOW_SYNC_DATABASE_URL is required for persistent sync storage.',
    )
  })

  it('returns a postgres-only configuration', () => {
    process.env.BRAINFLOW_SYNC_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5432/brainflow'
    process.env.BRAINFLOW_SYNC_DATABASE_SSL = 'true'
    process.env.BRAINFLOW_SYNC_PULL_LIMIT = '500'

    expect(readSyncServerConfig()).toEqual({
      driver: 'postgres',
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:5432/brainflow',
      databaseSsl: true,
      pullLimit: 500,
    })
  })
})
