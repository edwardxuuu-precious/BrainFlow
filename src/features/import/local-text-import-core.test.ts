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
      intent: 'preserve_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    })

    expect(built.response.previewNodes.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Import: GTM_main', 'Goals', 'Launch plan', 'Owner alignment']),
    )
    expect(built.response.mergeSuggestions).toEqual([])
    expect(built.response.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'create_child',
          title: 'Import: GTM_main',
          parent: `topic:${document.rootTopicId}`,
        }),
        expect.objectContaining({
          type: 'create_child',
          title: 'Goals',
        }),
      ]),
    )
    expect(built.response.operations.every((operation) => operation.type === 'create_child')).toBe(true)
  })

  it('anchors additive create_child operations under the requested topic', () => {
    const document = createMindMapDocument('Import doc')
    const anchorTopicId = document.topics[document.rootTopicId].childIds[0]
    const rawText = '# Goals\n\n- Launch plan\n'

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId,
      sourceName: 'GTM_main.md',
      sourceType: 'file',
      intent: 'preserve_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    })

    expect(built.response.anchorTopicId).toBe(anchorTopicId)
    expect(built.response.operations[0]).toEqual(
      expect.objectContaining({
        type: 'create_child',
        parent: `topic:${anchorTopicId}`,
      }),
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
        semanticHints: [],
        intent: 'preserve_structure' as const,
      },
      {
        sourceName: 'GTM_main.md',
        sourceType: 'file' as const,
        rawText: '# Main',
        preprocessedHints: preprocessTextToImportHints('# Main'),
        semanticHints: [],
        intent: 'preserve_structure' as const,
      },
      {
        sourceName: 'GTM_step1.md',
        sourceType: 'file' as const,
        rawText: '# Step 1',
        preprocessedHints: preprocessTextToImportHints('# Step 1'),
        semanticHints: [],
        intent: 'preserve_structure' as const,
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
    expect(built.response.crossFileMergeSuggestions).toEqual([])
  })

  it('classifies method-like text and builds template-slot-aware distilled nodes', () => {
    const document = createMindMapDocument('Import doc')
    const rawText = [
      '# Onboarding SOP',
      '',
      '目标：让新成员在第一周完成环境配置。',
      '',
      '## 步骤',
      '1. 创建账号并加入项目组',
      '2. 拉取仓库并运行初始化脚本',
      '',
      '## 检验标准',
      '- 本地可以成功启动开发环境',
      '- 可以通过基础健康检查',
    ].join('\n')

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'onboarding_sop.md',
      sourceType: 'file',
      intent: 'distill_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    })

    expect(built.response.classification.archetype).toBe('method')
    expect(built.response.templateSummary.visibleSlots).toContain('steps')
    expect(built.response.previewNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: '步骤', templateSlot: 'steps' }),
      ]),
    )
  })

  it('keeps per-file archetype summaries in batch previews', () => {
    const document = createMindMapDocument('Import doc')
    const files = sortTextImportBatchSources([
      {
        sourceName: 'weekly_report.md',
        sourceType: 'file' as const,
        rawText: '# Weekly Report\n\n关键结果：完成上线。\n\n下一步：跟进复盘。',
        preprocessedHints: preprocessTextToImportHints('# Weekly Report\n\n关键结果：完成上线。\n\n下一步：跟进复盘。'),
        semanticHints: [],
        intent: 'distill_structure' as const,
      },
      {
        sourceName: 'meeting_minutes.md',
        sourceType: 'file' as const,
        rawText: '# Meeting\n\n结论：采用方案 A。\n\n行动项：周三前提交 PR。',
        preprocessedHints: preprocessTextToImportHints('# Meeting\n\n结论：采用方案 A。\n\n行动项：周三前提交 PR。'),
        semanticHints: [],
        intent: 'distill_structure' as const,
      },
    ])

    const built = createLocalTextImportBatchPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      files,
    })

    expect(built.response.batch?.files?.every((file) => file.classification)).toBe(true)
    expect(built.response.classification.archetype).toBe('mixed')
  })
})
