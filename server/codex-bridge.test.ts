// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  CodexStatus,
  TextImportSemanticAdjudicationRequest,
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
    expect(execute.mock.calls[0][0]).toContain(
      'When the source is dialogue, chat, or meeting back-and-forth, prefer finer-grained nodes',
    )
    expect(execute.mock.calls[0][0]).toContain(
      'When the source contains tables or semi-structured data, preserve the full table in note text',
    )
    expect(execute.mock.calls[0][0]).toContain(
      'When the source is long-form prose without explicit markdown structure, infer a concise hierarchy',
    )
  })

  it('adjudicates semantic import candidates with a dedicated schema', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
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
    )

    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    await expect(bridge.adjudicateTextImportCandidates(baseAdjudicationRequest)).resolves.toEqual({
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
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('Semantic adjudication goal:'),
      expect.any(Object),
      expect.any(Object),
    )
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
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'loading_prompt',
      }),
    )
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'repairing_structure',
      }),
    )
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'starting_codex_repair',
      }),
    )
    expect(execute.mock.calls[1][0]).toContain('repair attempt')
  })

  it('logs import attempt timings and runner observations when requestId is provided', async () => {
    const execute = vi.fn().mockImplementation(async (_prompt, _schema, options) => {
      options?.onEvent?.({
        type: 'thread.started',
        thread_id: 'thread_1',
      })
      options?.onEvent?.({
        type: 'turn.started',
        turn_id: 'turn_1',
      })
      options?.onEvent?.({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: '{"summary":"Compact preview ready"}',
        },
      })
      options?.onEvent?.({
        type: 'turn.completed',
        usage: {
          input_tokens: 512,
          output_tokens: 128,
        },
      })
      options?.onObservation?.({
        phase: 'spawn_started',
        kind: 'structured',
        timestampMs: 100,
        promptLength: 120,
      })
      options?.onObservation?.({
        phase: 'heartbeat',
        kind: 'structured',
        timestampMs: 140,
        promptLength: 120,
        elapsedSinceLastEventMs: 40,
        hadJsonEvent: false,
      })
      options?.onObservation?.({
        phase: 'first_json_event',
        kind: 'structured',
        timestampMs: 180,
        promptLength: 120,
        elapsedSinceLastEventMs: 80,
        hadJsonEvent: true,
      })
      options?.onObservation?.({
        phase: 'completed',
        kind: 'structured',
        timestampMs: 320,
        promptLength: 120,
        elapsedSinceLastEventMs: 140,
        exitCode: 0,
        stdoutLength: 256,
        stderrLength: 0,
        hadJsonEvent: true,
      })

      return JSON.stringify({
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
      })
    })
    const logInfo = vi.fn()
    const onRunnerObservation = vi.fn()
    const onCodexEvent = vi.fn()
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
      logInfo,
      now: vi
        .fn()
        .mockReturnValueOnce(10)
        .mockReturnValueOnce(30)
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(70)
        .mockReturnValueOnce(90),
    })

    await bridge.previewTextImport(baseImportRequest, {
      requestId: 'req_123',
      onStatus: vi.fn(),
      onRunnerObservation,
      onCodexEvent,
    })

    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[import][requestId=req_123]'))
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('event="runner"'))
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('event="attempt_completed"'))
    expect(onRunnerObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 'primary',
        phase: 'heartbeat',
        promptLength: 120,
        elapsedSinceLastEventMs: 40,
      }),
    )
    expect(onRunnerObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 'primary',
        phase: 'first_json_event',
        promptLength: 120,
      }),
    )
    expect(onCodexEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        attempt: 'primary',
        eventType: 'turn.started',
        requestId: 'req_123',
        summary: 'Codex 已开始分析导入内容',
      }),
    )
    expect(onCodexEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        attempt: 'primary',
        eventType: 'item.completed',
        requestId: 'req_123',
        summary: '已生成结构化结果：Compact preview ready',
      }),
    )
    expect(onCodexEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        attempt: 'primary',
        eventType: 'turn.completed',
        requestId: 'req_123',
        summary: 'Codex 已完成生成（输入 512 tokens，输出 128 tokens）',
      }),
    )
  })

  it('builds a compact import context for markdown requests', async () => {
    const denseRequest: TextImportRequest = {
      ...baseImportRequest,
      sourceName: 'plan.md',
      context: {
        ...baseImportRequest.context,
        topicCount: 4,
        topics: [
          baseImportRequest.context.topics[0],
          {
            topicId: 'focus_child',
            title: 'Focus child',
            note: 'Detailed note kept in full',
            parentTopicId: 'root',
            childTopicIds: ['deep_child'],
            aiLocked: false,
            metadata: {
              labels: ['launch'],
              markers: [],
              task: null,
              links: [],
              attachments: [],
            },
            style: {
              emphasis: 'focus',
              variant: 'default',
            },
          },
          {
            topicId: 'deep_child',
            title: 'Deep child',
            note: 'Another full note',
            parentTopicId: 'focus_child',
            childTopicIds: [],
            aiLocked: true,
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
            topicId: 'background_topic',
            title: 'Background topic',
            note: 'This note should be truncated into a preview because it is outside the focus path.',
            parentTopicId: 'root',
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
          activeTopicId: 'focus_child',
          selectedTopicIds: ['focus_child'],
          relationSummary: [],
        },
      },
      anchorTopicId: 'focus_child',
    }

    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: 'Compact preview ready',
        previewNodes: [],
        operations: [],
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

    await bridge.previewTextImport(denseRequest)

    const prompt = execute.mock.calls[0]?.[0] as string
    expect(prompt).toContain('"focusedTopicCount": 3')
    expect(prompt).toContain('"compactTopicCount": 1')
    expect(prompt).toContain('"notePreview": "This note should be truncated')
    expect(prompt).not.toContain('"labels": []')
    expect(prompt).not.toContain('"variant": "default"')
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
