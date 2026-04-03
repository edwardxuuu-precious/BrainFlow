import type {
  AiCanvasOperation,
  AiCanvasProposal,
  AiCanvasTarget,
  AiChatRequest,
  AiChatResponse,
  CodexBridgeIssue,
  CodexSettings,
  CodexStatus,
} from '../shared/ai-contract.js'
import {
  createCodexRunner,
  type CodexJsonEvent,
  type CodexRunner,
} from './codex-runner.js'
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

interface RawPlanPayload {
  needsMoreContext?: boolean | null
  contextRequest?: string[] | null
  warnings?: string[] | null
  proposal?: RawProposalPayload | null
}

export interface CodexChatStreamResult {
  assistantMessage: string
  emittedDelta: boolean
}

export interface CodexChatStreamOptions {
  onAssistantDelta?: (delta: string) => void
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
  required: ['needsMoreContext', 'contextRequest', 'warnings', 'proposal'],
  properties: {
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

function normalizePlanPayload(
  request: AiChatRequest,
  assistantMessage: string,
  rawPayload: RawPlanPayload,
): AiChatResponse {
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
    assistantMessage: normalizeText(assistantMessage) ?? '我已经基于当前脑图整理出一份回答。',
    needsMoreContext: rawPayload.needsMoreContext === true,
    contextRequest,
    proposal,
    warnings,
  }
}

function parsePlanPayload(rawText: string | null | undefined): RawPlanPayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空响应。')
  }

  const parsed = JSON.parse(rawText) as RawPlanPayload
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

function buildHistory(request: AiChatRequest) {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  }))
}

function buildChatPrompt(request: AiChatRequest, prompt: LoadedSystemPrompt): string {
  return [
    prompt.fullPrompt,
    '',
    'Stage 1 goal:',
    '- Reply in natural language only.',
    '- Do not output JSON, code blocks, XML, YAML, or pseudo-schema.',
    '- Use the full graph context to understand the request; treat focus selection only as a hint.',
    '- Preserve the user’s original framing instead of forcing a methodology they did not ask for.',
    '- Mention locked-node conflicts as suggestions instead of silently ignoring them.',
    '',
    'Current request context:',
    JSON.stringify(
      {
        documentId: request.documentId,
        sessionId: request.sessionId,
        baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
        context: request.context,
        messages: buildHistory(request),
      },
      null,
      2,
    ),
  ].join('\n')
}

function buildPlanningPrompt(
  request: AiChatRequest,
  assistantMessage: string,
  prompt: LoadedSystemPrompt,
): string {
  return [
    prompt.fullPrompt,
    '',
    'Stage 2 goal:',
    '- Return valid JSON only.',
    '- Convert the natural-language answer into safe mind-map operations.',
    '- Existing node references should prefer topic:<realTopicId>.',
    '- If you create a node and want to reference it later in the same proposal, assign resultRef on the create operation and then refer to it as ref:<resultRef>.',
    '- Locked nodes have aiLocked=true. You may read them. You may create_child under a locked node or create_sibling around a locked node, but you must not update_topic, move_topic, or delete_topic on a locked node.',
    '- If a locked node seems wrong, mention that suggestion in warnings instead of modifying it.',
    '- Only use move_topic or delete_topic when the user explicitly asks to regroup, replace, delete, or reorganize existing content.',
    '- If the request is too ambiguous to apply safely, set needsMoreContext=true and ask one minimal clarification question in contextRequest.',
    '',
    'Natural-language answer already shown to the user:',
    assistantMessage,
    '',
    'Current request context:',
    JSON.stringify(
      {
        documentId: request.documentId,
        sessionId: request.sessionId,
        baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
        context: request.context,
        messages: buildHistory(request),
      },
      null,
      2,
    ),
  ].join('\n')
}

function extractAssistantDelta(event: CodexJsonEvent): string | null {
  if (typeof event.delta === 'string' && event.delta) {
    return event.delta
  }

  if (typeof event.item?.text_delta === 'string' && event.item.text_delta) {
    return event.item.text_delta
  }

  if (typeof event.item?.delta === 'string' && event.item.delta) {
    return event.item.delta
  }

  if (
    event.type?.includes('delta') &&
    typeof event.item?.message === 'string' &&
    event.item.message
  ) {
    return event.item.message
  }

  return null
}

export interface CodexBridge {
  getStatus(): Promise<CodexStatus>
  revalidate(): Promise<CodexStatus>
  getSettings(): Promise<CodexSettings>
  saveSettings(businessPrompt: string): Promise<CodexSettings>
  resetSettings(): Promise<CodexSettings>
  streamChat(
    request: AiChatRequest,
    options?: CodexChatStreamOptions,
  ): Promise<CodexChatStreamResult>
  planChanges(request: AiChatRequest, assistantMessage: string): Promise<AiChatResponse>
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

    async streamChat(request, options) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptStore.loadPrompt()
      let emittedDelta = false

      try {
        const assistantMessage = await runner.executeMessage(buildChatPrompt(request, loadedPrompt), {
          onEvent: (event) => {
            const delta = extractAssistantDelta(event)
            if (!delta) {
              return
            }

            emittedDelta = true
            options?.onAssistantDelta?.(delta)
          },
        })

        return {
          assistantMessage,
          emittedDelta,
        }
      } catch (error) {
        throw normalizeBridgeError(error)
      }
    },

    async planChanges(request, assistantMessage) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptStore.loadPrompt()

      try {
        const rawText = await runner.execute(
          buildPlanningPrompt(request, assistantMessage, loadedPrompt),
          RESPONSE_SCHEMA,
        )
        return normalizePlanPayload(request, assistantMessage, parsePlanPayload(rawText))
      } catch (error) {
        throw normalizeBridgeError(error)
      }
    },
  }
}
