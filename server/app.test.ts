// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  AiChatResponse,
  CodexSettings,
  CodexStatus,
  TextImportSemanticAdjudicationRequest,
  TextImportRequest,
  TextImportResponse,
} from '../shared/ai-contract.js'
import type { StorageAdminServerStatusResponse } from '../shared/storage-admin-contract.js'
import type { SyncAnalyzeConflictRequest, SyncResolveConflictRequest } from '../shared/sync-contract.js'
import { createPasswordHash } from './auth/password.js'
import { createApp } from './app.js'
import { CodexBridgeError } from './codex-bridge.js'
import type { SyncRepository } from './repos/sync-repository.js'
import { SyncService } from './services/sync-service.js'
import type { StorageAdminService } from './storage-admin-service.js'

const originalEnv = { ...process.env }

const status: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '锟斤拷锟斤拷系统锟斤拷示摘要',
  systemPromptVersion: 'abc123',
  systemPrompt: 'full prompt',
}

const settings: CodexSettings = {
  businessPrompt: '锟斤拷锟斤拷一锟斤拷锟斤拷锟斤拷锟矫伙拷直锟接帮拷锟诫法锟戒到锟斤拷图锟叫碉拷锟斤拷锟街★拷',
  updatedAt: 1,
  version: 'settings-v1',
}

const baseRequest: AiChatRequest = {
  documentId: 'doc_1',
  sessionId: 'session_default',
  baseDocumentUpdatedAt: 1,
  messages: [
    {
      id: 'msg_1',
      role: 'user',
      content: 'Summarize the meeting.',
      createdAt: 1,
    },
  ],
  context: {
    documentTitle: '锟斤拷锟斤拷锟斤拷图',
    rootTopicId: 'topic_root',
    scope: 'full_document',
    topicCount: 2,
    topics: [
      {
        topicId: 'topic_root',
        title: '锟斤拷锟斤拷锟斤拷锟斤拷',
        note: '',
        parentTopicId: null,
        childTopicIds: ['topic_1'],
        aiLocked: false,
        metadata: {
          labels: [],
          markers: [],
        },
        style: {
          emphasis: 'normal',
          variant: 'default',
        },
      },
      {
        topicId: 'topic_1',
        title: '锟斤拷支一',
        note: '',
        parentTopicId: 'topic_root',
        childTopicIds: [],
        aiLocked: false,
        metadata: {
          labels: [],
          markers: [],
        },
        style: {
          emphasis: 'normal',
          variant: 'default',
        },
      },
    ],
    focus: {
      activeTopicId: 'topic_1',
      selectedTopicIds: ['topic_1'],
      relationSummary: [],
    },
  },
}

const baseImportRequest: TextImportRequest = {
  documentId: 'doc_1',
  documentTitle: '锟斤拷锟斤拷锟斤拷图',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'topic_1',
  sourceName: 'plan.txt',
  sourceType: 'file',
  intent: 'distill_structure',
  rawText: '# Plan\n\n- Item',
  preprocessedHints: [
    {
      id: 'hint_1',
      kind: 'heading',
      text: 'Plan',
      raw: '# Plan',
      level: 1,
      lineStart: 1,
      lineEnd: 1,
      sourcePath: ['Plan'],
    },
  ],
  semanticHints: [],
}

const baseAdjudicationRequest: TextImportSemanticAdjudicationRequest = {
  jobId: 'job_semantic_1',
  documentId: 'doc_1',
  documentTitle: '锟斤拷锟斤拷锟斤拷图',
  batchTitle: 'Import batch: GTM',
  candidates: [
    {
      candidateId: 'candidate_1',
      scope: 'existing_topic',
      source: {
        id: 'preview_1',
        scope: 'import_preview',
        sourceName: 'GTM_main.md',
        pathTitles: ['Import: GTM_main', 'Goals'],
        title: 'Goals',
        noteSummary: 'Imported summary',
        parentTitle: 'Import: GTM_main',
        fingerprint: null,
      },
      target: {
        id: 'topic_1',
        scope: 'existing_topic',
        sourceName: null,
        pathTitles: ['锟斤拷锟斤拷锟斤拷锟斤拷', '锟斤拷支一'],
        title: '锟斤拷支一',
        noteSummary: 'Existing summary',
        parentTitle: '锟斤拷锟斤拷锟斤拷锟斤拷',
        fingerprint: 'fp_1',
      },
    },
  ],
}

const baseAnalyzeConflictRequest: SyncAnalyzeConflictRequest<unknown> = {
  conflict: {
    id: 'conflict_1',
    workspaceId: 'workspace_1',
    entityType: 'document',
    entityId: 'doc_1',
    deviceId: 'device_1',
    localRecord: {
      id: 'doc_1',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      deviceId: 'device_1',
      version: 2,
      baseVersion: 1,
      contentHash: 'hash_local',
      updatedAt: 200,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        title: 'Local title',
      },
    },
    cloudRecord: {
      id: 'doc_1',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      deviceId: 'device_2',
      version: 3,
      baseVersion: 2,
      contentHash: 'hash_cloud',
      updatedAt: 300,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        title: 'Cloud title',
      },
    },
    localPayload: { title: 'Local title' },
    cloudPayload: { title: 'Cloud title' },
    diffHints: {
      updatedAtDeltaMs: 100,
      sameContentHash: false,
    },
    analysisStatus: 'pending',
    analysisSource: null,
    recommendedResolution: null,
    confidence: null,
    summary: null,
    reasons: [],
    actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
    mergedPayload: null,
    analyzedAt: null,
    analysisNote: null,
    detectedAt: 400,
    resolvedAt: null,
  },
}

function createStorageAdminStatus(): StorageAdminServerStatusResponse {
  return {
    mode: 'local_postgres',
    checkedAt: 1_710_000_000_000,
    api: {
      reachable: true,
      checkedAt: 1_710_000_000_000,
    },
    database: {
      driver: 'postgres',
      configured: true,
      reachable: true,
      label: 'Local Postgres / brainflow',
      lastError: null,
      backupFormat: 'custom',
      lastBackupAt: 1_709_999_999_000,
    },
    backup: {
      available: true,
      directory: 'backups/postgres',
      lastError: null,
    },
    auth: {
      mode: 'stub',
      authenticated: true,
      username: 'admin',
    },
    workspace: {
      id: 'workspace_local',
      name: 'Local Workspace',
    },
    workspaces: [
      {
        id: 'workspace_local',
        userId: 'user_stub_default',
        name: 'Local Workspace',
        createdAt: 1_709_999_000_000,
        updatedAt: 1_710_000_000_000,
        documentCount: 1,
        conversationCount: 1,
      },
    ],
    runtime: {
      canonicalOrigin: 'http://127.0.0.1:4173',
    },
  }
}

function createStorageAdminService(
  overrides?: Partial<StorageAdminService>,
): StorageAdminService {
  return {
    getStatus: vi.fn().mockResolvedValue(createStorageAdminStatus()),
    createDatabaseBackup: vi.fn().mockResolvedValue({
      filePath: '',
      fileName: 'brainflow.dump',
      createdAt: Date.now(),
      format: 'custom',
      contentType: 'application/octet-stream',
    }),
    createWorkspace: vi.fn().mockResolvedValue({
      workspace: {
        id: 'workspace_new',
        userId: 'user_stub_default',
        name: 'New Workspace',
        createdAt: 1_710_000_000_100,
        updatedAt: 1_710_000_000_100,
        documentCount: 0,
        conversationCount: 0,
      },
    }),
    renameWorkspace: vi.fn().mockResolvedValue({
      workspace: {
        id: 'workspace_local',
        userId: 'user_stub_default',
        name: 'Renamed Workspace',
        createdAt: 1_709_999_000_000,
        updatedAt: 1_710_000_000_200,
        documentCount: 1,
        conversationCount: 1,
      },
    }),
    deleteWorkspace: vi.fn().mockResolvedValue({
      deletedWorkspaceId: 'workspace_local',
    }),
    ...overrides,
  }
}

function createBridge(overrides?: Record<string, unknown>) {
  return {
    getStatus: vi.fn().mockResolvedValue(status),
    revalidate: vi.fn().mockResolvedValue(status),
    getSettings: vi.fn().mockResolvedValue(settings),
    saveSettings: vi.fn().mockResolvedValue(settings),
    resetSettings: vi.fn().mockResolvedValue(settings),
    streamChat: vi.fn(),
    planChanges: vi.fn(),
    analyzeSyncConflict: vi.fn(),
    previewTextImport: vi.fn(),
    previewMarkdownImport: vi.fn(),
    adjudicateTextImportCandidates: vi.fn(),
    ...overrides,
  }
}

function parseNdjsonPayload(payload: string): Array<Record<string, unknown>> {
  return payload
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

function enableExternalAuth(): { username: string; password: string } {
  const username = 'admin'
  const password = 'brainflow-secret'
  process.env.BRAINFLOW_AUTH_MODE = 'external'
  process.env.BRAINFLOW_SESSION_SECRET = 'session-secret'
  process.env.BRAINFLOW_ADMIN_USERNAME = username
  process.env.BRAINFLOW_ADMIN_PASSWORD_HASH = createPasswordHash(password)
  process.env.BRAINFLOW_CANONICAL_ORIGIN = 'http://127.0.0.1:4173'
  return { username, password }
}

async function loginAsAdmin(app: ReturnType<typeof createApp>, username: string, password: string): Promise<string> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username,
      password,
    }),
  })

  expect(response.status).toBe(200)
  const cookie = response.headers.get('set-cookie')
  expect(cookie).toBeTruthy()
  return cookie as string
}

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('codex app', () => {
  it('returns an anonymous external-auth session before login', async () => {
    enableExternalAuth()
    const app = createApp({ bridge: createBridge() })

    const response = await app.request('/api/auth/session')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      authMode: 'external',
      authenticated: false,
      userId: null,
      username: null,
      canonicalOrigin: 'http://127.0.0.1:4173',
    })
  })

  it('creates a session cookie and allows protected access in external auth mode', async () => {
    const { username, password } = enableExternalAuth()
    const bridge = createBridge()
    const app = createApp({ bridge })

    const cookie = await loginAsAdmin(app, username, password)
    const response = await app.request('/api/codex/status', {
      headers: {
        cookie,
      },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(status)
    expect(bridge.getStatus).toHaveBeenCalledTimes(1)
  })

  it('rejects protected requests without a valid external-auth session', async () => {
    enableExternalAuth()
    const bridge = createBridge()
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(bridge.getStatus).not.toHaveBeenCalled()
  })

  it('returns codex status through the proxy', async () => {
    const bridge = createBridge()
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(status)
    expect(bridge.getStatus).toHaveBeenCalledTimes(1)
  })

  it('returns local storage admin status through the storage route', async () => {
    const storageStatus = createStorageAdminStatus()
    const storageAdminService = createStorageAdminService({
      getStatus: vi.fn().mockResolvedValue(storageStatus),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    const response = await app.request('/api/storage/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(storageStatus)
    expect(storageAdminService.getStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        authMode: 'stub',
        userId: 'user_stub_default',
      }),
    )
  })

  it('rejects unauthenticated storage admin requests in external auth mode', async () => {
    enableExternalAuth()
    const storageAdminService = createStorageAdminService({
      getStatus: vi.fn(),
      createDatabaseBackup: vi.fn(),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    const statusResponse = await app.request('/api/storage/status')
    const backupResponse = await app.request('/api/storage/backup/database', {
      method: 'POST',
    })
    const createResponse = await app.request('/api/storage/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'New Workspace' }),
    })
    const renameResponse = await app.request('/api/storage/workspaces/workspace_local', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Renamed Workspace' }),
    })
    const deleteResponse = await app.request('/api/storage/workspaces/workspace_local', {
      method: 'DELETE',
    })

    expect(statusResponse.status).toBe(401)
    expect(await statusResponse.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(backupResponse.status).toBe(401)
    expect(await backupResponse.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(createResponse.status).toBe(401)
    expect(await createResponse.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(renameResponse.status).toBe(401)
    expect(await renameResponse.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(deleteResponse.status).toBe(401)
    expect(await deleteResponse.json()).toEqual({
      code: 'request_failed',
      message: 'Authentication required.',
      rawMessage: 'Authentication required.',
      requestId: undefined,
    })
    expect(storageAdminService.getStatus).not.toHaveBeenCalled()
    expect(storageAdminService.createDatabaseBackup).not.toHaveBeenCalled()
    expect(storageAdminService.createWorkspace).not.toHaveBeenCalled()
    expect(storageAdminService.renameWorkspace).not.toHaveBeenCalled()
    expect(storageAdminService.deleteWorkspace).not.toHaveBeenCalled()
  })

  it('streams database backups as downloadable attachments', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'brainflow-backup-route-'))
    const backupPath = join(tempDir, 'brainflow-20260411.dump')
    await writeFile(backupPath, 'backup-payload')

    const storageAdminService = createStorageAdminService({
      createDatabaseBackup: vi.fn().mockResolvedValue({
        filePath: backupPath,
        fileName: 'brainflow-20260411.dump',
        createdAt: 1_710_000_001_000,
        format: 'custom',
        contentType: 'application/octet-stream',
      }),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    try {
      const response = await app.request('/api/storage/backup/database', {
        method: 'POST',
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/octet-stream')
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="brainflow-20260411.dump"',
      )
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('x-brainflow-backup-created-at')).toBe('1710000001000')
      expect(await response.text()).toBe('backup-payload')
      expect(storageAdminService.createDatabaseBackup).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticated: true,
          authMode: 'stub',
          userId: 'user_stub_default',
        }),
      )
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('deletes a managed workspace through the storage admin route', async () => {
    const storageAdminService = createStorageAdminService({
      deleteWorkspace: vi.fn().mockResolvedValue({
        deletedWorkspaceId: 'workspace_old',
      }),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    const response = await app.request('/api/storage/workspaces/workspace_old', {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      deletedWorkspaceId: 'workspace_old',
    })
    expect(storageAdminService.deleteWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        authMode: 'stub',
        userId: 'user_stub_default',
      }),
      'workspace_old',
    )
  })

  it('creates a managed workspace through the storage admin route', async () => {
    const storageAdminService = createStorageAdminService({
      createWorkspace: vi.fn().mockResolvedValue({
        workspace: {
          id: 'workspace_new',
          userId: 'user_stub_default',
          name: 'New Workspace',
          createdAt: 1_710_000_000_100,
          updatedAt: 1_710_000_000_100,
          documentCount: 0,
          conversationCount: 0,
        },
      }),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    const response = await app.request('/api/storage/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '  New Workspace  ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workspace: {
        id: 'workspace_new',
        userId: 'user_stub_default',
        name: 'New Workspace',
        createdAt: 1_710_000_000_100,
        updatedAt: 1_710_000_000_100,
        documentCount: 0,
        conversationCount: 0,
      },
    })
    expect(storageAdminService.createWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        authMode: 'stub',
        userId: 'user_stub_default',
      }),
      'New Workspace',
    )
  })

  it('renames a managed workspace through the storage admin route', async () => {
    const storageAdminService = createStorageAdminService({
      renameWorkspace: vi.fn().mockResolvedValue({
        workspace: {
          id: 'workspace_local',
          userId: 'user_stub_default',
          name: 'Renamed Workspace',
          createdAt: 1_709_999_000_000,
          updatedAt: 1_710_000_000_200,
          documentCount: 1,
          conversationCount: 1,
        },
      }),
    })
    const app = createApp({ bridge: createBridge(), storageAdminService })

    const response = await app.request('/api/storage/workspaces/workspace_local', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: ' Renamed Workspace ' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workspace: {
        id: 'workspace_local',
        userId: 'user_stub_default',
        name: 'Renamed Workspace',
        createdAt: 1_709_999_000_000,
        updatedAt: 1_710_000_000_200,
        documentCount: 1,
        conversationCount: 1,
      },
    })
    expect(storageAdminService.renameWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        authenticated: true,
        authMode: 'stub',
        userId: 'user_stub_default',
      }),
      'workspace_local',
      'Renamed Workspace',
    )
  })

  it('streams natural-language content first, then emits the final result', async () => {
    const result: AiChatResponse = {
      assistantMessage: '锟斤拷锟斤拷锟斤拷一锟斤拷 Codex 锟截达拷',
      needsMoreContext: false,
      contextRequest: [],
      proposal: {
        id: 'proposal_1',
        summary: 'no-op',
        baseDocumentUpdatedAt: 1,
        operations: [],
      },
    }
    const bridge = createBridge({
      streamChat: vi
        .fn()
        .mockResolvedValue({ assistantMessage: result.assistantMessage, emittedDelta: false }),
      planChanges: vi.fn<() => Promise<AiChatResponse>>().mockResolvedValue(result),
    })
    const app = createApp({ bridge })

    const chatResponse = await app.request('/api/codex/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseRequest),
    })

    expect(chatResponse.status).toBe(200)
    const payload = await chatResponse.text()
    expect(payload).toContain('"stage":"starting_codex"')
    expect(payload).toContain('"stage":"planning_changes"')
    expect(payload).toContain('"type":"result"')
  })

  it('streams text import preview stages and the final import result', async () => {
    const result: TextImportResponse = {
      summary: '锟斤拷锟斤拷锟缴碉拷锟斤拷预锟斤拷',
      baseDocumentUpdatedAt: 1,
      anchorTopicId: 'topic_1',
      classification: {
        archetype: 'plan',
        confidence: 0.72,
        rationale: 'Fixture classification.',
        secondaryArchetype: 'report',
      },
      templateSummary: {
        archetype: 'plan',
        visibleSlots: ['actions', 'risks'],
        foldedSlots: ['goal'],
      },
      bundle: null,
      sources: [],
      semanticNodes: [],
      semanticEdges: [],
      views: [],
      viewProjections: {},
      defaultViewId: null,
      activeViewId: null,
      nodePlans: [
        {
          id: 'preview_1',
          parentId: null,
          order: 0,
          title: 'Plan',
          note: null,
          semanticRole: 'section',
          confidence: 'high',
          sourceAnchors: [],
          groupKey: 'root',
          priority: 'primary',
          collapsedByDefault: false,
          templateSlot: null,
        },
      ],
      previewNodes: [
        {
          id: 'preview_1',
          parentId: null,
          order: 0,
          title: 'Plan',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
      operations: [
        {
          id: 'import_1',
          type: 'create_child',
          parent: 'topic:topic_1',
          title: 'Plan',
          risk: 'low',
        },
      ],
      conflicts: [],
      warnings: [],
    }
    const logInfo = vi.fn()
    const logError = vi.fn()
    const bridge = createBridge({
      previewTextImport: vi.fn().mockImplementation(async (_request, options) => {
        options?.onStatus?.({
          stage: 'loading_prompt',
          message: 'Loaded the system prompt for import analysis.',
          durationMs: 12,
        })
        options?.onTrace?.({
          id: 'trace_1',
          sequence: 1,
          timestampMs: 10,
          channel: 'request',
          eventType: 'request.dispatched',
          payload: {
            kind: 'structured',
            promptLength: 120,
            schemaEnabled: true,
            sourceName: 'plan.txt',
            requestId: options?.requestId,
            attempt: 'primary',
          },
          attempt: 'primary',
          currentFileName: 'plan.txt',
        })
        options?.onStatus?.({
          stage: 'starting_codex_primary',
          message: 'Starting the Codex import analysis.',
        })
        options?.onStatus?.({
          stage: 'waiting_codex_primary',
          message: 'Codex 锟斤拷锟节凤拷锟斤拷全锟斤拷锟斤拷锟斤拷锟斤拷锟斤拷图锟斤拷',
        })
        options?.onStatus?.({
          stage: 'parsing_primary_result',
          message: 'Parsing the primary import result.',
        })
        return result
      }),
    })
    const app = createApp({ bridge, logInfo, logError })

    const response = await app.request('/api/codex/import/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseImportRequest),
    })

    expect(response.status).toBe(200)
    const payload = await response.text()
    const events = parseNdjsonPayload(payload)
    expect(payload).toContain('"stage":"extracting_input"')
    expect(payload).toContain('"stage":"analyzing_source"')
    expect(payload).toContain('"stage":"loading_prompt"')
    expect(payload).toContain('"type":"trace"')
    expect(payload).toContain('"stage":"starting_codex_primary"')
    expect(payload).toContain('"stage":"waiting_codex_primary"')
    expect(payload).toContain('"stage":"parsing_primary_result"')
    expect(payload).toContain('"stage":"resolving_conflicts"')
    expect(payload).toContain('"stage":"building_preview"')
    expect(payload).toContain('"type":"result"')
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => typeof event.requestId === 'string')).toBe(true)
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'trace',
        requestId: expect.stringMatching(/^import_/),
        entry: expect.objectContaining({
          id: 'trace_1',
          requestId: expect.stringMatching(/^import_/),
          currentFileName: 'plan.txt',
          eventType: 'request.dispatched',
        }),
      }),
    )
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'result',
        requestId: expect.stringMatching(/^import_/),
      }),
    )
    expect(bridge.previewTextImport).toHaveBeenCalledWith(
      expect.objectContaining({
        ...baseImportRequest,
        archetypeMode: 'auto',
      }),
      expect.objectContaining({
        onTrace: expect.any(Function),
        onStatus: expect.any(Function),
        requestId: expect.stringMatching(/^import_/),
      }),
    )
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[import][requestId='))
    expect(logError).not.toHaveBeenCalled()
  })

  it('forwards raw import errors through the NDJSON error event', async () => {
    const bridge = createBridge({
      previewTextImport: vi.fn().mockRejectedValue(
        new CodexBridgeError(
          'request_failed',
          'Codex import repair failed',
          undefined,
          'stderr: model output was truncated',
        ),
      ),
    })
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/import/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseImportRequest),
    })

    const payload = await response.text()
    const events = parseNdjsonPayload(payload)
    expect(payload).toContain('"type":"error"')
    expect(payload).toContain('"message":"Codex import repair failed"')
    expect(payload).toContain('"rawMessage":"stderr: model output was truncated"')
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: 'error',
        requestId: expect.stringMatching(/^import_/),
        rawMessage: 'stderr: model output was truncated',
      }),
    )
  })

  it('proxies semantic adjudication requests through the JSON route', async () => {
    const bridge = createBridge({
      adjudicateTextImportCandidates: vi.fn().mockResolvedValue({
        decisions: [
          {
            candidateId: 'candidate_1',
            kind: 'same_topic',
            confidence: 'high',
            mergedTitle: 'Unified Goals',
            mergedSummary: 'Merged summary',
            evidence: 'The imported topic and target share the same goal framing.',
          },
        ],
        warnings: [],
      }),
    })
    const logInfo = vi.fn()
    const app = createApp({ bridge, logInfo })

    const response = await app.request('/api/codex/import/adjudicate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseAdjudicationRequest),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      decisions: [
        {
          candidateId: 'candidate_1',
          kind: 'same_topic',
          confidence: 'high',
          mergedTitle: 'Unified Goals',
          mergedSummary: 'Merged summary',
          evidence: 'The imported topic and target share the same goal framing.',
        },
      ],
      warnings: [],
    })
    expect(bridge.adjudicateTextImportCandidates).toHaveBeenCalledWith(baseAdjudicationRequest)
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[semantic][jobId=job_semantic_1]'))
  })

  it('proxies sync conflict analysis requests through the JSON route', async () => {
    const bridge = createBridge({
      analyzeSyncConflict: vi.fn().mockResolvedValue({
        analysisSource: 'ai',
        recommendedResolution: 'merged_payload',
        confidence: 'high',
        summary: 'AI recommends merging the two versions.',
        reasons: ['The two versions contain complementary edits.'],
        actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
        mergedPayload: {
          title: 'Merged title',
        },
        analyzedAt: 999,
        analysisNote: null,
      }),
    })
    const app = createApp({ bridge })

    const response = await app.request('/api/sync/analyze-conflict', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseAnalyzeConflictRequest),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      analysisSource: 'ai',
      recommendedResolution: 'merged_payload',
      confidence: 'high',
      summary: 'AI recommends merging the two versions.',
      reasons: ['The two versions contain complementary edits.'],
      actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
      mergedPayload: {
        title: 'Merged title',
      },
      analyzedAt: 999,
      analysisNote: null,
    })
    expect(bridge.analyzeSyncConflict).toHaveBeenCalledWith(baseAnalyzeConflictRequest)
  })

  it('returns 404 when a sync conflict resolution target is missing', async () => {
    const repository = {
      initialize: vi.fn().mockResolvedValue(undefined),
      resolveConflict: vi.fn().mockRejectedValue(new Error('Conflict not found.')),
    } as unknown as SyncRepository<unknown>
    const syncService = new SyncService(repository, 50)
    const app = createApp({ bridge: createBridge(), syncService })
    const request: SyncResolveConflictRequest<unknown> = {
      conflictId: 'conflict_missing',
      workspaceId: 'workspace_1',
      deviceId: 'device_1',
      resolution: 'save_local_copy',
    }

    const response = await app.request('/api/sync/resolve-conflict', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: 'Conflict not found.' })
  })

  it('asks the client to bootstrap when pushing to a workspace that no longer exists', async () => {
    const repository = {
      initialize: vi.fn().mockResolvedValue(undefined),
      applyMutation: vi.fn().mockRejectedValue(new Error('Workspace not found.')),
    } as unknown as SyncRepository<unknown>
    const syncService = new SyncService(repository, 50)
    const app = createApp({ bridge: createBridge(), syncService })

    const response = await app.request('/api/sync/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        workspaceId: 'workspace_missing',
        deviceId: 'device_1',
        ops: [
          {
            opId: 'op_1',
            entityType: 'document',
            entityId: 'doc_1',
            action: 'upsert',
            baseVersion: null,
            payload: { id: 'doc_1', title: 'Recovered' },
            contentHash: 'hash_doc_1',
            clientUpdatedAt: 1,
          },
        ],
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      applied: [],
      cursor: 0,
      serverTime: expect.any(Number),
      requiresBootstrap: true,
    })
  })
})
