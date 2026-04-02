export type AiRole = 'user' | 'assistant'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: number
}

export interface AiSelectedTopicContext {
  topicId: string
  title: string
  note: string
  ancestorTitles: string[]
  childTitles: string[]
  selectedChildTitles: string[]
  selectedParentTitle: string | null
}

export interface AiSelectionContext {
  documentTitle: string
  activeTopicId: string | null
  selectedTopicIds: string[]
  topics: AiSelectedTopicContext[]
  relationSummary: string[]
}

export type AiCanvasOperation =
  | {
      type: 'create_child'
      parentTopicId: string
      title: string
      note?: string
    }
  | {
      type: 'create_sibling'
      targetTopicId: string
      title: string
      note?: string
    }
  | {
      type: 'update_topic'
      topicId: string
      title?: string
      note?: string
    }

export interface AiCanvasProposal {
  id: string
  summary: string
  baseDocumentUpdatedAt: number
  operations: AiCanvasOperation[]
}

export interface AiConversation {
  documentId: string
  conversationId: string
  messages: AiMessage[]
  pendingProposal: AiCanvasProposal | null
  updatedAt: number
}

export interface AiChatRequest {
  documentId: string
  conversationId: string
  messages: AiMessage[]
  context: AiSelectionContext
  baseDocumentUpdatedAt: number
}

export interface AiChatResponse {
  assistantMessage: string
  needsMoreContext: boolean
  contextRequest?: string[]
  proposal?: AiCanvasProposal | null
}

export type CodexBridgeIssueCode =
  | 'cli_missing'
  | 'login_required'
  | 'verification_required'
  | 'subscription_required'
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

export interface CodexApiError {
  code: CodexBridgeIssueCode | 'invalid_request'
  message: string
  issues?: CodexBridgeIssue[]
}

export type AiStreamEvent =
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
      code?: CodexApiError['code']
      message: string
      issues?: CodexBridgeIssue[]
    }
