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

    expect(useTextImportStore.getState().preview).toEqual(preview)
    expect(useTextImportStore.getState().previewTree).toEqual([
      expect.objectContaining({
        id: 'preview_root',
        children: [expect.objectContaining({ id: 'preview_child', title: 'Launch' })],
      }),
    ])
    expect(useTextImportStore.getState().progress).toBe(100)
    expect(useTextImportStore.getState().progressIndeterminate).toBe(false)
    expect(useTextImportStore.getState().modeHint).toContain('Codex import pipeline')
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

  it('captures runner observations in the status timeline for Codex imports', async () => {
    const document = createMindMapDocument('Import doc')

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'waiting_codex_primary',
        message: 'Waiting for Codex',
        progress: 56,
        mode: 'codex_import',
        jobType: 'single',
      })
      onEvent({
        type: 'runner_observation',
        attempt: 'primary',
        phase: 'first_json_event',
        kind: 'structured',
        promptLength: 12_000,
        elapsedSinceSpawnMs: 2_450,
        mode: 'codex_import',
        jobType: 'single',
        requestId: 'import_456',
      })

      return {
        jobId: 'job_runner',
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

    const state = useTextImportStore.getState()
    expect(state.progressIndeterminate).toBe(true)
    expect(state.currentStatus).toEqual(
      expect.objectContaining({
        kind: 'runner_observation',
        phase: 'first_json_event',
        promptLength: 12_000,
      }),
    )
    expect(state.statusTimeline.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'waiting_codex_primary',
        runnerObservations: [
          expect.objectContaining({
            phase: 'first_json_event',
            promptLength: 12_000,
            requestId: 'import_456',
          }),
        ],
      }),
    )
  })

  it('captures heartbeat diagnostics in the status timeline for Codex imports', async () => {
    const document = createMindMapDocument('Import doc')

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'waiting_codex_primary',
        message: 'Waiting for Codex',
        progress: 56,
        mode: 'codex_import',
        jobType: 'single',
      })
      onEvent({
        type: 'runner_observation',
        attempt: 'primary',
        phase: 'heartbeat',
        kind: 'structured',
        promptLength: 49_301,
        elapsedSinceSpawnMs: 8_000,
        elapsedSinceLastEventMs: 8_000,
        hadJsonEvent: false,
        mode: 'codex_import',
        jobType: 'single',
        requestId: 'import_heartbeat',
      })

      return {
        jobId: 'job_heartbeat',
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

    const state = useTextImportStore.getState()
    expect(state.currentStatus).toEqual(
      expect.objectContaining({
        kind: 'runner_observation',
        phase: 'heartbeat',
        elapsedSinceLastEventMs: 8_000,
        requestId: 'import_heartbeat',
      }),
    )
    expect(state.statusTimeline.at(-1)).toEqual(
      expect.objectContaining({
        stage: 'waiting_codex_primary',
        runnerObservations: [
          expect.objectContaining({
            phase: 'heartbeat',
            elapsedSinceLastEventMs: 8_000,
            requestId: 'import_heartbeat',
          }),
        ],
      }),
    )
  })

  it('stores Codex live events separately from runner heartbeat diagnostics', async () => {
    const document = createMindMapDocument('Import doc')

    vi.mocked(startTextImportJob).mockImplementation((_request, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'waiting_codex_primary',
        message: 'Waiting for Codex',
        progress: 56,
        mode: 'codex_import',
        jobType: 'single',
      })
      onEvent({
        type: 'runner_observation',
        attempt: 'primary',
        phase: 'heartbeat',
        kind: 'structured',
        promptLength: 49_301,
        elapsedSinceSpawnMs: 8_000,
        elapsedSinceLastEventMs: 8_000,
        hadJsonEvent: false,
        mode: 'codex_import',
        jobType: 'single',
        requestId: 'import_live',
      })
      onEvent({
        type: 'codex_event',
        attempt: 'primary',
        eventType: 'turn.started',
        at: 1_000,
        summary: 'Codex 已开始分析导入内容',
        rawJson: '{"type":"turn.started"}',
        mode: 'codex_import',
        jobType: 'single',
        requestId: 'import_live',
      })

      return {
        jobId: 'job_live',
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

    const state = useTextImportStore.getState()
    expect(state.latestCodexEvent).toEqual({
      attempt: 'primary',
      eventType: 'turn.started',
      at: 1_000,
      summary: 'Codex 已开始分析导入内容',
      rawJson: '{"type":"turn.started"}',
      requestId: 'import_live',
    })
    expect(state.codexEventFeed).toEqual([
      {
        attempt: 'primary',
        eventType: 'turn.started',
        at: 1_000,
        summary: 'Codex 已开始分析导入内容',
        rawJson: '{"type":"turn.started"}',
        requestId: 'import_live',
      },
    ])
    expect(state.statusTimeline.at(-1)?.runnerObservations).toHaveLength(1)
  })

  it('tracks batch progress and preserves state when the dialog closes', async () => {
    const document = createMindMapDocument('Import doc')
    const fileA = new File(['# Main'], 'GTM_main.md', { type: 'text/markdown' })
    const fileB = new File(['# Step 1'], 'GTM_step1.md', { type: 'text/markdown' })

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
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      [fileA, fileB],
    )

    useTextImportStore.getState().close()

    expect(useTextImportStore.getState().isOpen).toBe(false)
    expect(useTextImportStore.getState().isPreviewing).toBe(true)
    expect(useTextImportStore.getState().activeJobId).toBe('job_batch')
    expect(useTextImportStore.getState().activeJobType).toBe('batch')
    expect(useTextImportStore.getState().fileCount).toBe(2)
    expect(useTextImportStore.getState().completedFileCount).toBe(1)
    expect(useTextImportStore.getState().currentFileName).toBe('GTM_step1.md')
  })
})
