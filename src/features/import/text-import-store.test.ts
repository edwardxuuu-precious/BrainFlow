import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TextImportResponse } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { resetTextImportStore, useTextImportStore } from './text-import-store'

vi.mock('./text-import-job', () => ({
  startTextImportJob: vi.fn(),
  startTextImportBatchJob: vi.fn(),
}))

import { startTextImportBatchJob, startTextImportJob } from './text-import-job'

describe('text-import-store', () => {
  beforeEach(() => {
    resetTextImportStore()
    vi.clearAllMocks()
  })

  it('stores preview results from single-file jobs and keeps progress metadata', async () => {
    const document = createMindMapDocument('Import doc')
    const preview: TextImportResponse = {
      summary: 'Import preview ready',
      baseDocumentUpdatedAt: document.updatedAt,
      anchorTopicId: document.rootTopicId,
      classification: {
        archetype: 'report',
        confidence: 0.78,
        rationale: 'Fixture classification.',
        secondaryArchetype: 'plan',
      },
      templateSummary: {
        archetype: 'report',
        visibleSlots: ['summary', 'next_steps'],
        foldedSlots: ['metrics'],
      },
      bundle: null,
      sources: [],
      semanticNodes: [],
      semanticEdges: [],
      views: [],
      viewProjections: {},
      defaultViewId: null,
      activeViewId: null,
      nodePlans: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Import: GTM_main',
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
          id: 'preview_child',
          parentId: 'preview_root',
          order: 0,
          title: 'Launch',
          note: null,
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
          title: 'Import: GTM_main',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'preview_child',
          parentId: 'preview_root',
          order: 0,
          title: 'Launch',
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
          title: 'Import: GTM_main',
          risk: 'low',
          resultRef: 'preview_root',
        },
      ],
      conflicts: [],
      mergeSuggestions: [],
      crossFileMergeSuggestions: [],
      batch: {
        jobType: 'single',
        fileCount: 1,
        completedFileCount: 1,
        currentFileName: null,
        batchContainerTitle: null,
        files: [],
      },
      warnings: [],
    }

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'parsing_markdown',
        message: 'Parsing Markdown structure...',
        progress: 20,
        mode: 'codex_import',
        jobType: 'single',
        fileCount: 1,
        completedFileCount: 0,
        currentFileName: 'GTM_main.md',
        semanticMergeStage: 'idle',
      })
      onEvent({
        type: 'result',
        data: preview,
        mode: 'codex_import',
        jobType: 'single',
      })

      return {
        jobId: 'job_1',
        mode: 'codex_import',
        jobType: 'single',
        cancel: vi.fn(),
      }
    })

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'GTM_main.md',
        sourceType: 'file',
        rawText: '# Launch',
      },
    )

    expect(useTextImportStore.getState().preview).toMatchObject({
      summary: preview.summary,
      anchorTopicId: preview.anchorTopicId,
      classification: preview.classification,
      templateSummary: preview.templateSummary,
      nodePlans: preview.nodePlans,
    })
    expect(useTextImportStore.getState().draftTree).toEqual([
      expect.objectContaining({
        id: 'preview_root',
        children: [expect.objectContaining({ id: 'preview_child', title: 'Launch' })],
      }),
    ])
    expect(useTextImportStore.getState().previewTree).toEqual([
      expect.objectContaining({
        id: 'preview_root',
        children: [expect.objectContaining({ id: 'preview_child', title: 'Launch' })],
      }),
    ])
    expect(useTextImportStore.getState().draftConfirmed).toBe(false)
    expect(useTextImportStore.getState().progress).toBe(100)
    expect(useTextImportStore.getState().progressIndeterminate).toBe(false)
    expect(useTextImportStore.getState().modeHint).toContain('skill-backed import pipeline')
    expect(useTextImportStore.getState().isPreviewing).toBe(false)
    expect(useTextImportStore.getState().previewFinishedAt).not.toBeNull()
  })

  it('preserves structured diagnostics when a single-file import job fails', async () => {
    const document = createMindMapDocument('Import doc')

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'error',
        stage: 'waiting_codex_primary',
        code: 'request_failed',
        message:
          'The import preview timed out while waiting for the local Codex bridge. Retry after the bridge finishes the current request.',
        rawMessage: 'stderr: model output was truncated',
        kind: 'bridge_unavailable',
        status: 504,
        requestId: 'import_123',
        currentFileName: 'GTM_main.md',
        mode: 'codex_import',
        jobType: 'single',
      })

      return {
        jobId: 'job_error',
        mode: 'codex_import',
        jobType: 'single',
        cancel: vi.fn(),
      }
    })

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'GTM_main.md',
        sourceType: 'file',
        rawText: '# Launch',
      },
    )

    expect(useTextImportStore.getState().error).toEqual({
      code: 'request_failed',
      kind: 'bridge_unavailable',
      message:
        'The import preview timed out while waiting for the local Codex bridge. Retry after the bridge finishes the current request.',
      rawMessage: 'stderr: model output was truncated',
      requestId: 'import_123',
      stage: 'waiting_codex_primary',
      status: 504,
    })
    expect(useTextImportStore.getState().currentFileName).toBe('GTM_main.md')
    expect(useTextImportStore.getState().isPreviewing).toBe(false)
  })

  it('uses the automatic planning resolver when no overrides are set', async () => {
    const document = createMindMapDocument('Import doc')
    const nestedTopicId = document.topics[document.rootTopicId].childIds[0]

    vi.mocked(startTextImportJob).mockImplementation((_request, _onEvent) => ({
      jobId: 'job_auto',
      mode: 'codex_import',
      jobType: 'single',
      cancel: vi.fn(),
    }))

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: nestedTopicId,
        selectedTopicIds: [nestedTopicId],
      },
      {
        sourceName: 'launch_runbook.md',
        sourceType: 'paste',
        rawText: '# Launch runbook\n## Steps\n1. Warm the audience\n2. Ship the sequence',
      },
    )

    expect(startTextImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorTopicId: document.rootTopicId,
        intent: 'preserve_structure',
        archetype: undefined,
        archetypeMode: 'auto',
      }),
      expect.any(Function),
    )
    expect(useTextImportStore.getState().presetOverride).toBeNull()
    expect(useTextImportStore.getState().planningSummaries[0]).toMatchObject({
      resolvedPreset: 'preserve',
      resolvedArchetype: 'process',
      isManual: false,
    })
  })

  it('allows users to explicitly anchor a single-file import to the current selection', async () => {
    const document = createMindMapDocument('Import doc')
    const nestedTopicId = document.topics[document.rootTopicId].childIds[0]
    useTextImportStore.getState().setAnchorMode('current_selection')

    vi.mocked(startTextImportJob).mockImplementation((_request, _onEvent) => ({
      jobId: 'job_current_selection',
      mode: 'codex_import',
      jobType: 'single',
      cancel: vi.fn(),
    }))

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: nestedTopicId,
        selectedTopicIds: [nestedTopicId],
      },
      {
        sourceName: 'launch_notes.md',
        sourceType: 'paste',
        rawText: '# Launch\n- Call the lighthouse customer',
      },
    )

    expect(startTextImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorTopicId: nestedTopicId,
      }),
      expect.any(Function),
    )
  })

  it('keeps manual overrides in reruns and request construction', async () => {
    const document = createMindMapDocument('Import doc')
    useTextImportStore.getState().setPresetOverride('action_first')
    useTextImportStore.getState().setArchetypeOverride('plan')

    vi.mocked(startTextImportJob).mockImplementation((_request, _onEvent) => ({
      jobId: 'job_manual',
      mode: 'codex_import',
      jobType: 'single',
      cancel: vi.fn(),
    }))

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'launch_notes.md',
        sourceType: 'paste',
        rawText: '- [ ] Assign owner\n- [ ] Publish timeline\nDecision: launch on Tuesday',
      },
    )

    expect(startTextImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'distill_structure',
        archetype: 'plan',
        archetypeMode: 'manual',
      }),
      expect.any(Function),
    )
    expect(useTextImportStore.getState().planningSummaries[0]).toMatchObject({
      resolvedPreset: 'action_first',
      resolvedArchetype: 'plan',
      isManual: true,
    })
  })

  it('tracks batch progress and preserves state when the dialog closes', async () => {
    const document = createMindMapDocument('Import doc')
    const nestedTopicId = document.topics[document.rootTopicId].childIds[0]
    const fileA = new File(['# Main'], 'GTM_main.md', { type: 'text/markdown' })
    const fileB = new File(['# Step 1'], 'GTM_step1.md', { type: 'text/markdown' })

    useTextImportStore.getState().setAnchorMode('current_selection')

    vi.mocked(startTextImportBatchJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'parsing_markdown',
        message: 'Parsing GTM_main.md...',
        progress: 24,
        mode: 'codex_import',
        jobType: 'batch',
        fileCount: 2,
        completedFileCount: 1,
        currentFileName: 'GTM_step1.md',
        semanticMergeStage: 'candidate_generation',
      })

      return {
        jobId: 'job_batch',
        mode: 'codex_import',
        jobType: 'batch',
        cancel: vi.fn(),
      }
    })

    await useTextImportStore.getState().previewFiles(
      document,
      {
        activeTopicId: nestedTopicId,
        selectedTopicIds: [nestedTopicId],
      },
      [fileA, fileB],
    )

    expect(startTextImportBatchJob).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorTopicId: nestedTopicId,
      }),
      expect.any(Function),
    )

    useTextImportStore.getState().close()

    expect(useTextImportStore.getState().isOpen).toBe(false)
    expect(useTextImportStore.getState().isPreviewing).toBe(true)
    expect(useTextImportStore.getState().activeJobId).toBe('job_batch')
    expect(useTextImportStore.getState().activeJobType).toBe('batch')
    expect(useTextImportStore.getState().sourceFiles).toEqual([
      expect.objectContaining({ sourceName: 'GTM_main.md' }),
      expect.objectContaining({ sourceName: 'GTM_step1.md' }),
    ])
    expect(useTextImportStore.getState().fileCount).toBe(2)
    expect(useTextImportStore.getState().completedFileCount).toBe(1)
    expect(useTextImportStore.getState().currentFileName).toBe('GTM_step1.md')
  })

  it('clears the import session after a successful import cycle reset', async () => {
    const document = createMindMapDocument('Import doc')
    const preview: TextImportResponse = {
      summary: 'Import preview ready',
      baseDocumentUpdatedAt: document.updatedAt,
      anchorTopicId: document.rootTopicId,
      classification: {
        archetype: 'plan',
        confidence: 0.91,
        rationale: 'Fixture classification.',
        secondaryArchetype: 'report',
      },
      templateSummary: {
        archetype: 'plan',
        visibleSlots: ['actions'],
        foldedSlots: ['risks'],
      },
      bundle: null,
      sources: [],
      semanticNodes: [],
      semanticEdges: [],
      views: [],
      viewProjections: {},
      defaultViewId: null,
      activeViewId: null,
      nodePlans: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Import: launch',
          note: null,
          semanticRole: 'section',
          confidence: 'high',
          sourceAnchors: [],
          groupKey: 'root',
          priority: 'primary',
          collapsedByDefault: false,
          templateSlot: null,
        },
      ],
      previewNodes: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Import: launch',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
      ],
      operations: [
        {
          id: 'import_root',
          type: 'create_child',
          parent: `topic:${document.rootTopicId}`,
          title: 'Import: launch',
          risk: 'low',
          resultRef: 'preview_root',
        },
      ],
      conflicts: [],
      mergeSuggestions: [],
      crossFileMergeSuggestions: [],
      warnings: [],
    }

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'result',
        data: preview,
        mode: 'codex_import',
        jobType: 'single',
      })

      return {
        jobId: 'job_reset',
        mode: 'codex_import',
        jobType: 'single',
        cancel: vi.fn(),
      }
    })

    useTextImportStore.getState().setPresetOverride('action_first')
    useTextImportStore.getState().setArchetypeOverride('plan')
    useTextImportStore.getState().setAnchorMode('current_selection')

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'launch.md',
        sourceType: 'file',
        rawText: '# Launch',
      },
    )

    useTextImportStore.getState().confirmDraft()
    useTextImportStore.getState().resetSession()

    expect(useTextImportStore.getState().isOpen).toBe(true)
    expect(useTextImportStore.getState().sourceName).toBeNull()
    expect(useTextImportStore.getState().sourceFiles).toEqual([])
    expect(useTextImportStore.getState().rawText).toBe('')
    expect(useTextImportStore.getState().draftSourceName).toBe('Pasted text')
    expect(useTextImportStore.getState().draftText).toBe('')
    expect(useTextImportStore.getState().preview).toBeNull()
    expect(useTextImportStore.getState().draftTree).toEqual([])
    expect(useTextImportStore.getState().previewTree).toEqual([])
    expect(useTextImportStore.getState().draftConfirmed).toBe(false)
    expect(useTextImportStore.getState().planningSummaries).toEqual([])
    expect(useTextImportStore.getState().approvedConflictIds).toEqual([])
    expect(useTextImportStore.getState().statusText).toBe('')
    expect(useTextImportStore.getState().modeHint).toBeNull()
    expect(useTextImportStore.getState().progress).toBe(0)
    expect(useTextImportStore.getState().isPreviewing).toBe(false)
    expect(useTextImportStore.getState().isApplying).toBe(false)
    expect(useTextImportStore.getState().presetOverride).toBeNull()
    expect(useTextImportStore.getState().archetypeOverride).toBeNull()
    expect(useTextImportStore.getState().anchorMode).toBe('document_root')
    expect(useTextImportStore.getState().fileCount).toBe(0)
    expect(useTextImportStore.getState().currentFileName).toBeNull()
  })

  it('resets the anchor mode back to the document root when the dialog closes and reopens', () => {
    useTextImportStore.getState().open()
    useTextImportStore.getState().setAnchorMode('current_selection')

    expect(useTextImportStore.getState().anchorMode).toBe('current_selection')

    useTextImportStore.getState().close()
    useTextImportStore.getState().open()

    expect(useTextImportStore.getState().isOpen).toBe(true)
    expect(useTextImportStore.getState().anchorMode).toBe('document_root')
  })

  it('stores per-file automatic planning summaries for batch imports', async () => {
    const document = createMindMapDocument('Import doc')
    const fileA = new File(['# Launch runbook\n1. Prep\n2. Ship'], 'launch_runbook.md', {
      type: 'text/markdown',
    })
    const fileB = new File(
      ['Agenda\n- [ ] Assign owner\n- [ ] Confirm blockers\nDecision: move the release'],
      'team_meeting.md',
      { type: 'text/markdown' },
    )

    vi.mocked(startTextImportBatchJob).mockImplementation((_request, _onEvent) => ({
      jobId: 'job_batch_summary',
      mode: 'codex_import',
      jobType: 'batch',
      cancel: vi.fn(),
    }))

    await useTextImportStore.getState().previewFiles(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      [fileA, fileB],
    )

    expect(useTextImportStore.getState().planningSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceName: 'launch_runbook.md',
          resolvedPreset: 'preserve',
        }),
        expect.objectContaining({
          sourceName: 'team_meeting.md',
          resolvedPreset: 'action_first',
        }),
      ]),
    )
  })

  it('requires draft confirmation after manual draft edits', async () => {
    const document = createMindMapDocument('Import doc')
    const preview: TextImportResponse = {
      summary: 'Import preview ready',
      baseDocumentUpdatedAt: document.updatedAt,
      anchorTopicId: document.rootTopicId,
      classification: {
        archetype: 'method',
        confidence: 0.84,
        rationale: 'Fixture classification.',
        secondaryArchetype: null,
      },
      templateSummary: {
        archetype: 'method',
        visibleSlots: ['steps'],
        foldedSlots: ['goal'],
      },
      bundle: null,
      sources: [],
      semanticNodes: [],
      semanticEdges: [],
      views: [],
      viewProjections: {},
      defaultViewId: null,
      activeViewId: null,
      nodePlans: [
        {
          id: 'preview_root',
          parentId: null,
          order: 0,
          title: 'Import: launch',
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
          id: 'preview_child',
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
          title: 'Import: launch',
          note: null,
          relation: 'new',
          matchedTopicId: null,
          reason: null,
        },
        {
          id: 'preview_child',
          parentId: 'preview_root',
          order: 0,
          title: 'Step 1',
          note: 'Launch the campaign',
          relation: 'new',
          matchedTopicId: null,
          reason: null,
          semanticRole: 'action',
          confidence: 'high',
          templateSlot: 'steps',
        },
      ],
      operations: [
        {
          id: 'import_root',
          type: 'create_child',
          parent: `topic:${document.rootTopicId}`,
          title: 'Import: launch',
          risk: 'low',
          resultRef: 'preview_root',
        },
      ],
      conflicts: [],
      mergeSuggestions: [],
      crossFileMergeSuggestions: [],
      warnings: [],
    }

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'result',
        data: preview,
        mode: 'codex_import',
        jobType: 'single',
      })

      return {
        jobId: 'job_confirm',
        mode: 'codex_import',
        jobType: 'single',
        cancel: vi.fn(),
      }
    })

    await useTextImportStore.getState().previewText(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      {
        sourceName: 'launch.md',
        sourceType: 'file',
        rawText: '# Launch',
      },
    )

    useTextImportStore.getState().confirmDraft()
    expect(useTextImportStore.getState().draftConfirmed).toBe(true)

    useTextImportStore.getState().renamePreviewNode('preview_child', 'Reframed step')
    expect(useTextImportStore.getState().draftConfirmed).toBe(false)
    expect(useTextImportStore.getState().preview?.nodePlans[1]?.title).toBe('Reframed step')
  })
})
