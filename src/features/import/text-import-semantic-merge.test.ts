import { describe, expect, it } from 'vitest'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
} from './local-text-import-core'
import {
  applyTextImportSemanticAdjudication,
  createTextImportSemanticDraft,
} from './text-import-semantic-merge'
import { preprocessTextToImportHints } from './text-import-preprocess'

describe('text-import-semantic-merge', () => {
  it('turns a high-confidence existing-topic adjudication into a note+title update', () => {
    const document = createMindMapDocument('Import doc')
    const targetId = document.topics[document.rootTopicId].childIds[0]
    document.topics[targetId].title = 'Goals'

    const rawText = '# Goals\n\nImported detail'
    const request = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'GTM_main.md',
      sourceType: 'file' as const,
      intent: 'preserve_structure' as const,
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    }

    const built = createLocalTextImportPreview(request)
    const draft = createTextImportSemanticDraft(request, built.response)
    const bundle = draft.candidateBundles.find((candidate) => candidate.scope === 'existing_topic')
    expect(bundle).toBeDefined()

    const result = applyTextImportSemanticAdjudication(built.response, draft, {
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
    const built = createLocalTextImportBatchPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: GTM',
      files: [
        {
          sourceName: 'GTM_step1.md',
          sourceType: 'file',
          intent: 'preserve_structure' as const,
          rawText: '# Step 1\n\n## Positioning\n\nText A',
          preprocessedHints: preprocessTextToImportHints('# Step 1\n\n## Positioning\n\nText A'),
          semanticHints: [],
        },
        {
          sourceName: 'GTM_step1-1.md',
          sourceType: 'file',
          intent: 'preserve_structure' as const,
          rawText: '# Step 1-1\n\n## Positioning\n\nText B',
          preprocessedHints: preprocessTextToImportHints('# Step 1-1\n\n## Positioning\n\nText B'),
          semanticHints: [],
        },
      ],
    })

    const request = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: GTM',
      files: [
        {
          sourceName: 'GTM_step1.md',
          sourceType: 'file' as const,
          intent: 'preserve_structure' as const,
          rawText: '# Step 1\n\n## Positioning\n\nText A',
          preprocessedHints: preprocessTextToImportHints('# Step 1\n\n## Positioning\n\nText A'),
          semanticHints: [],
        },
        {
          sourceName: 'GTM_step1-1.md',
          sourceType: 'file' as const,
          intent: 'preserve_structure' as const,
          rawText: '# Step 1-1\n\n## Positioning\n\nText B',
          preprocessedHints: preprocessTextToImportHints('# Step 1-1\n\n## Positioning\n\nText B'),
          semanticHints: [],
        },
      ],
    }

    const draft = createTextImportSemanticDraft(request, built.response)
    const crossFileBundle = draft.candidateBundles.find((candidate) => candidate.scope === 'cross_file')
    expect(crossFileBundle).toBeDefined()

    const result = applyTextImportSemanticAdjudication(built.response, draft, {
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
