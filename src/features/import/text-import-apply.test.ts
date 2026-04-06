import { describe, expect, it } from 'vitest'
import { createMindMapDocument } from '../documents/document-factory'
import { renameTopic } from '../editor/tree-operations'
import { applyTextImportPreview } from './text-import-apply'

describe('text-import-apply', () => {
  it('re-bases safe additive import previews onto a newer document version', async () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId
    const newerDocument = renameTopic(document, rootId, 'Updated root title')

    const result = await applyTextImportPreview(
      newerDocument,
      {
        summary: 'Import preview',
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
      },
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
      {
        summary: 'Import preview',
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
      },
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
})
