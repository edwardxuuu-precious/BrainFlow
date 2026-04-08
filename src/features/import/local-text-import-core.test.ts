import { describe, expect, it } from 'vitest'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
  sortTextImportBatchSources,
} from './local-text-import-core'
import { preprocessTextToImportHints } from './text-import-preprocess'
import GTM_MAIN_FIXTURE from './__fixtures__/GTM_main.md?raw'

describe('local-text-import-core', () => {
  it('builds a single thinking bundle for generic markdown while preserving source traceability', () => {
    const document = createMindMapDocument('Import doc')
    const rawText = '# Goals\n\nLaunch plan\n\n- Owner alignment\n- Weekly checkpoint\n'

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'launch_notes.md',
      sourceType: 'file',
      intent: 'preserve_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    })

    expect(built.response.bundle).not.toBeNull()
    expect(built.response.sources).toHaveLength(1)
    expect(built.response.sources[0]?.raw_content).toContain('Owner alignment')
    expect(built.response.sources[0]?.metadata).toMatchObject({
      sourceName: 'launch_notes.md',
      headingCount: 1,
    })
    expect(built.response.views.map((view) => view.type)).toEqual(['thinking_view'])
    expect(built.response.activeViewId).toBe(built.response.defaultViewId)
    expect(built.response.previewNodes.length).toBeGreaterThan(0)
  })

  it('anchors the generated projection under the requested topic', () => {
    const document = createMindMapDocument('Import doc')
    const anchorTopicId = document.topics[document.rootTopicId].childIds[0]
    const rawText = '# Goals\n\n- Launch plan\n'

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId,
      sourceName: 'launch_notes.md',
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

  it('sorts GTM files hierarchically and keeps batch previews in the bundle model', () => {
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

    expect(built.response.bundle).not.toBeNull()
    expect(built.response.sources).toHaveLength(3)
    expect(built.response.batch).toEqual(
      expect.objectContaining({
        jobType: 'batch',
        fileCount: 3,
        batchContainerTitle: 'Import batch: GTM',
      }),
    )
    expect(built.response.views.map((view) => view.type)).toEqual(['thinking_view'])
    expect(built.response.crossFileMergeSuggestions).toEqual([])
  })

  it('rebuilds the GTM import into one center question and a combined execution branch', () => {
    const document = createMindMapDocument('Import doc')

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'GTM_main.md',
      sourceType: 'file',
      intent: 'distill_structure',
      rawText: GTM_MAIN_FIXTURE,
      preprocessedHints: preprocessTextToImportHints(GTM_MAIN_FIXTURE),
      semanticHints: [],
    })

    const root = built.response.previewNodes.find((node) => node.parentId === null)
    const levelOne = built.response.previewNodes.filter((node) => node.parentId === root?.id)
    const disallowed = new Set(['说明', '对话记录', '用户', '助手', '备注', '结论', '拆解', '建议下一步'])

    expect(root?.title).toBe('第一波应该先打谁')
    expect(levelOne.map((node) => node.title)).toEqual([
      '谁最痛',
      '谁最容易现在买',
      '谁最容易触达',
      '谁最容易形成案例扩散',
      '确定第一波 beachhead segment',
    ])
    expect(
      built.response.previewNodes.some((node) => disallowed.has(node.title)),
    ).toBe(false)
    expect(built.response.previewNodes).toHaveLength(15)
    expect(built.response.previewNodes[0]?.sourceAnchors?.length ?? 0).toBeGreaterThanOrEqual(0)
    expect(built.response.sources[0]?.metadata).toMatchObject({
      headingCount: expect.any(Number),
      headings: expect.any(Array),
      segments: expect.any(Array),
    })

    const decisionBranch = levelOne.find((branch) => branch.title === '确定第一波 beachhead segment')
    const decisionChildren = built.response.previewNodes.filter((node) => node.parentId === decisionBranch?.id)
    expect(decisionChildren.map((node) => node.title)).toEqual([
      'Beachhead Segment 筛选',
      '决策',
      '收敛第一波目标市场',
    ])
    const branchWithDetails = levelOne.find((branch) => branch.title === '谁最痛')
    const detailChildren = built.response.previewNodes.filter((node) => node.parentId === branchWithDetails?.id)
    expect(detailChildren.map((node) => node.title)).toEqual(['判断标准', '证据问题', '常见误判'])
    return

    levelOne
      .filter((branch) => branch.title !== '确定第一波 beachhead segment')
      .forEach((branch) => {
        const children = built.response.previewNodes.filter((node) => node.parentId === branch.id)
        expect(children.map((node) => node.title)).toEqual(['判断标准', '证据问题', '常见误判'])
      })
  })

  it('classifies method-like text and keeps slot-aware thinking nodes', () => {
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
    expect(
      built.response.previewNodes.some((node) => (node.note ?? '').includes('环境配置')),
    ).toBe(true)
    expect(
      built.response.previewNodes.some((node) => node.title.includes('目标：让新成员在第一周完成环境配置。')),
    ).toBe(false)
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
    expect(built.response.bundle?.views.map((view) => view.type)).toEqual(['thinking_view'])
  })
})
