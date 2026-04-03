import type {
  AiCanvasTarget,
  AiCanvasOperation,
  AiCanvasProposal,
  AiChatRequest,
  AiChatResponse,
  CodexBridgeIssue,
  CodexSettings,
  CodexStatus,
} from '../shared/ai-contract.js'
import { createCodexRunner, type CodexRunner } from './codex-runner.js'
import {
  createSystemPromptStore,
  type LoadedSystemPrompt,
  type SystemPromptStore,
} from './system-prompt.js'

type RawProposalOperation = {
  type?: string | null
  parent?: string | null
  anchor?: string | null
  target?: string | null
  newParent?: string | null
  targetIndex?: number | null
  title?: string | null
  note?: string | null
  resultRef?: string | null
  parentTopicId?: string | null
  targetTopicId?: string | null
  topicId?: string | null
  targetParentId?: string | null
}

interface RawProposalPayload {
  id?: string | null
  summary?: string | null
  operations?: RawProposalOperation[] | null
}

interface RawAiResponsePayload {
  assistantMessage?: string | null
  needsMoreContext?: boolean | null
  contextRequest?: string[] | null
  warnings?: string[] | null
  proposal?: RawProposalPayload | null
}

export class CodexBridgeError extends Error {
  code: CodexBridgeIssue['code'] | 'invalid_request'
  issues?: CodexBridgeIssue[]

  constructor(
    code: CodexBridgeIssue['code'] | 'invalid_request',
    message: string,
    issues?: CodexBridgeIssue[],
  ) {
    super(message)
    this.name = 'CodexBridgeError'
    this.code = code
    this.issues = issues
  }
}

const OPERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type',
    'parent',
    'anchor',
    'target',
    'newParent',
    'targetIndex',
    'title',
    'note',
    'resultRef',
    'parentTopicId',
    'targetTopicId',
    'topicId',
    'targetParentId',
  ],
  properties: {
    type: { type: ['string', 'null'] },
    parent: { type: ['string', 'null'] },
    anchor: { type: ['string', 'null'] },
    target: { type: ['string', 'null'] },
    newParent: { type: ['string', 'null'] },
    targetIndex: { type: ['integer', 'null'], minimum: 0 },
    title: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    resultRef: { type: ['string', 'null'] },
    parentTopicId: { type: ['string', 'null'] },
    targetTopicId: { type: ['string', 'null'] },
    topicId: { type: ['string', 'null'] },
    targetParentId: { type: ['string', 'null'] },
  },
} as const

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'needsMoreContext', 'contextRequest', 'warnings', 'proposal'],
  properties: {
    assistantMessage: { type: ['string', 'null'] },
    needsMoreContext: { type: ['boolean', 'null'] },
    contextRequest: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    warnings: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    proposal: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['id', 'summary', 'operations'],
      properties: {
        id: { type: ['string', 'null'] },
        summary: { type: ['string', 'null'] },
        operations: {
          type: ['array', 'null'],
          items: OPERATION_SCHEMA,
        },
      },
    },
  },
} as const

function createProposalId(): string {
  return `proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeNote(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  return value
}

function toTargetReference(candidate: string): AiCanvasTarget {
  if (candidate.startsWith('topic:') || candidate.startsWith('ref:')) {
    return candidate as AiCanvasTarget
  }

  if (
    candidate.startsWith('tmp_') ||
    candidate.startsWith('temp_') ||
    candidate.startsWith('ref_')
  ) {
    return `ref:${candidate}`
  }

  return `topic:${candidate}`
}

function createTargetReference(
  ...candidates: Array<string | null | undefined>
): AiCanvasTarget | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (normalized) {
      return toTargetReference(normalized)
    }
  }

  return undefined
}

function normalizeOperation(operation: RawProposalOperation): AiCanvasOperation {
  const operationType = normalizeText(operation.type)

  switch (operationType) {
    case 'create_child': {
      const parent = createTargetReference(operation.parent, operation.parentTopicId)
      const title = normalizeText(operation.title)
      if (!parent || !title) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 create_child 提案。')
      }

      return {
        type: 'create_child',
        parent,
        title,
        note: normalizeNote(operation.note),
        resultRef: normalizeText(operation.resultRef),
      }
    }

    case 'create_sibling': {
      const anchor = createTargetReference(operation.anchor, operation.targetTopicId)
      const title = normalizeText(operation.title)
      if (!anchor || !title) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 create_sibling 提案。')
      }

      return {
        type: 'create_sibling',
        anchor,
        title,
        note: normalizeNote(operation.note),
        resultRef: normalizeText(operation.resultRef),
      }
    }

    case 'update_topic': {
      const target = createTargetReference(operation.target, operation.topicId)
      const title = normalizeText(operation.title)
      const note = normalizeNote(operation.note)
      if (!target || (title === undefined && note === undefined)) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 update_topic 提案。')
      }

      return {
        type: 'update_topic',
        target,
        title,
        note,
      }
    }

    case 'move_topic': {
      const target = createTargetReference(operation.target, operation.topicId)
      const newParent = createTargetReference(operation.newParent, operation.targetParentId)
      if (!target || !newParent) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 move_topic 提案。')
      }

      return {
        type: 'move_topic',
        target,
        newParent,
        targetIndex:
          typeof operation.targetIndex === 'number' && Number.isInteger(operation.targetIndex)
            ? operation.targetIndex
            : undefined,
      }
    }

    case 'delete_topic': {
      const target = createTargetReference(operation.target, operation.topicId)
      if (!target) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 delete_topic 提案。')
      }

      return {
        type: 'delete_topic',
        target,
      }
    }

    default:
      throw new CodexBridgeError('request_failed', 'Codex 返回了不支持的操作类型。')
  }
}

function normalizeResponsePayload(
  request: AiChatRequest,
  rawPayload: RawAiResponsePayload,
): AiChatResponse {
  const assistantMessage =
    normalizeText(rawPayload.assistantMessage) ?? '我需要更多上下文才能安全地回答这个问题。'
  const contextRequest = (rawPayload.contextRequest ?? [])
    .map((item) => normalizeText(item))
    .filter(Boolean) as string[] | undefined
  const warnings = (rawPayload.warnings ?? [])
    .map((item) => normalizeText(item))
    .filter(Boolean) as string[] | undefined

  let proposal: AiCanvasProposal | null = null
  if (rawPayload.proposal?.operations?.length) {
    proposal = {
      id: normalizeText(rawPayload.proposal.id) ?? createProposalId(),
      summary: normalizeText(rawPayload.proposal.summary) ?? 'Codex 已生成一组脑图变更。',
      baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
      operations: rawPayload.proposal.operations.map(normalizeOperation),
    }
  }

  return {
    assistantMessage,
    needsMoreContext: rawPayload.needsMoreContext === true,
    contextRequest,
    proposal,
    warnings,
  }
}

function parseResponsePayload(rawText: string | null | undefined): RawAiResponsePayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空响应。')
  }

  const parsed = JSON.parse(rawText) as RawAiResponsePayload
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的结构化结果。')
  }

  return parsed
}

function normalizeBridgeError(error: unknown): CodexBridgeError {
  if (error instanceof CodexBridgeError) {
    return error
  }

  const issue =
    typeof error === 'object' && error && 'issue' in error
      ? (error as { issue?: CodexBridgeIssue }).issue
      : undefined

  if (issue) {
    return new CodexBridgeError(issue.code, issue.message, [issue])
  }

  return new CodexBridgeError(
    'request_failed',
    error instanceof Error ? error.message : 'Codex 请求失败。',
  )
}

function buildPrompt(request: AiChatRequest, prompt: LoadedSystemPrompt): string {
  const history = request.messages.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }))

  return [
    prompt.fullPrompt,
    '',
    'Return requirements:',
    '- Return valid JSON only.',
    '- Use the full graph context to understand the request; treat focus selection only as a hint.',
    '- Existing node references should prefer topic:<realTopicId>.',
    '- If you create a node and want to reference it later in the same proposal, assign resultRef on the create operation and then refer to it as ref:<resultRef>.',
    '- Locked nodes have aiLocked=true. You may read them. You may create_child under a locked node or create_sibling around a locked node, but you must not update_topic, move_topic, or delete_topic on a locked node.',
    '- If a locked node seems wrong, mention that suggestion in assistantMessage instead of modifying it.',
    '- Prefer preserving the user’s original framing; do not force a methodology the user did not ask for.',
    '- Only use move_topic or delete_topic when the user explicitly asks to regroup, replace, delete, or reorganize existing content.',
    '- If the request is too ambiguous to apply safely, set needsMoreContext=true and ask one minimal clarification question in contextRequest.',
    '',
    'Current request context:',
    JSON.stringify(
      {
        documentId: request.documentId,
        sessionId: request.sessionId,
        baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
        context: request.context,
        messages: history,
      },
      null,
      2,
    ),
  ].join('\n')
}

export interface CodexBridge {
  getStatus(): Promise<CodexStatus>
  revalidate(): Promise<CodexStatus>
  getSettings(): Promise<CodexSettings>
  saveSettings(businessPrompt: string): Promise<CodexSettings>
  resetSettings(): Promise<CodexSettings>
  chat(request: AiChatRequest): Promise<AiChatResponse>
}

interface CreateCodexBridgeOptions {
  runner?: CodexRunner
  promptStore?: SystemPromptStore
}

export function createCodexBridge(options?: CreateCodexBridgeOptions): CodexBridge {
  const runner = options?.runner ?? createCodexRunner()
  const promptStore = options?.promptStore ?? createSystemPromptStore()

  const buildStatus = async (): Promise<CodexStatus> => {
    const [runnerStatus, loadedPrompt] = await Promise.all([
      runner.getStatus(),
      promptStore.loadPrompt(),
    ])

    return {
      ...runnerStatus,
      systemPromptSummary: loadedPrompt.summary,
      systemPromptVersion: loadedPrompt.version,
      systemPrompt: loadedPrompt.fullPrompt,
    }
  }

  return {
    getStatus: buildStatus,
    revalidate: buildStatus,
    getSettings: () => promptStore.getSettings(),
    saveSettings: (businessPrompt) => promptStore.saveSettings(businessPrompt),
    resetSettings: () => promptStore.resetSettings(),
    async chat(request) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptStore.loadPrompt()
      let rawText = ''

      try {
        rawText = await runner.execute(buildPrompt(request, loadedPrompt), RESPONSE_SCHEMA)
      } catch (error) {
        throw normalizeBridgeError(error)
      }

      return normalizeResponsePayload(request, parseResponsePayload(rawText))
    },
  }
}
