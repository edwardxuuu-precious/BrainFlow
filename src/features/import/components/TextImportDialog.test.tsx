import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TextImportResponse } from '../../../../shared/ai-contract'
import type { TextImportSourcePlanningSummary } from '../../../../shared/text-import-semantics'
import { TextImportDialog } from './TextImportDialog'

const draftTree = [
  {
    id: 'preview_1',
    parentId: null,
    order: 0,
    title: 'Step 1',
    note: 'Launch the campaign',
    relation: 'new' as const,
    matchedTopicId: null,
    reason: 'New branch',
    children: [],
  },
]
const previewTree = draftTree

function createPreview(
  overrides: Partial<TextImportResponse> = {},
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
    summary: 'Preview ready for review.',
    baseDocumentUpdatedAt: 1,
    anchorTopicId: 'root',
    classification: {
      archetype: 'method',
      confidence: 0.82,
      rationale: 'Ordered steps and criteria strongly indicate a method.',
      secondaryArchetype: 'plan',
    },
    templateSummary: {
      archetype: 'method',
      visibleSlots: ['steps', 'pitfalls'],
      foldedSlots: ['goal', 'criteria'],
    },
    nodePlans: [
      {
        id: 'preview_root',
        parentId: null,
        order: 0,
        title: 'Import: GTM main',
        note: null,
        semanticRole: 'section',
        confidence: 'high',
        sourceAnchors: [],
        groupKey: 'root',
        priority: 'primary',
        collapsedByDefault: false,
        templateSlot: null,
      },
      {
        id: 'preview_1',
        parentId: 'preview_root',
        order: 0,
        title: 'Step 1',
        note: 'Launch the campaign',
        semanticRole: 'action',
        confidence: 'high',
        sourceAnchors: [],
        groupKey: 'steps',
        priority: 'primary',
        collapsedByDefault: false,
        templateSlot: 'steps',
      },
    ],
    previewNodes: [
      {
        id: 'preview_root',
        parentId: null,
        order: 0,
        title: 'Import: GTM main',
        note: null,
        relation: 'new',
        matchedTopicId: null,
        reason: null,
      },
      {
        id: 'preview_1',
        parentId: 'preview_root',
        order: 0,
        title: 'Step 1',
        note: 'Launch the campaign',
        relation: 'new',
        matchedTopicId: null,
        reason: 'New branch',
        semanticRole: 'action',
        confidence: 'high',
        templateSlot: 'steps',
      },
    ],
    conflicts: [
      {
        id: 'conflict_1',
        title: 'Rename Step 1',
        description: 'Renaming an existing node needs approval.',
        kind: 'rename',
        operationIds: ['op_2'],
        targetTopicIds: ['topic_1'],
      },
    ],
    operations: [
      { id: 'op_1', type: 'create_child', parent: 'topic:root', title: 'Import: GTM main', risk: 'low', resultRef: 'preview_root' },
      { id: 'op_2', type: 'update_topic', target: 'topic:topic_1', title: 'Step 1', risk: 'high' },
    ],
    bundle,
    sources,
    semanticNodes,
    semanticEdges,
    views,
    viewProjections,
    defaultViewId,
    activeViewId,
    mergeSuggestions: [
      {
        id: 'merge_1',
        previewNodeId: 'preview_1',
        matchedTopicId: 'topic_existing',
        matchedTopicTitle: 'Existing Step 1',
        kind: 'same_topic',
        confidence: 'high',
        reason: 'Titles and note summaries strongly overlap.',
      },
    ],
    warnings: ['One warning remains.'],
    ...rest,
  }
}

const preview = createPreview()

const previewWithoutReviewItems = createPreview({
  summary: 'Preview ready without merge review items.',
  conflicts: [],
  operations: [{ id: 'op_1', type: 'create_child', parent: 'topic:root', title: 'Import: GTM main', risk: 'low', resultRef: 'preview_root' }],
  mergeSuggestions: [],
  warnings: [],
})
const crossFileMergeSuggestions = [
  {
    id: 'cross_1',
    previewNodeId: 'preview_1',
    sourceName: 'GTM_step1.md',
    matchedPreviewNodeId: 'preview_existing',
    matchedSourceName: 'GTM_main.md',
    matchedTitle: 'Existing Step 1',
    kind: 'same_topic' as const,
    confidence: 'high' as const,
    reason: 'The imported node matches a branch from another file.',
  },
]

function createPlanningSummary(
  overrides: Partial<TextImportSourcePlanningSummary> = {},
): TextImportSourcePlanningSummary {
  return {
    sourceName: 'GTM_main.md',
    sourceType: 'file',
    resolvedPreset: 'distill',
    resolvedArchetype: 'method',
    confidence: 'high',
    presetConfidence: 'high',
    archetypeConfidence: 'high',
    structureScore: 0.84,
    structureConfidence: 0.88,
    recommendedRoute: 'local_markdown',
    isShallowPass: false,
    needsDeepPass: false,
    rationale: 'Distill is the safest default. Ordered steps and criteria strongly indicate a method.',
    presetRationale: 'Distill is the safest default.',
    archetypeRationale: 'Ordered steps and criteria strongly indicate a method.',
    isManual: false,
    ...overrides,
  }
}

function createProps(
  overrides: Partial<ComponentProps<typeof TextImportDialog>> = {},
): ComponentProps<typeof TextImportDialog> {
  const props: ComponentProps<typeof TextImportDialog> = {
    open: true,
    sourceName: 'GTM_main.md',
    sourceType: 'file',
    sourceFiles: [{ sourceName: 'GTM_main.md', sourceType: 'file', textLength: 1200 }],
    rawText: '',
    draftSourceName: 'GTM_main.md',
    draftText: '',
    preprocessedHints: [],
    preview: null,
    draftTree: [],
    previewTree: [],
    draftConfirmed: false,
    planningSummaries: [],
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    statusText: '',
    progress: 0,
    progressIndeterminate: false,
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
    currentFileName: 'GTM_main.md',
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
    onChooseFile: () => {},
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

  if (overrides.planningSummaries !== undefined) {
    return props
  }

  return {
    ...props,
    planningSummaries: props.sourceFiles.length > 0 ? [createPlanningSummary()] : [],
  }
}

describe('TextImportDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the import source step and keeps later review pages separate', () => {
    render(<TextImportDialog {...createProps()} />)

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Structure draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Merge review' })).not.toBeInTheDocument()
  })

  it('shows progress, elapsed time and batch metadata while importing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-05T11:30:00Z'))

    render(
      <TextImportDialog
        {...createProps({
          sourceName: '2 files',
          sourceFiles: [
            { sourceName: 'GTM_main.md', sourceType: 'file', textLength: 1200 },
            { sourceName: 'GTM_step1.md', sourceType: 'file', textLength: 800 },
          ],
          statusText: 'Parsing GTM_step1.md...',
          progress: 42,
          modeHint: 'This import uses the local Markdown batch pipeline.',
          isPreviewing: true,
          previewStartedAt: Date.now() - 12_000,
          jobMode: 'local_markdown',
          jobType: 'batch',
          fileCount: 5,
          completedFileCount: 2,
          currentFileName: 'GTM_step1.md',
          semanticMergeStage: 'candidate_generation',
          semanticCandidateCount: 24,
          semanticAdjudicatedCount: 12,
          semanticFallbackCount: 3,
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Import progress' })).toBeInTheDocument()
    expect(screen.getByText('Progress 42% | Elapsed 12s')).toBeInTheDocument()
    expect(screen.getByText('Files 2/5 | Current: GTM_step1.md')).toBeInTheDocument()
    expect(screen.getByText('Semantic stage: Generating semantic candidates')).toBeInTheDocument()
    expect(screen.getByText('Candidates 24/12 | Fallbacks 3')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2_000)
    })

    expect(screen.getByText('Progress 42% | Elapsed 14s')).toBeInTheDocument()
  })

  it('shows the active pipeline badge based on the job mode', () => {
    render(
      <TextImportDialog
        {...createProps({
          statusText: 'Preparing the Codex import pipeline...',
          modeHint: 'Using the Codex import pipeline for Markdown analysis.',
          jobMode: 'codex_import',
        })}
      />,
    )

    expect(screen.getByText('Codex pipeline')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Import progress' })).toBeInTheDocument()
  })

  it('shows automatic setup by default without rendering the old option wall', () => {
    render(<TextImportDialog {...createProps()} />)

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Automatic import setup' })).toBeInTheDocument()
    expect(screen.getByText('Smart distill')).toBeInTheDocument()
    expect(screen.getByText('Method')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Advanced settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Argument/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Preserve structure/i })).not.toBeInTheDocument()
  })

  it('lets users override the automatic setup from advanced settings', async () => {
    const user = userEvent.setup()
    const onPresetChange = vi.fn()
    const onArchetypeChange = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          onPresetChange,
          archetypeOverride: null,
          onArchetypeChange,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Advanced settings' }))
    const comboboxes = screen.getAllByRole('combobox')
    const presetSelect = comboboxes[1]
    const archetypeSelect = comboboxes[2]
    await user.selectOptions(presetSelect, 'preserve')
    await user.selectOptions(archetypeSelect, 'argument')

    expect(onPresetChange).toHaveBeenCalledWith('preserve')
    expect(onArchetypeChange).toHaveBeenCalledWith('argument')
  })

  it('defaults the import target to the document root and warns when nesting under the current selection', async () => {
    const user = userEvent.setup()
    const onAnchorModeChange = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          onAnchorModeChange,
        })}
      />,
    )

    const anchorSelect = within(screen.getByRole('region', { name: 'Import target' })).getByRole('combobox')
    expect(anchorSelect).toHaveValue('document_root')
    expect(
      screen.getByText(
        'Default. Each new import starts at the document root so repeated imports stay as sibling branches.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/will be nested under the currently selected topic/i)).not.toBeInTheDocument()

    await user.selectOptions(anchorSelect, 'current_selection')

    expect(onAnchorModeChange).toHaveBeenCalledWith('current_selection')
  })

  it('shows the nesting warning when the current selection anchor is active', () => {
    render(
      <TextImportDialog
        {...createProps({
          anchorMode: 'current_selection',
          currentSelectionLabel: 'Imported branch',
        })}
      />,
    )

    const anchorSelect = within(screen.getByRole('region', { name: 'Import target' })).getByRole('combobox')
    expect(anchorSelect).toHaveValue('current_selection')
    expect(
      screen.getByText(
        'Import under the currently selected topic. This can intentionally nest the next imported branch.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The next import will be nested under the currently selected topic instead of the document root.',
      ),
    ).toBeInTheDocument()
  })

  it('shows a low-confidence hint without blocking the source step', () => {
    render(
      <TextImportDialog
        {...createProps({
          planningSummaries: [
            createPlanningSummary({
              confidence: 'low',
              presetConfidence: 'medium',
              archetypeConfidence: 'low',
            }),
          ],
        })}
      />,
    )

    expect(
      screen.getByText('The system already chose a default setup. You can refine it in Advanced settings.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('auto-advances to the structure draft when generation completes', async () => {
    const { rerender } = render(
      <TextImportDialog
        {...createProps({
          isPreviewing: true,
          previewStartedAt: Date.now() - 4_000,
          statusText: 'Generating preview...',
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()

    rerender(
      <TextImportDialog
        {...createProps({
          preview,
          draftTree,
          previewTree,
          crossFileMergeSuggestions,
          approvedConflictIds: ['conflict_1'],
          previewFinishedAt: Date.now(),
        })}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Merge review' })).not.toBeInTheDocument()
  })

  it('lets users switch to the draft review step before a preview exists', async () => {
    const user = userEvent.setup()

    render(<TextImportDialog {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Draft review/ }))

    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()
    expect(screen.getByText('No structure draft yet')).toBeInTheDocument()
  })

  it('only shows the source card when there is no progress content yet', () => {
    render(<TextImportDialog {...createProps()} />)

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Import progress' })).not.toBeInTheDocument()
  })

  it('expands selected file details inline inside the source card', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          sourceFiles: [
            { sourceName: 'GTM_main.md', sourceType: 'file', textLength: 1200 },
            { sourceName: 'GTM_step1.md', sourceType: 'file', textLength: 800 },
          ],
          statusText: 'Codex is analyzing the full import context...',
          progress: 56,
          progressIndeterminate: true,
          modeHint: 'Using the Codex import pipeline for Markdown analysis.',
          isPreviewing: true,
          previewStartedAt: Date.now() - 8_000,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Show file details' }))

    expect(screen.getByText('GTM_main.md')).toBeInTheDocument()
    expect(screen.getByText('GTM_step1.md')).toBeInTheDocument()
  })

  it('keeps merge review gated until the draft is confirmed', async () => {
    const user = userEvent.setup()

    render(<TextImportDialog {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Merge review/ }))

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Merge review' })).not.toBeInTheDocument()
  })

  it('shows the generating state on the draft step while preview generation is in progress', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          isPreviewing: true,
          previewStartedAt: Date.now() - 4_000,
          statusText: 'Generating preview...',
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Draft review/ }))
    expect(screen.getByText('Generating structure draft')).toBeInTheDocument()
  })

  it('confirms the draft before opening merge review', async () => {
    const user = userEvent.setup()
    const onConfirmDraft = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          preview,
          draftTree,
          previewTree,
          onConfirmDraft,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()
    expect(screen.getByText('Launch the campaign')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Confirm draft' }))
    expect(onConfirmDraft).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument()
    expect(screen.getByText('Confirm the draft first')).toBeInTheDocument()
  })

  it('shows merge review content after the draft is confirmed', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview,
          draftTree,
          previewTree,
          draftConfirmed: true,
          crossFileMergeSuggestions,
          approvedConflictIds: ['conflict_1'],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument()
    expect(screen.getByText('Existing Step 1')).toBeInTheDocument()
    expect(screen.getByText('One warning remains.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()
  })

  it('shows a no-review-needed state when the preview has no merge items', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview: previewWithoutReviewItems,
          draftTree,
          previewTree,
          draftConfirmed: true,
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Merge review/ }))

    expect(screen.getByText('No merge or conflict items to review')).toBeInTheDocument()
  })

  it('resets back to the import source step when reopened', async () => {
    const user = userEvent.setup()
    const props = createProps({
      preview,
      draftTree,
      previewTree,
      draftConfirmed: true,
      crossFileMergeSuggestions,
      approvedConflictIds: ['conflict_1'],
    })

    const { rerender } = render(<TextImportDialog {...props} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()

    rerender(<TextImportDialog {...props} open={false} />)
    rerender(<TextImportDialog {...props} open />)

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
  })

  it('shows apply progress on the merge review step and preserves it when navigating away and back', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview,
          draftTree,
          previewTree,
          draftConfirmed: true,
          crossFileMergeSuggestions,
          isApplying: true,
          statusText: 'Applying 3/10 operations...',
          applyProgress: 30,
          appliedCount: 3,
          totalOperations: 10,
          currentApplyLabel: 'Merging Step 1',
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument()
    expect(screen.getByText('Applying 3/10 operations...')).toBeInTheDocument()
    expect(screen.getByText('Applying 3/10 operations')).toBeInTheDocument()
    expect(screen.getByText('Merging Step 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Draft review/ }))
    expect(screen.getByRole('heading', { name: 'Structure draft' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Merge review/ }))
    expect(screen.getByText('Applying 3/10 operations...')).toBeInTheDocument()
  })

  it('shows the upload action in the empty paste state', () => {
    render(
      <TextImportDialog
        {...createProps({
          sourceName: null,
          sourceType: null,
          sourceFiles: [],
          draftSourceName: 'Pasted text',
          draftText: '',
          rawText: '',
          jobMode: null,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: 'Choose Files' })).toBeInTheDocument()
  })

  it('keeps the upload action visible after files are selected', () => {
    render(<TextImportDialog {...createProps()} />)

    expect(screen.getByRole('button', { name: 'Choose Files' })).toBeInTheDocument()
    expect(screen.getByText('1 file selected')).toBeInTheDocument()
  })

  it('renders structured diagnostics for preview errors on the source step', () => {
    render(
      <TextImportDialog
        {...createProps({
          error: {
            message: 'The import preview timed out while waiting for the local Codex bridge. Retry after the bridge finishes the current request.',
            rawMessage: 'stderr: model output was truncated',
            code: 'request_failed',
            kind: 'bridge_unavailable',
            status: 504,
            stage: 'waiting_codex_primary',
            requestId: 'import_123',
          },
          currentFileName: 'GTM_step1.md',
        })}
      />,
    )

    expect(screen.getByText('The local Codex bridge is unavailable.')).toBeInTheDocument()
    expect(
      screen.getByText('Request import_123 | Stage waiting_codex_primary | File GTM_step1.md | HTTP 504'),
    ).toBeInTheDocument()
    expect(screen.getByText('Raw error: stderr: model output was truncated')).toBeInTheDocument()
  })

  it('hides manual preview actions for uploaded files', () => {
    render(<TextImportDialog {...createProps({ rawText: '# Goals', draftText: '# Goals' })} />)

    expect(screen.queryByRole('button', { name: 'Generate draft' })).not.toBeInTheDocument()
  })

  it('shows the repair action when a legacy import can be rebuilt', async () => {
    const user = userEvent.setup()
    const onRepair = vi.fn()

    render(
      <TextImportDialog
        {...createProps({
          preview,
          repairLabel: '修复当前导入',
          repairDescription: '检测到旧版 GTM 模板导入。',
          onRepair,
        })}
      />,
    )

    expect(screen.getByRole('button', { name: '修复当前导入' })).toBeInTheDocument()
    expect(screen.getByText('检测到旧版 GTM 模板导入。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '修复当前导入' }))

    expect(onRepair).toHaveBeenCalledTimes(1)
  })

  it('renders debug diagnostics when preview diagnostics are present', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview: createPreview({
            diagnostics: {
              timings: {
                preprocessMs: 3,
                planningMs: 4,
                parseTreeMs: 5,
                batchComposeMs: 0,
                semanticCandidateMs: 2,
                semanticAdjudicationMs: 7,
                previewEditMs: 1,
                applyMs: 0,
                totalMs: 22,
              },
              densityStats: {
                previewNodeCount: 2,
                semanticNodeCount: 2,
                semanticEdgeCount: 1,
                operationCount: 2,
                sourceAnchorCount: 1,
                foldedNoteCount: 1,
                evidenceNodeCount: 0,
                maxDepth: 1,
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
                lowConfidenceNodeCount: 0,
                foldedEvidenceCount: 0,
                duplicateSiblingGroupCount: 0,
                shallowSourceCount: 0,
                needsDeepPassCount: 1,
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
              dirtySubtreeIds: ['preview_1'],
              lastEditAction: 'rename',
            },
          }),
        })}
      />,
    )

    await user.click(screen.getByText('Debug diagnostics'))

    expect(screen.getByText(/Preprocess 3 ms \| Planning 4 ms \| Parse 5 ms/)).toBeInTheDocument()
    expect(screen.getByText(/Artifact reuse: hints yes, units yes, plan yes/)).toBeInTheDocument()
    expect(screen.getByText(/Last edit action: rename \| Dirty subtrees: preview_1/)).toBeInTheDocument()
  })
})
