// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  CodexStatus,
  TextImportRequest,
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

const baseImportRequest: TextImportRequest = {
  documentId: 'doc_1',
  documentTitle: '测试脑图',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'root',
  sourceName: 'plan.txt',
  sourceType: 'file',
  rawText: '# Plan',
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
      issues: [expect.objectContaining({ code: 'request_failed', message: expect.stringContaining('ENOENT') })],
      systemPromptSummary: '系统 Prompt 加载失败',
      systemPromptVersion: 'unavailable',
      systemPrompt: '',
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
  })

  it('normalizes flat text import preview payloads', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: '已生成导入预览',
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

    await expect(bridge.previewTextImport(baseImportRequest)).resolves.toMatchObject({
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: 1,
      previewNodes: [
        expect.objectContaining({
          id: 'preview_1',
          parentId: null,
          order: 0,
          title: 'Plan',
          relation: 'new',
        }),
      ],
      operations: [expect.objectContaining({ id: 'import_1', risk: 'low', type: 'create_child' })],
      conflicts: [],
      warnings: [],
    })
  })

  it('retries once with a repair prompt when the first import schema is incompatible', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('schema failed'), {
          issue: {
            code: 'schema_invalid',
            message: 'schema mismatch',
          },
          rawMessage: 'invalid_json_schema: recursive children not supported',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          summary: '已生成导入预览',
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
          operations: [],
          conflicts: [],
          warnings: [],
        }),
      )

    const onStatus = vi.fn()
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    const result = await bridge.previewTextImport(baseImportRequest, { onStatus })

    expect(result.previewNodes).toHaveLength(1)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(onStatus).toHaveBeenCalledWith('正在修正导入结构…')
    expect(execute.mock.calls[1][0]).toContain('repair attempt')
  })

  it('surfaces the raw Codex error when repair also fails', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('schema failed'), {
          issue: {
            code: 'schema_invalid',
            message: 'schema mismatch',
          },
          rawMessage: 'invalid_json_schema: recursive children not supported',
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('cli failed'), {
          issue: {
            code: 'request_failed',
            message: 'Codex 执行失败，请稍后重试；如果持续失败，请检查本地 bridge 日志。',
          },
          rawMessage: 'stderr: model output was truncated',
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

    await expect(bridge.previewTextImport(baseImportRequest)).rejects.toMatchObject({
      code: 'request_failed',
      message: 'Codex 导入结构修正失败',
      rawMessage: 'stderr: model output was truncated',
    } satisfies Partial<CodexBridgeError>)
  })
})
