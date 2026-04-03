// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  AiChatResponse,
  CodexSettings,
  CodexStatus,
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
      },
      {
        topicId: 'topic_1',
        title: '分支一',
        note: '',
        parentTopicId: 'topic_root',
        childTopicIds: [],
        aiLocked: false,
      },
    ],
    focus: {
      activeTopicId: 'topic_1',
      selectedTopicIds: ['topic_1'],
      relationSummary: [],
    },
  },
}

describe('codex app', () => {
  it('returns codex status through the proxy', async () => {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
      getSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(settings),
      resetSettings: vi.fn().mockResolvedValue(settings),
      chat: vi.fn(),
    }
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(status)
    expect(bridge.getStatus).toHaveBeenCalledTimes(1)
  })

  it('reads, saves, and resets codex settings', async () => {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
      getSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue({
        ...settings,
        businessPrompt: '新的业务 Prompt',
        version: 'settings-v2',
      }),
      resetSettings: vi.fn().mockResolvedValue(settings),
      chat: vi.fn(),
    }
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

  it('streams chat results for direct canvas application', async () => {
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
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
      getSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(settings),
      resetSettings: vi.fn().mockResolvedValue(settings),
      chat: vi.fn<() => Promise<AiChatResponse>>().mockResolvedValue(result),
    }
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
    const firstLine = payload.split('\n').find(Boolean)
    expect(firstLine).toBe(
      '{"type":"status","stage":"starting_codex","message":"正在调用本机 Codex…"}',
    )
    expect(payload).toContain('"type":"result"')
    expect(bridge.chat).toHaveBeenCalledWith(baseRequest)
  })

  it('streams schema_invalid errors without pretending that login is broken', async () => {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
      getSettings: vi.fn().mockResolvedValue(settings),
      saveSettings: vi.fn().mockResolvedValue(settings),
      resetSettings: vi.fn().mockResolvedValue(settings),
      chat: vi
        .fn()
        .mockRejectedValue(
          new CodexBridgeError(
            'schema_invalid',
            '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。这不是登录问题，重新验证不会解决，请修复应用端格式后再试。',
          ),
        ),
    }
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
    expect(payload).toContain('"type":"error"')
    expect(payload).toContain('"code":"schema_invalid"')
    expect(payload).toContain('这不是登录问题')
  })
})
