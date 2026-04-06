import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextImportDialog } from './TextImportDialog'

const previewTree = [
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

const preview = {
  summary: 'Preview ready for review.',
  conflicts: [
    {
      id: 'conflict_1',
      title: 'Rename Step 1',
      description: 'Renaming an existing node needs approval.',
      kind: 'rename' as const,
      operationIds: ['op_2'],
      targetTopicIds: ['topic_1'],
    },
  ],
  operations: [
    { risk: 'low' as const },
    { risk: 'high' as const },
  ],
  mergeSuggestions: [
    {
      id: 'merge_1',
      previewNodeId: 'preview_1',
      matchedTopicId: 'topic_existing',
      matchedTopicTitle: 'Existing Step 1',
      kind: 'same_topic' as const,
      confidence: 'high' as const,
      reason: 'Titles and note summaries strongly overlap.',
    },
  ],
  warnings: ['One warning remains.'],
}

const previewWithoutReviewItems = {
  summary: 'Preview ready without merge review items.',
  conflicts: [],
  operations: [{ risk: 'low' as const }],
}

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

function createProps(
  overrides: Partial<ComponentProps<typeof TextImportDialog>> = {},
): ComponentProps<typeof TextImportDialog> {
  return {
    open: true,
    sourceName: 'GTM_main.md',
    sourceType: 'file',
    sourceFiles: [{ sourceName: 'GTM_main.md', sourceType: 'file', textLength: 1200 }],
    rawText: '',
    draftSourceName: 'GTM_main.md',
    draftText: '',
    preprocessedHints: [],
    preview: null,
    previewTree: [],
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
    currentStatus: null,
    latestCodexExplainer: null,
    latestCodexEvent: null,
    codexEventFeed: [],
    codexDiagnostics: [],
    statusTimeline: [],
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
    onClose: () => {},
    onChooseFile: () => {},
    onDraftSourceNameChange: () => {},
    onDraftTextChange: () => {},
    onGenerateFromText: () => {},
    onToggleConflict: () => {},
    onApply: () => {},
    ...overrides,
  }
}

describe('TextImportDialog', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on the import source step and keeps later review pages separate', () => {
    render(<TextImportDialog {...createProps()} />)

    expect(screen.getByRole('heading', { name: 'Import source' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Structured preview' })).not.toBeInTheDocument()
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

  it('shows a Codex live feed, a runtime explainer, and keeps diagnostics collapsed by default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-06T09:15:00Z'))

    render(
      <TextImportDialog
        {...createProps({
          statusText: 'Codex is analyzing the full import context...',
          progress: 56,
          progressIndeterminate: true,
          modeHint: 'Using the Codex import pipeline for Markdown analysis.',
          isPreviewing: true,
          previewStartedAt: Date.now() - 125_000,
          currentStatus: {
            kind: 'runner_observation',
            attempt: 'primary',
            phase: 'heartbeat',
            promptLength: 69_622,
            elapsedSinceSpawnMs: 125_000,
            elapsedSinceLastEventMs: 57_000,
            hadJsonEvent: true,
            at: Date.now(),
          },
          latestCodexExplainer: {
            attempt: 'primary',
            at: Date.now() - 1_000,
            headline: '正在比较导入内容与现有脑图结构',
            reason: '推断：已经收到 turn.started，但还没有新的内容型事件。',
            evidence: ['导入源 GTM_main.md', 'Prompt 69,622 chars'],
            requestId: 'import_456',
          },
          latestCodexEvent: {
            attempt: 'primary',
            eventType: 'item.completed',
            at: Date.now() - 57_000,
            summary: '已生成结构化结果：Compact preview ready',
            rawJson: '{"type":"item.completed"}',
            requestId: 'import_456',
          },
          codexEventFeed: [
            {
              attempt: 'primary',
              eventType: 'turn.started',
              at: Date.now() - 121_000,
              summary: 'Codex started analyzing',
              rawJson: '{"type":"turn.started"}',
              requestId: 'import_456',
            },
            {
              attempt: 'primary',
              eventType: 'item.completed',
              at: Date.now() - 57_000,
              summary: '已生成结构化结果：Compact preview ready',
              rawJson: '{"type":"item.completed"}',
              requestId: 'import_456',
            },
          ],
          codexDiagnostics: [
            {
              attempt: 'primary',
              category: 'capability_gap',
              at: Date.now() - 30_000,
              message: 'ephemeral 线程不支持 includeTurns 回读。',
              rawLine: 'thread/read failed ... includeTurns',
              requestId: 'import_456',
            },
            {
              attempt: 'primary',
              category: 'noise',
              at: Date.now() - 20_000,
              message: '插件目录同步失败（403），已降级为噪音诊断。',
              rawLine: 'plugin sync failed 403',
              requestId: 'import_456',
            },
          ],
          statusTimeline: [
            {
              id: 'loading_prompt_1',
              stage: 'loading_prompt',
              message: 'Loaded the system prompt for import analysis.',
              progress: 28,
              startedAt: Date.now() - 8_000,
              completedAt: Date.now() - 7_500,
              runnerObservations: [],
            },
            {
              id: 'waiting_codex_primary_1',
              stage: 'waiting_codex_primary',
              message: 'Codex is analyzing the full import context.',
              progress: 56,
              startedAt: Date.now() - 125_000,
              completedAt: null,
              runnerObservations: [
                {
                  attempt: 'primary',
                  phase: 'spawn_started',
                  promptLength: 69_622,
                  observedAt: Date.now() - 120_000,
                },
                {
                  attempt: 'primary',
                  phase: 'first_json_event',
                  promptLength: 69_622,
                  elapsedSinceSpawnMs: 3_736,
                  elapsedSinceLastEventMs: 3_736,
                  hadJsonEvent: true,
                  observedAt: Date.now() - 121_000,
                },
                {
                  attempt: 'primary',
                  phase: 'heartbeat',
                  promptLength: 69_622,
                  elapsedSinceSpawnMs: 125_000,
                  elapsedSinceLastEventMs: 57_000,
                  hadJsonEvent: true,
                  observedAt: Date.now() - 1_000,
                },
              ],
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Runtime explainer')).toBeInTheDocument()
    expect(screen.getByText('Inferred runtime explanation')).toBeInTheDocument()
    expect(screen.getByText('正在比较导入内容与现有脑图结构')).toBeInTheDocument()
    expect(screen.getByText('Codex live feed')).toBeInTheDocument()
    expect(screen.getAllByText('No new Codex events for 57s')).toHaveLength(2)
    expect(screen.getByText('turn.started')).toBeInTheDocument()

    const diagnosticsSummary = screen.getByText('Import diagnostics')
    expect(diagnosticsSummary.closest('details')).not.toHaveAttribute('open')

    ;(document.querySelector('ol li details summary') as HTMLElement | null)?.click()
    expect(screen.getByText('{"type":"turn.started"}')).toBeInTheDocument()

    diagnosticsSummary.click()

    expect(screen.getByText('Runner status: Still running after 2m 05s | No new events for 57s | Prompt 69,622 chars')).toBeInTheDocument()
    expect(screen.getByText('Capability gaps')).toBeInTheDocument()
    expect(screen.getByText('Load prompt')).toBeInTheDocument()
    expect(screen.getByText('<1s')).toBeInTheDocument()
    expect(screen.getByText('Primary: Spawn started')).toBeInTheDocument()
  })

  it('shows a waiting-for-first-event fallback explainer before any CLI output arrives', () => {
    render(
      <TextImportDialog
        {...createProps({
          statusText: 'Codex is analyzing the full import context...',
          progress: 56,
          progressIndeterminate: true,
          modeHint: 'Using the Codex import pipeline for Markdown analysis.',
          isPreviewing: true,
          previewStartedAt: Date.now() - 8_000,
          currentStatus: {
            kind: 'runner_observation',
            attempt: 'primary',
            phase: 'heartbeat',
            promptLength: 49_301,
            elapsedSinceSpawnMs: 8_000,
            elapsedSinceLastEventMs: 8_000,
            hadJsonEvent: false,
            at: Date.now(),
          },
          latestCodexEvent: null,
          codexEventFeed: [],
          statusTimeline: [
            {
              id: 'waiting_codex_primary_1',
              stage: 'waiting_codex_primary',
              message: 'Codex is analyzing the full import context.',
              progress: 56,
              startedAt: Date.now() - 8_000,
              completedAt: null,
              runnerObservations: [
                {
                  attempt: 'primary',
                  phase: 'heartbeat',
                  promptLength: 49_301,
                  elapsedSinceSpawnMs: 8_000,
                  elapsedSinceLastEventMs: 8_000,
                  hadJsonEvent: false,
                  observedAt: Date.now(),
                },
              ],
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Runtime explainer')).toBeInTheDocument()
    expect(screen.getByText('Waiting for the first Codex CLI event')).toBeInTheDocument()
    expect(screen.getByText('Codex has started, but no new CLI events have arrived yet.')).toBeInTheDocument()
    expect(screen.getAllByText('Waiting for first CLI event for 8s')).toHaveLength(2)
  })

  it('auto-advances to structured preview when preview generation completes', async () => {
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
          previewTree,
          crossFileMergeSuggestions,
          approvedConflictIds: ['conflict_1'],
          previewFinishedAt: Date.now(),
        })}
      />,
    )

    expect(await screen.findByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Merge review' })).not.toBeInTheDocument()
  })

  it('lets users switch to the structured preview step before a preview exists', async () => {
    const user = userEvent.setup()

    render(<TextImportDialog {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Structured preview/ }))

    expect(screen.getByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()
    expect(screen.getByText('No structured preview yet')).toBeInTheDocument()
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

  it('lets users switch to the merge review step before a preview exists', async () => {
    const user = userEvent.setup()

    render(<TextImportDialog {...createProps()} />)

    await user.click(screen.getByRole('button', { name: /Merge review/ }))

    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument()
    expect(screen.getByText('No merge review content yet')).toBeInTheDocument()
  })

  it('shows generating states on review steps while preview generation is in progress', async () => {
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

    await user.click(screen.getByRole('button', { name: /Structured preview/ }))
    expect(screen.getByText('Generating structured preview')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Merge review/ }))
    expect(screen.getByText('Generating merge review')).toBeInTheDocument()
  })

  it('navigates through structured preview and merge review with step actions', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview,
          previewTree,
          crossFileMergeSuggestions,
          approvedConflictIds: ['conflict_1'],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()
    expect(screen.getByText('Launch the campaign')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Merge review' })).toBeInTheDocument()
    expect(screen.getByText('Existing Step 1')).toBeInTheDocument()
    expect(screen.getByText('One warning remains.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()
  })

  it('shows a no-review-needed state when the preview has no merge items', async () => {
    const user = userEvent.setup()

    render(
      <TextImportDialog
        {...createProps({
          preview: previewWithoutReviewItems,
          previewTree,
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
      previewTree,
      crossFileMergeSuggestions,
      approvedConflictIds: ['conflict_1'],
    })

    const { rerender } = render(<TextImportDialog {...props} />)

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()

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
          previewTree,
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

    await user.click(screen.getByRole('button', { name: /Structured preview/ }))
    expect(screen.getByRole('heading', { name: 'Structured preview' })).toBeInTheDocument()

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

    expect(screen.queryByRole('button', { name: 'Generate preview' })).not.toBeInTheDocument()
  })
})
