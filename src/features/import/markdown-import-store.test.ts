import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownImportResponse } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { resetMarkdownImportStore, useMarkdownImportStore } from './markdown-import-store'

vi.mock('./markdown-import-client', () => ({
  streamCodexMarkdownImportPreview: vi.fn(),
}))

import { streamCodexMarkdownImportPreview } from './markdown-import-client'

describe('markdown-import-store', () => {
  beforeEach(() => {
    resetMarkdownImportStore()
    vi.clearAllMocks()
  })

  it('stores preview results from the markdown import stream', async () => {
    const document = createMindMapDocument('Import doc')
    const preview: MarkdownImportResponse = {
      summary: '已生成导入预览',
      baseDocumentUpdatedAt: document.updatedAt,
      previewTree: [
        {
          id: 'preview_root',
          title: 'Launch',
          relation: 'new',
          matchedTopicId: null,
          children: [],
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

    vi.mocked(streamCodexMarkdownImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'analyzing_import',
        message: '正在分析',
      })
      onEvent({
        type: 'result',
        data: preview,
      })
    })

    await useMarkdownImportStore.getState().previewFile(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      new File(['# Launch\n\n- Item'], 'launch.md', { type: 'text/markdown' }),
    )

    expect(useMarkdownImportStore.getState().preview).toEqual(preview)
    expect(useMarkdownImportStore.getState().runStage).toBe('completed')
    expect(useMarkdownImportStore.getState().isPreviewing).toBe(false)
  })

  it('applies only low-risk and approved high-risk operations', () => {
    const document = createMindMapDocument('Import doc')
    const rootId = document.rootTopicId

    useMarkdownImportStore.setState({
      isOpen: true,
      sourceFileName: 'launch.md',
      sourceMarkdown: '# Launch',
      preprocessedTree: [],
      preview: {
        summary: '导入完成',
        baseDocumentUpdatedAt: document.updatedAt,
        previewTree: [],
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
      approvedConflictIds: ['conflict_1'],
      runStage: 'completed',
      statusText: '',
      error: null,
      isPreviewing: false,
      isApplying: false,
    })

    const result = useMarkdownImportStore.getState().applyPreview(document)

    expect(result).not.toBeNull()
    expect(Object.values(result!.document.topics).map((topic) => topic.title)).toEqual(
      expect.arrayContaining(['Low risk', 'High risk']),
    )
  })
})
