import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  TextImportProgressEntry,
  TextImportResponse,
  TextImportTraceEntry,
} from '../../../../shared/ai-contract'
import type { TextImportSourcePlanningSummary } from '../../../../shared/text-import-semantics'
import { TextImportDialog } from './TextImportDialog'

const draftTree = [
  {
    id: 'preview_root',
    parentId: null,
    order: 0,
    title: 'Launch rollout',
    note: 'Confirm the launch structure before merge review begins.',
    relation: 'new' as const,
    matchedTopicId: null,
    reason: 'Generated from the source order.',
    semanticRole: 'section' as const,
    confidence: 'high' as const,
    sourceAnchors: [{ lineStart: 1, lineEnd: 4 }],
    children: [
      {
        id: 'preview_claim',
        parentId: 'preview_root',
        order: 0,
        title: 'Channel priority',
        note: 'Email and partner channels should be sequenced first.',
        relation: 'merge' as const,
        matchedTopicId: 'topic_existing',
        reason: 'High overlap with an existing branch.',
        semanticRole: 'claim' as const,
        confidence: 'medium' as const,
        sourceAnchors: [{ lineStart: 5, lineEnd: 8 }],
        children: [],
      },
    ],
  },
]

function createPreview(overrides: Partial<TextImportResponse> = {}): TextImportResponse {
  return {
    summary: 'Preview ready. Review the generated logic map before merge.',
    baseDocumentUpdatedAt: 1,
    anchorTopicId: 'root',
    classification: {
      archetype: 'process',
      confidence: 0.42,
      rationale: 'Ordered procedural signals dominate the source.',
      secondaryArchetype: 'analysis',
    },
    templateSummary: {
      archetype: 'process',
      visibleSlots: [],
      foldedSlots: [],
    },
    bundle: null,
    sources: [],
    semanticNodes: [],
    semanticEdges: [],
    views: [],
    viewProjections: {},
    defaultViewId: null,
    activeViewId: null,
    nodePlans: [],
    previewNodes: [],
    operations: [
      {
        id: 'op_1',
        type: 'create_child',
        parent: 'topic:root',
        title: 'Launch rollout',
        risk: 'low',
        resultRef: 'preview_root',
      },
      {
        id: 'op_2',
        type: 'update_topic',
        target: 'topic:existing',
        title: 'Channel priority',
        risk: 'high',
        conflictId: 'conflict_1',
      },
    ],
    conflicts: [
      {
        id: 'conflict_1',
        title: 'Approve rename',
        description: 'Renaming the existing branch requires approval.',
        kind: 'rename',
        operationIds: ['op_2'],
        targetTopicIds: ['topic:existing'],
      },
    ],
    mergeSuggestions: [
      {
        id: 'merge_1',
        previewNodeId: 'preview_claim',
        matchedTopicId: 'topic_existing',
        matchedTopicTitle: 'Existing rollout channel',
        kind: 'same_topic',
        confidence: 'high',
        reason: 'The titles and note summaries strongly overlap.',
      },
    ],
    warnings: ['One warning remains.'],
    ...overrides,
  }
}

function createTraceEntry(
  overrides: Partial<TextImportTraceEntry> = {},
): TextImportTraceEntry {
  return {
    id: 'trace_1',
    sequence: 1,
    timestampMs: Date.now(),
    attempt: 'primary',
    channel: 'runner',
    eventType: 'heartbeat',
    payload: {
      kind: 'structured',
      phase: 'heartbeat',
      promptLength: 120,
      elapsedSinceLastEventMs: 12_000,
      hadJsonEvent: false,
    },
    currentFileName: 'Launch.md',
    requestId: 'import_1',
    ...overrides,
  }
}

function createPlanningSummary(
  overrides: Partial<TextImportSourcePlanningSummary> = {},
): TextImportSourcePlanningSummary {
  return {
    sourceName: 'Launch.md',
    sourceType: 'file',
    resolvedPreset: 'distill',
    resolvedArchetype: 'process',
    confidence: 'high',
    presetConfidence: 'high',
    archetypeConfidence: 'high',
    structureScore: 0.82,
    structureConfidence: 0.86,
    recommendedRoute: 'codex_import',
    isShallowPass: false,
    needsDeepPass: false,
    rationale: 'The source reads like a procedure with explicit action ordering.',
    presetRationale: 'Skill-backed distillation is the safest default.',
    archetypeRationale: 'Ordered steps and checks indicate a process document.',
    isManual: false,
    ...overrides,
  }
}

function createProgressEntry(
  overrides: Partial<TextImportProgressEntry> = {},
): TextImportProgressEntry {
  return {
    id: 'progress_1',
    timestampMs: Date.now(),
    stage: 'parsing_markdown',
    message: 'Parsing local markdown structure...',
    tone: 'info',
    source: 'status',
    attempt: 'local',
    currentFileName: 'Launch.md',
    ...overrides,
  }
}

function createProps(
  overrides: Partial<ComponentProps<typeof TextImportDialog>> = {},
): ComponentProps<typeof TextImportDialog> {
  return {
    open: true,
    sourceName: 'Launch.md',
    sourceType: 'file',
    sourceFiles: [{ sourceName: 'Launch.md', sourceType: 'file', textLength: 1200 }],
    rawText: '',
    draftSourceName: 'Launch.md',
    draftText: '',
    preprocessedHints: [],
    preview: null,
    draftTree: [],
    previewTree: [],
    draftConfirmed: false,
    planningSummaries: [createPlanningSummary()],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    statusText: '',
    progress: 0,
    progressIndeterminate: false,
    progressEntries: [],
    traceEntries: [],
    modeHint: null,
    error: null,
    isPreviewing: false,
    isApplying: false,
    previewStartedAt: null,
    previewFinishedAt: null,
    jobMode: 'codex_import',
    jobType: 'single',
    fileCount: 1,
    completedFileCount: 0,
    currentFileName: 'Launch.md',
    semanticMergeStage: 'idle',
    semanticCandidateCount: 0,
    semanticAdjudicatedCount: 0,
    semanticFallbackCount: 0,
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
    presetOverride: null,
    archetypeOverride: null,
    anchorMode: 'document_root',
    documentRootLabel: 'Central topic',
    currentSelectionLabel: 'Selected branch',
    onClose: () => {},
    onChooseFiles: () => {},
    onPresetChange: () => {},
    onArchetypeChange: () => {},
    onAnchorModeChange: () => {},
    onDraftSourceNameChange: () => {},
    onDraftTextChange: () => {},
    onGenerateFromText: () => {},
    onToggleConflict: () => {},
    onConfirmDraft: () => {},
    onRenamePreviewNode: () => {},
    onPromotePreviewNode: () => {},
    onDemotePreviewNode: () => {},
    onDeletePreviewNode: () => {},
    onApply: () => {},
    ...overrides,
  }
}

async function openFirstSkillStatusDetails(user: ReturnType<typeof userEvent.setup>) {
  const skillStatus = screen.getByRole('region', { name: 'Skill status' })
  const firstSummary = skillStatus.querySelector('summary')
  expect(firstSummary).not.toBeNull()
  await user.click(firstSummary as HTMLElement)
}

describe('TextImportDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a minimal file-only source panel by default', () => {
    render(
      <TextImportDialog
        {...createProps({
          sourceName: null,
          sourceType: null,
          sourceFiles: [],
          planningSummaries: [],
        })}
      />,
    )

    expect(screen.getByRole('region', { name: 'Prepare import' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import files' })).toBeInTheDocument()
    expect(screen.getByText('No file imported')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Import target')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Paste Markdown or plain text here and generate an import preview.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate draft' })).not.toBeInTheDocument()
  })

  it('shows only the imported file name in the source summary', () => {
    render(
      <TextImportDialog
        {...createProps({
          sourceFiles: [{ sourceName: 'GTM_main.md', sourceType: 'file', textLength: 3533 }],
        })}
      />,
    )

    expect(screen.getByText('GTM_main.md')).toBeInTheDocument()
    expect(screen.queryByText('Imported: GTM_main.md')).not.toBeInTheDocument()
    expect(screen.queryByText('3533 chars')).not.toBeInTheDocument()
  })

  it('keeps the skill status compact without extra controls', () => {
    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
        })}
      />,
    )

    const skillStatus = screen.getByRole('region', { name: 'Skill status' })

    expect(within(skillStatus).getByText('Attach evidence / tasks')).toBeInTheDocument()
    expect(within(skillStatus).getByText(/Process/)).toBeInTheDocument()
    expect(within(skillStatus).queryByRole('button', { name: 'Pin type' })).not.toBeInTheDocument()
    expect(within(skillStatus).queryByText('Why and details')).not.toBeInTheDocument()
  })

  it.skip('shows a compact skill status summary and keeps rationale behind details', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
        })}
      />,
    )

    const skillStatus = screen.getByRole('region', { name: 'Skill status' })

    expect(within(skillStatus).getByText('Attach evidence / tasks')).toBeInTheDocument()
    expect(within(skillStatus).getByText('Process · low (42%)')).toBeInTheDocument()
    expect(within(skillStatus).getByRole('button', { name: 'Pin type' })).toBeInTheDocument()
    expect(within(skillStatus).queryByText('Ordered procedural signals dominate the source.')).not.toBeInTheDocument()

    await user.click(within(skillStatus).getByText('Why and details'))

    expect(within(skillStatus).getByText('Ordered procedural signals dominate the source.')).toBeInTheDocument()
  })

it.skip('opens more options from the low-confidence warning', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          planningSummaries: [createPlanningSummary({ confidence: 'low', archetypeConfidence: 'low' })],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Pin type' }))

    expect(screen.getByRole('button', { name: 'More options' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /Show import internals/i })).toBeInTheDocument()
  })

  it('keeps activity logs collapsed by default while previewing', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          sourceFiles: [
            { sourceName: 'Launch.md', sourceType: 'file', textLength: 1200 },
            { sourceName: 'Ops.md', sourceType: 'file', textLength: 800 },
          ],
          planningSummaries: [
            createPlanningSummary(),
            createPlanningSummary({ sourceName: 'Ops.md', confidence: 'medium' }),
          ],
          statusText: 'Codex is building the logic map...',
          progress: 42,
          traceEntries: [
            createTraceEntry({
              id: 'trace_1',
              sequence: 1,
              channel: 'request',
              eventType: 'request.dispatched',
              payload: {
                kind: 'structured',
                sourceName: 'Launch.md',
                promptLength: 120,
                schemaEnabled: true,
              },
            }),
            createTraceEntry({
              id: 'trace_2',
              sequence: 2,
              channel: 'codex',
              currentFileName: 'Ops.md',
              eventType: 'item.delta',
              payload: {
                item: {
                  text_delta: 'Thinking through launch order',
                },
              },
              timestampMs: Date.now() - 1_000,
            }),
          ],
          isPreviewing: true,
          previewStartedAt: Date.now() - 12_000,
          jobType: 'batch',
          fileCount: 5,
          completedFileCount: 2,
          currentFileName: 'Ops.md',
          semanticMergeStage: 'candidate_generation',
          semanticCandidateCount: 9,
          semanticAdjudicatedCount: 4,
          semanticFallbackCount: 2,
        })}
      />,
    )

    expect(screen.getByText('Codex is building the logic map...')).toBeInTheDocument()
    expect(screen.getByText(/Progress 42% \| Elapsed \d+s/)).toBeInTheDocument()
    expect(screen.getByText('Files 2/5 | Current: Ops.md')).toBeInTheDocument()
    expect(screen.queryByText('Ops.md | Thinking through launch order')).not.toBeInTheDocument()
    expect(screen.queryByText('Communication trace')).not.toBeInTheDocument()
    expect(screen.queryByText('View raw JSON')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Semantic stage: Generating semantic candidates \| Candidates 9\/4 \| Fallbacks 2/),
    ).toBeInTheDocument()

    await openFirstSkillStatusDetails(user)
    expect(screen.getByText('Ops.md | Thinking through launch order')).toBeInTheDocument()
  })

  it('groups real tool events into command-level activity lines', async () => {
    const user = userEvent.setup()
    render(
      <TextImportDialog
        {...createProps({
          isPreviewing: true,
          previewStartedAt: Date.now() - 15_000,
          traceEntries: [
            createTraceEntry({
              id: 'cmd_1',
              sequence: 1,
              channel: 'codex',
              eventType: 'item.started',
              payload: {
                item: {
                  type: 'command_execution',
                  command: 'npm config get prefix',
                },
              },
            }),
            createTraceEntry({
              id: 'search_1',
              sequence: 2,
              timestampMs: Date.now() - 1_000,
              channel: 'codex',
              eventType: 'item.completed',
              payload: {
                item: {
                  type: 'web_search',
                  query: 'shopify cli install',
                },
              },
            }),
          ],
        })}
      />,
    )

    await openFirstSkillStatusDetails(user)
    expect(screen.getByText(/npm config get prefix/)).toBeInTheDocument()
    expect(screen.getByText(/shopify cli install/)).toBeInTheDocument()
  })

  it('does not render raw event trace controls in the simplified view', () => {
    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
          previewStartedAt: Date.now() - 18_000,
          previewFinishedAt: Date.now() - 2_000,
          traceEntries: [
            createTraceEntry({
              id: 'trace_done',
              sequence: 1,
              channel: 'codex',
              eventType: 'item.completed',
              payload: {
                item: {
                  type: 'agent_message',
                },
              },
            }),
          ],
        })}
      />,
    )

    expect(screen.queryByText('View raw JSON')).not.toBeInTheDocument()
  })

  it('shows local import progress without Codex wording', async () => {
    const user = userEvent.setup()
    render(
      <TextImportDialog
        {...createProps({
          jobMode: 'local_markdown',
          isPreviewing: true,
          previewStartedAt: Date.now() - 8_000,
          progressEntries: [
            createProgressEntry(),
            createProgressEntry({
              id: 'progress_2',
              timestampMs: Date.now() - 1_000,
              stage: 'analyzing_import',
              message: 'Parsing local import preview...',
            }),
          ],
        })}
      />,
    )

    expect(screen.queryByText(/Codex/)).not.toBeInTheDocument()
    expect(screen.queryByText('Parsing local import preview...')).not.toBeInTheDocument()

    await openFirstSkillStatusDetails(user)
    expect(screen.getByText('Parsing local import preview...')).toBeInTheDocument()
  })

  it('keeps batch file details collapsed by default and expands them on demand', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          sourceFiles: [
            { sourceName: 'Launch.md', sourceType: 'file', textLength: 1200 },
            { sourceName: 'Ops.md', sourceType: 'file', textLength: 800 },
          ],
          planningSummaries: [
            createPlanningSummary(),
            createPlanningSummary({ sourceName: 'Ops.md', confidence: 'medium' }),
          ],
        })}
      />,
    )

    expect(screen.queryByText('Ops.md')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show file details' }))

    expect(screen.getByText('Launch.md')).toBeInTheDocument()
    expect(screen.getByText('Ops.md')).toBeInTheDocument()
  })

  it('keeps merge review disabled until the draft is confirmed', () => {
    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
        })}
      />,
    )

    expect(screen.getByRole('region', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Draft' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Merge' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Confirm draft' })).toBeInTheDocument()
  })

  it('switches to merge review after the draft is confirmed and shows merge decisions', async () => {
    const user = userEvent.setup()
    const onToggleConflict = vi.fn()
    const onApply = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
          draftConfirmed: true,
          onToggleConflict,
          onApply,
          crossFileMergeSuggestions: [
            {
              id: 'cross_1',
              previewNodeId: 'preview_claim',
              sourceName: 'Ops.md',
              matchedPreviewNodeId: 'preview_existing',
              matchedSourceName: 'Launch.md',
              matchedTitle: 'Existing rollout channel',
              kind: 'same_topic',
              confidence: 'medium',
              reason: 'This branch overlaps with another imported file.',
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Merge' }))

    expect(screen.getByText('Conflicts')).toBeInTheDocument()
    expect(screen.getByText('Merge suggestions')).toBeInTheDocument()
    expect(screen.getByText('Cross-file overlaps')).toBeInTheDocument()
    expect(screen.getByText('Warnings')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox'))
    expect(onToggleConflict).toHaveBeenCalledWith('conflict_1')

    await user.click(screen.getByRole('button', { name: 'Apply to canvas' }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('shows the blocked merge state when the component switches tabs before the parent confirms the draft', async () => {
    const user = userEvent.setup()
    const onConfirmDraft = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
          onConfirmDraft,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Confirm draft' }))

    expect(onConfirmDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Confirm the draft first')).toBeInTheDocument()
  })

  it('keeps diagnostics and repair tools hidden in the simplified view', () => {
    const onRepair = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview({
            diagnostics: {
              timings: {
                preprocessMs: 3,
                planningMs: 4,
                parseTreeMs: 5,
                batchComposeMs: 1,
                semanticCandidateMs: 2,
                semanticAdjudicationMs: 7,
                previewEditMs: 1,
                applyMs: 0,
                totalMs: 23,
              },
              densityStats: {
                previewNodeCount: 2,
                semanticNodeCount: 2,
                semanticEdgeCount: 1,
                operationCount: 2,
                sourceAnchorCount: 2,
                foldedNoteCount: 1,
                evidenceNodeCount: 1,
                maxDepth: 2,
              },
              artifactReuse: {
                contentKey: 'content',
                planKey: 'plan',
                reusedSemanticHints: true,
                reusedSemanticUnits: true,
                reusedPlannedStructure: true,
              },
              qualitySignals: {
                warningCount: 1,
                genericTitleCount: 0,
                lowConfidenceNodeCount: 1,
                foldedEvidenceCount: 0,
                duplicateSiblingGroupCount: 0,
                shallowSourceCount: 0,
                needsDeepPassCount: 0,
              },
              applyEstimate: {
                createCount: 1,
                updateCount: 1,
                mergeCount: 1,
                crossFileMergeCount: 0,
                skippedUpdateCount: 0,
              },
              semanticAdjudication: {
                candidateCount: 3,
                representativeCount: 2,
                requestCount: 1,
                adjudicatedCount: 2,
                fallbackCount: 0,
              },
              dirtySubtreeIds: ['preview_claim'],
              lastEditAction: 'rename',
            },
          }),
          draftTree,
          previewTree: draftTree,
          onRepair,
          repairDescription: 'A legacy import structure can be rebuilt into the new skill format.',
        })}
      />,
    )

    expect(screen.queryByText(/Timings\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/Density\./)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Repair current import' })).not.toBeInTheDocument()
    expect(onRepair).not.toHaveBeenCalled()
  })

  it('shows applying progress inside the merge tab', () => {
    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview(),
          draftTree,
          previewTree: draftTree,
          draftConfirmed: true,
          isApplying: true,
          statusText: 'Applying 3/10 operations...',
          applyProgress: 30,
          appliedCount: 3,
          totalOperations: 10,
          currentApplyLabel: 'Merging rollout branch',
        })}
      />,
    )

    const mergePanel = screen.getByRole('tabpanel', { name: 'Merge' })

    expect(screen.getByRole('tab', { name: 'Merge' })).toHaveAttribute('aria-selected', 'true')
    expect(within(mergePanel).getByText('Applying changes')).toBeInTheDocument()
    expect(within(mergePanel).getByText('Applying 3/10 operations...')).toBeInTheDocument()
    expect(within(mergePanel).getByText('Merging rollout branch')).toBeInTheDocument()
  })

  it('passes selected files through the dialog-owned file input', async () => {
    const user = userEvent.setup()
    const onChooseFiles = vi.fn()
    const { container } = render(
      <TextImportDialog
        {...createProps({
          onChooseFiles,
        })}
      />,
    )

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    const file = new File(['# Sample'], 'sample.md', { type: 'text/markdown' })
    await user.upload(input as HTMLInputElement, file)

    expect(onChooseFiles).toHaveBeenCalledWith([file])
  })
})


