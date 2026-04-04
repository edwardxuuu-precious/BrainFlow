import { create } from 'zustand'
import type {
  AiRunStage,
  TextImportPreprocessHint,
  TextImportPreviewNode,
  TextImportResponse,
  TextImportSourceType,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import { buildAiContext } from '../ai/ai-context'
import { applyAiProposal } from '../ai/ai-proposal'
import {
  createProposalFromTextImportPreview,
  getInitialApprovedConflictIds,
} from './text-import-apply'
import { streamCodexTextImportPreview } from './text-import-client'
import { preprocessTextToImportHints } from './text-import-preprocess'
import { buildTextImportPreviewTree } from './text-import-preview-tree'

interface ImportSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

interface ApplyTextImportResult {
  document: MindMapDocument
  selectedTopicId: string | null
  summary: string
  warnings: string[]
}

interface TextImportState {
  isOpen: boolean
  sourceName: string | null
  sourceType: TextImportSourceType | null
  rawText: string
  draftSourceName: string
  draftText: string
  preprocessedHints: TextImportPreprocessHint[]
  preview: TextImportResponse | null
  previewTree: TextImportPreviewNode[]
  approvedConflictIds: string[]
  runStage: AiRunStage
  statusText: string
  error: string | null
  isPreviewing: boolean
  isApplying: boolean
  open: () => void
  close: () => void
  setDraftSourceName: (value: string) => void
  setDraftText: (value: string) => void
  previewFile: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    file: File,
  ) => Promise<void>
  previewText: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    options?: { sourceName?: string; sourceType?: TextImportSourceType; rawText?: string },
  ) => Promise<void>
  toggleConflictApproval: (conflictId: string) => void
  applyPreview: (document: MindMapDocument) => ApplyTextImportResult | null
}

const INITIAL_STATE = {
  isOpen: false,
  sourceName: null,
  sourceType: null as TextImportSourceType | null,
  rawText: '',
  draftSourceName: '粘贴文本',
  draftText: '',
  preprocessedHints: [] as TextImportPreprocessHint[],
  preview: null as TextImportResponse | null,
  previewTree: [] as TextImportPreviewNode[],
  approvedConflictIds: [] as string[],
  runStage: 'idle' as AiRunStage,
  statusText: '',
  error: null as string | null,
  isPreviewing: false,
  isApplying: false,
}

async function runPreview(
  set: (partial: Partial<TextImportState>) => void,
  document: MindMapDocument,
  selection: ImportSelectionSnapshot,
  sourceName: string,
  sourceType: TextImportSourceType,
  rawText: string,
): Promise<void> {
  const normalizedText = rawText.replace(/\r\n?/g, '\n').trim()
  if (!normalizedText) {
    set({
      error: '请先选择文本文件或粘贴需要整理的内容。',
      preview: null,
      previewTree: [],
      approvedConflictIds: [],
      runStage: 'error',
      statusText: '',
      isPreviewing: false,
    })
    return
  }

  const preprocessedHints = preprocessTextToImportHints(normalizedText)

  set({
    isOpen: true,
    sourceName,
    sourceType,
    rawText: normalizedText,
    draftSourceName: sourceName,
    draftText: normalizedText,
    preprocessedHints,
    preview: null,
    previewTree: [],
    approvedConflictIds: [],
    runStage: 'extracting_input',
    statusText: '正在提取文本线索并准备导入上下文…',
    error: null,
    isPreviewing: true,
    isApplying: false,
  })

  try {
    await streamCodexTextImportPreview(
      {
        documentId: document.id,
        documentTitle: document.title,
        baseDocumentUpdatedAt: document.updatedAt,
        context: buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId),
        anchorTopicId: selection.activeTopicId ?? document.rootTopicId,
        sourceName,
        sourceType,
        rawText: normalizedText,
        preprocessedHints,
      },
      (event) => {
        if (event.type === 'status') {
          set({
            runStage: event.stage,
            statusText: event.message,
          })
          return
        }

        if (event.type === 'error') {
          set({
            error: event.rawMessage ?? event.message,
            preview: null,
            previewTree: [],
            isPreviewing: false,
            runStage: 'error',
            statusText: '',
          })
          return
        }

        set({
          preview: event.data,
          previewTree: buildTextImportPreviewTree(event.data.previewNodes),
          approvedConflictIds: getInitialApprovedConflictIds(event.data),
          isPreviewing: false,
          runStage: 'completed',
          statusText: '',
          error: null,
        })
      },
    )
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : '智能导入预览失败。',
      preview: null,
      previewTree: [],
      isPreviewing: false,
      runStage: 'error',
      statusText: '',
    })
  }
}

export const useTextImportStore = create<TextImportState>((set, get) => ({
  ...INITIAL_STATE,

  open: () => set({ isOpen: true, error: null }),

  close: () => set({ ...INITIAL_STATE }),

  setDraftSourceName: (value) => set({ draftSourceName: value }),

  setDraftText: (value) => set({ draftText: value }),

  previewFile: async (document, selection, file) => {
    const rawText = await file.text()
    await runPreview(set, document, selection, file.name, 'file', rawText)
  },

  previewText: async (document, selection, options) => {
    const state = get()
    const sourceName = (options?.sourceName ?? state.draftSourceName.trim()) || '粘贴文本'
    const sourceType = options?.sourceType ?? state.sourceType ?? 'paste'
    const rawText = options?.rawText ?? state.draftText
    await runPreview(set, document, selection, sourceName, sourceType, rawText)
  },

  toggleConflictApproval: (conflictId) =>
    set((state) => ({
      approvedConflictIds: state.approvedConflictIds.includes(conflictId)
        ? state.approvedConflictIds.filter((item) => item !== conflictId)
        : [...state.approvedConflictIds, conflictId],
    })),

  applyPreview: (document) => {
    const state = get()
    if (!state.preview) {
      set({ error: '当前没有可应用的导入预览。' })
      return null
    }

    set({
      isApplying: true,
      runStage: 'applying_changes',
      statusText: '正在将导入结果应用到脑图…',
      error: null,
    })

    try {
      const proposal = createProposalFromTextImportPreview(
        state.preview,
        state.approvedConflictIds,
      )
      if (proposal.operations.length === 0) {
        throw new Error('当前没有选中的导入改动可应用。')
      }

      const result = applyAiProposal(document, proposal)
      set({
        isApplying: false,
        runStage: 'completed',
        statusText: result.appliedSummary,
        error: null,
      })
      return {
        document: result.document,
        selectedTopicId: result.selectedTopicId,
        summary: result.appliedSummary,
        warnings: result.warnings,
      }
    } catch (error) {
      set({
        isApplying: false,
        runStage: 'error',
        statusText: '',
        error: error instanceof Error ? error.message : '导入结果应用失败。',
      })
      return null
    }
  },
}))

export function resetTextImportStore(): void {
  useTextImportStore.setState(INITIAL_STATE)
}
