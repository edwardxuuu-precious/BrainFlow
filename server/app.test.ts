// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { AiChatRequest, AiChatResponse, CodexStatus } from '../shared/ai-contract.js'
import { createApp } from './app.js'

const status: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '只基于选区上下文回答。',
  systemPromptVersion: 'abc123',
  systemPrompt: 'full prompt',
}

const baseRequest: AiChatRequest = {
  documentId: 'doc_1',
  conversationId: 'default',
  baseDocumentUpdatedAt: 1,
  messages: [
    {
      id: 'msg_1',
      role: 'user',
      content: '请帮我扩展这个节点',
      createdAt: 1,
    },
  ],
  context: {
    documentTitle: '测试脑图',
    activeTopicId: 'topic_1',
    selectedTopicIds: ['topic_1'],
    topics: [
      {
        topicId: 'topic_1',
        title: '中心主题',
        note: '',
        ancestorTitles: [],
        childTitles: ['分支一'],
        selectedChildTitles: [],
        selectedParentTitle: null,
      },
    ],
    relationSummary: [],
  },
}

describe('codex app', () => {
  it('returns codex status through the proxy', async () => {
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
      chat: vi.fn(),
    }
    const app = createApp({ bridge })

    const response = await app.request('/api/codex/status')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(status)
    expect(bridge.getStatus).toHaveBeenCalledTimes(1)
  })

  it('streams chat results and never auto-applies writes', async () => {
    const result: AiChatResponse = {
      assistantMessage: '这里是一条 Codex 回答。',
      needsMoreContext: false,
      proposal: null,
    }
    const bridge = {
      getStatus: vi.fn().mockResolvedValue(status),
      revalidate: vi.fn().mockResolvedValue(status),
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
    expect(await chatResponse.text()).toContain('"type":"result"')
    expect(bridge.chat).toHaveBeenCalledWith(baseRequest)
  })
})
