import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TextImportBatchFileSummary,
  TextImportRequest,
  TextImportResponse,
} from '../../../shared/ai-contract'
import { buildAiContext } from '../ai/ai-context'
import { createMindMapDocument } from '../documents/document-factory'

vi.mock('./text-import-client', () => ({
  streamCodexTextImportPreview: vi.fn(),
  adjudicateTextImportCandidates: vi.fn(),
}))

import { adjudicateTextImportCandidates, streamCodexTextImportPreview } from './text-import-client'
import { startTextImportBatchJob, startTextImportJob, type TextImportJobEvent } from './text-import-job'

class WorkerStub {
  static instances: WorkerStub[] = []
  readonly scriptUrl: URL
  readonly options?: WorkerOptions

  constructor(scriptUrl: URL, options?: WorkerOptions) {
    this.scriptUrl = scriptUrl
    this.options = options
    WorkerStub.instances.push(this)
  }

  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  postMessage = vi.fn()
  terminate = vi.fn()
}

function createRequest(
  overrides: Partial<TextImportRequest> = {},
): TextImportRequest {
  const document = createMindMapDocument('Import doc')
  return {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
    anchorTopicId: document.rootTopicId,
    sourceName: 'notes.txt',
    sourceType: 'file',
    intent: 'distill_structure',
    rawText: '# Notes',
    preprocessedHints: [
      {
        id: 'hint_1',
        kind: 'heading',
        text: 'Notes',
        raw: '# Notes',
        level: 1,
        lineStart: 1,
        lineEnd: 1,
        sourcePath: ['Notes'],
      },
    ],
    semanticHints: [],
    ...overrides,
  }
}

function createBatchFile(overrides: Partial<TextImportRequest> & {
  sourceName: string
  rawText: string
}): {
  sourceName: string
  sourceType: 'file'
  rawText: string
  preprocessedHints: TextImportRequest['preprocessedHints']
  semanticHints: TextImportRequest['semanticHints']
  intent: TextImportRequest['intent']
  contentProfile?: TextImportRequest['contentProfile']
  nodeBudget?: TextImportRequest['nodeBudget']
} {
  return {
    sourceName: overrides.sourceName,
    sourceType: 'file',
    rawText: overrides.rawText,
    preprocessedHints: overrides.preprocessedHints ?? [],
    semanticHints: overrides.semanticHints ?? [],
    intent: overrides.intent ?? 'distill_structure',
    contentProfile: overrides.contentProfile,
    nodeBudget: overrides.nodeBudget,
  }
}

function createPreviewResponse(rootTitle: string, childTitle: string): TextImportResponse {
  return {
    summary: `Preview for ${rootTitle}`,
    baseDocumentUpdatedAt: 1,
    anchorTopicId: 'root',
    classification: {
      archetype: 'mixed',
      confidence: 0.6,
      rationale: 'Fixture response.',
      secondaryArchetype: null,
    },
    templateSummary: {
      archetype: 'mixed',
      visibleSlots: ['themes'],
      foldedSlots: ['summary'],
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
        title: rootTitle,
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
        title: childTitle,
        note: 'Shared note',
        semanticRole: 'summary',
        confidence: 'medium',
        sourceAnchors: [],
        groupKey: 'items',
        priority: 'secondary',
        collapsedByDefault: false,
        templateSlot: null,
      },
    ],
    previewNodes: [
      {
        id: 'preview_root',
        parentId: null,
        order: 0,
        title: rootTitle,
        note: null,
        relation: 'new',
        matchedTopicId: null,
        reason: null,
      },
      {
        id: 'preview_child',
        parentId: 'preview_root',
        order: 0,
        title: childTitle,
        note: 'Shared note',
        relation: 'new',
        matchedTopicId: null,
        reason: null,
      },
    ],
    operations: [
      {
        id: 'import_root',
        type: 'create_child',
        parent: 'topic:root',
        title: rootTitle,
        risk: 'low',
        resultRef: 'preview_root',
      },
      {
        id: 'import_child',
        type: 'create_child',
        parent: 'ref:preview_root',
        title: childTitle,
        note: 'Shared note',
        risk: 'low',
        resultRef: 'preview_child',
      },
    ],
    conflicts: [],
    warnings: [],
  }
}

describe('text-import-job', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    WorkerStub.instances = []
    vi.stubGlobal('Worker', WorkerStub as unknown as typeof Worker)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('routes structured markdown files through the skill-backed Codex pipeline', () => {
    const request = createRequest({
      sourceName: 'structured.md',
      rawText: '# Goals\n\n## Next\n\n- Launch',
      preprocessedHints: [],
    })
    vi.mocked(streamCodexTextImportPreview).mockResolvedValue(undefined)

    const handle = startTextImportJob(request, () => {})

    expect(handle.mode).toBe('codex_import')
    expect(WorkerStub.instances).toHaveLength(0)
    expect(vi.mocked(streamCodexTextImportPreview)).toHaveBeenCalledWith(
      request,
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )

    handle.cancel()
  })

  it('keeps prose-heavy markdown files on the Codex import pipeline', async () => {
    const request = createRequest({
      sourceName: 'conversation.md',
      rawText: 'Plain prose without headings',
      preprocessedHints: [],
    })
    const response = createPreviewResponse('Import: conversation', 'Action items')

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({ type: 'result', data: response })
    })

    const events: string[] = []
    const handle = startTextImportJob(request, (event) => {
      events.push(event.type)
    })

    await vi.waitFor(() => {
      expect(events).toContain('result')
    })

    expect(handle.mode).toBe('codex_import')
    expect(vi.mocked(streamCodexTextImportPreview)).toHaveBeenCalledWith(
      request,
      expect.any(Function),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(WorkerStub.instances).toHaveLength(0)
  })

  it('threads request ids and structured transport errors through Codex import jobs', async () => {
    const request = createRequest({
      sourceName: 'conversation.md',
      rawText: 'Plain prose without headings',
      preprocessedHints: [],
    })

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'progress',
        entry: {
          id: 'progress_1',
          timestampMs: 100,
          stage: 'waiting_codex_primary',
          message: '我正在等待 Codex 返回主导入结果。已等待 12s，仍在运行。',
          tone: 'waiting',
          source: 'observation',
          attempt: 'primary',
          replaceKey: 'progress:waiting_codex_primary',
          currentFileName: 'conversation.md',
          requestId: 'import_123',
        },
        requestId: 'import_123',
      })
      onEvent({
        type: 'status',
        stage: 'waiting_codex_primary',
        message: 'Waiting for Codex',
        requestId: 'import_123',
      })
      onEvent({
        type: 'error',
        stage: 'waiting_codex_primary',
        code: 'request_failed',
        message: 'The import preview failed inside the local Codex bridge. Review the bridge logs and retry.',
        rawMessage: 'stderr: model output was truncated',
        requestId: 'import_123',
      })
    })

    const events: TextImportJobEvent[] = []
    startTextImportJob(request, (event) => {
      events.push(event)
    })

    await vi.waitFor(() => {
      expect(events.some((event) => event.type === 'error')).toBe(true)
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'progress',
        entry: expect.objectContaining({
          id: 'progress_1',
          requestId: 'import_123',
          currentFileName: 'conversation.md',
        }),
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'status',
        requestId: 'import_123',
      }),
    )
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        requestId: 'import_123',
        currentFileName: 'conversation.md',
      }),
    )
  })

  it('keeps pasted text on the skill-backed Codex pipeline', () => {
    const request = createRequest({
      sourceName: 'Pasted text',
      sourceType: 'paste',
      rawText: '# Goals\n\n- Launch\n- Align',
      preprocessedHints: [
        {
          id: 'hint_1',
          kind: 'heading',
          text: 'Goals',
          raw: '# Goals',
          level: 1,
          lineStart: 1,
          lineEnd: 1,
          sourcePath: ['Goals'],
        },
        {
          id: 'hint_2',
          kind: 'bullet_list',
          text: 'Launch\nAlign',
          raw: '- Launch\n- Align',
          level: 0,
          lineStart: 3,
          lineEnd: 4,
          sourcePath: ['Goals'],
          items: ['Launch', 'Align'],
        },
        {
          id: 'hint_3',
          kind: 'ordered_list',
          text: 'Review',
          raw: '1. Review',
          level: 0,
          lineStart: 5,
          lineEnd: 5,
          sourcePath: ['Goals'],
          items: ['Review'],
        },
      ],
    })
    vi.mocked(streamCodexTextImportPreview).mockResolvedValue(undefined)

    const handle = startTextImportJob(request, () => {})

    expect(handle.mode).toBe('codex_import')
    expect(WorkerStub.instances).toHaveLength(0)
    expect(vi.mocked(streamCodexTextImportPreview)).toHaveBeenCalledWith(
      request,
      expect.any(Function),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )

    handle.cancel()
  })

  it('routes structured markdown-only batches through the skill-backed Codex pipeline', async () => {
    const baseRequest = createRequest()
    const request = {
      documentId: baseRequest.documentId,
      documentTitle: baseRequest.documentTitle,
      baseDocumentUpdatedAt: baseRequest.baseDocumentUpdatedAt,
      context: baseRequest.context,
      anchorTopicId: baseRequest.anchorTopicId,
      files: [
        createBatchFile({ sourceName: 'GTM_main.md', rawText: '# Main\n\n- Launch' }),
        createBatchFile({ sourceName: 'GTM_step1.md', rawText: '# Step 1\n\n- Align' }),
      ],
    }
    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'result',
        data: createPreviewResponse('Import: file', 'Structured branch'),
      })
    })

    const resultEvent = await new Promise<TextImportJobEvent>((resolve, reject) => {
      const handle = startTextImportBatchJob(request, (event) => {
        if (event.type === 'result') {
          resolve(event)
        }
        if (event.type === 'error') {
          reject(new Error(event.message))
        }
      })

      expect(handle.mode).toBe('codex_import')
    })

    expect(WorkerStub.instances).toHaveLength(0)
    expect(
      vi.mocked(streamCodexTextImportPreview).mock.calls.map(([singleRequest]) => singleRequest.sourceName),
    ).toEqual(['GTM_main.md', 'GTM_step1.md'])
    expect(resultEvent.mode).toBe('codex_import')
  })

  it('builds mixed batch previews by streaming every file through the shared Codex import path', async () => {
    const baseRequest = createRequest()
    const request = {
      documentId: baseRequest.documentId,
      documentTitle: baseRequest.documentTitle,
      baseDocumentUpdatedAt: baseRequest.baseDocumentUpdatedAt,
      context: baseRequest.context,
      anchorTopicId: baseRequest.anchorTopicId,
      batchTitle: 'Import batch: Launch',
      files: [
        createBatchFile({ sourceName: 'GTM_main.md', rawText: '# Main\n\n- Launch plan' }),
        createBatchFile({ sourceName: 'GTM_step1.md', rawText: 'Conversation export B' }),
      ],
    }

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (singleRequest, onEvent) => {
      onEvent({
        type: 'status',
        stage: 'waiting_codex_primary',
        message: `Analyzing ${singleRequest.sourceName}`,
      })
      onEvent({
        type: 'result',
        data: createPreviewResponse('Import: beta', 'Launch plan'),
      })
    })

    vi.mocked(adjudicateTextImportCandidates).mockImplementation(async (semanticRequest) => ({
      decisions: semanticRequest.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        kind: 'partial_overlap',
        confidence: 'medium',
        mergedTitle: null,
        mergedSummary: 'Shared launch notes',
        evidence: 'Shared launch theme.',
      })),
      warnings: [],
    }))

    const resultEvent = await new Promise<any>((resolve, reject) => {
      startTextImportBatchJob(request, (event) => {
        if (event.type === 'result') {
          resolve(event)
        }
        if (event.type === 'error') {
          reject(new Error(event.message))
        }
      })
    })

    expect(
      vi.mocked(streamCodexTextImportPreview).mock.calls.map(([singleRequest]) => singleRequest.sourceName),
    ).toEqual(['GTM_main.md', 'GTM_step1.md'])
    expect(resultEvent.mode).toBe('codex_import')
    expect(resultEvent.data.batch).toEqual(
      expect.objectContaining({
        jobType: 'batch',
        fileCount: 2,
        batchContainerTitle: 'Import batch: Launch',
        files: [
          expect.objectContaining({ sourceName: 'GTM_main.md' }),
          expect.objectContaining({ sourceName: 'GTM_step1.md' }),
        ],
      }),
    )
    const batchFiles: TextImportBatchFileSummary[] = resultEvent.data.batch?.files ?? []
    const mainFile = batchFiles.find((file: TextImportBatchFileSummary) => file.sourceName === 'GTM_main.md')
    const stepFile = batchFiles.find((file: TextImportBatchFileSummary) => file.sourceName === 'GTM_step1.md')
    expect(mainFile).toMatchObject({
      sourceRole: 'canonical_knowledge',
      mergeMode: 'create_new',
    })
    expect(stepFile).toMatchObject({
      sourceRole: 'context_record',
      mergeMode: 'merge_into_existing',
    })
    expect(stepFile?.canonicalTopicId).toBe(mainFile?.canonicalTopicId)
    expect(stepFile?.sameAsTopicId).toBe(mainFile?.canonicalTopicId)

    const thinkingRoots = resultEvent.data.previewNodes.filter((node: TextImportResponse['previewNodes'][number]) => node.parentId === null)
    expect(thinkingRoots).toHaveLength(1)
    expect(thinkingRoots[0]?.title).toBe('GTM_main')
    const emptyJudgmentGroups = resultEvent.data.previewNodes.filter((node: TextImportResponse['previewNodes'][number]) => {
      if (
        node.structureRole !== 'core_judgment_group' &&
        node.structureRole !== 'judgment_basis_group' &&
        node.structureRole !== 'potential_action_group'
      ) {
        return false
      }
      const hasChildren = resultEvent.data.previewNodes.some((child: TextImportResponse['previewNodes'][number]) => child.parentId === node.id)
      return !hasChildren
    })
    expect(emptyJudgmentGroups).toHaveLength(0)
  })

  it('fails fast on batch markdown errors and includes the failing file name', async () => {
    const baseRequest = createRequest()
    const request = {
      documentId: baseRequest.documentId,
      documentTitle: baseRequest.documentTitle,
      baseDocumentUpdatedAt: baseRequest.baseDocumentUpdatedAt,
      context: baseRequest.context,
      anchorTopicId: baseRequest.anchorTopicId,
      files: [
        createBatchFile({ sourceName: 'GTM_main.md', rawText: 'Conversation export A' }),
        createBatchFile({ sourceName: 'GTM_step1.md', rawText: 'Conversation export B' }),
      ],
    }

    vi.mocked(streamCodexTextImportPreview).mockImplementation(async (singleRequest, onEvent) => {
      if (singleRequest.sourceName === 'GTM_step1.md') {
        throw new Error('model timeout')
      }

      onEvent({
        type: 'result',
        data: createPreviewResponse('Import: alpha', 'Launch plan'),
      })
    })

    const errorEvent = await new Promise<any>((resolve) => {
      startTextImportBatchJob(request, (event) => {
        if (event.type === 'error') {
          resolve(event)
        }
      })
    })

    expect(errorEvent.mode).toBe('codex_import')
    expect(errorEvent.currentFileName).toBe('GTM_step1.md')
    expect(errorEvent.message).toContain('model timeout')
    expect(vi.mocked(streamCodexTextImportPreview)).toHaveBeenCalledTimes(2)
  })
})
