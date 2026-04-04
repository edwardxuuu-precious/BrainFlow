import { create } from 'zustand'
import type {
  AiApplySummary,
  AiConversation,
  AiExecutionError,
  AiMessage,
  AiRunStage,
  AiSessionSummary,
  AiStatusFeedback,
  CodexSettings,
  CodexStatus,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'
import { getEditorSnapshot, useEditorStore } from '../editor/editor-store'
import { applyAiProposal } from './ai-proposal'
import { buildAiContext } from './ai-context'
import {
  type CodexRequestFailureKind,
  fetchCodexSettings,
  fetchCodexStatus,
  revalidateCodexStatus,
  resetCodexSettings,
  saveCodexSettings,
  streamCodexChat,
} from './ai-client'
import {
  archiveAiConversation,
  createEmptyConversation,
  deleteAiConversation,
  getAiConversation,
  listAiSessions,
  listArchivedAiSessions,
  restoreAiConversation,
  saveAiConversation,
} from './ai-storage'

interface AiSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
}

interface LastAppliedAiChange {
  proposalId: string
  summary: string
  historyLength: number
  documentUpdatedAt: number
}

interface StatusRequestOptions {
  successFeedback?: (status: CodexStatus) => AiStatusFeedback
}

interface AiState {
  documentId: string | null
  documentTitle: string
  activeSessionId: string | null
  activeSessionTitle: string
  sessionList: AiSessionSummary[]
  archivedSessions: AiSessionSummary[]
  messages: AiMessage[]
  status: CodexStatus | null
  statusError: string | null
  statusFailureKind: CodexRequestFailureKind | null
  statusFeedback: AiStatusFeedback | null
  hasCheckedStatus: boolean
  settings: CodexSettings | null
  settingsError: string | null
  isHydrating: boolean
  isCheckingStatus: boolean
  isLoadingSettings: boolean
  isSavingSettings: boolean
  isLoadingArchivedSessions: boolean
  isSending: boolean
  runStage: AiRunStage
  streamingStatusText: string
  streamingText: string
  error: string | null
  lastExecutionError: AiExecutionError | null
  lastAppliedChange: LastAppliedAiChange | null
  setError: (message: string | null) => void
  hydrate: (documentId: string, documentTitle: string, sessionId?: string) => Promise<void>
  createSession: () => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  archiveSession: (sessionId?: string) => Promise<void>
  deleteSession: (sessionId?: string) => Promise<void>
  loadArchivedSessions: () => Promise<void>
  restoreArchivedSession: (documentId: string, sessionId: string) => Promise<void>
  deleteArchivedSession: (documentId: string, sessionId: string) => Promise<void>
  refreshStatus: () => Promise<void>
  revalidateStatus: () => Promise<void>
  loadSettings: () => Promise<void>
  saveSettings: (businessPrompt: string) => Promise<void>
  resetSettings: () => Promise<void>
  clearLastAppliedChange: () => void
  undoLastAppliedChange: () => void
  sendMessage: (
    document: MindMapDocument,
    selection: AiSelectionSnapshot,
    content: string,
  ) => Promise<void>
}

type AiSetState = (partial: Partial<AiState>) => void

const DEFAULT_SESSION_TITLE = '新对话'

function deriveStatusFailureKind(error: unknown): CodexRequestFailureKind | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    (error as { kind?: CodexRequestFailureKind }).kind
  ) {
    return (error as { kind?: CodexRequestFailureKind }).kind ?? null
  }

  return null
}

function createMessage(role: AiMessage['role'], content: string): AiMessage {
  return {
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  }
}

function deriveSessionTitle(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) {
    return DEFAULT_SESSION_TITLE
  }

  return trimmed.length > 16 ? `${trimmed.slice(0, 16).trimEnd()}…` : trimmed
}

function replaceSessionSummary(
  sessions: AiSessionSummary[],
  conversation: AiConversation,
): AiSessionSummary[] {
  const summary: AiSessionSummary = {
    documentId: conversation.documentId,
    documentTitle: conversation.documentTitle,
    sessionId: conversation.sessionId,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    archivedAt: conversation.archivedAt,
  }

  return [...sessions.filter((item) => item.sessionId !== summary.sessionId), summary].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )
}

async function ensureSession(
  documentId: string,
  documentTitle: string,
  preferredSessionId?: string,
): Promise<{
  conversation: AiConversation
  sessionList: AiSessionSummary[]
}> {
  let sessionList = await listAiSessions(documentId)
  const preferred = preferredSessionId
    ? sessionList.find((session) => session.sessionId === preferredSessionId)
    : undefined
  const activeSummary = preferred ?? sessionList[0]

  if (!activeSummary) {
    const conversation = createEmptyConversation(documentId, documentTitle)
    await saveAiConversation(conversation)
    sessionList = await listAiSessions(documentId)
    return {
      conversation,
      sessionList,
    }
  }

  const conversation =
    (await getAiConversation(documentId, activeSummary.sessionId)) ??
    createEmptyConversation(documentId, documentTitle, activeSummary.sessionId)

  if (conversation.documentTitle !== documentTitle) {
    const nextConversation = {
      ...conversation,
      documentTitle,
    }
    await saveAiConversation(nextConversation)
    sessionList = replaceSessionSummary(sessionList, nextConversation)
    return {
      conversation: nextConversation,
      sessionList,
    }
  }

  return {
    conversation,
    sessionList,
  }
}

async function applyStatusRequest(
  action: () => Promise<CodexStatus>,
  set: AiSetState,
  options?: StatusRequestOptions,
): Promise<void> {
  set({
    isCheckingStatus: true,
    statusError: null,
    statusFailureKind: null,
    statusFeedback: null,
  })

  try {
    const status = await action()
    set({
      status,
      statusError: null,
      statusFailureKind: null,
      statusFeedback: options?.successFeedback?.(status) ?? null,
      hasCheckedStatus: true,
      isCheckingStatus: false,
    })
  } catch (error) {
    set({
      status: null,
      statusError: error instanceof Error ? error.message : 'Codex 状态检查失败。',
      statusFailureKind: deriveStatusFailureKind(error),
      statusFeedback: null,
      hasCheckedStatus: true,
      isCheckingStatus: false,
    })
  }
}

async function applySettingsRequest(
  action: () => Promise<CodexSettings>,
  set: AiSetState,
  options?: { saving?: boolean },
): Promise<void> {
  set({
    isLoadingSettings: !options?.saving,
    isSavingSettings: !!options?.saving,
    settingsError: null,
  })

  try {
    const settings = await action()
    set({
      settings,
      settingsError: null,
      isLoadingSettings: false,
      isSavingSettings: false,
    })
  } catch (error) {
    set({
      settingsError: error instanceof Error ? error.message : 'AI 设置加载失败。',
      isLoadingSettings: false,
      isSavingSettings: false,
    })
  }
}

function canUndoAppliedChange(change: LastAppliedAiChange | null): boolean {
  if (!change) {
    return false
  }

  const snapshot = getEditorSnapshot()
  return (
    snapshot.history.length === change.historyLength &&
    snapshot.document?.updatedAt === change.documentUpdatedAt
  )
}

function createExecutionError(
  code: AiExecutionError['code'],
  message: string,
  stage?: AiRunStage,
): AiExecutionError {
  return {
    code,
    message,
    stage,
  }
}

function toConversation(state: AiState): AiConversation | null {
  if (!state.documentId || !state.activeSessionId) {
    return null
  }

  return {
    documentId: state.documentId,
    documentTitle: state.documentTitle,
    sessionId: state.activeSessionId,
    title: state.activeSessionTitle,
    messages: state.messages,
    updatedAt: Date.now(),
    archivedAt: null,
  }
}

async function persistState(state: AiState): Promise<void> {
  const conversation = toConversation(state)
  if (!conversation) {
    return
  }

  await saveAiConversation(conversation)
}

function toStatusMessage(summary: AiApplySummary | null): string {
  return summary?.summary ?? ''
}

export const useAiStore = create<AiState>((set, get) => ({
  documentId: null,
  documentTitle: '',
  activeSessionId: null,
  activeSessionTitle: DEFAULT_SESSION_TITLE,
  sessionList: [],
  archivedSessions: [],
  messages: [],
  status: null,
  statusError: null,
  statusFailureKind: null,
  statusFeedback: null,
  hasCheckedStatus: false,
  settings: null,
  settingsError: null,
  isHydrating: false,
  isCheckingStatus: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  isLoadingArchivedSessions: false,
  isSending: false,
  runStage: 'idle',
  streamingStatusText: '',
  streamingText: '',
  error: null,
  lastExecutionError: null,
  lastAppliedChange: null,

  setError: (message) => set({ error: message }),

  hydrate: async (documentId, documentTitle, sessionId) => {
    const currentState = get()
    const shouldRefreshCodexState =
      currentState.documentId !== documentId || !currentState.hasCheckedStatus

    set({
      isHydrating: true,
      error: null,
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      lastExecutionError: null,
      lastAppliedChange: null,
      hasCheckedStatus: shouldRefreshCodexState ? false : currentState.hasCheckedStatus,
    })

    const { conversation, sessionList } = await ensureSession(documentId, documentTitle, sessionId)

    set({
      documentId,
      documentTitle,
      activeSessionId: conversation.sessionId,
      activeSessionTitle: conversation.title,
      sessionList,
      messages: conversation.messages,
      isHydrating: shouldRefreshCodexState,
      isSending: false,
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      error: null,
      statusFailureKind: shouldRefreshCodexState ? null : currentState.statusFailureKind,
      statusFeedback: null,
      hasCheckedStatus: shouldRefreshCodexState ? false : currentState.hasCheckedStatus,
      lastExecutionError: null,
      lastAppliedChange: null,
    })

    if (shouldRefreshCodexState) {
      await Promise.all([
        applyStatusRequest(fetchCodexStatus, set),
        applySettingsRequest(fetchCodexSettings, set),
      ])
      set({
        isHydrating: false,
      })
    }
  },

  createSession: async () => {
    const state = get()
    if (!state.documentId) {
      return
    }

    const conversation = createEmptyConversation(state.documentId, state.documentTitle)
    await saveAiConversation(conversation)
    const sessionList = await listAiSessions(state.documentId)

    set({
      activeSessionId: conversation.sessionId,
      activeSessionTitle: conversation.title,
      sessionList,
      messages: [],
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      error: null,
      lastExecutionError: null,
    })
  },

  switchSession: async (sessionId) => {
    const state = get()
    if (!state.documentId) {
      return
    }

    const conversation = await getAiConversation(state.documentId, sessionId)
    if (!conversation) {
      return
    }

    set({
      activeSessionId: conversation.sessionId,
      activeSessionTitle: conversation.title,
      messages: conversation.messages,
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      error: null,
      lastExecutionError: null,
    })
  },

  archiveSession: async (sessionId) => {
    const state = get()
    if (!state.documentId) {
      return
    }

    const targetSessionId = sessionId ?? state.activeSessionId
    if (!targetSessionId) {
      return
    }

    await archiveAiConversation(state.documentId, targetSessionId)
    const sessionList = await listAiSessions(state.documentId)
    const archivedSessions = await listArchivedAiSessions()

    if (targetSessionId !== state.activeSessionId) {
      set({ sessionList, archivedSessions })
      return
    }

    const fallback = sessionList[0]
    if (fallback) {
      const fallbackConversation = await getAiConversation(state.documentId, fallback.sessionId)
      set({
        sessionList,
        archivedSessions,
        activeSessionId: fallback.sessionId,
        activeSessionTitle: fallback.title,
        messages: fallbackConversation?.messages ?? [],
        runStage: 'idle',
        streamingStatusText: '',
        streamingText: '',
        error: null,
        lastExecutionError: null,
      })
      return
    }

    await get().createSession()
    set({ archivedSessions: await listArchivedAiSessions() })
  },

  deleteSession: async (sessionId) => {
    const state = get()
    if (!state.documentId) {
      return
    }

    const targetSessionId = sessionId ?? state.activeSessionId
    if (!targetSessionId) {
      return
    }

    await deleteAiConversation(state.documentId, targetSessionId)
    const sessionList = await listAiSessions(state.documentId)
    const archivedSessions = await listArchivedAiSessions()

    if (targetSessionId !== state.activeSessionId) {
      set({ sessionList, archivedSessions })
      return
    }

    const fallback = sessionList[0]
    if (fallback) {
      const fallbackConversation = await getAiConversation(state.documentId, fallback.sessionId)
      set({
        sessionList,
        archivedSessions,
        activeSessionId: fallback.sessionId,
        activeSessionTitle: fallback.title,
        messages: fallbackConversation?.messages ?? [],
        runStage: 'idle',
        streamingStatusText: '',
        streamingText: '',
        error: null,
        lastExecutionError: null,
      })
      return
    }

    await get().createSession()
    set({ archivedSessions: await listArchivedAiSessions() })
  },

  loadArchivedSessions: async () => {
    set({ isLoadingArchivedSessions: true })
    try {
      const archivedSessions = await listArchivedAiSessions()
      set({
        archivedSessions,
        isLoadingArchivedSessions: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '归档会话加载失败。',
        isLoadingArchivedSessions: false,
      })
    }
  },

  restoreArchivedSession: async (documentId, sessionId) => {
    await restoreAiConversation(documentId, sessionId)
    const state = get()
    const [archivedSessions, sessionList] = await Promise.all([
      listArchivedAiSessions(),
      state.documentId === documentId ? listAiSessions(documentId) : Promise.resolve(state.sessionList),
    ])

    set({
      archivedSessions,
      sessionList,
    })
  },

  deleteArchivedSession: async (documentId, sessionId) => {
    await deleteAiConversation(documentId, sessionId)
    const state = get()
    const [archivedSessions, sessionList] = await Promise.all([
      listArchivedAiSessions(),
      state.documentId === documentId ? listAiSessions(documentId) : Promise.resolve(state.sessionList),
    ])

    set({
      archivedSessions,
      sessionList,
    })
  },

  refreshStatus: async () => {
    set({
      runStage: 'checking_status',
      streamingStatusText: '正在检查本机 Codex 状态…',
    })

    await applyStatusRequest(fetchCodexStatus, set, {
      successFeedback: (status) =>
        status.ready
          ? {
              tone: 'success',
              message: '已重新检查，本机 Codex 当前可用。',
            }
          : {
              tone: 'warning',
              message: '已重新检查，但当前 Codex 仍不可用。',
            },
    })

    set({
      runStage: 'idle',
      streamingStatusText: '',
    })
  },

  revalidateStatus: async () => {
    set({
      runStage: 'checking_status',
      streamingStatusText: '正在重新验证本机 Codex 登录状态…',
    })

    await applyStatusRequest(revalidateCodexStatus, set, {
      successFeedback: (status) =>
        status.ready
          ? {
              tone: 'success',
              message: '已重新验证，本机 Codex 当前可用。',
            }
          : {
              tone: 'warning',
              message: '已重新验证，但当前 Codex 仍不可用。',
            },
    })

    set({
      runStage: 'idle',
      streamingStatusText: '',
    })
  },

  loadSettings: async () => {
    await applySettingsRequest(fetchCodexSettings, set)
  },

  saveSettings: async (businessPrompt) => {
    await applySettingsRequest(() => saveCodexSettings(businessPrompt), set, { saving: true })
    await applyStatusRequest(fetchCodexStatus, set)
  },

  resetSettings: async () => {
    await applySettingsRequest(resetCodexSettings, set, { saving: true })
    await applyStatusRequest(fetchCodexStatus, set)
  },

  clearLastAppliedChange: () => set({ lastAppliedChange: null }),

  undoLastAppliedChange: () =>
    set((state) => {
      if (!canUndoAppliedChange(state.lastAppliedChange)) {
        return {
          lastAppliedChange: null,
          error: state.lastAppliedChange
            ? '当前已经存在后续内容改动，无法直接撤销上一轮 AI 改动。'
            : state.error,
        }
      }

      useEditorStore.getState().undo()
      const undoMessage = createMessage('assistant', '已撤销上一轮 AI 改动。')
      const nextMessages = [...state.messages, undoMessage]
      const nextState = {
        messages: nextMessages,
        lastAppliedChange: null,
        error: null,
      }

      void persistState({ ...state, ...nextState })
      return nextState
    }),

  sendMessage: async (document, selection, content) => {
    const question = content.trim()
    if (!question) {
      return
    }

    const currentState = get()
    if (!currentState.status?.ready) {
      const requestFailedIssue = currentState.status?.issues.find((issue) => issue.code === 'request_failed')
      const cliMissingIssue = currentState.status?.issues.find((issue) => issue.code === 'cli_missing')

      if (currentState.statusFailureKind === 'bridge_internal_error' || requestFailedIssue) {
        const message =
          currentState.statusError ??
          requestFailedIssue?.message ??
          '本机 Codex bridge 在线，但状态检查失败，请查看 bridge 日志后重试。'
        set({
          error: message,
          lastExecutionError: createExecutionError('request_failed', message, 'error'),
        })
        return
      }

      if (currentState.status === null) {
        const message =
          currentState.statusError ??
          '当前未连接到本机 Codex 服务，请先恢复 bridge 后再试。'
        set({
          error: message,
          lastExecutionError: createExecutionError('request_failed', message, 'error'),
        })
        return
      }

      if (cliMissingIssue) {
        set({
          error: cliMissingIssue.message,
          lastExecutionError: createExecutionError('cli_missing', cliMissingIssue.message, 'error'),
        })
        return
      }

      set({
        error: '当前 Codex 验证信息不可用，请尽快重新验证。',
        lastExecutionError: createExecutionError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          'error',
        ),
      })
      return
    }

    const ensured =
      currentState.documentId === document.id && currentState.activeSessionId
        ? null
        : await ensureSession(document.id, document.title, currentState.activeSessionId ?? undefined)

    const sessionId = ensured?.conversation.sessionId ?? currentState.activeSessionId
    const sessionTitleBase = ensured?.conversation.title ?? currentState.activeSessionTitle
    if (!sessionId) {
      return
    }

    const userMessage = createMessage('user', question)
    const nextMessages = [...(ensured?.conversation.messages ?? currentState.messages), userMessage]
    const nextSessionTitle =
      sessionTitleBase === DEFAULT_SESSION_TITLE ? deriveSessionTitle(question) : sessionTitleBase
    const nextConversation: AiConversation = {
      documentId: document.id,
      documentTitle: document.title,
      sessionId,
      title: nextSessionTitle,
      messages: nextMessages,
      updatedAt: Date.now(),
      archivedAt: null,
    }
    const nextSessionList = replaceSessionSummary(
      ensured?.sessionList ?? currentState.sessionList,
      nextConversation,
    )

    set({
      documentId: document.id,
      documentTitle: document.title,
      activeSessionId: sessionId,
      activeSessionTitle: nextSessionTitle,
      sessionList: nextSessionList,
      messages: nextMessages,
      isSending: true,
      runStage: 'building_context',
      streamingStatusText: '正在整理整张脑图与当前聚焦范围…',
      streamingText: '',
      error: null,
      lastExecutionError: null,
    })

    await saveAiConversation(nextConversation)

    try {
      let hasCommittedAssistantMessage = false

      const buildSessionSummaryList = (messages: AiMessage[]) =>
        replaceSessionSummary(get().sessionList, {
          documentId: document.id,
          documentTitle: document.title,
          sessionId,
          title: nextSessionTitle,
          messages,
          updatedAt: Date.now(),
          archivedAt: null,
        })

      const commitAssistantMessage = (fallbackContent?: string) => {
        if (hasCommittedAssistantMessage) {
          return
        }

        const state = get()
        const contentToPersist = (state.streamingText || fallbackContent || '').trim()
        if (!contentToPersist) {
          return
        }

        hasCommittedAssistantMessage = true
        const assistantMessage = createMessage('assistant', contentToPersist)
        const messages = [...state.messages, assistantMessage]
        const sessionList = buildSessionSummaryList(messages)
        const nextState = {
          ...state,
          messages,
          sessionList,
          activeSessionTitle: nextSessionTitle,
          streamingText: '',
        }

        set({
          messages,
          sessionList,
          activeSessionTitle: nextSessionTitle,
          streamingText: '',
        })
        void persistState(nextState)
      }

      await streamCodexChat(
        {
          documentId: document.id,
          sessionId,
          messages: nextMessages,
          context: buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId),
          baseDocumentUpdatedAt: document.updatedAt,
        },
        (event) => {
          if (event.type === 'status') {
            if (event.stage === 'planning_changes') {
              commitAssistantMessage()
            }

            set({
              runStage: event.stage,
              streamingStatusText: event.message,
            })
            return
          }

          if (event.type === 'assistant_delta') {
            set((state) => ({
              runStage: 'streaming',
              streamingStatusText: 'Codex 正在输出回复…',
              streamingText: state.streamingText + event.delta,
            }))
            return
          }

          if (event.type === 'error') {
            if (
              event.stage === 'planning_changes' ||
              event.stage === 'applying_changes'
            ) {
              commitAssistantMessage()
            }

            set({
              isSending: false,
              runStage: 'error',
              streamingStatusText: '',
              streamingText: '',
              error: null,
              lastExecutionError: createExecutionError(
                event.code,
                event.message,
                event.stage ?? 'error',
              ),
            })

            void persistState(get())

            if (
              event.code === 'verification_required' ||
              event.code === 'subscription_required' ||
              event.code === 'login_required'
            ) {
              void get().revalidateStatus()
            }
            return
          }

          commitAssistantMessage(event.data.assistantMessage)
          const baseState = get()
          const nextState: Partial<AiState> = {
            isSending: false,
            runStage: 'completed',
            streamingStatusText: '',
            streamingText: '',
            error: null,
            lastExecutionError: null,
          }

          let applySummary: AiApplySummary | null = null
          if (event.data.proposal) {
            try {
              set({
                runStage: 'applying_changes',
                streamingStatusText: '正在把有效改动应用到画布…',
              })

              const editorSnapshot = getEditorSnapshot()
              const currentDocument = editorSnapshot.document

              if (!currentDocument) {
                throw new Error('当前脑图尚未加载完成，无法应用 AI 改动。')
              }

              const result = applyAiProposal(currentDocument, event.data.proposal)
              useEditorStore
                .getState()
                .applyExternalDocument(result.document, result.selectedTopicId ?? editorSnapshot.activeTopicId)

              applySummary = {
                summary: result.appliedSummary,
                appliedCount: result.appliedCount,
                skippedCount: result.skippedCount,
                warnings: result.warnings,
              }

              const appliedNotice = createMessage(
                'assistant',
                [
                  result.appliedSummary,
                  result.warnings.length > 0
                    ? `未执行项：${result.warnings.join('；')}`
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
              )
              const afterApplySnapshot = getEditorSnapshot()

              nextState.messages = [...baseState.messages, appliedNotice]
              nextState.lastAppliedChange = {
                proposalId: event.data.proposal.id,
                summary: result.appliedSummary,
                historyLength: afterApplySnapshot.history.length,
                documentUpdatedAt: afterApplySnapshot.document?.updatedAt ?? currentDocument.updatedAt,
              }
              nextState.runStage = 'completed'
              nextState.streamingStatusText = toStatusMessage(applySummary)
            } catch (error) {
              nextState.runStage = 'error'
              nextState.streamingStatusText = ''
              nextState.lastExecutionError = createExecutionError(
                'request_failed',
                error instanceof Error ? error.message : 'AI 改动应用失败。',
                'applying_changes',
              )
            }
          }

          set((state) => {
            const mergedState = {
              ...state,
              ...nextState,
              activeSessionTitle: nextSessionTitle,
              sessionList: replaceSessionSummary(
                state.sessionList,
                {
                  documentId: document.id,
                  documentTitle: document.title,
                  sessionId,
                  title: nextSessionTitle,
                  messages: nextState.messages ?? state.messages,
                  updatedAt: Date.now(),
                  archivedAt: null,
                },
              ),
            }
            void persistState(mergedState)
            return mergedState
          })
        },
      )
    } catch (error) {
      set({
        isSending: false,
        runStage: 'error',
        streamingStatusText: '',
        streamingText: '',
        error: null,
        lastExecutionError: createExecutionError(
          'code' in Object(error) ? (error as { code?: AiExecutionError['code'] }).code : undefined,
          error instanceof Error ? error.message : 'Codex 对话请求失败。',
          get().runStage,
        ),
      })

      if (
        'code' in Object(error) &&
        ((error as { code?: AiExecutionError['code'] }).code === 'verification_required' ||
          (error as { code?: AiExecutionError['code'] }).code === 'subscription_required' ||
          (error as { code?: AiExecutionError['code'] }).code === 'login_required')
      ) {
        void get().revalidateStatus()
      }
    }
  },
}))

export function resetAiStore(): void {
  useAiStore.setState({
    documentId: null,
    documentTitle: '',
    activeSessionId: null,
    activeSessionTitle: DEFAULT_SESSION_TITLE,
    sessionList: [],
    archivedSessions: [],
    messages: [],
    status: null,
    statusError: null,
    statusFailureKind: null,
    statusFeedback: null,
    hasCheckedStatus: false,
    settings: null,
    settingsError: null,
    isHydrating: false,
    isCheckingStatus: false,
    isLoadingSettings: false,
    isSavingSettings: false,
    isLoadingArchivedSessions: false,
    isSending: false,
    runStage: 'idle',
    streamingStatusText: '',
    streamingText: '',
    error: null,
    lastExecutionError: null,
    lastAppliedChange: null,
  })
}

export async function seedAiConversation(conversation: AiConversation): Promise<void> {
  await saveAiConversation(conversation)
  useAiStore.setState({
    documentId: conversation.documentId,
    documentTitle: conversation.documentTitle,
    activeSessionId: conversation.sessionId,
    activeSessionTitle: conversation.title,
    messages: conversation.messages,
    sessionList: [
      {
        documentId: conversation.documentId,
        documentTitle: conversation.documentTitle,
        sessionId: conversation.sessionId,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        archivedAt: conversation.archivedAt,
      },
    ],
    archivedSessions: [],
    isHydrating: false,
    isSending: false,
    runStage: 'idle',
    streamingStatusText: '',
    streamingText: '',
    error: null,
    statusFailureKind: null,
    statusFeedback: null,
    hasCheckedStatus: false,
    lastExecutionError: null,
    lastAppliedChange: null,
  })
}

export async function clearAiConversation(documentId: string, documentTitle = '未命名脑图'): Promise<void> {
  const empty = createEmptyConversation(documentId, documentTitle)
  await saveAiConversation(empty)
}
