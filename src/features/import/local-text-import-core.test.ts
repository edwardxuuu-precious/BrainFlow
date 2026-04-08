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
import { resolveTextImportPlanningOptions } from '../../../shared/text-import-semantics'

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

    const previewRoots = built.response.previewNodes.filter((node) => node.parentId === null)
    const mainFileRoot = built.response.previewNodes.find((node) => node.title === 'GTM_main')
    const stepOneFileRoot = built.response.previewNodes.find((node) => node.title === 'GTM_step1')
    const stepOneOneFileRoot = built.response.previewNodes.find((node) => node.title === 'GTM_step1-1')

    expect(previewRoots.map((node) => node.title)).toEqual(['GTM_main'])
    expect(mainFileRoot?.parentId).toBeNull()
    expect(stepOneFileRoot?.parentId).toBe(mainFileRoot?.id)
    expect(stepOneOneFileRoot?.parentId).toBe(stepOneFileRoot?.id)
    expect(built.response.views.map((view) => view.type)).toEqual(['thinking_view'])
    expect(built.response.crossFileMergeSuggestions).toEqual([])
  })

  it('keeps GTM imports on the generic planner path instead of the removed fixed template', () => {
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

    expect(root?.title).toBe('Import: GTM_main')
    expect(built.response.semanticNodes.some((node) => node.id.startsWith('semantic_gtm_'))).toBe(false)
    expect(
      built.response.previewNodes.some(
        (node) => node.title === '\u7b2c\u4e00\u6ce2\u5e94\u8be5\u5148\u6253\u8c01',
      ),
    ).toBe(false)
    expect(built.response.previewNodes[0]?.sourceAnchors?.length ?? 0).toBeGreaterThanOrEqual(0)
    expect(built.response.sources[0]?.metadata).toMatchObject({
      headingCount: expect.any(Number),
      headings: expect.any(Array),
      segments: expect.any(Array),
    })
  })

  it('classifies method-like text and keeps slot-aware thinking nodes', () => {
    const document = createMindMapDocument('Import doc')
    const rawText = [
      '# Onboarding SOP',
      '',
      'Goal: get every new hire through environment setup in the first week.',
      '',
      '## Steps',
      '1. Create the account and join the project.',
      '2. Clone the repository and run the bootstrap script.',
      '',
      '## Checks',
      '- Local development boots successfully.',
      '- Baseline health checks pass.',
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
      built.response.previewNodes.some((node) => (node.note ?? '').includes('environment setup')),
    ).toBe(true)
    expect(
      built.response.previewNodes.some((node) =>
        node.title.includes('Goal: get every new hire through environment setup in the first week.'),
      ),
    ).toBe(false)
  })

  it('keeps per-file archetype summaries in batch previews', () => {
    const document = createMindMapDocument('Import doc')
    const files = sortTextImportBatchSources([
      {
        sourceName: 'weekly_report.md',
        sourceType: 'file' as const,
        rawText: '# Weekly Report\n\nKey result: launched the beta.\n\nNext step: review analytics.',
        preprocessedHints: preprocessTextToImportHints(
          '# Weekly Report\n\nKey result: launched the beta.\n\nNext step: review analytics.',
        ),
        semanticHints: [],
        intent: 'distill_structure' as const,
      },
      {
        sourceName: 'meeting_minutes.md',
        sourceType: 'file' as const,
        rawText: '# Meeting\n\nDecision: adopt option A.\n\nAction item: open a PR by Wednesday.',
        preprocessedHints: preprocessTextToImportHints(
          '# Meeting\n\nDecision: adopt option A.\n\nAction item: open a PR by Wednesday.',
        ),
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

  it('captures diagnostics and artifact reuse when prepared artifacts are reused', () => {
    const document = createMindMapDocument('Import doc')
    const rawText = '# Launch runbook\n\n## Steps\n1. Warm the audience\n2. Ship the sequence'
    const preprocessedHints = preprocessTextToImportHints(rawText)
    const planning = resolveTextImportPlanningOptions({
      sourceName: 'launch_runbook.md',
      sourceType: 'file',
      preprocessedHints,
    })

    createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'launch_runbook.md',
      sourceType: 'file',
      intent: planning.intent,
      archetype: planning.resolvedArchetype,
      archetypeMode: 'auto',
      contentProfile: planning.contentProfile,
      nodeBudget: planning.nodeBudget,
      rawText,
      preprocessedHints,
      semanticHints: planning.semanticHints,
    }, {
      preparedArtifacts: planning.preparedArtifacts,
    })

    const reusedPlanning = resolveTextImportPlanningOptions({
      sourceName: 'launch_runbook.md',
      sourceType: 'file',
      preprocessedHints,
    })

    const reused = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'launch_runbook.md',
      sourceType: 'file',
      intent: reusedPlanning.intent,
      archetype: reusedPlanning.resolvedArchetype,
      archetypeMode: 'auto',
      contentProfile: reusedPlanning.contentProfile,
      nodeBudget: reusedPlanning.nodeBudget,
      rawText,
      preprocessedHints,
      semanticHints: reusedPlanning.semanticHints,
    }, {
      preparedArtifacts: reusedPlanning.preparedArtifacts,
    })

    expect(reused.response.diagnostics?.artifactReuse.contentKey).toBeTruthy()
    expect(reused.response.diagnostics?.artifactReuse.reusedSemanticHints).toBe(true)
    expect(reused.response.diagnostics?.artifactReuse.reusedPlannedStructure).toBe(true)
    expect(reused.response.diagnostics?.densityStats.previewNodeCount).toBeGreaterThan(0)
  })
})
