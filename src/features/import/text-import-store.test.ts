import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TextImportResponse } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { resetTextImportStore, useTextImportStore } from './text-import-store'

vi.mock('./text-import-client', () => ({
  streamCodexTextImportPreview: vi.fn(),
}))

import { streamCodexTextImportPreview } from './text-import-client'

describe('text-import-store', () => {
  beforeEach(() => {
    resetTextImportStore()
    vi.clearAllMocks()
  })

  it('stores preview results from the text import stream and builds a preview tree locally', async () => {
    const document = createMindMapDocument('Import doc')
    const preview: TextImportResponse = {
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: document.updatedAt,
      previewNodes: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Launch',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'preview_child',
          parentId: 'preview_root',
          order: 0,
          title: 'Checklist',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
      operations: [
        {
          id: 'import_low',
          type: 'create_child',
          parent: `topic:${document.rootTopicId}`,
          title: 'Launch',
          risk: 'low',
        },
      ],
      conflicts: [],
      warnings: [],
    }

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'analyzing_source',
        message: '正在分析来源',
      })
      onEvent({
        type: 'result',
        data: preview,
      })
    })

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'launch.txt',
        sourceType: 'paste',
        rawText: 'Launch\n\n- Item',
      },
    )

    expect(useTextImportStore.getState().preview).toEqual(preview)
    expect(useTextImportStore.getState().previewTree).toEqual([
      expect.objectContaining({
        id: 'preview_root',
        title: 'Launch',
        children: [expect.objectContaining({ id: 'preview_child', title: 'Checklist' })],
      }),
    ])
    expect(useTextImportStore.getState().runStage).toBe('completed')
    expect(useTextImportStore.getState().isPreviewing).toBe(false)
  })

  it('stores raw import errors from the stream', async () => {
    const document = createMindMapDocument('Import doc')

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'error',
        stage: 'building_preview',
        code: 'request_failed',
        message: 'Codex 导入结构修正失败',
        rawMessage: 'stderr: schema mismatch',
      })
    })

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'launch.txt',
        sourceType: 'paste',
        rawText: 'Launch',
      },
    )

    expect(useTextImportStore.getState().error).toBe('stderr: schema mismatch')
    expect(useTextImportStore.getState().preview).toBeNull()
    expect(useTextImportStore.getState().previewTree).toEqual([])
  })

  it('applies low-risk and approved high-risk operations only', () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId

    useTextImportStore.setState({
      isOpen: true,
      sourceName: 'launch.txt',
      sourceType: 'file',
      rawText: 'Launch',
      draftSourceName: 'launch.txt',
      draftText: 'Launch',
      preprocessedHints: [],
      preview: {
        summary: '导入完成',
        baseDocumentUpdatedAt: document.updatedAt,
        previewNodes: [],
        operations: [
          {
            id: 'import_low',
            type: 'create_child',
            parent: `topic:${rootId}`,
            title: 'Low risk',
            risk: 'low',
          },
          {
            id: 'import_high',
            type: 'create_child',
            parent: `topic:${rootId}`,
            title: 'High risk',
            risk: 'high',
            conflictId: 'conflict_1',
          },
        ],
        conflicts: [
          {
            id: 'conflict_1',
            title: 'Possible merge',
            description: 'Needs confirmation',
            kind: 'merge',
            operationIds: ['import_high'],
            targetTopicIds: [rootId],
          },
        ],
        warnings: [],
      },
      previewTree: [],
      approvedConflictIds: ['conflict_1'],
      runStage: 'completed',
      statusText: '',
      error: null,
      isPreviewing: false,
      isApplying: false,
    })

    const result = useTextImportStore.getState().applyPreview(document)

    expect(result).not.toBeNull()
    expect(Object.values(result!.document.topics).map((topic) => topic.title)).toEqual(
      expect.arrayContaining(['Low risk', 'High risk']),
    )
  })
})
