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
import { createApp } from './app.js'
import { CodexBridgeError } from './codex-bridge.js'

const status: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '完整系统提示摘要',
  systemPromptVersion: 'abc123',
  systemPrompt: 'full prompt',
}

const settings: CodexSettings = {
  businessPrompt: '你是一个帮助用户直接把想法落到脑图中的助手。',
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
      content: '请帮我整理这张脑图',
      createdAt: 1,
    },
  ],
  context: {
    documentTitle: '测试脑图',
    rootTopicId: 'topic_root',
    topicCount: 2,
    topics: [
      {
        topicId: 'topic_root',
        title: '中心主题',
        note: '',
        parentTopicId: null,
        childTopicIds: ['topic_1'],
        aiLocked: false,
        metadata: {
          labels: [],
          markers: [],
          task: null,
          links: [],
          attachments: [],
        },
        style: {
          emphasis: 'normal',
          variant: 'default',
        },
      },
      {
        topicId: 'topic_1',
        title: '分支一',
        note: '',
        parentTopicId: 'topic_root',
        childTopicIds: [],
        aiLocked: false,
        metadata: {
          labels: [],
          markers: [],
          task: null,
          links: [],
          attachments: [],
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
  documentTitle: '测试脑图',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'topic_1',
  sourceName: 'plan.txt',
  sourceType: 'file',
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
}

const baseAdjudicationRequest: TextImportSemanticAdjudicationRequest = {
  jobId: 'job_semantic_1',
  documentId: 'doc_1',
  documentTitle: '测试脑图',
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
        pathTitles: ['中心主题', '分支一'],
        title: '分支一',
        noteSummary: 'Existing summary',
        parentTitle: '中心主题',
        fingerprint: 'fp_1',
      },
    },
  ],
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
      assistantMessage: '这里是一条 Codex 回答。',
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
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: 1,
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
          message: '已加载系统提示词，正在准备导入分析…',
          durationMs: 12,
        })
        options?.onStatus?.({
          stage: 'starting_codex_primary',
          message: '正在启动 Codex 导入分析…',
        })
        options?.onStatus?.({
          stage: 'waiting_codex_primary',
          message: 'Codex 正在分析全文与整张脑图…',
        })
        options?.onRunnerObservation?.({
          attempt: 'primary',
          phase: 'heartbeat',
          kind: 'structured',
          promptLength: 120,
          elapsedSinceSpawnMs: 5_000,
          elapsedSinceLastEventMs: 5_000,
          hadJsonEvent: false,
        })
        options?.onCodexEvent?.({
          attempt: 'primary',
          eventType: 'turn.started',
          at: 1_000,
          summary: 'Codex 已开始分析导入内容',
          rawJson: '{"type":"turn.started"}',
        })
        options?.onStatus?.({
          stage: 'parsing_primary_result',
          message: '正在解析主导入结果…',
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
    expect(payload).toContain('"type":"runner_observation"')
    expect(payload).toContain('"phase":"heartbeat"')
    expect(payload).toContain('"type":"codex_event"')
    expect(payload).toContain('"eventType":"turn.started"')
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
    expect(bridge.previewTextImport).toHaveBeenCalledWith(baseImportRequest, expect.any(Object))
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[import][requestId='))
    expect(logError).not.toHaveBeenCalled()
  })

  it('forwards raw import errors through the NDJSON error event', async () => {
    const bridge = createBridge({
      previewTextImport: vi.fn().mockRejectedValue(
        new CodexBridgeError(
          'request_failed',
          'Codex 导入结构修正失败',
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
    expect(payload).toContain('"message":"Codex 导入结构修正失败"')
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
})
