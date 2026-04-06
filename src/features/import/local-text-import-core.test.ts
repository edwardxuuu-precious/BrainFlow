import { describe, expect, it } from 'vitest'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
  sortTextImportBatchSources,
} from './local-text-import-core'
import { preprocessTextToImportHints } from './text-import-preprocess'

describe('local-text-import-core', () => {
  it('builds a deterministic preview tree for markdown headings and lists', () => {
    const document = createMindMapDocument('Import doc')
    const leftBranchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[leftBranchId].title = 'Goals'

    const rawText = '# Goals\n\nIntro paragraph.\n\n- Launch plan\n- Owner alignment\n'
    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'GTM_main.md',
      sourceType: 'file',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
    })

    expect(built.response.previewNodes.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Import: GTM_main', 'Goals', 'Launch plan', 'Owner alignment']),
    )
    expect(built.response.mergeSuggestions).toEqual([
      expect.objectContaining({
        matchedTopicId: leftBranchId,
        matchedTopicTitle: 'Goals',
      }),
    ])
    expect(built.response.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'create_child',
          title: 'Import: GTM_main',
          parent: `topic:${document.rootTopicId}`,
        }),
        expect.objectContaining({
          type: 'update_topic',
          target: `topic:${leftBranchId}`,
        }),
      ]),
    )
  })

  it('sorts GTM files hierarchically and creates a batch import container', () => {
    const document = createMindMapDocument('Import doc')
    const files = sortTextImportBatchSources([
      {
        sourceName: 'GTM_step1-1.md',
        sourceType: 'file' as const,
        rawText: '# Step 1-1',
        preprocessedHints: preprocessTextToImportHints('# Step 1-1'),
      },
      {
        sourceName: 'GTM_main.md',
        sourceType: 'file' as const,
        rawText: '# Main',
        preprocessedHints: preprocessTextToImportHints('# Main'),
      },
      {
        sourceName: 'GTM_step1.md',
        sourceType: 'file' as const,
        rawText: '# Step 1',
        preprocessedHints: preprocessTextToImportHints('# Step 1'),
      },
    ])

    expect(files.map((file) => file.sourceName)).toEqual([
      'GTM_main.md',
      'GTM_step1.md',
      'GTM_step1-1.md',
    ])

    const built = createLocalTextImportBatchPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: GTM',
      files,
    })

    expect(built.response.batch).toEqual(
      expect.objectContaining({
        jobType: 'batch',
        fileCount: 3,
        batchContainerTitle: 'Import batch: GTM',
      }),
    )
    expect(built.response.previewNodes[0]).toEqual(
      expect.objectContaining({
        title: 'Import batch: GTM',
      }),
    )
    expect(built.response.crossFileMergeSuggestions).toBeDefined()
  })
})
