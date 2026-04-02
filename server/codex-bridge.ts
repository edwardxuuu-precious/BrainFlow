import type {
  AiCanvasOperation,
  AiCanvasProposal,
  AiChatRequest,
  AiChatResponse,
  CodexBridgeIssue,
  CodexStatus,
} from '../shared/ai-contract.js'
import { createCodexRunner, type CodexRunner } from './codex-runner.js'
import { loadSystemPrompt, type LoadedSystemPrompt } from './system-prompt.js'

interface RawProposalOperation {
  type: 'create_child' | 'create_sibling' | 'update_topic'
  parentTopicId: string | null
  targetTopicId: string | null
  topicId: string | null
  title: string | null
  note: string | null
}

interface RawProposalPayload {
  id: string
  summary: string
  operations: RawProposalOperation[]
}

interface RawAiResponsePayload {
  assistantMessage: string
  needsMoreContext: boolean
  contextRequest: string[] | null
  proposal: RawProposalPayload | null
}

export class CodexBridgeError extends Error {
  code: 'verification_required' | 'request_failed' | 'invalid_request'
  issues?: CodexBridgeIssue[]

  constructor(
    code: 'verification_required' | 'request_failed' | 'invalid_request',
    message: string,
    issues?: CodexBridgeIssue[],
  ) {
    super(message)
    this.name = 'CodexBridgeError'
    this.code = code
    this.issues = issues
  }
}

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assistantMessage', 'needsMoreContext', 'contextRequest', 'proposal'],
  properties: {
    assistantMessage: { type: 'string' },
    needsMoreContext: { type: 'boolean' },
    contextRequest: {
      anyOf: [
        {
          type: 'array',
          items: { type: 'string' },
        },
        { type: 'null' },
      ],
    },
    proposal: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'summary', 'operations'],
          properties: {
            id: { type: 'string' },
            summary: { type: 'string' },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'type',
                  'parentTopicId',
                  'targetTopicId',
                  'topicId',
                  'title',
                  'note',
                ],
                properties: {
                  type: {
                    type: 'string',
                    enum: ['create_child', 'create_sibling', 'update_topic'],
                  },
                  parentTopicId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  targetTopicId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  topicId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  title: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                },
              },
            },
          },
        },
        { type: 'null' },
      ],
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
  return trimmed ? trimmed : undefined
}

function normalizeOperation(operation: RawProposalOperation): AiCanvasOperation {
  switch (operation.type) {
    case 'create_child': {
      const parentTopicId = normalizeText(operation.parentTopicId)
      const title = normalizeText(operation.title)

      if (!parentTopicId || !title) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 create_child 提案。')
      }

      return {
        type: 'create_child',
        parentTopicId,
        title,
        note: normalizeText(operation.note),
      }
    }

    case 'create_sibling': {
      const targetTopicId = normalizeText(operation.targetTopicId)
      const title = normalizeText(operation.title)

      if (!targetTopicId || !title) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 create_sibling 提案。')
      }

      return {
        type: 'create_sibling',
        targetTopicId,
        title,
        note: normalizeText(operation.note),
      }
    }

    case 'update_topic': {
      const topicId = normalizeText(operation.topicId)
      const title = normalizeText(operation.title)
      const note = normalizeText(operation.note)

      if (!topicId || (!title && note === undefined)) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 update_topic 提案。')
      }

      return {
        type: 'update_topic',
        topicId,
        title,
        note,
      }
    }
  }
}

function normalizeResponsePayload(
  request: AiChatRequest,
  rawPayload: RawAiResponsePayload,
): AiChatResponse {
  const assistantMessage =
    normalizeText(rawPayload.assistantMessage) ?? '我需要更多上下文才能安全回答这个问题。'
  const contextRequest =
    rawPayload.contextRequest?.map(normalizeText).filter(Boolean) as string[] | undefined

  let proposal: AiCanvasProposal | null = null
  if (rawPayload.proposal && rawPayload.proposal.operations.length > 0) {
    proposal = {
      id: normalizeText(rawPayload.proposal.id) ?? createProposalId(),
      summary: normalizeText(rawPayload.proposal.summary) ?? 'Codex 生成了一组待审批的脑图变更。',
      baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
      operations: rawPayload.proposal.operations.map(normalizeOperation),
    }
  }

  return {
    assistantMessage,
    needsMoreContext: rawPayload.needsMoreContext,
    contextRequest,
    proposal,
  }
}

function parseResponsePayload(rawText: string | null | undefined): RawAiResponsePayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空响应。')
  }

  const parsed = JSON.parse(rawText) as Partial<RawAiResponsePayload>
  if (
    typeof parsed.assistantMessage !== 'string' ||
    typeof parsed.needsMoreContext !== 'boolean' ||
    !('contextRequest' in parsed) ||
    !('proposal' in parsed)
  ) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了不符合约束的结构化结果。')
  }

  return parsed as RawAiResponsePayload
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
    '返回要求：',
    '- 必须严格返回符合 schema 的 JSON。',
    '- assistantMessage 直接回答用户问题。',
    '- 当上下文不足时，needsMoreContext=true，并在 contextRequest 中说明还需要哪些节点。',
    '- proposal 只能使用 create_child、create_sibling、update_topic，且 update_topic 仅允许 title / note。',
    '',
    '当前请求上下文：',
    JSON.stringify(
      {
        documentId: request.documentId,
        conversationId: request.conversationId,
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
  chat(request: AiChatRequest): Promise<AiChatResponse>
}

interface CreateCodexBridgeOptions {
  runner?: CodexRunner
  loadedPrompt?: LoadedSystemPrompt
}

export function createCodexBridge(options?: CreateCodexBridgeOptions): CodexBridge {
  const runner = options?.runner ?? createCodexRunner()
  const promptPromise = options?.loadedPrompt ? Promise.resolve(options.loadedPrompt) : loadSystemPrompt()

  const buildStatus = async (): Promise<CodexStatus> => {
    const [runnerStatus, loadedPrompt] = await Promise.all([runner.getStatus(), promptPromise])

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
    async chat(request) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptPromise
      const rawText = await runner.execute(buildPrompt(request, loadedPrompt), RESPONSE_SCHEMA)
      return normalizeResponsePayload(request, parseResponsePayload(rawText))
    },
  }
}
