// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type {
  AiChatRequest,
  CodexStatus,
  TextImportSemanticAdjudicationRequest,
  TextImportRequest,
} from '../shared/ai-contract.js'
import type { SyncAnalyzeConflictRequest } from '../shared/sync-contract.js'
import { CodexBridgeError, createCodexBridge } from './codex-bridge.js'

const GTM_V2_OUTPUT = JSON.parse(
  readFileSync(new URL('../docs/test_docs/GTM_main.document-to-logic-map.v2.json', import.meta.url), 'utf8'),
)

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
      content: 'Summarize the current map.',
      createdAt: 1,
    },
  ],
  context: {
    documentTitle: '濞村鐦懘鎴濇禈',
    rootTopicId: 'root',
    scope: 'full_document',
    topicCount: 1,
    topics: [
      {
        topicId: 'root',
        title: '娑擃厼绺炬稉濠氼暯',
        note: '',
        parentTopicId: null,
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
      activeTopicId: 'root',
      selectedTopicIds: ['root'],
      relationSummary: [],
    },
  },
  baseDocumentUpdatedAt: 1,
}

const baseImportRequest: TextImportRequest = {
  documentId: 'doc_1',
  documentTitle: '濞村鐦懘鎴濇禈',
  baseDocumentUpdatedAt: 1,
  context: baseRequest.context,
  anchorTopicId: 'root',
  sourceName: 'plan.txt',
  sourceType: 'file',
  intent: 'distill_structure',
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
  semanticHints: [],
}

const baseAdjudicationRequest: TextImportSemanticAdjudicationRequest = {
  jobId: 'job_semantic_1',
  documentId: 'doc_1',
  documentTitle: '濞村鐦懘鎴濇禈',
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
        pathTitles: ['Root topic', 'Goals'],
        title: 'Goals',
        noteSummary: 'Existing summary',
        parentTitle: '娑擃厼绺炬稉濠氼暯',
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
        body: 'Local note',
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
        body: 'Cloud note',
      },
    },
    localPayload: {
      title: 'Local title',
      body: 'Local note',
    },
    cloudPayload: {
      title: 'Cloud title',
      body: 'Cloud note',
    },
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
      systemPromptSummary: expect.stringContaining('Prompt'),
      systemPromptVersion: 'unavailable',
      systemPrompt: '',
    })
  })

  it('streams natural-language chat first and forwards assistant deltas when available', async () => {
    const executeMessage = vi.fn().mockImplementation(async (_prompt, options) => {
      options?.onEvent?.({
        type: 'item.delta',
        item: {
          text_delta: 'Streaming assistant delta',
        },
      })

      return 'Assistant reply'
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
      assistantMessage: 'Assistant reply',
      emittedDelta: true,
    })
    expect(onAssistantDelta).toHaveBeenCalledWith('Streaming assistant delta')
  })

  it('switches chat prompt guidance when only a focused subset is provided', async () => {
    const executeMessage = vi.fn().mockResolvedValue('Assistant reply')
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute: vi.fn(),
        executeMessage,
      },
      promptStore: createPromptStore(),
    })

    const subsetRequest: AiChatRequest = {
      ...baseRequest,
      context: {
        ...baseRequest.context,
        scope: 'focused_subset',
        topicCount: 1,
        topics: [baseRequest.context.topics[0]],
      },
    }

    await bridge.streamChat(subsetRequest)

    expect(executeMessage.mock.calls[0]?.[0]).toContain('Use only the provided subset graph context.')
    expect(executeMessage.mock.calls[0]?.[0]).not.toContain('Use the full graph context to understand the request')
  })

  it('drops AI-authored markers and stickers from planned proposal metadata', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        needsMoreContext: false,
        contextRequest: [],
        warnings: [],
        proposal: {
          id: 'proposal_1',
          summary: 'Planned changes',
          operations: [
            {
              type: 'update_topic',
              target: 'topic:root',
              title: 'Updated root',
              metadata: {
                labels: ['action'],
                type: 'task',
                markers: ['warning'],
                stickers: ['rocket'],
              },
            },
          ],
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

    const result = await bridge.planChanges(baseRequest, 'Assistant reply')

    expect(result).toMatchObject({
      assistantMessage: 'Assistant reply',
      needsMoreContext: false,
      proposal: {
        summary: 'Planned changes',
        operations: [
          expect.objectContaining({
            type: 'update_topic',
            target: 'topic:root',
          }),
        ],
      },
    })
    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'update_topic',
      target: 'topic:root',
      metadata: {
        labels: ['action'],
        type: 'task',
      },
    })
    const firstOperation = result.proposal?.operations[0]
    expect(firstOperation && 'metadata' in firstOperation ? firstOperation.metadata : undefined).not.toHaveProperty('markers')
    expect(firstOperation && 'metadata' in firstOperation ? firstOperation.metadata : undefined).not.toHaveProperty('stickers')
    expect(execute.mock.calls[0]?.[0]).toContain('Markers and stickers are human-maintained fields.')
    expect(execute.mock.calls[0]?.[0]).toContain(
      'you must not create or modify markers or stickers in proposal metadata.',
    )
  })

  it('normalizes flat text import preview payloads', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: 'Compact preview ready',
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
      summary: 'Compact preview ready',
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
      'Use the repo skill `document-to-logic-map` for this import.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '"spec_version": "document-to-logic-map/v2"',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '"semantic_hint_count": 0',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Each judgment module must use the fixed skeleton: 核心判断 -> 判断依据 -> 潜在动作.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Rewrite the visible thinking structure into a judgment tree around the core question instead of preserving the source outline.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Choose the root from the highest-information semantic unit, such as the core question, thesis, main decision, or main job-to-be-done. The root may keep light source context in note, but do not default it to the file title.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Extract tasks with high recall. If the action is clear but the deliverable is incomplete, infer `task.output` and mark `inferred_output=true` instead of dropping the task.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Treat 判断依据 as a grouping layer, not the main information layer. Prefer concrete basis_item grandchildren over group-level summaries.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- If the source contains concrete checks, interview prompts, evidence conditions, criteria, or observation points, emit them as separate basis_item children under 判断依据.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Do not leave 判断依据 empty when the source or the group note already contains concrete checks, criteria, or interview prompts.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Do not leave 潜在动作 empty when the source or the group note already contains clear validation,整理,核查,建表,访谈,汇总, or output intent.',
    )
    expect(execute.mock.calls[0][0]).toContain(
      '- Convert only source-grounded validation,整理,核查,汇总,访谈,评分,建表, and output intent into tasks. Infer outputs when needed, but do not invent new workstreams or strategy packages beyond the source.',
    )
  })

  it('normalizes layer-only import payloads and compiles local projections', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: 'Layer preview ready',
        classification: {
          archetype: 'mixed',
          confidence: 0.81,
          rationale: 'Semantic layer fixture.',
          secondaryArchetype: null,
        },
        templateSummary: {
          archetype: 'mixed',
          visibleSlots: ['themes'],
          foldedSlots: ['summary'],
        },
        bundle: {
          id: 'bundle_layered',
          title: 'GTM import',
          createdAt: 1,
          anchorTopicId: 'root',
          sources: [
            {
              id: 'source_1',
              type: 'file',
              title: 'GTM_main',
              raw_content: '# GTM',
              metadata: {
                segments: [
                  {
                    kind: 'heading',
                    text: 'GTM_main',
                    lineStart: 1,
                    lineEnd: 1,
                    pathTitles: ['GTM_main'],
                  },
                ],
              },
            },
          ],
          semanticNodes: [
            {
              id: 'question_root',
              type: 'question',
              title: '第一波应该先打谁',
              summary: '中心问题',
              detail: '',
              source_refs: [],
              confidence: 'high',
              task: null,
            },
            {
              id: 'criterion_1',
              type: 'criterion',
              title: '判断标准',
              summary: '是否有明确预算',
              detail: '',
              source_refs: [],
              confidence: 'medium',
              task: null,
            },
          ],
          semanticEdges: [
            {
              from: 'criterion_1',
              to: 'question_root',
              type: 'belongs_to',
              label: null,
              source_refs: [],
              confidence: 'high',
            },
          ],
          views: [],
          viewProjections: {},
        },
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

    const result = await bridge.previewTextImport(baseImportRequest)

    expect(result.bundle).not.toBeNull()
    expect(result.views.map((view) => view.type)).toEqual([
      'thinking_view',
      'execution_view',
      'archive_view',
    ])
    expect(result.previewNodes[0]).toMatchObject({
      title: '第一波应该先打谁',
    })
    expect(result.viewProjections[result.activeViewId as string]?.previewNodes.length).toBeGreaterThan(0)
    expect(result.sources[0]).toMatchObject({
      source_role: 'canonical_knowledge',
      merge_mode: 'create_new',
      same_as_topic_id: null,
    })
    expect(result.sources[0]?.canonical_topic_id).toBeTruthy()
    expect(result.sources[0]?.semantic_fingerprint).toBeTruthy()
  })

  it('normalizes v2 judgment-tree payloads and mirrors tasks into execution view', async () => {
    const execute = vi.fn().mockResolvedValue(JSON.stringify(GTM_V2_OUTPUT))

    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    const result = await bridge.previewTextImport({
      ...baseImportRequest,
      sourceName: 'GTM_main.md',
      rawText: '# GTM main',
    })

    const thinkingRoot = result.previewNodes.find((node) => node.parentId === null)
    const firstLevelTitles = result.previewNodes
      .filter((node) => node.parentId === thinkingRoot?.id)
      .map((node) => node.title)
    const executionViewId = result.views.find((view) => view.type === 'execution_view')?.id as string
    const executionProjection = result.viewProjections[executionViewId]
    const executionTitles = executionProjection.previewNodes.map((node) => node.title)
    const mirroredTypes = executionProjection.previewNodes
      .filter((node) => node.parentId !== null)
      .map((node) => node.structureRole)
    const painBasisTitles = result.previewNodes
      .filter((node) => node.parentId === 'module_pain_basis')
      .map((node) => node.title)
    const buyingBasisTitles = result.previewNodes
      .filter((node) => node.parentId === 'module_buying_basis')
      .map((node) => node.title)
    const accessBasisTitles = result.previewNodes
      .filter((node) => node.parentId === 'module_access_basis')
      .map((node) => node.title)
    const discoveryTaskTitles = result.previewNodes
      .filter((node) => node.parentId === 'module_discovery_actions')
      .map((node) => node.title)

    expect(thinkingRoot?.title).toBe('第一波应该先打谁')
    expect(firstLevelTitles).toEqual([
      '先明确筛选问题',
      '先按处境切分',
      '先识别真实痛感',
      '再判断购买成熟度',
      '再判断触达效率',
      '再判断案例扩散',
      '再统一四维评分',
      '最后做 Discovery 验证',
    ])
    expect(firstLevelTitles).not.toContain('制作 Beachhead Segment 四维筛选表')
    expect(
      result.semanticNodes.find((node) => node.id === 'task_build_scoring_sheet'),
    ).toMatchObject({
      source_module_id: 'module_scoring',
      task: {
        output: 'Beachhead Segment 四维筛选表',
        mirrored_task_id: 'execution::task_build_scoring_sheet',
        inferred_output: false,
      },
    })
    expect(painBasisTitles).toEqual([
      '最近一次这个问题发生在什么时候',
      '现在怎么解决，这个替代方案是什么',
      '这个替代方案哪里最难受',
      '如果 3 个月不解决，会损失什么',
      '已经花过什么时间、钱、精力或关系成本',
    ])
    expect(buyingBasisTitles).toEqual([
      '成功标准是否明确',
      '是否存在明确的决策时间线',
      '是否已经有预算，或能否快速拿到预算',
      '谁有采购权或最终决定权',
      '审批链是否足够短',
      '他们是否已经在比较替代方案',
    ])
    expect(accessBasisTitles).toEqual([
      '他们是否集中在少数社区、群组、线下场景或工作流节点',
      '你是否能直接接触到他们，而不是依赖大规模投放',
      '前 20 到 30 个潜在客户是否能被明确找到并手动转化',
    ])
    expect(discoveryTaskTitles).toEqual([
      '跑一轮 customer discovery 验证候选 segment',
      '输出一句 beachhead 定义',
    ])
    expect(executionProjection.previewNodes[0]).toMatchObject({
      title: '执行汇总',
      structureRole: 'execution_root',
    })
    expect(executionTitles).toContain('制作 Beachhead Segment 四维筛选表')
    expect(executionTitles).toContain('跑一轮 customer discovery 验证候选 segment')
    expect(executionTitles).toContain('输出一句 beachhead 定义')
    expect(executionTitles).not.toContain('先明确筛选问题')
    expect(mirroredTypes.every((value) => value === 'execution_task_mirror')).toBe(true)
  })

  it('normalizes v2 source-role merge metadata and falls back to safe defaults', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        spec_version: 'document-to-logic-map/v2',
        document_type: 'analysis',
        document_type_confidence: 0.92,
        document_type_rationale: 'Fixture rationale',
        source_role: 'context_record',
        canonical_topic_id: 'topic_gtm',
        same_as_topic_id: 'topic_gtm',
        merge_mode: 'merge_into_existing',
        merge_confidence: 0.86,
        semantic_fingerprint: 'fp_gtm',
        summary: 'Metadata fixture',
        nodes: [
          {
            id: 'root_context',
            parent_id: null,
            order: 0,
            type: 'question',
            title: 'Root question',
            note: null,
            semantic_role: 'question',
            confidence: 'high',
            source_spans: [{ line_start: 1, line_end: 1 }],
            structure_role: 'root_context',
            locked: false,
            source_module_id: null,
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
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

    const result = await bridge.previewTextImport({
      ...baseImportRequest,
      sourceName: 'GTM_step1.md',
      rawText: '# GTM step1',
    })

    expect(result.sources[0]).toMatchObject({
      source_role: 'context_record',
      canonical_topic_id: 'topic_gtm',
      same_as_topic_id: 'topic_gtm',
      merge_mode: 'merge_into_existing',
      merge_confidence: 0.86,
      semantic_fingerprint: 'fp_gtm',
    })
  })

  it('repairs empty v2 basis and action groups from source-grounded hints instead of passing empty shells through', async () => {
    const request: TextImportRequest = {
      ...baseImportRequest,
      sourceName: 'pricing_research.md',
      rawText: [
        '# Pricing research',
        '',
        '## Renewal risk',
        'Price is only the blocker when renewal objections cluster around missing value proof.',
        '- What changed in renewal objections this quarter?',
        '- Which accounts asked for discounts before churn?',
        '- Is onboarding complete before the renewal date?',
        '- Create a renewal interview guide',
        '- Build a discount exception table',
      ].join('\n'),
      preprocessedHints: [
        ...baseImportRequest.preprocessedHints,
        {
          id: 'hint_pricing_heading',
          kind: 'heading',
          text: 'Renewal risk',
          raw: '## Renewal risk',
          level: 2,
          lineStart: 3,
          lineEnd: 3,
          sourcePath: ['Pricing research', 'Renewal risk'],
        },
        {
          id: 'hint_pricing_basis',
          kind: 'bullet_list',
          text: 'Renewal checks',
          raw: '- What changed in renewal objections this quarter?\n- Which accounts asked for discounts before churn?\n- Is onboarding complete before the renewal date?',
          level: 0,
          lineStart: 5,
          lineEnd: 7,
          sourcePath: ['Pricing research', 'Renewal risk'],
          items: [
            'What changed in renewal objections this quarter?',
            'Which accounts asked for discounts before churn?',
            'Is onboarding complete before the renewal date?',
          ],
        },
        {
          id: 'hint_pricing_actions',
          kind: 'bullet_list',
          text: 'Follow-up actions',
          raw: '- Create a renewal interview guide\n- Build a discount exception table',
          level: 0,
          lineStart: 8,
          lineEnd: 9,
          sourcePath: ['Pricing research', 'Renewal risk'],
          items: [
            'Create a renewal interview guide',
            'Build a discount exception table',
          ],
        },
      ],
    }
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        spec_version: 'document-to-logic-map/v2',
        document_type: 'analysis',
        document_type_confidence: 0.9,
        document_type_rationale: 'Pricing analysis with one judgment module.',
        summary: 'Pricing repair ready',
        nodes: [
          {
            id: 'root_context',
            parent_id: null,
            order: 0,
            type: 'question',
            title: 'Should pricing be validated as the main churn risk first?',
            note: null,
            semantic_role: 'question',
            confidence: 'high',
            source_spans: [{ line_start: 1, line_end: 9 }],
            structure_role: 'root_context',
            locked: false,
            source_module_id: null,
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_pricing',
            parent_id: 'root_context',
            order: 0,
            type: 'section',
            title: 'First verify whether pricing is the real blocker',
            note: null,
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [{ line_start: 3, line_end: 9 }],
            structure_role: 'judgment_module',
            locked: false,
            source_module_id: null,
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_pricing_core',
            parent_id: 'module_pricing',
            order: 0,
            type: 'section',
            title: '核心判断',
            note: 'Price is only the blocker when renewal objections cluster around missing value proof.',
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [{ line_start: 4, line_end: 4 }],
            structure_role: 'core_judgment_group',
            locked: false,
            source_module_id: 'module_pricing',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_pricing_basis',
            parent_id: 'module_pricing',
            order: 1,
            type: 'section',
            title: '判断依据',
            note: null,
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [],
            structure_role: 'judgment_basis_group',
            locked: false,
            source_module_id: 'module_pricing',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_pricing_actions',
            parent_id: 'module_pricing',
            order: 2,
            type: 'section',
            title: '潜在动作',
            note: null,
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [],
            structure_role: 'potential_action_group',
            locked: false,
            source_module_id: 'module_pricing',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
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

    const result = await bridge.previewTextImport(request)
    const repairedCore = result.previewNodes.filter((node) => node.parentId === 'module_pricing_core')
    const basisChildren = result.previewNodes.filter((node) => node.parentId === 'module_pricing_basis')
    const actionChildren = result.previewNodes.filter((node) => node.parentId === 'module_pricing_actions')

    expect(repairedCore).toHaveLength(1)
    expect(basisChildren.map((node) => node.title)).toEqual([
      'What changed in renewal objections this quarter?',
      'Which accounts asked for discounts before churn?',
      'Is onboarding complete before the renewal date?',
    ])
    expect(actionChildren.map((node) => node.title)).toEqual([
      'Create a renewal interview guide',
      'Build a discount exception table',
    ])
    expect(
      result.warnings.some((warning) =>
        warning.includes('[auto-filled] Judgment group "判断依据" in module "First verify whether pricing is the real blocker"'),
      ),
    ).toBe(true)
    expect(
      result.warnings.some((warning) =>
        warning.includes('[auto-filled] Judgment group "潜在动作" in module "First verify whether pricing is the real blocker"'),
      ),
    ).toBe(true)
    expect(
      result.semanticNodes.filter((node) => node.source_module_id === 'module_pricing' && node.type === 'task'),
    ).toMatchObject([
      {
        title: 'Create a renewal interview guide',
        structure_role: 'action_item',
        task: {
          output: 'a renewal interview guide',
          inferred_output: true,
          mirrored_task_id: 'execution::module_pricing_actions_action_1',
        },
      },
      {
        title: 'Build a discount exception table',
        structure_role: 'action_item',
        task: {
          output: 'a discount exception table',
          inferred_output: true,
          mirrored_task_id: 'execution::module_pricing_actions_action_2',
        },
      },
    ])
  })

  it('keeps abstract reminders out of repaired task nodes and keeps a fallback group note when actions stay empty', async () => {
    const request: TextImportRequest = {
      ...baseImportRequest,
      sourceName: 'research_notes.md',
      rawText: [
        '# Research notes',
        '',
        '## Adoption check',
        'Keep listening closely to customer language before changing the roadmap.',
      ].join('\n'),
      preprocessedHints: [
        ...baseImportRequest.preprocessedHints,
        {
          id: 'hint_research_heading',
          kind: 'heading',
          text: 'Adoption check',
          raw: '## Adoption check',
          level: 2,
          lineStart: 3,
          lineEnd: 3,
          sourcePath: ['Research notes', 'Adoption check'],
        },
        {
          id: 'hint_research_para',
          kind: 'paragraph',
          text: 'Keep listening closely to customer language before changing the roadmap.',
          raw: 'Keep listening closely to customer language before changing the roadmap.',
          level: 0,
          lineStart: 4,
          lineEnd: 4,
          sourcePath: ['Research notes', 'Adoption check'],
        },
      ],
    }
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        spec_version: 'document-to-logic-map/v2',
        document_type: 'notes',
        document_type_confidence: 0.83,
        document_type_rationale: 'Research notes around one adoption judgment.',
        summary: 'Research reminder preview',
        nodes: [
          {
            id: 'root_context',
            parent_id: null,
            order: 0,
            type: 'question',
            title: 'What should be validated before changing adoption strategy?',
            note: null,
            semantic_role: 'question',
            confidence: 'high',
            source_spans: [{ line_start: 1, line_end: 4 }],
            structure_role: 'root_context',
            locked: false,
            source_module_id: null,
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_adoption',
            parent_id: 'root_context',
            order: 0,
            type: 'section',
            title: 'First verify whether adoption language is understood',
            note: null,
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [{ line_start: 3, line_end: 4 }],
            structure_role: 'judgment_module',
            locked: false,
            source_module_id: null,
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_adoption_core',
            parent_id: 'module_adoption',
            order: 0,
            type: 'section',
            title: '核心判断',
            note: 'The team should hear customer language clearly before rewriting the roadmap.',
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [{ line_start: 4, line_end: 4 }],
            structure_role: 'core_judgment_group',
            locked: false,
            source_module_id: 'module_adoption',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_adoption_basis',
            parent_id: 'module_adoption',
            order: 1,
            type: 'section',
            title: '判断依据',
            note: 'Which language do customers actually use when they describe onboarding pain?',
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [{ line_start: 4, line_end: 4 }],
            structure_role: 'judgment_basis_group',
            locked: false,
            source_module_id: 'module_adoption',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
          },
          {
            id: 'module_adoption_actions',
            parent_id: 'module_adoption',
            order: 2,
            type: 'section',
            title: '潜在动作',
            note: null,
            semantic_role: 'section',
            confidence: 'high',
            source_spans: [],
            structure_role: 'potential_action_group',
            locked: false,
            source_module_id: 'module_adoption',
            proposed_reorder: null,
            proposed_reparent: null,
            task: null,
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

    const result = await bridge.previewTextImport(request)

    expect(result.previewNodes.filter((node) => node.parentId === 'module_adoption_actions')).toEqual([])
    expect(
      result.previewNodes.find((node) => node.id === 'module_adoption_actions')?.note?.length ?? 0,
    ).toBeGreaterThan(0)
    expect(
      result.semanticNodes.some(
        (node) => node.source_module_id === 'module_adoption' && node.type === 'task',
      ),
    ).toBe(false)
    expect(
      result.warnings.some((warning) =>
        warning.includes('[kept-group-note] Judgment group "潜在动作" in module "First verify whether adoption language is understood"'),
      ),
    ).toBe(true)
    expect(result.warnings).toContain(
      'Judgment module "First verify whether adoption language is understood" is missing concrete 潜在动作 items.',
    )
  })

  it('strips formatting fields from imported structural operations', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        summary: 'Compact preview ready',
        previewNodes: [
          {
            id: 'preview_1',
            parentId: null,
            order: 0,
            title: 'Plan',
            note: 'Capture the key follow-up',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
        operations: [
          {
            id: 'import_1',
            risk: 'low',
            type: 'create_child',
            parent: 'topic:root',
            title: 'Plan',
            note: 'Capture the key follow-up',
            resultRef: 'preview_1',
            metadata: {
              labels: ['action'],
              type: 'task',
              markers: ['warning'],
              stickers: ['rocket'],
            },
            style: {
              emphasis: 'focus',
              variant: 'soft',
            },
            presentation: {
              collapsedByDefault: true,
              groupKey: 'actions',
              priority: 'primary',
            },
          },
          {
            id: 'import_2',
            risk: 'low',
            type: 'update_topic',
            target: 'topic:root',
            title: 'Root update',
            note: 'Keep the existing branch concise',
            metadata: {
              labels: ['decision'],
              markers: ['decision'],
            },
            style: {
              emphasis: 'focus',
              variant: 'solid',
            },
            presentation: {
              collapsedByDefault: true,
            },
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

    const result = await bridge.previewTextImport(baseImportRequest)
    const createOperation = result.operations[0]
    const updateOperation = result.operations[1]

    expect(createOperation).toMatchObject({
      type: 'create_child',
      parent: 'topic:root',
      title: 'Plan',
      note: 'Capture the key follow-up',
      resultRef: 'preview_1',
    })
    expect(createOperation).not.toHaveProperty('metadata')
    expect(createOperation).not.toHaveProperty('style')
    expect(createOperation).not.toHaveProperty('presentation')

    expect(updateOperation).toMatchObject({
      type: 'update_topic',
      target: 'topic:root',
      title: 'Root update',
      note: 'Keep the existing branch concise',
    })
    expect(updateOperation).not.toHaveProperty('metadata')
    expect(updateOperation).not.toHaveProperty('style')
    expect(updateOperation).not.toHaveProperty('presentation')
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

  it('analyzes sync conflicts with a dedicated schema', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        recommendedResolution: 'merged_payload',
        confidence: 'high',
        summary: 'Merge the two versions.',
        reasons: ['Both sides contain useful edits.'],
        actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
        mergedPayload: {
          title: 'Merged title',
          body: 'Merged note',
        },
        analysisNote: null,
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

    await expect(bridge.analyzeSyncConflict(baseAnalyzeConflictRequest)).resolves.toMatchObject({
      analysisSource: 'ai',
      recommendedResolution: 'merged_payload',
      confidence: 'high',
      summary: 'Merge the two versions.',
      reasons: ['Both sides contain useful edits.'],
      actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
      mergedPayload: {
        title: 'Merged title',
        body: 'Merged note',
      },
      analyzedAt: expect.any(Number),
      analysisNote: null,
    })
    expect(execute.mock.calls[0]?.[0]).toContain('Analyze a sync conflict between local cache and cloud data.')
  })

  it('rejects merged sync conflict recommendations without merged payload', async () => {
    const execute = vi.fn().mockResolvedValue(
      JSON.stringify({
        recommendedResolution: 'merged_payload',
        confidence: 'medium',
        summary: 'Try merging.',
        reasons: ['The records look related.'],
        actionableResolutions: ['merged_payload'],
        mergedPayload: null,
        analysisNote: null,
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

    await expect(bridge.analyzeSyncConflict(baseAnalyzeConflictRequest)).rejects.toMatchObject({
      code: 'schema_invalid',
      message: '冲突分析返回了 merged_payload，但缺少完整 mergedPayload。',
    } satisfies Partial<CodexBridgeError>)
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
          summary: 'Compact preview ready',
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
    const onProgress = vi.fn()
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    const result = await bridge.previewTextImport(baseImportRequest, { onStatus, onProgress })

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
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'repairing_structure',
        source: 'status',
        attempt: 'repair',
        tone: 'warning',
      }),
    )
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'starting_codex_repair',
        source: 'status',
        attempt: 'repair',
      }),
    )
    expect(execute.mock.calls[1][0]).toContain('repair attempt')
  })

  it('logs import attempt timings when requestId is provided', async () => {
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
        summary: 'preview',
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

    const onTrace = vi.fn()

    await bridge.previewTextImport(baseImportRequest, {
      requestId: 'req_123',
      onStatus: vi.fn(),
      onTrace,
    })

    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('[import][requestId=req_123]'))
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('event="runner"'))
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('event="attempt_completed"'))
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'request.dispatched',
        channel: 'request',
        attempt: 'primary',
        requestId: 'req_123',
      }),
    )
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'heartbeat',
        channel: 'runner',
        attempt: 'primary',
        replaceKey: 'trace:primary:heartbeat',
      }),
    )
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'item.completed',
        channel: 'codex',
        attempt: 'primary',
      }),
    )
  })

  it('emits waiting heartbeat status updates during long import attempts', async () => {
    const execute = vi.fn().mockImplementation(async (_prompt, _schema, options) => {
      options?.onObservation?.({
        phase: 'heartbeat',
        kind: 'structured',
        timestampMs: 140,
        promptLength: 120,
        elapsedSinceLastEventMs: 5_000,
        hadJsonEvent: false,
      })

      return JSON.stringify({
        summary: 'preview',
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

    const onStatus = vi.fn()
    const onTrace = vi.fn()
    const bridge = createCodexBridge({
      runner: {
        getStatus: vi.fn().mockResolvedValue(readyStatus),
        execute,
        executeMessage: vi.fn(),
      },
      promptStore: createPromptStore(),
    })

    await bridge.previewTextImport(baseImportRequest, { onStatus, onTrace })

    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'waiting_codex_primary',
        message: '我正在等待 Codex 返回主导入结果。 已等待 5s，仍在运行。',
        durationMs: 5_000,
      }),
    )
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'runner',
        eventType: 'heartbeat',
        attempt: 'primary',
        replaceKey: 'trace:primary:heartbeat',
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
    expect(prompt).toContain('"focused_topic_count": 3')
    expect(prompt).toContain('"compact_topic_count": 1')
    expect(prompt).toContain('"focused_note_preview_count": 2')
    expect(prompt).toContain('"compact_note_preview_count": 1')
    expect(prompt).toContain('"structured_hint_count": 1')
    expect(prompt).toContain('"preprocessed_hint_summary"')
    expect(prompt).toContain('"background_topic_titles": [')
    expect(prompt).toContain('"focused_topics": [')
    expect(prompt).toContain('"preprocessed_hints": [')
    expect(prompt).toContain('"notePreview": "Detailed note kept in full"')
    expect(prompt).toContain('"notePreview": "Another full note"')
    expect(prompt).toContain('"Background topic"')
    expect(prompt).not.toContain('"notePreview": "This note should be truncated')
    expect(prompt).not.toContain('"note": "Detailed note kept in full"')
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
            message: 'Codex execution failed; check the local bridge logs.',
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
      message: expect.stringContaining('Codex'),
      rawMessage: 'stderr: model output was truncated',
    } satisfies Partial<CodexBridgeError>)
  })
})
