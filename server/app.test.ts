// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  AiChatResponse,
  CodexSettings,
  CodexStatus,
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
    ...overrides,
  }
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
    const bridge = createBridge({
      previewTextImport: vi.fn().mockResolvedValue(result),
    })
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/import/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseImportRequest),
    })

    expect(response.status).toBe(200)
    const payload = await response.text()
    expect(payload).toContain('"stage":"extracting_input"')
    expect(payload).toContain('"stage":"analyzing_source"')
    expect(payload).toContain('"stage":"resolving_conflicts"')
    expect(payload).toContain('"stage":"building_preview"')
    expect(payload).toContain('"type":"result"')
    expect(bridge.previewTextImport).toHaveBeenCalledWith(baseImportRequest, expect.any(Object))
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
    expect(payload).toContain('"type":"error"')
    expect(payload).toContain('"message":"Codex 导入结构修正失败"')
    expect(payload).toContain('"rawMessage":"stderr: model output was truncated"')
  })
})
