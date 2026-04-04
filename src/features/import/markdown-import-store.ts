import { create } from 'zustand'
import type {
  AiRunStage,
  MarkdownImportPreprocessedNode,
  MarkdownImportResponse,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import { buildAiContext } from '../ai/ai-context'
import { applyAiProposal } from '../ai/ai-proposal'
import { createProposalFromImportPreview } from './markdown-import-apply'
import { streamCodexMarkdownImportPreview } from './markdown-import-client'
import { preprocessMarkdownToImportTree } from './markdown-preprocess'

interface ImportSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

interface ApplyMarkdownImportResult {
  document: MindMapDocument
  selectedTopicId: string | null
  summary: string
  warnings: string[]
}

interface MarkdownImportState {
  isOpen: boolean
  sourceFileName: string | null
  sourceMarkdown: string
  preprocessedTree: MarkdownImportPreprocessedNode[]
  preview: MarkdownImportResponse | null
  approvedConflictIds: string[]
  runStage: AiRunStage
  statusText: string
  error: string | null
  isPreviewing: boolean
  isApplying: boolean
  open: () => void
  close: () => void
  previewFile: (
    document: MindMapDocument,
    selection: ImportSelectionSnapshot,
    file: File,
  ) => Promise<void>
  toggleConflictApproval: (conflictId: string) => void
  applyPreview: (document: MindMapDocument) => ApplyMarkdownImportResult | null
}

const INITIAL_STATE = {
  isOpen: false,
  sourceFileName: null,
  sourceMarkdown: '',
  preprocessedTree: [] as MarkdownImportPreprocessedNode[],
  preview: null as MarkdownImportResponse | null,
  approvedConflictIds: [] as string[],
  runStage: 'idle' as AiRunStage,
  statusText: '',
  error: null as string | null,
  isPreviewing: false,
  isApplying: false,
}

export const useMarkdownImportStore = create<MarkdownImportState>((set, get) => ({
  ...INITIAL_STATE,

  open: () => set({ isOpen: true }),

  close: () => set({ ...INITIAL_STATE }),

  previewFile: async (document, selection, file) => {
    const markdown = await file.text()
    const preprocessedTree = preprocessMarkdownToImportTree(markdown)

    set({
      isOpen: true,
      sourceFileName: file.name,
      sourceMarkdown: markdown,
      preprocessedTree,
      preview: null,
      approvedConflictIds: [],
      runStage: 'parsing_markdown',
      statusText: '正在检查 Markdown 结构…',
      error: null,
      isPreviewing: true,
      isApplying: false,
    })

    try {
      await streamCodexMarkdownImportPreview(
        {
          documentId: document.id,
          documentTitle: document.title,
          baseDocumentUpdatedAt: document.updatedAt,
          context: buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId),
          anchorTopicId: selection.activeTopicId ?? document.rootTopicId,
          fileName: file.name,
          markdown,
          preprocessedTree,
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
              error: event.message,
              isPreviewing: false,
              runStage: 'error',
              statusText: '',
            })
            return
          }

          set({
            preview: event.data,
            approvedConflictIds: [],
            isPreviewing: false,
            runStage: 'completed',
            statusText: '',
            error: null,
          })
        },
      )
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Markdown 导入预览失败。',
        isPreviewing: false,
        runStage: 'error',
        statusText: '',
      })
    }
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
      const proposal = createProposalFromImportPreview(
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

export function resetMarkdownImportStore(): void {
  useMarkdownImportStore.setState(INITIAL_STATE)
}
