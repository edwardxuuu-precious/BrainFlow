import { create } from 'zustand'
import type {
  AiCanvasProposal,
  AiConversation,
  AiMessage,
  CodexStatus,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import { buildAiContext } from './ai-context'
import {
  fetchCodexStatus,
  revalidateCodexStatus,
  streamCodexChat,
} from './ai-client'
import {
  createEmptyConversation,
  getAiConversation,
  saveAiConversation,
} from './ai-storage'

const DEFAULT_CONVERSATION_ID = 'default'

interface AiSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

interface AiState {
  documentId: string | null
  conversationId: string
  messages: AiMessage[]
  pendingProposal: AiCanvasProposal | null
  status: CodexStatus | null
  statusError: string | null
  isHydrating: boolean
  isCheckingStatus: boolean
  isSending: boolean
  streamingText: string
  error: string | null
  setError: (message: string | null) => void
  hydrate: (documentId: string, conversationId?: string) => Promise<void>
  refreshStatus: () => Promise<void>
  revalidateStatus: () => Promise<void>
  clearPendingProposal: () => void
  sendMessage: (
    document: MindMapDocument,
    selection: AiSelectionSnapshot,
    content: string,
  ) => Promise<void>
}

type AiSetState = (partial: Partial<AiState>) => void

function createMessage(role: AiMessage['role'], content: string): AiMessage {
  return {
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  }
}

function toConversation(state: AiState): AiConversation | null {
  if (!state.documentId) {
    return null
  }

  return {
    documentId: state.documentId,
    conversationId: state.conversationId,
    messages: state.messages,
    pendingProposal: state.pendingProposal,
    updatedAt: Date.now(),
  }
}

function persistState(state: AiState): void {
  const conversation = toConversation(state)
  if (!conversation) {
    return
  }

  void saveAiConversation(conversation)
}

async function applyStatusRequest(
  action: () => Promise<CodexStatus>,
  set: AiSetState,
): Promise<void> {
  set({ isCheckingStatus: true, statusError: null })

  try {
    const status = await action()
    set({
      status,
      statusError: null,
      isCheckingStatus: false,
    })
  } catch (error) {
    set({
      status: null,
      statusError: error instanceof Error ? error.message : 'Codex 状态检测失败',
      isCheckingStatus: false,
    })
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  documentId: null,
  conversationId: DEFAULT_CONVERSATION_ID,
  messages: [],
  pendingProposal: null,
  status: null,
  statusError: null,
  isHydrating: false,
  isCheckingStatus: false,
  isSending: false,
  streamingText: '',
  error: null,

  setError: (message) => set({ error: message }),

  hydrate: async (documentId, conversationId = DEFAULT_CONVERSATION_ID) => {
    set({ isHydrating: true, error: null })
    const conversation = await getAiConversation(documentId, conversationId)

    set({
      documentId,
      conversationId,
      messages: conversation.messages,
      pendingProposal: conversation.pendingProposal,
      isHydrating: false,
      isSending: false,
      streamingText: '',
      error: null,
    })

    await applyStatusRequest(fetchCodexStatus, set)
  },

  refreshStatus: async () => {
    await applyStatusRequest(fetchCodexStatus, set)
  },

  revalidateStatus: async () => {
    await applyStatusRequest(revalidateCodexStatus, set)
  },

  clearPendingProposal: () =>
    set((state) => {
      if (!state.documentId) {
        return {}
      }

      const nextState = { pendingProposal: null }
      persistState({ ...state, ...nextState })
      return nextState
    }),

  sendMessage: async (document, selection, content) => {
    const question = content.trim()
    if (!question) {
      return
    }

    if (selection.selectedTopicIds.length === 0) {
      set({ error: '先框选或多选节点后再提问。' })
      return
    }

    const currentState = get()
    if (!currentState.status?.ready) {
      set({
        error: '当前 Codex 验证信息不可用，请尽快重新验证。',
      })
      return
    }

    const documentId = currentState.documentId ?? document.id
    const conversationId = currentState.conversationId || DEFAULT_CONVERSATION_ID
    const userMessage = createMessage('user', question)
    const nextMessages = [...currentState.messages, userMessage]

    set({
      documentId,
      conversationId,
      messages: nextMessages,
      isSending: true,
      streamingText: '',
      error: null,
    })

    persistState({
      ...currentState,
      documentId,
      conversationId,
      messages: nextMessages,
    })

    try {
      await streamCodexChat(
        {
          documentId,
          conversationId,
          messages: nextMessages,
          context: buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId),
          baseDocumentUpdatedAt: document.updatedAt,
        },
        (event) => {
          if (event.type === 'assistant_delta') {
            set((state) => ({
              streamingText: state.streamingText + event.delta,
            }))
            return
          }

          if (event.type === 'error') {
            set({
              isSending: false,
              streamingText: '',
              error: event.message,
            })

            if (event.code === 'verification_required' || event.code === 'subscription_required') {
              void get().revalidateStatus()
            }
            return
          }

          const assistantMessage = createMessage('assistant', event.data.assistantMessage)
          set((state) => {
            const nextState = {
              messages: [...state.messages, assistantMessage],
              pendingProposal: event.data.proposal ?? null,
              isSending: false,
              streamingText: '',
              error: null,
            }

            persistState({ ...state, ...nextState })
            return nextState
          })
        },
      )
    } catch (error) {
      set({
        isSending: false,
        streamingText: '',
        error: error instanceof Error ? error.message : 'Codex 对话请求失败',
      })
    }
  },
}))

export function resetAiStore(): void {
  useAiStore.setState({
    documentId: null,
    conversationId: DEFAULT_CONVERSATION_ID,
    messages: [],
    pendingProposal: null,
    status: null,
    statusError: null,
    isHydrating: false,
    isCheckingStatus: false,
    isSending: false,
    streamingText: '',
    error: null,
  })
}

export async function seedAiConversation(conversation: AiConversation): Promise<void> {
  await saveAiConversation(conversation)
  useAiStore.setState({
    documentId: conversation.documentId,
    conversationId: conversation.conversationId,
    messages: conversation.messages,
    pendingProposal: conversation.pendingProposal,
    isHydrating: false,
    isSending: false,
    streamingText: '',
    error: null,
  })
}

export async function clearAiConversation(documentId: string): Promise<void> {
  const empty = createEmptyConversation(documentId, DEFAULT_CONVERSATION_ID)
  await saveAiConversation(empty)
}
