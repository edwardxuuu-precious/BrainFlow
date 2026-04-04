// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  AiChatResponse,
  CodexSettings,
  CodexStatus,
  MarkdownImportRequest,
  MarkdownImportResponse,
} from '../shared/ai-contract.js'
import { createApp } from './app.js'
import { CodexBridgeError } from './codex-bridge.js'

const status: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '完整系统提示词摘要',
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

const baseImportRequest: MarkdownImportRequest = {
  documentId: 'doc_1',
  documentTitle: '测试脑图',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'topic_1',
  fileName: 'plan.md',
  markdown: '# Plan\n\n- Item',
  preprocessedTree: [
    {
      id: 'md_1',
      title: 'Plan',
      level: 1,
      sourcePath: ['Plan'],
      blocks: [
        {
          type: 'bullet_list',
          text: 'Item',
          raw: '- Item',
          items: ['Item'],
        },
      ],
      children: [],
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

  it('returns a structured json 500 when status throws unexpectedly', async () => {
    const logError = vi.fn()
    const bridge = createBridge({
      getStatus: vi.fn().mockRejectedValue(new Error('runner exploded')),
    })
    const app = createApp({ bridge, logError })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'request_failed',
      message: 'runner exploded',
    })
    expect(logError).toHaveBeenCalledWith('[codex] GET /api/codex/status failed', expect.any(Error))
  })

  it('returns a structured json 500 when revalidate throws unexpectedly', async () => {
    const logError = vi.fn()
    const bridge = createBridge({
      revalidate: vi.fn().mockRejectedValue(new Error('prompt load failed')),
    })
    const app = createApp({ bridge, logError })

    const response = await app.request('/api/codex/revalidate', {
      method: 'POST',
    })

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      code: 'request_failed',
      message: 'prompt load failed',
    })
    expect(logError).toHaveBeenCalledWith(
      '[codex] POST /api/codex/revalidate failed',
      expect.any(Error),
    )
  })

  it('reads, saves, and resets codex settings', async () => {
    const bridge = createBridge({
      saveSettings: vi.fn().mockResolvedValue({
        ...settings,
        businessPrompt: '新的业务 Prompt',
        version: 'settings-v2',
      }),
    })
    const app = createApp({ bridge })

    const readResponse = await app.request('/api/codex/settings')
    expect(readResponse.status).toBe(200)
    expect(await readResponse.json()).toEqual(settings)

    const saveResponse = await app.request('/api/codex/settings', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessPrompt: '新的业务 Prompt' }),
    })
    expect(saveResponse.status).toBe(200)
    expect(bridge.saveSettings).toHaveBeenCalledWith('新的业务 Prompt')

    const resetResponse = await app.request('/api/codex/settings/reset', {
      method: 'POST',
    })
    expect(resetResponse.status).toBe(200)
    expect(bridge.resetSettings).toHaveBeenCalledTimes(1)
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
    expect(chatResponse.headers.get('content-type')).toContain('application/x-ndjson')
    const payload = await chatResponse.text()
    expect(payload).toContain('"stage":"starting_codex"')
    expect(payload).toContain('"stage":"streaming"')
    expect(payload).toContain('"type":"assistant_delta"')
    expect(payload).toContain('"stage":"planning_changes"')
    expect(payload).toContain('"type":"result"')
    expect(bridge.streamChat).toHaveBeenCalledWith(baseRequest, expect.any(Object))
    expect(bridge.planChanges).toHaveBeenCalledWith(baseRequest, result.assistantMessage)
  })

  it('keeps the first-stage answer available when planning changes fails', async () => {
    const bridge = createBridge({
      streamChat: vi
        .fn()
        .mockResolvedValue({ assistantMessage: '这里是一条已成功生成的回答。', emittedDelta: false }),
      planChanges: vi
        .fn()
        .mockRejectedValue(
          new CodexBridgeError('request_failed', '第二阶段结构化落图失败，请稍后重试。'),
        ),
    })
    const app = createApp({ bridge })

    const chatResponse = await app.request('/api/codex/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(baseRequest),
    })

    const payload = await chatResponse.text()
    expect(payload).toContain('这里是一条已成功生成的回答。')
    expect(payload).toContain('"stage":"planning_changes"')
    expect(payload).toContain('"type":"error"')
    expect(payload).toContain('第二阶段结构化落图失败')
  })
  it('streams markdown import preview stages and the final import result', async () => {
    const result: MarkdownImportResponse = {
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: 1,
      previewTree: [
        {
          id: 'preview_1',
          title: 'Plan',
          relation: 'new',
          matchedTopicId: null,
          children: [],
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
      previewMarkdownImport: vi.fn().mockResolvedValue(result),
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
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')
    const payload = await response.text()
    expect(payload).toContain('"stage":"parsing_markdown"')
    expect(payload).toContain('"stage":"analyzing_import"')
    expect(payload).toContain('"stage":"resolving_conflicts"')
    expect(payload).toContain('"stage":"building_preview"')
    expect(payload).toContain('"type":"result"')
    expect(bridge.previewMarkdownImport).toHaveBeenCalledWith(baseImportRequest)
  })
})
