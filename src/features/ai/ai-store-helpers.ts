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
import { getEditorSnapshot } from '../editor/editor-store'
import {
  type AiProviderConfig,
  type CodexRequestFailureKind,
} from './ai-client'
import {
  createEmptyConversation,
  getAiConversation,
  listAiSessions,
  saveAiConversation,
} from './ai-storage'

// --- Exported Types ---

export interface AiSelectionSnapshot {
  activeTopicId: string | null
  selectedTopicIds: string[]
  useFullDocument?: boolean
  manualContextTopicIds?: string[]
}

export interface LastAppliedAiChange {
  proposalId: string
  summary: string
  historyLength: number
  documentUpdatedAt: number
}

export interface StatusRequestOptions {
  successFeedback?: (status: CodexStatus) => AiStatusFeedback
}

export interface ProviderConfigInput {
  apiKey: string
  model?: string
  baseUrl?: string
}

export interface AiState {
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
  availableProviders: import('../../../shared/ai-contract').AiProviderInfo[]
  currentProvider: string
  isLoadingProviders: boolean
  providerSwitchError: string | null
  providerConfigs: Record<string, AiProviderConfig>
  isLoadingProviderConfig: boolean
  providerConfigError: string | null
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
  loadAvailableProviders: () => Promise<void>
  switchProvider: (providerType: string) => Promise<boolean>
  validateCurrentProvider: () => Promise<boolean>
  testProvider: (providerType: string, workspaceId?: string) => Promise<boolean>
  loadProviderConfig: (providerType: string, workspaceId: string) => Promise<void>
  saveProviderConfig: (
    providerType: string,
    workspaceId: string,
    config: ProviderConfigInput,
  ) => Promise<boolean>
  deleteProviderConfig: (providerType: string, workspaceId: string) => Promise<boolean>
  clearLastAppliedChange: () => void
  undoLastAppliedChange: () => void
  sendMessage: (
    document: import('../documents/types').MindMapDocument,
    selection: AiSelectionSnapshot,
    content: string,
  ) => Promise<void>
}

export type AiSetState = (partial: Partial<AiState>) => void

// --- Constants ---

export const DEFAULT_SESSION_TITLE = '新对话'
export const EMPTY_PROVIDER_CONFIG: AiProviderConfig = {
  hasConfig: false,
  model: null,
  baseUrl: null,
}

// --- Provider config pending counter ---

let providerConfigPendingCount = 0

export function beginProviderConfigRequest(set: AiSetState): void {
  providerConfigPendingCount += 1
  set({ isLoadingProviderConfig: true })
}

export function finishProviderConfigRequest(set: AiSetState): void {
  providerConfigPendingCount = Math.max(0, providerConfigPendingCount - 1)
  if (providerConfigPendingCount === 0) {
    set({ isLoadingProviderConfig: false })
  }
}

export function resetProviderConfigPendingCount(): void {
  providerConfigPendingCount = 0
}

// --- Pure helper functions ---

export function deriveStatusFailureKind(error: unknown): CodexRequestFailureKind | null {
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

export function getProviderDisplayName(type: string): string {
  switch (type) {
    case 'deepseek':
      return 'DeepSeek'
    case 'kimi-code':
      return 'Kimi Code'
    case 'codex':
    default:
      return 'Codex'
  }
}

export function getStatusCheckingText(providerType: string): string {
  if (providerType === 'codex') {
    return '正在检查本机 Codex 状态…'
  }

  return `正在检查 ${getProviderDisplayName(providerType)} 状态…`
}

export function getStatusRevalidateText(providerType: string): string {
  if (providerType === 'codex') {
    return '正在重新验证本机 Codex 登录状态…'
  }

  return `正在重新验证 ${getProviderDisplayName(providerType)} 配置状态…`
}

export function createRefreshFeedback(providerType: string, ready: boolean): AiStatusFeedback {
  if (providerType === 'codex') {
    return ready
      ? {
          tone: 'success',
          message: '已重新检查，本机 Codex 当前可用。',
        }
      : {
          tone: 'warning',
          message: '已重新检查，但当前 Codex 仍不可用。',
        }
  }

  const providerName = getProviderDisplayName(providerType)
  return ready
    ? {
        tone: 'success',
        message: `已重新检查，${providerName} 当前可用。`,
      }
    : {
        tone: 'warning',
        message: `已重新检查，但当前 ${providerName} 仍不可用。`,
      }
}

export function createRevalidateFeedback(providerType: string, ready: boolean): AiStatusFeedback {
  if (providerType === 'codex') {
    return ready
      ? {
          tone: 'success',
          message: '已重新验证，本机 Codex 当前可用。',
        }
      : {
          tone: 'warning',
          message: '已重新验证，但当前 Codex 仍不可用。',
        }
  }

  const providerName = getProviderDisplayName(providerType)
  return ready
    ? {
        tone: 'success',
        message: `已重新验证，${providerName} 当前可用。`,
      }
    : {
        tone: 'warning',
        message: `已重新验证，但当前 ${providerName} 仍不可用。`,
      }
}

export function createProviderUnavailableMessage(providerType: string): string {
  if (providerType === 'codex') {
    return '当前 Codex 验证信息不可用，请尽快重新验证。'
  }

  return `${getProviderDisplayName(providerType)} 当前不可用，请先完成配置或测试连接。`
}

export function createMessage(role: AiMessage['role'], content: string): AiMessage {
  return {
    id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
  }
}

export function describeContextStatus(scope: 'full_document' | 'focused_subset' | 'empty'): string {
  switch (scope) {
    case 'focused_subset':
      return '正在整理所选上下文节点与祖先路径…'
    case 'empty':
      return '正在基于当前提问发起零上下文对话…'
    case 'full_document':
    default:
      return '正在整理整张脑图与当前重点节点…'
  }
}

export function deriveSessionTitle(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) {
    return DEFAULT_SESSION_TITLE
  }

  return trimmed.length > 16 ? `${trimmed.slice(0, 16).trimEnd()}…` : trimmed
}

export function replaceSessionSummary(
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

export async function ensureSession(
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

export async function applyStatusRequest(
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

export async function applySettingsRequest(
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

export function canUndoAppliedChange(change: LastAppliedAiChange | null): boolean {
  if (!change) {
    return false
  }

  const snapshot = getEditorSnapshot()
  return (
    snapshot.history.length === change.historyLength &&
    snapshot.document?.updatedAt === change.documentUpdatedAt
  )
}

export function createExecutionError(
  code: AiExecutionError['code'],
  message: string,
  stage?: AiRunStage,
  providerType?: string,
): AiExecutionError {
  return {
    code,
    message,
    stage,
    providerType: providerType as AiExecutionError['providerType'],
  }
}

export function toConversation(state: AiState): AiConversation | null {
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

export async function persistState(state: AiState): Promise<void> {
  const conversation = toConversation(state)
  if (!conversation) {
    return
  }

  await saveAiConversation(conversation)
}

export function toStatusMessage(summary: AiApplySummary | null): string {
  return summary?.summary ?? ''
}

export function buildProviderStatusErrorMessage(state: AiState, providerType: string): string {
  return (
    state.status?.issues[0]?.message ??
    state.statusError ??
    createProviderUnavailableMessage(providerType)
  )
}
