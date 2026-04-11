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
import GTM_STEP1_FIXTURE from '../../../docs/test_docs/GTM_step1.md?raw'
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
    expect(built.response.views.map((view) => view.type)).toEqual([
      'thinking_view',
      'execution_view',
      'archive_view',
    ])
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
    const batchFiles = built.response.batch?.files ?? []
    const mainFile = batchFiles.find((file) => file.sourceName === 'GTM_main.md')
    const stepOneFile = batchFiles.find((file) => file.sourceName === 'GTM_step1.md')
    const stepOneOneFile = batchFiles.find((file) => file.sourceName === 'GTM_step1-1.md')

    expect(previewRoots).toHaveLength(1)
    expect(mainFile).toMatchObject({
      sourceRole: 'canonical_knowledge',
      mergeMode: 'create_new',
    })
    expect(stepOneFile).toMatchObject({
      sourceRole: 'context_record',
      mergeMode: 'merge_into_existing',
    })
    expect(stepOneOneFile).toMatchObject({
      sourceRole: 'context_record',
      mergeMode: 'merge_into_existing',
    })
    expect(stepOneFile?.canonicalTopicId).toBe(mainFile?.canonicalTopicId)
    expect(stepOneOneFile?.canonicalTopicId).toBe(mainFile?.canonicalTopicId)
    expect(built.response.views.map((view) => view.type)).toEqual([
      'thinking_view',
      'execution_view',
      'archive_view',
    ])
    expect(built.response.crossFileMergeSuggestions).toEqual([])
  })

  it('keeps a single canonical root for GTM main+step1 and preserves dual-source metadata', () => {
    const document = createMindMapDocument('Import doc')
    const files = sortTextImportBatchSources([
      {
        sourceName: 'GTM_main.md',
        sourceType: 'file' as const,
        rawText: GTM_MAIN_FIXTURE,
        preprocessedHints: preprocessTextToImportHints(GTM_MAIN_FIXTURE),
        semanticHints: [],
        intent: 'distill_structure' as const,
      },
      {
        sourceName: 'GTM_step1.md',
        sourceType: 'file' as const,
        rawText: GTM_STEP1_FIXTURE,
        preprocessedHints: preprocessTextToImportHints(GTM_STEP1_FIXTURE),
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
      batchTitle: 'Import batch: GTM',
      files,
    })

    const roots = built.response.previewNodes.filter((node) => node.parentId === null)
    const batchFiles = built.response.batch?.files ?? []
    const mainFile = batchFiles.find((file) => file.sourceName === 'GTM_main.md')
    const stepFile = batchFiles.find((file) => file.sourceName === 'GTM_step1.md')

    expect(roots).toHaveLength(1)
    expect(mainFile).toMatchObject({
      sourceRole: 'canonical_knowledge',
      mergeMode: 'create_new',
    })
    expect(stepFile).toMatchObject({
      sourceRole: 'context_record',
    })
    expect(stepFile?.mergeMode === 'merge_into_existing' || stepFile?.mergeMode === 'archive_only').toBe(true)
    expect(stepFile?.canonicalTopicId).toBe(mainFile?.canonicalTopicId)
    expect(stepFile?.sameAsTopicId).toBe(mainFile?.canonicalTopicId)
    const emptyJudgmentGroups = built.response.previewNodes.filter((node) => {
      if (
        node.structureRole !== 'core_judgment_group' &&
        node.structureRole !== 'judgment_basis_group' &&
        node.structureRole !== 'potential_action_group'
      ) {
        return false
      }
      const hasChildren = built.response.previewNodes.some((child) => child.parentId === node.id)
      return !hasChildren
    })
    expect(emptyJudgmentGroups).toHaveLength(0)
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
    const duplicateTitleCounts = built.response.previewNodes.reduce<Record<string, number>>((counts, node) => {
      counts[node.title] = (counts[node.title] ?? 0) + 1
      return counts
    }, {})

    expect(root?.title).toBe('证据问题：我们手上有什么渠道')
    expect(root?.title).not.toBe('Import: GTM_main')
    expect(['analysis', 'process', 'plan', 'notes']).toContain(built.response.classification.archetype)
    expect(built.response.diagnostics?.densityStats.sourceAnchorCount).toBeGreaterThan(0)
    expect(built.response.diagnostics?.densityStats.evidenceNodeCount).toBeLessThan(
      built.response.previewNodes.length / 2,
    )
    expect(duplicateTitleCounts['证据'] ?? 0).toBeLessThanOrEqual(1)
    expect(built.response.semanticNodes.some((node) => node.id.startsWith('semantic_gtm_'))).toBe(false)
    expect(
      built.response.previewNodes.some(
        (node) =>
          node.title === '\u7b2c\u4e00\u6ce2\u5e94\u8be5\u5148\u6253\u8c01' &&
          node.parentId === null,
      ),
    ).toBe(false)
    expect(built.response.previewNodes[0]?.sourceAnchors?.length ?? 0).toBeGreaterThanOrEqual(0)
    expect(built.response.sources[0]?.metadata).toMatchObject({
      headingCount: expect.any(Number),
      headings: expect.any(Array),
      segments: expect.any(Array),
    })
  })

  it('keeps conversation-export wrapper headings out of the local thinking spine', () => {
    const document = createMindMapDocument('Import doc')
    const rawText = [
      '# Markdown 记录',
      '',
      '## Turn 1 · User',
      'Should we target agencies or SMB first?',
      '',
      '## Turn 1 · Assistant',
      '### 结论',
      'SMB should be the first segment.',
      '',
      '### 拆解',
      '#### 痛点强度',
      'SMB teams report repeated urgency.',
      '#### 触达效率',
      'Founder-led sales can reach SMB accounts quickly.',
      '#### 下一步',
      '- Create a target-account list for 20 SMB design partners.',
    ].join('\n')

    const built = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'conversation_export.md',
      sourceType: 'file',
      intent: 'distill_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    })

    expect(built.response.views.map((view) => view.type)).toEqual([
      'thinking_view',
      'execution_view',
      'archive_view',
    ])
    expect(built.response.previewNodes[0]?.title).not.toBe('Markdown 记录')
    expect(built.response.previewNodes[0]?.title).not.toBe('Turn 1 · User')
    expect(built.response.previewNodes[0]?.title).not.toBe('Turn 1 · Assistant')
    expect(
      built.response.previewNodes.some(
        (node) => node.title === 'Markdown 记录' || node.title === 'Turn 1 · User',
      ),
    ).toBe(false)
    const archiveView = built.response.bundle?.views.find((view) => view.type === 'archive_view')
    const archiveNodes =
      archiveView ? built.response.bundle?.viewProjections[archiveView.id]?.previewNodes ?? [] : []
    expect(archiveNodes.some((node) => node.title === 'Markdown 记录')).toBe(true)
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

    expect(built.response.classification.archetype).toBe('process')
    expect(built.response.templateSummary.visibleSlots).toEqual([])
    expect(
      built.response.previewNodes.some((node) => (node.note ?? '').includes('environment setup')),
    ).toBe(true)
    expect(
      built.response.previewNodes.some((node) =>
        node.title.includes('Goal: get every new hire through environment setup in the first week.'),
      ),
    ).toBe(false)
  })

  it('uses document-structure semantics across SOP, research, plan, and meeting notes', () => {
    const cases = [
      {
        sourceName: 'support_sop.md',
        expectedType: 'process',
        rawText: [
          '# Refund SOP',
          '## Intake',
          'Confirm the order id and issue category.',
          '## Decision rules',
          '- Metric: refund amount under $100 can be approved immediately.',
          '## Execution',
          '- Output a refund decision record after comparing policy and customer evidence.',
        ].join('\n'),
      },
      {
        sourceName: 'pricing_research.md',
        expectedType: 'analysis',
        rawText: [
          '# Pricing research',
          '## Claim',
          'The free tier is causing support load to rise.',
          '## Evidence',
          'Support tickets increased 35% in March.',
          '## Risk',
          'Risk: paid conversion may drop if limits are too aggressive.',
        ].join('\n'),
      },
      {
        sourceName: 'q2_roadmap_plan.md',
        expectedType: 'plan',
        rawText: [
          '# Q2 roadmap plan',
          '## Goal',
          'Ship the beta to the design partner cohort.',
          '## Milestones',
          '- Validate onboarding and output a launch readiness report.',
          '## Metric',
          'KPI: activation rate above 40%.',
        ].join('\n'),
      },
      {
        sourceName: 'design_meeting_notes.md',
        expectedType: 'notes',
        rawText: [
          '# Design meeting notes',
          '## Decisions',
          'Decision: adopt option A for the editor toolbar.',
          '## Open questions',
          'Question: can we ship without bulk edit?',
          '## Actions',
          '- Create a comparison table for option A and option B.',
        ].join('\n'),
      },
    ]

    cases.forEach((entry) => {
      const document = createMindMapDocument('Import doc')
      const built = createLocalTextImportPreview({
        documentId: document.id,
        documentTitle: document.title,
        baseDocumentUpdatedAt: document.updatedAt,
        context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
        anchorTopicId: document.rootTopicId,
        sourceName: entry.sourceName,
        sourceType: 'file',
        intent: 'distill_structure',
        rawText: entry.rawText,
        preprocessedHints: preprocessTextToImportHints(entry.rawText),
        semanticHints: [],
      })
      const legacyTypes = new Set(['topic', 'criterion', 'insight', 'goal', 'project', 'review'])
      const genericTitles = new Set(['证据', '数据', '分论点'])
      const previewById = new Map(built.response.previewNodes.map((node) => [node.id, node]))

      expect(built.response.classification.archetype).toBe(entry.expectedType)
      expect(built.response.previewNodes.some((node) => legacyTypes.has(node.semanticType ?? ''))).toBe(false)
      expect(built.response.previewNodes.some((node) => genericTitles.has(node.title))).toBe(false)
      built.response.previewNodes
        .filter((node) => node.parentId !== null && node.semanticType !== 'section')
        .forEach((node) => expect(node.sourceAnchors?.length ?? 0).toBeGreaterThan(0))
      built.response.previewNodes
        .filter((node) => node.semanticType === 'evidence' || node.semanticType === 'metric')
        .forEach((node) => {
          const parent = previewById.get(node.parentId ?? '')
          expect(parent?.semanticType === 'section' || parent?.semanticType === 'claim').toBe(true)
        })
    })
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
    expect(built.response.bundle?.views.map((view) => view.type)).toEqual([
      'thinking_view',
      'execution_view',
      'archive_view',
    ])
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
