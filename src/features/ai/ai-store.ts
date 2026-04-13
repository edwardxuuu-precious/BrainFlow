import { create } from 'zustand'
import type { AiApplySummary, AiConversation, AiExecutionError, AiMessage } from '../../../shared/ai-contract'
import { getEditorSnapshot, useEditorStore } from '../editor/editor-store'
import { applyAiProposal } from './ai-proposal'
import { buildAiContext } from './ai-context'
import {
  deleteAiProviderConfig,
  fetchAvailableProviders,
  fetchCodexSettings,
  fetchCodexStatus,
  getAiProviderConfig,
  getStoredProvider,
  getStoredWorkspaceId,
  revalidateCodexStatus,
  resetCodexSettings,
  saveCodexSettings,
  setAiProviderConfig,
  setStoredProvider,
  streamCodexChat,
  validateProvider,
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
import {
  type AiState,
  applySettingsRequest,
  applyStatusRequest,
  beginProviderConfigRequest,
  buildProviderStatusErrorMessage,
  canUndoAppliedChange,
  createExecutionError,
  createMessage,
  createProviderUnavailableMessage,
  createRefreshFeedback,
  createRevalidateFeedback,
  DEFAULT_SESSION_TITLE,
  deriveSessionTitle,
  describeContextStatus,
  EMPTY_PROVIDER_CONFIG,
  ensureSession,
  finishProviderConfigRequest,
  getProviderDisplayName,
  getStatusCheckingText,
  getStatusRevalidateText,
  persistState,
  replaceSessionSummary,
  resetProviderConfigPendingCount,
  toStatusMessage,
} from './ai-store-helpers'

export type { AiSelectionSnapshot, LastAppliedAiChange, ProviderConfigInput } from './ai-store-helpers'

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
  availableProviders: [],
  currentProvider: getStoredProvider(),
  isLoadingProviders: false,
  providerSwitchError: null,
  providerConfigs: {},
  isLoadingProviderConfig: false,
  providerConfigError: null,
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
    const shouldRefreshStatus =
      currentState.documentId !== documentId || !currentState.hasCheckedStatus

    set({
      isHydrating: true,
      error: null,
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      lastExecutionError: null,
      lastAppliedChange: null,
      hasCheckedStatus: shouldRefreshStatus ? false : currentState.hasCheckedStatus,
    })

    const { conversation, sessionList } = await ensureSession(documentId, documentTitle, sessionId)

    set({
      documentId,
      documentTitle,
      activeSessionId: conversation.sessionId,
      activeSessionTitle: conversation.title,
      sessionList,
      messages: conversation.messages,
      isHydrating: shouldRefreshStatus,
      isSending: false,
      runStage: 'idle',
      streamingStatusText: '',
      streamingText: '',
      error: null,
      statusFailureKind: shouldRefreshStatus ? null : currentState.statusFailureKind,
      statusFeedback: null,
      hasCheckedStatus: shouldRefreshStatus ? false : currentState.hasCheckedStatus,
      lastExecutionError: null,
      lastAppliedChange: null,
    })

    if (shouldRefreshStatus) {
      const providerType = get().currentProvider
      await Promise.all([
        applyStatusRequest(() => fetchCodexStatus({ providerType }), set),
        applySettingsRequest(fetchCodexSettings, set),
      ])
      set({
        isHydrating: false,
      })
      return
    }

    set({
      isHydrating: false,
    })
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
    const providerType = get().currentProvider
    set({
      runStage: 'checking_status',
      streamingStatusText: getStatusCheckingText(providerType),
    })

    await applyStatusRequest(() => fetchCodexStatus({ providerType }), set, {
      successFeedback: (status) => createRefreshFeedback(providerType, status.ready),
    })

    set({
      runStage: 'idle',
      streamingStatusText: '',
    })
  },

  revalidateStatus: async () => {
    const providerType = get().currentProvider
    set({
      runStage: 'checking_status',
      streamingStatusText: getStatusRevalidateText(providerType),
    })

    await applyStatusRequest(() => revalidateCodexStatus({ providerType }), set, {
      successFeedback: (status) => createRevalidateFeedback(providerType, status.ready),
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
    await applyStatusRequest(() => fetchCodexStatus({ providerType: get().currentProvider }), set)
  },

  resetSettings: async () => {
    await applySettingsRequest(resetCodexSettings, set, { saving: true })
    await applyStatusRequest(() => fetchCodexStatus({ providerType: get().currentProvider }), set)
  },

  loadAvailableProviders: async () => {
    set({
      isLoadingProviders: true,
    })

    try {
      const providers = await fetchAvailableProviders()
      set({
        availableProviders: providers,
        isLoadingProviders: false,
      })
    } catch (error) {
      set({
        isLoadingProviders: false,
        providerSwitchError: error instanceof Error ? error.message : '可用 AI 列表加载失败。',
      })
    }
  },

  switchProvider: async (providerType) => {
    if (!providerType) {
      return false
    }

    setStoredProvider(providerType)
    const nextProvider = getStoredProvider()
    const providerName = getProviderDisplayName(nextProvider)

    set({
      currentProvider: nextProvider,
      providerSwitchError: null,
      statusFeedback: null,
    })

    await Promise.all([
      get().loadAvailableProviders(),
      applyStatusRequest(
        () => fetchCodexStatus({ providerType: nextProvider }),
        set,
        {
          successFeedback: (status) =>
            status.ready
              ? {
                  tone: 'success',
                  message:
                    nextProvider === 'codex'
                      ? '已切换到 Codex，并立即生效。'
                      : `已切换到 ${providerName}，并立即生效。`,
                }
              : {
                  tone: 'warning',
                  message: `${providerName} 已设为默认 AI，但当前尚不可用。`,
                },
        },
      ),
    ])

    const state = get()
    if (!state.status?.ready) {
      set({
        providerSwitchError: buildProviderStatusErrorMessage(state, nextProvider),
      })
      return false
    }

    set({
      providerSwitchError: null,
    })
    return true
  },

  validateCurrentProvider: async () => {
    return get().testProvider(get().currentProvider, getStoredWorkspaceId())
  },

  testProvider: async (providerType, workspaceId) => {
    if (!providerType) {
      return false
    }

    set({
      providerSwitchError: null,
    })

    try {
      const result = await validateProvider(providerType, workspaceId)
      await get().loadAvailableProviders()

      if (get().currentProvider === providerType) {
        await applyStatusRequest(() => fetchCodexStatus({ providerType }), set)
      }

      if (!result.valid) {
        set({
          providerSwitchError:
            result.error ?? `${getProviderDisplayName(providerType)} 连接测试失败。`,
        })
        return false
      }

      set({
        providerSwitchError: null,
      })
      return true
    } catch (error) {
      set({
        providerSwitchError: error instanceof Error ? error.message : 'Provider 测试失败。',
      })
      return false
    }
  },

  loadProviderConfig: async (providerType, workspaceId) => {
    if (!workspaceId) {
      return
    }

    beginProviderConfigRequest(set)
    try {
      const config = await getAiProviderConfig(providerType, workspaceId)
      set((state) => ({
        providerConfigs: {
          ...state.providerConfigs,
          [providerType]: config,
        },
      }))
    } catch (error) {
      set({
        providerConfigError:
          error instanceof Error ? error.message : 'Provider 配置读取失败。',
      })
    } finally {
      finishProviderConfigRequest(set)
    }
  },

  saveProviderConfig: async (providerType, workspaceId, config) => {
    if (!workspaceId) {
      set({
        providerConfigError: '请先选择工作区，再保存 API 配置。',
      })
      return false
    }

    beginProviderConfigRequest(set)
    set({
      providerConfigError: null,
    })

    try {
      const result = await setAiProviderConfig(
        {
          provider: providerType,
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        },
        workspaceId,
      )

      set((state) => ({
        providerConfigs: {
          ...state.providerConfigs,
          [providerType]: {
            hasConfig: result.success,
            model: config.model ?? state.providerConfigs[providerType]?.model ?? null,
            baseUrl: config.baseUrl ?? state.providerConfigs[providerType]?.baseUrl ?? null,
          },
        },
        providerConfigError: result.valid
          ? null
          : (result.error ?? `${getProviderDisplayName(providerType)} 配置校验失败。`),
      }))

      await get().loadAvailableProviders()

      if (get().currentProvider === providerType) {
        await applyStatusRequest(() => fetchCodexStatus({ providerType }), set)
      }

      return result.valid
    } catch (error) {
      set({
        providerConfigError:
          error instanceof Error ? error.message : 'Provider 配置保存失败。',
      })
      return false
    } finally {
      finishProviderConfigRequest(set)
    }
  },

  deleteProviderConfig: async (providerType, workspaceId) => {
    if (!workspaceId) {
      set({
        providerConfigError: '请先选择工作区，再删除 API 配置。',
      })
      return false
    }

    beginProviderConfigRequest(set)
    set({
      providerConfigError: null,
    })

    try {
      await deleteAiProviderConfig(providerType, workspaceId)
      set((state) => ({
        providerConfigs: {
          ...state.providerConfigs,
          [providerType]: EMPTY_PROVIDER_CONFIG,
        },
      }))

      await get().loadAvailableProviders()

      if (get().currentProvider === providerType) {
        await applyStatusRequest(() => fetchCodexStatus({ providerType }), set)
      }

      return true
    } catch (error) {
      set({
        providerConfigError:
          error instanceof Error ? error.message : 'Provider 配置删除失败。',
      })
      return false
    } finally {
      finishProviderConfigRequest(set)
    }
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
    const currentProvider = currentState.currentProvider
    const currentProviderName = getProviderDisplayName(currentProvider)
    if (!currentState.status?.ready) {
      if (currentProvider !== 'codex') {
        const message = buildProviderStatusErrorMessage(currentState, currentProvider)
        set({
          error: message,
          lastExecutionError: createExecutionError(
            'provider_unavailable',
            message,
            'error',
            currentProvider,
          ),
        })
        return
      }

      const requestFailedIssue = currentState.status?.issues.find((issue) => issue.code === 'request_failed')
      const cliMissingIssue = currentState.status?.issues.find((issue) => issue.code === 'cli_missing')

      if (currentState.statusFailureKind === 'bridge_internal_error' || requestFailedIssue) {
        const message =
          currentState.statusError ??
          requestFailedIssue?.message ??
          '本机 Codex bridge 在线，但状态检查失败，请查看 bridge 日志后重试。'
        set({
          error: message,
          lastExecutionError: createExecutionError(
            'request_failed',
            message,
            'error',
            currentProvider,
          ),
        })
        return
      }

      if (currentState.status === null) {
        const message =
          currentState.statusError ??
          '当前未连接到本机 Codex 服务，请先恢复 bridge 后再试。'
        set({
          error: message,
          lastExecutionError: createExecutionError(
            'request_failed',
            message,
            'error',
            currentProvider,
          ),
        })
        return
      }

      if (cliMissingIssue) {
        set({
          error: cliMissingIssue.message,
          lastExecutionError: createExecutionError(
            'cli_missing',
            cliMissingIssue.message,
            'error',
            currentProvider,
          ),
        })
        return
      }

      const message = createProviderUnavailableMessage(currentProvider)
      set({
        error: message,
        lastExecutionError: createExecutionError(
          'verification_required',
          message,
          'error',
          currentProvider,
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

      const context = buildAiContext(document, selection.selectedTopicIds, selection.activeTopicId, {
        useFullDocument: selection.useFullDocument,
        manualContextTopicIds: selection.manualContextTopicIds,
      })

      set({
        streamingStatusText: describeContextStatus(context.scope),
      })

      await streamCodexChat(
        {
          documentId: document.id,
          sessionId,
          messages: nextMessages,
          context,
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
              streamingStatusText: `${currentProviderName} 正在输出回复…`,
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
                currentProvider,
              ),
            })

            void persistState(get())

            if (
              event.code === 'verification_required' ||
              event.code === 'subscription_required' ||
              event.code === 'login_required' ||
              event.code === 'authentication_failed' ||
              event.code === 'provider_unavailable'
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
                currentProvider,
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
        {
          providerType: currentProvider,
        },
      )
    } catch (error) {
      const errorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error
          ? (error as { code?: AiExecutionError['code'] }).code
          : undefined

      set({
        isSending: false,
        runStage: 'error',
        streamingStatusText: '',
        streamingText: '',
        error: null,
        lastExecutionError: createExecutionError(
          errorCode,
          error instanceof Error ? error.message : 'AI 对话请求失败。',
          get().runStage,
          currentProvider,
        ),
      })

      if (
        errorCode === 'verification_required' ||
        errorCode === 'subscription_required' ||
        errorCode === 'login_required' ||
        errorCode === 'authentication_failed' ||
        errorCode === 'provider_unavailable'
      ) {
        void get().revalidateStatus()
      }
    }
  },
}))

export function resetAiStore(): void {
  resetProviderConfigPendingCount()
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
    availableProviders: [],
    currentProvider: getStoredProvider(),
    isLoadingProviders: false,
    providerSwitchError: null,
    providerConfigs: {},
    isLoadingProviderConfig: false,
    providerConfigError: null,
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
