import { describe, expect, it } from 'vitest'
import type { TextImportResponse } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { renameTopic } from '../editor/tree-operations'
import { applyTextImportPreview } from './text-import-apply'

function createPreviewResponse(
  overrides: Partial<TextImportResponse>,
): TextImportResponse {
  const {
    bundle = null,
    sources = [],
    semanticNodes = [],
    semanticEdges = [],
    views = [],
    viewProjections = {},
    defaultViewId = null,
    activeViewId = null,
    ...rest
  } = overrides

  return {
    summary: 'Import preview',
    baseDocumentUpdatedAt: 0,
    anchorTopicId: null,
    classification: {
      archetype: 'mixed',
      confidence: 0.5,
      rationale: 'Test fixture.',
      secondaryArchetype: null,
    },
    templateSummary: {
      archetype: 'mixed',
      visibleSlots: ['themes'],
      foldedSlots: ['summary'],
    },
    bundle,
    sources,
    semanticNodes,
    semanticEdges,
    views,
    viewProjections,
    defaultViewId,
    activeViewId,
    nodePlans: [],
    previewNodes: [],
    operations: [],
    conflicts: [],
    mergeSuggestions: [],
    warnings: [],
    ...rest,
  }
}

describe('text-import-apply', () => {
  it('re-bases safe additive import previews onto a newer document version', async () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId
    const newerDocument = renameTopic(document, rootId, 'Updated root title')

    const result = await applyTextImportPreview(
      newerDocument,
      createPreviewResponse({
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Import: GTM_main',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
        operations: [
          {
            id: 'op_root',
            type: 'create_child',
            parent: `topic:${rootId}`,
            title: 'Import: GTM_main',
            risk: 'low',
            resultRef: 'preview_root',
          },
        ],
        conflicts: [],
        mergeSuggestions: [],
        warnings: [],
      }),
      [],
    )

    expect(Object.values(result.document.topics).map((topic) => topic.title)).toEqual(
      expect.arrayContaining(['Import: GTM_main', 'Updated root title']),
    )
  })

  it('skips semantic update_topic merges when the target changed after preview generation', async () => {
    const document = createMindMapDocument('Import doc')
    const targetId = document.topics[document.rootTopicId].childIds[0]
    const targetBefore = document.topics[targetId]
    const changedDocument = renameTopic(document, targetId, 'Goals v2')

    const result = await applyTextImportPreview(
      changedDocument,
      createPreviewResponse({
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Import: GTM_main',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
        operations: [
          {
            id: 'op_root',
            type: 'create_child',
            parent: `topic:${document.rootTopicId}`,
            title: 'Import: GTM_main',
            risk: 'low',
            resultRef: 'preview_root',
          },
          {
            id: 'merge_update',
            type: 'update_topic',
            target: `topic:${targetId}`,
            note: 'Merged import summary',
            risk: 'low',
            targetFingerprint: JSON.stringify({
              title: targetBefore.title,
              note: targetBefore.note,
              parentId: targetBefore.parentId,
              metadata: targetBefore.metadata,
              style: targetBefore.style,
            }),
          },
        ],
        conflicts: [],
        mergeSuggestions: [],
        warnings: [],
      }),
      [],
    )

    expect(result.document.topics[targetId].title).toBe('Goals v2')
    expect(result.document.topics[targetId].note).not.toContain('Merged import summary')
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Skipped semantic merge'),
      ]),
    )
  })

  it('keeps update_topic operations that target newly created refs without a fingerprint', async () => {
    const document = createMindMapDocument('Import doc')

    const result = await applyTextImportPreview(
      document,
      createPreviewResponse({
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Imported branch',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
        operations: [
          {
            id: 'op_root',
            type: 'create_child',
            parent: `topic:${document.rootTopicId}`,
            title: 'Imported branch',
            risk: 'low',
            resultRef: 'preview_root',
          },
          {
            id: 'op_root_update',
            type: 'update_topic',
            target: 'ref:preview_root',
            note: 'Imported note body',
            risk: 'low',
          },
        ],
        conflicts: [],
        mergeSuggestions: [],
        warnings: [],
      }),
      [],
    )

    const importedTopic = Object.values(result.document.topics).find(
      (topic) => topic.title === 'Imported branch',
    )

    expect(importedTopic).toBeDefined()
    expect(importedTopic?.note).toContain('Imported note body')
  })

  it('does not restore import metadata, style, or presentation hints on created topics', async () => {
    const document = createMindMapDocument('Import doc')

    const result = await applyTextImportPreview(
      document,
      createPreviewResponse({
        anchorTopicId: document.rootTopicId,
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Imported action',
            note: 'Call supplier and confirm lead time',
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'action',
            confidence: 'high',
            templateSlot: 'actions',
          },
        ],
        operations: [
          {
            id: 'op_root',
            type: 'create_child',
            parent: `topic:${document.rootTopicId}`,
            title: 'Imported action',
            note: 'Call supplier and confirm lead time',
            risk: 'low',
            resultRef: 'preview_root',
            metadata: {
              labels: ['action'],
              type: 'task',
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
        ],
      }),
      [],
    )

    const importedTopic = Object.values(result.document.topics).find(
      (topic) => topic.title === 'Imported action',
    )

    expect(importedTopic).toBeDefined()
    expect(importedTopic).toMatchObject({
      note: 'Call supplier and confirm lead time',
      isCollapsed: false,
      metadata: {
        labels: [],
        markers: [],
        stickers: [],
      },
      style: {
        emphasis: 'normal',
        variant: 'default',
      },
      layout: {
        semanticGroupKey: null,
        priority: null,
      },
    })
    expect(importedTopic?.metadata.type).toBeUndefined()
  })

  it('applies rebuilt import branches under the stored anchor topic', async () => {
    const document = createMindMapDocument('Import doc')
    const anchorTopicId = document.topics[document.rootTopicId].childIds[0]

    const result = await applyTextImportPreview(
      document,
      createPreviewResponse({
        anchorTopicId,
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Import: anchored',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )

    const importedTopic = Object.values(result.document.topics).find(
      (topic) => topic.title === 'Import: anchored',
    )

    expect(importedTopic?.parentId).toBe(anchorTopicId)
  })

  it('falls back to the document root when the stored anchor no longer exists', async () => {
    const document = createMindMapDocument('Import doc')

    const result = await applyTextImportPreview(
      document,
      createPreviewResponse({
        anchorTopicId: 'missing_anchor',
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root',
            parentId: null,
            order: 0,
            title: 'Import: fallback',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )

    const importedTopic = Object.values(result.document.topics).find(
      (topic) => topic.title === 'Import: fallback',
    )

    expect(importedTopic?.parentId).toBe(document.rootTopicId)
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('original import anchor is missing'),
      ]),
    )
  })

  it('keeps sequential single-file imports as sibling roots when both previews target the document root', async () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId

    const firstResult = await applyTextImportPreview(
      document,
      createPreviewResponse({
        anchorTopicId: rootId,
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root_main',
            parentId: null,
            order: 0,
            title: 'Import: GTM_main',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )
    const firstImportedTopic = Object.values(firstResult.document.topics).find(
      (topic) => topic.title === 'Import: GTM_main',
    )

    expect(firstImportedTopic?.parentId).toBe(rootId)

    const secondResult = await applyTextImportPreview(
      firstResult.document,
      createPreviewResponse({
        anchorTopicId: rootId,
        baseDocumentUpdatedAt: firstResult.document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root_step1',
            parentId: null,
            order: 0,
            title: 'Import: GTM_step1',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )
    const importedTopics = Object.values(secondResult.document.topics).filter((topic) =>
      topic.title.startsWith('Import: GTM_'),
    )
    const secondImportedTopic = importedTopics.find((topic) => topic.title === 'Import: GTM_step1')

    expect(importedTopics).toHaveLength(2)
    expect(secondImportedTopic?.parentId).toBe(rootId)
    expect(firstImportedTopic?.id).not.toBe(secondImportedTopic?.id)
    expect(secondResult.document.topics[rootId].childIds).toEqual(
      expect.arrayContaining([firstImportedTopic!.id, secondImportedTopic!.id]),
    )
  })

  it('nests the second sequential single-file import under the current selection when the preview anchor is explicit', async () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId

    const firstResult = await applyTextImportPreview(
      document,
      createPreviewResponse({
        anchorTopicId: rootId,
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root_main_nested',
            parentId: null,
            order: 0,
            title: 'Import: GTM_main',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )
    const firstImportedTopic = Object.values(firstResult.document.topics).find(
      (topic) => topic.title === 'Import: GTM_main',
    )

    expect(firstImportedTopic?.parentId).toBe(rootId)

    const secondResult = await applyTextImportPreview(
      firstResult.document,
      createPreviewResponse({
        anchorTopicId: firstImportedTopic?.id ?? null,
        baseDocumentUpdatedAt: firstResult.document.updatedAt,
        previewNodes: [
          {
            id: 'preview_root_step1_nested',
            parentId: null,
            order: 0,
            title: 'Import: GTM_step1',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
          },
        ],
      }),
      [],
    )
    const secondImportedTopic = Object.values(secondResult.document.topics).find(
      (topic) => topic.title === 'Import: GTM_step1',
    )

    expect(secondImportedTopic?.parentId).toBe(firstImportedTopic?.id)
  })
})
