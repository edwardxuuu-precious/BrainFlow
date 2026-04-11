import { describe, expect, it } from 'vitest'
import type { TextImportResponse } from '../../../shared/ai-contract'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'
import type { LocalTextImportBatchRequest } from './local-text-import-core'
import { composeTextImportBatchPreview, type BatchTextImportPreviewSource } from './text-import-batch-compose'
import {
  applyTextImportSemanticAdjudication,
  createTextImportSemanticDraft,
} from './text-import-semantic-merge'

function createBaseResponse(overrides: Partial<TextImportResponse> = {}): TextImportResponse {
  return {
    summary: 'Semantic merge preview',
    baseDocumentUpdatedAt: 1,
    anchorTopicId: 'root',
    classification: {
      archetype: 'mixed',
      confidence: 0.6,
      rationale: 'Fixture response.',
      secondaryArchetype: null,
    },
    templateSummary: {
      archetype: 'mixed',
      visibleSlots: ['themes'],
      foldedSlots: ['summary'],
    },
    bundle: null,
    sources: [],
    semanticNodes: [],
    semanticEdges: [],
    views: [],
    viewProjections: {},
    defaultViewId: null,
    activeViewId: null,
    nodePlans: [],
    previewNodes: [],
    operations: [],
    conflicts: [],
    mergeSuggestions: [],
    crossFileMergeSuggestions: [],
    semanticMerge: null,
    batch: null,
    warnings: [],
    ...overrides,
  }
}

function createBatchSourceResponse(
  previewNodes: TextImportResponse['previewNodes'],
): TextImportResponse {
  return createBaseResponse({
    previewNodes,
    nodePlans: [],
    operations: [],
    warnings: [],
  })
}

describe('text-import-semantic-merge', () => {
  it('turns a high-confidence existing-topic adjudication into a note+title update', () => {
    const document = createMindMapDocument('Import doc')
    const targetId = document.topics[document.rootTopicId].childIds[0]
    document.topics[targetId].title = 'Goals'

    const request = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'import_goals.md',
      sourceType: 'file' as const,
      intent: 'distill_structure' as const,
      rawText: '# Goals',
      preprocessedHints: [],
      semanticHints: [],
    }

    const response = createBaseResponse({
      baseDocumentUpdatedAt: document.updatedAt,
      anchorTopicId: document.rootTopicId,
      previewNodes: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Import',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'preview_goals',
          parentId: 'preview_root',
          order: 0,
          title: 'Goals',
          note: 'Imported detail',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
    })

    const draft = createTextImportSemanticDraft(request, response)
    const bundle = draft.candidateBundles.find((candidate) => candidate.scope === 'existing_topic')
    expect(bundle).toBeDefined()

    const result = applyTextImportSemanticAdjudication(response, draft, {
      decisions: [
        {
          candidateId: bundle!.candidate.candidateId,
          kind: 'same_topic',
          confidence: 'high',
          mergedTitle: 'Unified Goals',
          mergedSummary: 'Combined imported summary',
          evidence: 'The imported section and the existing topic describe the same goals.',
        },
      ],
      warnings: [],
    })

    expect(result.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'update_topic',
          target: `topic:${targetId}`,
          title: 'Unified Goals',
        }),
      ]),
    )
    expect(result.operations.find((operation) => operation.type === 'update_topic')?.note).toContain(
      'Combined imported summary',
    )
    expect(result.mergeSuggestions).toEqual([])
    expect(result.semanticMerge).toEqual(
      expect.objectContaining({
        autoMergedExistingCount: 1,
      }),
    )
  })

  it('canonicalizes high-confidence cross-file matches into a single apply node', () => {
    const document = createMindMapDocument('Import doc')
    const request = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: Strategy',
      files: [
        {
          sourceName: 'strategy_alpha.md',
          sourceType: 'file' as const,
          intent: 'distill_structure' as const,
          rawText: '# Alpha',
          preprocessedHints: [],
          semanticHints: [],
        },
        {
          sourceName: 'strategy_beta.md',
          sourceType: 'file' as const,
          intent: 'distill_structure' as const,
          rawText: '# Beta',
          preprocessedHints: [],
          semanticHints: [],
        },
      ],
    }

    const response = createBaseResponse({
      baseDocumentUpdatedAt: document.updatedAt,
      anchorTopicId: document.rootTopicId,
      previewNodes: [
        {
          id: 'batch_root',
          parentId: null,
          order: 0,
          title: 'Import batch: Strategy',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'file_alpha',
          parentId: 'batch_root',
          order: 0,
          title: 'Alpha',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'alpha_positioning',
          parentId: 'file_alpha',
          order: 0,
          title: 'Positioning',
          note: 'Text A',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'file_beta',
          parentId: 'batch_root',
          order: 1,
          title: 'Beta',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'beta_positioning',
          parentId: 'file_beta',
          order: 0,
          title: 'Positioning',
          note: 'Text B',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
      batch: {
        jobType: 'batch',
        fileCount: 2,
        completedFileCount: 2,
        currentFileName: null,
        batchContainerTitle: 'Import batch: Strategy',
        files: [
          {
            sourceName: 'strategy_alpha.md',
            sourceType: 'file',
            previewNodeId: 'file_alpha',
            nodeCount: 2,
            sourceRole: 'canonical_knowledge',
            canonicalTopicId: 'topic_strategy_alpha',
            sameAsTopicId: null,
            mergeMode: 'create_new',
            mergeConfidence: 1,
            semanticFingerprint: 'fingerprint_strategy_alpha',
            mergeSuggestionCount: 0,
            warningCount: 0,
            classification: null,
            templateSummary: null,
          },
          {
            sourceName: 'strategy_beta.md',
            sourceType: 'file',
            previewNodeId: 'file_beta',
            nodeCount: 2,
            sourceRole: 'context_record',
            canonicalTopicId: 'topic_strategy_alpha',
            sameAsTopicId: 'topic_strategy_alpha',
            mergeMode: 'merge_into_existing',
            mergeConfidence: 0.88,
            semanticFingerprint: 'fingerprint_strategy_beta',
            mergeSuggestionCount: 0,
            warningCount: 0,
            classification: null,
            templateSummary: null,
          },
        ],
      },
    })

    const draft = createTextImportSemanticDraft(request, response)
    const crossFileBundle = draft.candidateBundles.find((candidate) => candidate.scope === 'cross_file')
    expect(crossFileBundle).toBeDefined()

    const result = applyTextImportSemanticAdjudication(response, draft, {
      decisions: [
        {
          candidateId: crossFileBundle!.candidate.candidateId,
          kind: 'same_topic',
          confidence: 'high',
          mergedTitle: 'Unified Positioning',
          mergedSummary: 'Combined positioning notes',
          evidence: 'Both files describe the same positioning topic.',
        },
      ],
      warnings: [],
    })

    expect(
      result.operations.filter(
        (operation) => operation.type === 'create_child' && operation.title === 'Unified Positioning',
      ),
    ).toHaveLength(1)
    expect((result.semanticMerge?.autoMergedCrossFileCount ?? 0) > 0).toBe(true)
  })

  it('annotates semantic candidates with grouping metadata for bridge deduplication', () => {
    const document = createMindMapDocument('Import doc')
    const request = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: Strategy',
      files: [
        {
          sourceName: 'strategy_alpha.md',
          sourceType: 'file' as const,
          intent: 'distill_structure' as const,
          rawText: '# Alpha',
          preprocessedHints: [],
          semanticHints: [],
        },
        {
          sourceName: 'strategy_beta.md',
          sourceType: 'file' as const,
          intent: 'distill_structure' as const,
          rawText: '# Beta',
          preprocessedHints: [],
          semanticHints: [],
        },
      ],
    }

    const response = createBaseResponse({
      previewNodes: [
        {
          id: 'batch_root',
          parentId: null,
          order: 0,
          title: 'Import batch: Strategy',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'file_alpha',
          parentId: 'batch_root',
          order: 0,
          title: 'Alpha',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'alpha_positioning',
          parentId: 'file_alpha',
          order: 0,
          title: 'Positioning',
          note: 'Text A',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'file_beta',
          parentId: 'batch_root',
          order: 1,
          title: 'Beta',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'beta_positioning',
          parentId: 'file_beta',
          order: 0,
          title: 'Positioning',
          note: 'Text B',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
      batch: {
        jobType: 'batch',
        fileCount: 2,
        completedFileCount: 2,
        currentFileName: null,
        batchContainerTitle: 'Import batch: Strategy',
        files: [
          {
            sourceName: 'strategy_alpha.md',
            sourceType: 'file',
            previewNodeId: 'file_alpha',
            nodeCount: 2,
            sourceRole: 'canonical_knowledge',
            canonicalTopicId: 'topic_strategy_alpha',
            sameAsTopicId: null,
            mergeMode: 'create_new',
            mergeConfidence: 1,
            semanticFingerprint: 'fingerprint_strategy_alpha',
            mergeSuggestionCount: 0,
            warningCount: 0,
            classification: null,
            templateSummary: null,
          },
          {
            sourceName: 'strategy_beta.md',
            sourceType: 'file',
            previewNodeId: 'file_beta',
            nodeCount: 2,
            sourceRole: 'context_record',
            canonicalTopicId: 'topic_strategy_alpha',
            sameAsTopicId: 'topic_strategy_alpha',
            mergeMode: 'merge_into_existing',
            mergeConfidence: 0.88,
            semanticFingerprint: 'fingerprint_strategy_beta',
            mergeSuggestionCount: 0,
            warningCount: 0,
            classification: null,
            templateSummary: null,
          },
        ],
      },
    })

    const draft = createTextImportSemanticDraft(request, response)
    const crossFileCandidate = draft.candidateBundles.find((bundle) => bundle.scope === 'cross_file')

    expect(crossFileCandidate?.candidate.groupId).toBeTruthy()
    expect(crossFileCandidate?.candidate.groupSize).toBeGreaterThanOrEqual(1)
    expect(crossFileCandidate?.candidate.similarityScore).toBeGreaterThan(0)
  })

  it('merges context records into a single canonical root and injects basis/task increments', () => {
    const document = createMindMapDocument('Import doc')
    const batchRequest: LocalTextImportBatchRequest = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: GTM',
      files: [
        {
          sourceName: 'GTM_main.md',
          sourceType: 'file',
          rawText: '# GTM main',
          preprocessedHints: [],
          semanticHints: [],
          intent: 'distill_structure',
        },
        {
          sourceName: 'GTM_step1.md',
          sourceType: 'file',
          rawText: '# GTM step1',
          preprocessedHints: [],
          semanticHints: [],
          intent: 'distill_structure',
        },
      ],
    }
    const sources: BatchTextImportPreviewSource[] = [
      {
        ...batchRequest.files[0],
        route: 'codex_import',
        response: createBatchSourceResponse([
          {
            id: 'root_main',
            parentId: null,
            order: 0,
            title: '第一波市场先打谁',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'section',
            semanticType: 'question',
            structureRole: 'root_context',
            confidence: 'high',
          },
          {
            id: 'module_main',
            parentId: 'root_main',
            order: 0,
            title: '先识别真实痛点',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'claim',
            semanticType: 'claim',
            structureRole: 'judgment_module',
            confidence: 'high',
          },
          {
            id: 'basis_group_main',
            parentId: 'module_main',
            order: 0,
            title: '判断依据',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'evidence',
            semanticType: 'evidence',
            structureRole: 'judgment_basis_group',
            confidence: 'high',
          },
          {
            id: 'basis_item_shared_main',
            parentId: 'basis_group_main',
            order: 0,
            title: '是否存在重复高频抱怨',
            note: 'main basis detail',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'evidence',
            semanticType: 'evidence',
            structureRole: 'basis_item',
            confidence: 'high',
          },
          {
            id: 'action_group_main',
            parentId: 'module_main',
            order: 1,
            title: '潜在动作',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'task',
            semanticType: 'task',
            structureRole: 'potential_action_group',
            confidence: 'high',
          },
          {
            id: 'action_item_main',
            parentId: 'action_group_main',
            order: 0,
            title: '访谈10个候选客户',
            note: 'main action detail',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'task',
            semanticType: 'task',
            structureRole: 'action_item',
            confidence: 'high',
          },
        ]),
      },
      {
        ...batchRequest.files[1],
        route: 'codex_import',
        response: createBatchSourceResponse([
          {
            id: 'root_step',
            parentId: null,
            order: 0,
            title: '第一波市场先打谁',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'section',
            semanticType: 'question',
            structureRole: 'root_context',
            confidence: 'high',
          },
          {
            id: 'module_step',
            parentId: 'root_step',
            order: 0,
            title: '先识别真实痛点',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'claim',
            semanticType: 'claim',
            structureRole: 'judgment_module',
            confidence: 'high',
          },
          {
            id: 'basis_group_step',
            parentId: 'module_step',
            order: 0,
            title: '判断依据',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'evidence',
            semanticType: 'evidence',
            structureRole: 'judgment_basis_group',
            confidence: 'high',
          },
          {
            id: 'basis_item_shared_step',
            parentId: 'basis_group_step',
            order: 0,
            title: '是否存在重复高频抱怨',
            note: 'step conflict phrasing',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'evidence',
            semanticType: 'evidence',
            structureRole: 'basis_item',
            confidence: 'high',
          },
          {
            id: 'basis_item_increment_step',
            parentId: 'basis_group_step',
            order: 1,
            title: '收集最近30天工单标签频率',
            note: 'step added basis',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'evidence',
            semanticType: 'evidence',
            structureRole: 'basis_item',
            confidence: 'high',
          },
          {
            id: 'action_group_step',
            parentId: 'module_step',
            order: 1,
            title: '潜在动作',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'task',
            semanticType: 'task',
            structureRole: 'potential_action_group',
            confidence: 'high',
          },
          {
            id: 'action_item_increment_step',
            parentId: 'action_group_step',
            order: 0,
            title: '按行业拆分痛点热度表',
            note: 'step added action',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'task',
            semanticType: 'task',
            structureRole: 'action_item',
            confidence: 'high',
          },
        ]),
      },
    ]

    const composed = composeTextImportBatchPreview(batchRequest, sources)
    const rootNodes = composed.previewNodes.filter((node) => node.parentId === null)
    const batchFiles = composed.batch?.files ?? []
    const mainFile = batchFiles.find((file) => file.sourceName === 'GTM_main.md')
    const stepFile = batchFiles.find((file) => file.sourceName === 'GTM_step1.md')
    const emptyJudgmentGroups = composed.previewNodes.filter((node) => {
      if (node.structureRole !== 'judgment_basis_group' && node.structureRole !== 'potential_action_group') {
        return false
      }
      const hasChildren = composed.previewNodes.some((child) => child.parentId === node.id)
      return !hasChildren && !(node.note?.trim())
    })
    const conflictNode = composed.previewNodes.find(
      (node) => node.title === '是否存在重复高频抱怨',
    )

    expect(rootNodes).toHaveLength(1)
    expect(emptyJudgmentGroups).toHaveLength(0)
    expect(rootNodes[0]?.title).not.toBe('GTM_step1')
    expect(composed.previewNodes.some((node) => node.title === '收集最近30天工单标签频率')).toBe(true)
    expect(composed.previewNodes.some((node) => node.title === '按行业拆分痛点热度表')).toBe(true)
    expect(conflictNode?.note ?? '').toContain('[Source-backed conflict:GTM_step1.md]')
    expect(mainFile).toMatchObject({
      sourceRole: 'canonical_knowledge',
      mergeMode: 'create_new',
    })
    expect(stepFile).toMatchObject({
      sourceRole: 'context_record',
      mergeMode: 'merge_into_existing',
    })
    expect(stepFile?.canonicalTopicId).toBe(mainFile?.canonicalTopicId)
    expect(stepFile?.sameAsTopicId).toBe(mainFile?.canonicalTopicId)
  })
})
