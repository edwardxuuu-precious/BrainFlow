// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  CodexStatus,
  MarkdownImportRequest,
} from '../shared/ai-contract.js'
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
      activeTopicId: 'root',
      selectedTopicIds: ['root'],
      relationSummary: [],
    },
  },
  baseDocumentUpdatedAt: 1,
}

const baseImportRequest: MarkdownImportRequest = {
  documentId: 'doc_1',
  documentTitle: '测试脑图',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'root',
  fileName: 'plan.md',
  markdown: '# Plan',
  preprocessedTree: [
    {
      id: 'md_1',
      title: 'Plan',
      level: 1,
      sourcePath: ['Plan'],
      blocks: [],
      children: [],
    },
  ],
}

function createPromptStore(overrides?: Record<string, unknown>) {
  return {
    loadPrompt: vi.fn().mockResolvedValue({
      summary: 'summary',
      version: 'version',
      fullPrompt: 'prompt',
    }),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    resetSettings: vi.fn(),
    ...overrides,
  }
}

describe('createCodexBridge', () => {
  it('degrades status when prompt loading fails instead of throwing', async () => {
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute: vi.fn(),
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore({
        loadPrompt: vi.fn().mockRejectedValue(new Error('ENOENT')),
      }),
    })

    await expect(bridge.getStatus()).resolves.toMatchObject({
      cliInstalled: true,
      loggedIn: true,
      ready: false,
      issues: [expect.objectContaining({ code: 'request_failed', message: '系统 Prompt 加载失败：ENOENT' })],
      systemPromptSummary: '系统 Prompt 加载失败',
      systemPromptVersion: 'unavailable',
      systemPrompt: '',
    })
  })

  it('degrades status when runner status throws unexpectedly instead of bubbling a 500', async () => {
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockRejectedValue(new Error('runner exploded')),
        execute: vi.fn(),
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    await expect(bridge.getStatus()).resolves.toMatchObject({
      cliInstalled: false,
      loggedIn: false,
      authProvider: null,
      ready: false,
      issues: [
        expect.objectContaining({
          code: 'request_failed',
          message: '本机 Codex 状态检查失败：runner exploded',
        }),
      ],
      systemPromptSummary: 'summary',
      systemPromptVersion: 'version',
      systemPrompt: 'prompt',
    })
  })

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
                  metadata: { type: string[] }
                  style: { type: string[] }
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
      'metadata',
      'style',
    ])
    expect(operationSchema.properties.parentTopicId.type).toEqual(['string', 'null'])
    expect(operationSchema.properties.resultRef.type).toEqual(['string', 'null'])
    expect(operationSchema.properties.metadata.type).toEqual(['object', 'null'])
    expect(operationSchema.properties.style.type).toEqual(['object', 'null'])
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
  it('normalizes markdown import preview payloads', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: '已生成导入预览',
        previewTree: [
          {
            id: 'preview_1',
            title: 'Plan',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            note: null,
            children: [],
          },
        ],
        operations: [
          {
            id: 'import_1',
            risk: 'low',
            conflictId: null,
            reason: null,
            type: 'create_child',
            parent: 'topic:root',
            anchor: null,
            target: null,
            newParent: null,
            targetIndex: null,
            title: 'Plan',
            note: null,
            resultRef: null,
            parentTopicId: null,
            targetTopicId: null,
            topicId: null,
            targetParentId: null,
            metadata: null,
            style: null,
          },
        ],
        conflicts: [],
        warnings: [],
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

    await expect(bridge.previewMarkdownImport(baseImportRequest)).resolves.toMatchObject({
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: 1,
      previewTree: [expect.objectContaining({ title: 'Plan', relation: 'new' })],
      operations: [expect.objectContaining({ id: 'import_1', risk: 'low', type: 'create_child' })],
      conflicts: [],
      warnings: [],
    })
  })
})
