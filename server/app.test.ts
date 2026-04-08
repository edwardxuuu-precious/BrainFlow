// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  AiChatResponse,
  CodexSettings,
  CodexStatus,
  TextImportSemanticAdjudicationRequest,
  TextImportRequest,
  TextImportResponse,
} from '../shared/ai-contract.js'
import type { SyncAnalyzeConflictRequest } from '../shared/sync-contract.js'
import { createApp } from './app.js'
import { CodexBridgeError } from './codex-bridge.js'

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

describe('codex app', () => {
  it('returns codex status through the proxy', async () => {
    const bridge = createBridge()
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(status)
    expect(bridge.getStatus).toHaveBeenCalledTimes(1)
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
    expect(payload).toContain('"stage":"starting_codex_primary"')
    expect(payload).toContain('"stage":"waiting_codex_primary"')
    expect(payload).toContain('"stage":"parsing_primary_result"')
    expect(payload).toContain('"stage":"resolving_conflicts"')
    expect(payload).toContain('"stage":"building_preview"')
    expect(payload).toContain('"type":"result"')
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => typeof event.requestId === 'string')).toBe(true)
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
})
