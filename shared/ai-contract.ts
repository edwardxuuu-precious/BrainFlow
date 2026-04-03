export type AiRole = 'user' | 'assistant'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: number
}

export interface AiDocumentTopicContext {
  topicId: string
  title: string
  note: string
  parentTopicId: string | null
  childTopicIds: string[]
  aiLocked: boolean
}

export interface AiFocusContext {
  activeTopicId: string | null
  selectedTopicIds: string[]
  relationSummary: string[]
}

export interface AiSelectionContext {
  documentTitle: string
  rootTopicId: string
  topicCount: number
  topics: AiDocumentTopicContext[]
  focus: AiFocusContext
}

export type AiCanvasTarget = `topic:${string}` | `ref:${string}`

export type AiCanvasOperation =
  | {
      type: 'create_child'
      parent: AiCanvasTarget
      title: string
      note?: string
      resultRef?: string
    }
  | {
      type: 'create_sibling'
      anchor: AiCanvasTarget
      title: string
      note?: string
      resultRef?: string
    }
  | {
      type: 'update_topic'
      target: AiCanvasTarget
      title?: string
      note?: string
    }
  | {
      type: 'move_topic'
      target: AiCanvasTarget
      newParent: AiCanvasTarget
      targetIndex?: number
    }
  | {
      type: 'delete_topic'
      target: AiCanvasTarget
    }

export interface AiCanvasProposal {
  id: string
  summary: string
  baseDocumentUpdatedAt: number
  operations: AiCanvasOperation[]
}

export interface AiSkippedOperation {
  index: number
  type: AiCanvasOperation['type']
  reason: string
}

export interface AiApplySummary {
  summary: string
  appliedCount: number
  skippedCount: number
  warnings: string[]
}

export interface AiConversation {
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  messages: AiMessage[]
  updatedAt: number
  archivedAt: number | null
}

export interface AiSessionSummary {
  documentId: string
  documentTitle: string
  sessionId: string
  title: string
  updatedAt: number
  archivedAt: number | null
}

export interface AiChatRequest {
  documentId: string
  sessionId: string
  messages: AiMessage[]
  context: AiSelectionContext
  baseDocumentUpdatedAt: number
}

export interface AiChatResponse {
  assistantMessage: string
  needsMoreContext: boolean
  contextRequest?: string[]
  proposal?: AiCanvasProposal | null
  warnings?: string[]
}

export type CodexBridgeIssueCode =
  | 'cli_missing'
  | 'login_required'
  | 'verification_required'
  | 'subscription_required'
  | 'schema_invalid'
  | 'request_failed'

export interface CodexBridgeIssue {
  code: CodexBridgeIssueCode
  message: string
}

export interface CodexStatus {
  cliInstalled: boolean
  loggedIn: boolean
  authProvider: string | null
  ready: boolean
  issues: CodexBridgeIssue[]
  systemPromptSummary: string
  systemPromptVersion: string
  systemPrompt: string
}

export interface CodexSettings {
  businessPrompt: string
  updatedAt: number
  version: string
}

export interface CodexApiError {
  code: CodexBridgeIssueCode | 'invalid_request'
  message: string
  issues?: CodexBridgeIssue[]
}

export type AiRunStage =
  | 'idle'
  | 'checking_status'
  | 'building_context'
  | 'starting_codex'
  | 'waiting_first_token'
  | 'streaming'
  | 'planning_changes'
  | 'applying_changes'
  | 'completed'
  | 'error'

export interface AiExecutionError {
  code?: CodexApiError['code']
  message: string
  stage?: AiRunStage
}

export interface AiStatusFeedback {
  tone: 'success' | 'warning'
  message: string
}

export type AiStreamEvent =
  | {
      type: 'status'
      stage: Exclude<AiRunStage, 'idle' | 'completed' | 'error'>
      message: string
    }
  | {
      type: 'assistant_delta'
      delta: string
    }
  | {
      type: 'result'
      data: AiChatResponse
    }
  | {
      type: 'error'
      stage?: Exclude<AiRunStage, 'idle' | 'completed'>
      code?: CodexApiError['code']
      message: string
      issues?: CodexBridgeIssue[]
    }
