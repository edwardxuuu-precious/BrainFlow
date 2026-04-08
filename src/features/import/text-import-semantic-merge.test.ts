import { describe, expect, it } from 'vitest'
import type { TextImportResponse } from '../../../shared/ai-contract'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'
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
})
