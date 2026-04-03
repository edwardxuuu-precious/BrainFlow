// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { AiChatRequest, CodexStatus } from '../shared/ai-contract.js'
import { CodexBridgeError, createCodexBridge } from './codex-bridge.js'

const readyStatus: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: 'summary',
  systemPromptVersion: 'version',
  systemPrompt: 'prompt',
}

const baseRequest: AiChatRequest = {
  documentId: 'doc_1',
  sessionId: 'session_default',
  messages: [
    {
      id: 'msg_1',
      role: 'user',
      content: '帮我整理脑图',
      createdAt: 1,
    },
  ],
  context: {
    documentTitle: '测试脑图',
    rootTopicId: 'root',
    topicCount: 1,
    topics: [
      {
        topicId: 'root',
        title: '中心主题',
        note: '',
        parentTopicId: null,
        childTopicIds: [],
        aiLocked: false,
      },
    ],
    focus: {
      activeTopicId: 'root',
      selectedTopicIds: ['root'],
      relationSummary: [],
    },
  },
  baseDocumentUpdatedAt: 1,
}

function createPromptStore() {
  return {
    loadPrompt: vi.fn().mockResolvedValue({
      summary: 'summary',
      version: 'version',
      fullPrompt: 'prompt',
    }),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    resetSettings: vi.fn(),
  }
}

describe('createCodexBridge', () => {
  it('streams natural-language chat first and forwards assistant deltas when available', async () => {
    const executeMessage = vi.fn().mockImplementation(async (_prompt, options) => {
      options?.onEvent?.({
        type: 'item.delta',
        item: {
          text_delta: '正在输出的片段',
        },
      })

      return '完整自然语言回答'
    })

    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute: vi.fn(),
        executeMessage,
      },
      promptStore: createPromptStore(),
    })

    const onAssistantDelta = vi.fn()
    const result = await bridge.streamChat(baseRequest, { onAssistantDelta })

    expect(result).toEqual({
      assistantMessage: '完整自然语言回答',
      emittedDelta: true,
    })
    expect(onAssistantDelta).toHaveBeenCalledWith('正在输出的片段')
    expect(executeMessage).toHaveBeenCalledTimes(1)
  })

  it('passes a wide output schema that remains compatible with current codex exec validation', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsMoreContext: false,
        contextRequest: [],
        warnings: [],
        proposal: {
          summary: 'no-op',
          operations: [],
        },
      }),
    )

    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    await bridge.planChanges(baseRequest, '自然语言回答')

    const schema = execute.mock.calls[0][1] as {
      required: string[]
      properties: {
        proposal: {
          type: string[]
          required: string[]
          properties: {
            operations: {
              items: {
                required: string[]
                properties: {
                  type: { type: string[] }
                  parentTopicId: { type: string[] }
                  resultRef: { type: string[] }
                }
              }
            }
          }
        }
      }
    }

    const operationSchema = schema.properties.proposal.properties.operations.items
    expect(schema.required).toEqual(['needsMoreContext', 'contextRequest', 'warnings', 'proposal'])
    expect(schema.properties.proposal.type).toEqual(['object', 'null'])
    expect(schema.properties.proposal.required).toEqual(['id', 'summary', 'operations'])
    expect(operationSchema.properties.type.type).toEqual(['string', 'null'])
    expect(operationSchema.required).toEqual([
      'type',
      'parent',
      'anchor',
      'target',
      'newParent',
      'targetIndex',
      'title',
      'note',
      'resultRef',
      'parentTopicId',
      'targetTopicId',
      'topicId',
      'targetParentId',
    ])
    expect(operationSchema.properties.parentTopicId.type).toEqual(['string', 'null'])
    expect(operationSchema.properties.resultRef.type).toEqual(['string', 'null'])
  })

  it('rewraps runner schema failures as bridge errors with schema_invalid', async () => {
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute: vi.fn().mockRejectedValue(
          Object.assign(new Error('schema failed'), {
            issue: {
              code: 'schema_invalid',
              message: '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。',
            },
          }),
        ),
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    await expect(bridge.planChanges(baseRequest, '自然语言回答')).rejects.toMatchObject({
      code: 'schema_invalid',
      message: '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。',
    } satisfies Partial<CodexBridgeError>)
  })
})
