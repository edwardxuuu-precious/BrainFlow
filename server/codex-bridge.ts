import type {
  AiDocumentTopicContext,
  AiImportOperation,
  AiRunStage,
  AiCanvasOperation,
  AiCanvasProposal,
  AiCanvasTarget,
  AiChatRequest,
  AiChatResponse,
  AiTopicMetadataPatch,
  AiTopicStyle,
  CodexBridgeIssue,
  CodexSettings,
  CodexStatus,
  TextImportSemanticAdjudicationRequest,
  TextImportSemanticAdjudicationResponse,
  TextImportSemanticDecision,
  TextImportConflict,
  TextImportCodexDiagnostic,
  TextImportCodexDiagnosticCategory,
  TextImportCodexEvent,
  TextImportCodexExplainer,
  TextImportPreviewItem,
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportRunnerAttempt,
  TextImportRunnerObservation,
} from '../shared/ai-contract.js'
import {
  createCodexRunner,
  type CodexExecutionObservation,
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
  metadata?: unknown
  style?: unknown
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

interface RawImportOperation extends RawProposalOperation {
  id?: string | null
  risk?: string | null
  conflictId?: string | null
  reason?: string | null
}

interface RawImportConflict {
  id?: string | null
  title?: string | null
  description?: string | null
  kind?: string | null
  operationIds?: string[] | null
  targetTopicIds?: string[] | null
}

interface RawImportPreviewItem {
  id?: string | null
  parentId?: string | null
  order?: number | null
  title?: string | null
  note?: string | null
  relation?: string | null
  matchedTopicId?: string | null
  reason?: string | null
}

interface RawImportPayload {
  summary?: string | null
  previewNodes?: RawImportPreviewItem[] | null
  operations?: RawImportOperation[] | null
  conflicts?: RawImportConflict[] | null
  warnings?: string[] | null
}

interface RawSemanticDecision {
  candidateId?: string | null
  kind?: string | null
  confidence?: string | null
  mergedTitle?: string | null
  mergedSummary?: string | null
  evidence?: string | null
}

interface RawSemanticAdjudicationPayload {
  decisions?: RawSemanticDecision[] | null
  warnings?: string[] | null
}

export interface CodexChatStreamResult {
  assistantMessage: string
  emittedDelta: boolean
}

export interface CodexChatStreamOptions {
  onAssistantDelta?: (delta: string) => void
}

export interface TextImportStatusUpdate {
  stage: TextImportRunStage
  message: string
  durationMs?: number
}

export type TextImportRunnerObservationUpdate = TextImportRunnerObservation
export type TextImportCodexEventUpdate = TextImportCodexEvent
export type TextImportCodexExplainerUpdate = TextImportCodexExplainer
export type TextImportCodexDiagnosticUpdate = TextImportCodexDiagnostic

export interface TextImportPreviewOptions {
  requestId?: string
  onStatus?: (update: TextImportStatusUpdate) => void
  onRunnerObservation?: (update: TextImportRunnerObservationUpdate) => void
  onCodexEvent?: (update: TextImportCodexEventUpdate) => void
  onCodexExplainer?: (update: TextImportCodexExplainerUpdate) => void
  onCodexDiagnostic?: (update: TextImportCodexDiagnosticUpdate) => void
}

export class CodexBridgeError extends Error {
  code: CodexBridgeIssue['code'] | 'invalid_request'
  issues?: CodexBridgeIssue[]
  rawMessage?: string
  stage?: AiRunStage | TextImportRunStage

  constructor(
    code: CodexBridgeIssue['code'] | 'invalid_request',
    message: string,
    issues?: CodexBridgeIssue[],
    rawMessage?: string,
    stage?: AiRunStage | TextImportRunStage,
  ) {
    super(message)
    this.name = 'CodexBridgeError'
    this.code = code
    this.issues = issues
    this.rawMessage = rawMessage
    this.stage = stage
  }
}

const METADATA_PATCH_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['labels', 'markers', 'task', 'links', 'attachments'],
  properties: {
    labels: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    markers: {
      type: ['array', 'null'],
      items: {
        type: 'string',
        enum: ['important', 'question', 'idea', 'warning', 'decision', 'blocked'],
      },
    },
    task: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['status', 'priority', 'dueDate'],
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: ['string', 'null'] },
      },
    },
    links: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'label', 'href', 'targetTopicId', 'path'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['web', 'topic', 'local'] },
          label: { type: 'string' },
          href: { type: ['string', 'null'] },
          targetTopicId: { type: ['string', 'null'] },
          path: { type: ['string', 'null'] },
        },
      },
    },
    attachments: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'uri', 'source', 'mimeType'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          uri: { type: 'string' },
          source: { type: 'string', enum: ['local', 'url'] },
          mimeType: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const

const STYLE_PATCH_SCHEMA = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['emphasis', 'variant', 'background', 'textColor', 'branchColor'],
  properties: {
    emphasis: { type: ['string', 'null'], enum: ['normal', 'focus', null] },
    variant: { type: ['string', 'null'], enum: ['default', 'soft', 'solid', null] },
    background: { type: ['string', 'null'] },
    textColor: { type: ['string', 'null'] },
    branchColor: { type: ['string', 'null'] },
  },
} as const

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
    'metadata',
    'style',
  ],
  properties: {
    type: { type: ['string', 'null'] },
    parent: { type: ['string', 'null'] },
    anchor: { type: ['string', 'null'] },
    target: { type: ['string', 'null'] },
    newParent: { type: ['string', 'null'] },
    targetIndex: { type: ['integer', 'null'] },
    title: { type: ['string', 'null'] },
    note: { type: ['string', 'null'] },
    resultRef: { type: ['string', 'null'] },
    parentTopicId: { type: ['string', 'null'] },
    targetTopicId: { type: ['string', 'null'] },
    topicId: { type: ['string', 'null'] },
    targetParentId: { type: ['string', 'null'] },
    metadata: METADATA_PATCH_SCHEMA,
    style: STYLE_PATCH_SCHEMA,
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

const IMPORT_OPERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'risk',
    'conflictId',
    'reason',
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
    'metadata',
    'style',
  ],
  properties: {
    id: { type: ['string', 'null'] },
    risk: { type: ['string', 'null'], enum: ['low', 'high', null] },
    conflictId: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    ...OPERATION_SCHEMA.properties,
  },
} as const

const IMPORT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'previewNodes', 'operations', 'conflicts', 'warnings'],
  properties: {
    summary: { type: ['string', 'null'] },
    previewNodes: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'parentId', 'order', 'title', 'note', 'relation', 'matchedTopicId', 'reason'],
        properties: {
          id: { type: ['string', 'null'] },
          parentId: { type: ['string', 'null'] },
          order: { type: ['integer', 'null'] },
          title: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          relation: { type: ['string', 'null'], enum: ['new', 'merge', 'conflict', null] },
          matchedTopicId: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
        },
      },
    },
    operations: {
      type: ['array', 'null'],
      items: IMPORT_OPERATION_SCHEMA,
    },
    conflicts: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'description', 'kind', 'operationIds', 'targetTopicIds'],
        properties: {
          id: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          kind: {
            type: ['string', 'null'],
            enum: [
              'rename',
              'move',
              'delete',
              'merge',
              'locked',
              'ambiguous_parent',
              'duplicate',
              'content_overlap',
              'code_block',
              'table',
              'other',
              null,
            ],
          },
          operationIds: {
            type: ['array', 'null'],
            items: { type: 'string' },
          },
          targetTopicIds: {
            type: ['array', 'null'],
            items: { type: 'string' },
          },
        },
      },
    },
    warnings: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
  },
} as const

const SEMANTIC_ADJUDICATION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions', 'warnings'],
  properties: {
    decisions: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['candidateId', 'kind', 'confidence', 'mergedTitle', 'mergedSummary', 'evidence'],
        properties: {
          candidateId: { type: ['string', 'null'] },
          kind: {
            type: ['string', 'null'],
            enum: ['same_topic', 'partial_overlap', 'conflict', 'distinct', null],
          },
          confidence: { type: ['string', 'null'], enum: ['high', 'medium', null] },
          mergedTitle: { type: ['string', 'null'] },
          mergedSummary: { type: ['string', 'null'] },
          evidence: { type: ['string', 'null'] },
        },
      },
    },
    warnings: {
      type: ['array', 'null'],
      items: { type: 'string' },
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

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  return value
    .map((item) => normalizeText(typeof item === 'string' ? item : undefined))
    .filter((item): item is string => !!item)
}

function normalizeMetadataPatch(value: unknown): AiTopicMetadataPatch | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const raw = value as {
    labels?: unknown
    markers?: unknown
    task?: unknown
    links?: unknown
    attachments?: unknown
  }

  const patch: AiTopicMetadataPatch = {}

  if ('labels' in raw) {
    patch.labels = normalizeStringArray(raw.labels) ?? []
  }

  if ('markers' in raw) {
    patch.markers = (normalizeStringArray(raw.markers) ?? []).filter((marker) =>
      ['important', 'question', 'idea', 'warning', 'decision', 'blocked'].includes(marker),
    ) as AiTopicMetadataPatch['markers']
  }

  if ('task' in raw) {
    if (raw.task === null) {
      patch.task = null
    } else if (raw.task && typeof raw.task === 'object' && !Array.isArray(raw.task)) {
      const task = raw.task as {
        status?: unknown
        priority?: unknown
        dueDate?: unknown
      }
      if (
        typeof task.status === 'string' &&
        ['todo', 'in_progress', 'done'].includes(task.status) &&
        typeof task.priority === 'string' &&
        ['low', 'medium', 'high'].includes(task.priority) &&
        (typeof task.dueDate === 'string' || task.dueDate === null || task.dueDate === undefined)
      ) {
        patch.task = {
          status: task.status as 'todo' | 'in_progress' | 'done',
          priority: task.priority as 'low' | 'medium' | 'high',
          dueDate: typeof task.dueDate === 'string' ? task.dueDate : null,
        }
      } else {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 task 提案。')
      }
    }
  }

  if ('links' in raw) {
    if (raw.links === null) {
      patch.links = []
    } else if (Array.isArray(raw.links)) {
      patch.links = raw.links.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的链接提案。')
        }

        const link = item as {
          id?: unknown
          type?: unknown
          label?: unknown
          href?: unknown
          targetTopicId?: unknown
          path?: unknown
        }

        if (
          typeof link.id !== 'string' ||
          typeof link.type !== 'string' ||
          typeof link.label !== 'string'
        ) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的链接提案。')
        }
        if (!['web', 'topic', 'local'].includes(link.type)) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的链接类型。')
        }

        return {
          id: link.id,
          type: link.type as 'web' | 'topic' | 'local',
          label: link.label,
          href: typeof link.href === 'string' ? link.href : undefined,
          targetTopicId: typeof link.targetTopicId === 'string' ? link.targetTopicId : undefined,
          path: typeof link.path === 'string' ? link.path : undefined,
        }
      })
    }
  }

  if ('attachments' in raw) {
    if (raw.attachments === null) {
      patch.attachments = []
    } else if (Array.isArray(raw.attachments)) {
      patch.attachments = raw.attachments.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的附件提案。')
        }

        const attachment = item as {
          id?: unknown
          name?: unknown
          uri?: unknown
          source?: unknown
          mimeType?: unknown
        }

        if (
          typeof attachment.id !== 'string' ||
          typeof attachment.name !== 'string' ||
          typeof attachment.uri !== 'string' ||
          typeof attachment.source !== 'string'
        ) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的附件提案。')
        }
        if (!['local', 'url'].includes(attachment.source)) {
          throw new CodexBridgeError('request_failed', 'Codex 返回了无效的附件来源。')
        }

        return {
          id: attachment.id,
          name: attachment.name,
          uri: attachment.uri,
          source: attachment.source as 'local' | 'url',
          mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : null,
        }
      })
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

function normalizeStylePatch(value: unknown): AiTopicStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const raw = value as {
    emphasis?: unknown
    variant?: unknown
    background?: unknown
    textColor?: unknown
    branchColor?: unknown
  }
  const patch: AiTopicStyle = {}

  if ('emphasis' in raw) {
    if (
      raw.emphasis === null ||
      raw.emphasis === 'normal' ||
      raw.emphasis === 'focus'
    ) {
      patch.emphasis = raw.emphasis ?? undefined
    } else {
      throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 emphasis 提案。')
    }
  }

  if ('variant' in raw) {
    if (
      raw.variant === null ||
      raw.variant === 'default' ||
      raw.variant === 'soft' ||
      raw.variant === 'solid'
    ) {
      patch.variant = raw.variant ?? undefined
    } else {
      throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 variant 提案。')
    }
  }

  if ('background' in raw) {
    patch.background = typeof raw.background === 'string' ? raw.background : undefined
  }

  if ('textColor' in raw) {
    patch.textColor = typeof raw.textColor === 'string' ? raw.textColor : undefined
  }

  if ('branchColor' in raw) {
    patch.branchColor = typeof raw.branchColor === 'string' ? raw.branchColor : undefined
  }

  return Object.keys(patch).length > 0 ? patch : undefined
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
        metadata: normalizeMetadataPatch(operation.metadata),
        style: normalizeStylePatch(operation.style),
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
        metadata: normalizeMetadataPatch(operation.metadata),
        style: normalizeStylePatch(operation.style),
        resultRef: normalizeText(operation.resultRef),
      }
    }

    case 'update_topic': {
      const target = createTargetReference(operation.target, operation.topicId)
      const title = normalizeText(operation.title)
      const note = normalizeNote(operation.note)
      const metadata = normalizeMetadataPatch(operation.metadata)
      const style = normalizeStylePatch(operation.style)
      if (!target || (title === undefined && note === undefined && !metadata && !style)) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 update_topic 提案。')
      }

      return {
        type: 'update_topic',
        target,
        title,
        note,
        metadata,
        style,
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

function createImportOperationId(): string {
  return `import_op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeImportOperation(operation: RawImportOperation): AiImportOperation {
  const risk = normalizeText(operation.risk)
  if (risk !== 'low' && risk !== 'high') {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入操作风险级别。')
  }

  return {
    ...normalizeOperation(operation),
    id: normalizeText(operation.id) ?? createImportOperationId(),
    risk,
    conflictId: normalizeText(operation.conflictId),
    reason: normalizeText(operation.reason),
  }
}

function normalizeImportPreviewItem(value: RawImportPreviewItem): TextImportPreviewItem {
  const title = normalizeText(value.title)
  const relation = normalizeText(value.relation)
  const order = typeof value.order === 'number' && Number.isInteger(value.order) ? value.order : null
  if (
    !title ||
    order === null ||
    (relation !== 'new' && relation !== 'merge' && relation !== 'conflict')
  ) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入预览节点。')
  }

  return {
    id: normalizeText(value.id) ?? createImportOperationId(),
    parentId: normalizeText(value.parentId) ?? null,
    order,
    title,
    note: normalizeNote(value.note) ?? null,
    relation,
    matchedTopicId: normalizeText(value.matchedTopicId) ?? null,
    reason: normalizeText(value.reason) ?? null,
  }
}

function validateImportPreviewItems(items: TextImportPreviewItem[]): TextImportPreviewItem[] {
  const ids = new Set<string>()

  for (const item of items) {
    if (ids.has(item.id)) {
      throw new CodexBridgeError('request_failed', `Codex 返回了重复的导入预览节点 id: ${item.id}`)
    }
    ids.add(item.id)
  }

  for (const item of items) {
    if (item.parentId && !ids.has(item.parentId)) {
      throw new CodexBridgeError(
        'request_failed',
        `Codex 返回了无效的导入预览父节点引用: ${item.parentId}`,
      )
    }
    if (item.parentId === item.id) {
      throw new CodexBridgeError('request_failed', `Codex 返回了自引用的导入预览节点: ${item.id}`)
    }
  }

  return [...items].sort((left, right) => {
    if (left.parentId !== right.parentId) {
      return (left.parentId ?? '').localeCompare(right.parentId ?? '')
    }
    if (left.order !== right.order) {
      return left.order - right.order
    }
    return left.id.localeCompare(right.id)
  })
}

function normalizeImportConflict(value: RawImportConflict): TextImportConflict {
  const id = normalizeText(value.id)
  const title = normalizeText(value.title)
  const description = normalizeText(value.description)
  const kind = normalizeText(value.kind)
  if (
    !id ||
    !title ||
    !description ||
    !kind ||
    ![
      'rename',
      'move',
      'delete',
      'merge',
      'locked',
      'ambiguous_parent',
      'duplicate',
      'content_overlap',
      'code_block',
      'table',
      'other',
    ].includes(kind)
  ) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入冲突项。')
  }

  return {
    id,
    title,
    description,
    kind: kind as TextImportConflict['kind'],
    operationIds: normalizeStringArray(value.operationIds) ?? [],
    targetTopicIds: normalizeStringArray(value.targetTopicIds) ?? [],
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

function normalizeImportPayload(
  request: TextImportRequest,
  rawPayload: RawImportPayload,
): TextImportResponse {
  const previewNodes = validateImportPreviewItems(
    (rawPayload.previewNodes ?? []).map(normalizeImportPreviewItem),
  )

  return {
    summary: normalizeText(rawPayload.summary) ?? '智能导入预览已生成。',
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    previewNodes,
    operations: (rawPayload.operations ?? []).map(normalizeImportOperation),
    conflicts: (rawPayload.conflicts ?? []).map(normalizeImportConflict),
    warnings: (rawPayload.warnings ?? [])
      .map((item) => normalizeText(item))
      .filter((item): item is string => !!item),
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

function parseImportPayload(rawText: string | null | undefined): RawImportPayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空的导入预览结果。')
  }

  const parsed = JSON.parse(rawText) as RawImportPayload
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入预览结构。')
  }

  return parsed
}

function parseSemanticAdjudicationPayload(
  rawText: string | null | undefined,
): RawSemanticAdjudicationPayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空的语义裁决结果。')
  }

  const parsed = JSON.parse(rawText) as RawSemanticAdjudicationPayload
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的语义裁决结构。')
  }

  return parsed
}

function normalizeSemanticDecision(value: RawSemanticDecision): TextImportSemanticDecision {
  const candidateId = normalizeText(value.candidateId)
  const kind = normalizeText(value.kind)
  const confidence = normalizeText(value.confidence)
  const evidence = normalizeText(value.evidence)

  if (
    !candidateId ||
    !kind ||
    !confidence ||
    !evidence ||
    !['same_topic', 'partial_overlap', 'conflict', 'distinct'].includes(kind) ||
    !['high', 'medium'].includes(confidence)
  ) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的语义裁决结果。')
  }

  return {
    candidateId,
    kind: kind as TextImportSemanticDecision['kind'],
    confidence: confidence as TextImportSemanticDecision['confidence'],
    mergedTitle: normalizeText(value.mergedTitle) ?? null,
    mergedSummary: normalizeText(value.mergedSummary) ?? null,
    evidence,
  }
}

function normalizeSemanticAdjudicationPayload(
  rawPayload: RawSemanticAdjudicationPayload,
): TextImportSemanticAdjudicationResponse {
  return {
    decisions: (rawPayload.decisions ?? []).map(normalizeSemanticDecision),
    warnings: (rawPayload.warnings ?? [])
      .map((item) => normalizeText(item))
      .filter((item): item is string => !!item),
  }
}

function formatImportLog(
  requestId: string | undefined,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const prefix = requestId ? `[import][requestId=${requestId}]` : '[import]'
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
  return payload ? `${prefix} ${payload}` : prefix
}

function formatSemanticLog(
  jobId: string | undefined,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const prefix = jobId ? `[semantic][jobId=${jobId}]` : '[semantic]'
  const payload = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
  return payload ? `${prefix} ${payload}` : prefix
}

function summarizeLogText(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return undefined
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function normalizeBridgeError(error: unknown): CodexBridgeError {
  if (error instanceof CodexBridgeError) {
    return error
  }

  const issue =
    typeof error === 'object' && error && 'issue' in error
      ? (error as { issue?: CodexBridgeIssue }).issue
      : undefined
  const rawMessage =
    typeof error === 'object' && error && 'rawMessage' in error
      ? normalizeText((error as { rawMessage?: string | null }).rawMessage)
      : undefined
  const stage =
    typeof error === 'object' && error && 'stage' in error
      ? ((error as { stage?: AiRunStage | TextImportRunStage }).stage ?? undefined)
      : undefined

  if (issue) {
    return new CodexBridgeError(issue.code, issue.message, [issue], rawMessage, stage)
  }

  return new CodexBridgeError(
    'request_failed',
    error instanceof Error ? error.message : 'Codex 请求失败。',
    undefined,
    error instanceof Error ? error.message : undefined,
    stage,
  )
}

function withImportStage(error: unknown, stage: TextImportRunStage): CodexBridgeError {
  const normalized = normalizeBridgeError(error)
  normalized.stage = normalized.stage ?? stage
  return normalized
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
    '- Locked nodes have aiLocked=true. You may read them. You may create_child under a locked node or create_sibling around a locked node, but you must not update_topic, move_topic, or delete_topic on a locked node. That restriction also covers note, metadata, and style changes.',
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

interface CompactImportTopicSummary {
  topicId: string
  title: string
  parentTopicId: string | null
  childTopicIds: string[]
  aiLocked: boolean
  note?: string
  notePreview?: string
  metadata?: Partial<AiDocumentTopicContext['metadata']>
  style?: Partial<AiDocumentTopicContext['style']>
}

interface BuiltTextImportPromptContext {
  promptContextText: string
  focusedTopicCount: number
  compactTopicCount: number
  notePreviewCount: number
  preprocessedHintCount: number
  promptContextLength: number
}

function hasMeaningfulMetadata(topic: AiDocumentTopicContext): boolean {
  return (
    topic.metadata.labels.length > 0 ||
    topic.metadata.markers.length > 0 ||
    topic.metadata.task !== null ||
    topic.metadata.links.length > 0 ||
    topic.metadata.attachments.length > 0
  )
}

function hasMeaningfulStyle(topic: AiDocumentTopicContext): boolean {
  return (
    topic.style.emphasis === 'focus' ||
    topic.style.variant === 'soft' ||
    topic.style.variant === 'solid' ||
    Boolean(topic.style.background) ||
    Boolean(topic.style.textColor) ||
    Boolean(topic.style.branchColor)
  )
}

function truncateImportNotePreview(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function collectAncestorTopicIds(
  topicsById: Map<string, AiDocumentTopicContext>,
  startId: string | null,
  target: Set<string>,
): void {
  let cursorId = startId

  while (cursorId) {
    const topic = topicsById.get(cursorId)
    if (!topic) {
      break
    }

    target.add(topic.topicId)
    cursorId = topic.parentTopicId
  }
}

function collectDescendantTopicIds(
  topicsById: Map<string, AiDocumentTopicContext>,
  startId: string | null,
  maxDepth: number,
  target: Set<string>,
): void {
  if (!startId) {
    return
  }

  const queue: Array<{ topicId: string; depth: number }> = [{ topicId: startId, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    const topic = topicsById.get(current.topicId)
    if (!topic) {
      continue
    }

    target.add(topic.topicId)
    if (current.depth >= maxDepth) {
      continue
    }

    topic.childTopicIds.forEach((childTopicId) => {
      queue.push({
        topicId: childTopicId,
        depth: current.depth + 1,
      })
    })
  }
}

function buildFocusedImportTopic(topic: AiDocumentTopicContext): CompactImportTopicSummary {
  const metadata = {
    ...(topic.metadata.labels.length > 0 ? { labels: topic.metadata.labels } : {}),
    ...(topic.metadata.markers.length > 0 ? { markers: topic.metadata.markers } : {}),
    ...(topic.metadata.task !== null ? { task: topic.metadata.task } : {}),
    ...(topic.metadata.links.length > 0 ? { links: topic.metadata.links } : {}),
    ...(topic.metadata.attachments.length > 0 ? { attachments: topic.metadata.attachments } : {}),
  }
  const style = {
    ...(topic.style.emphasis === 'focus' ? { emphasis: topic.style.emphasis } : {}),
    ...(topic.style.variant !== 'default' ? { variant: topic.style.variant } : {}),
    ...(topic.style.background ? { background: topic.style.background } : {}),
    ...(topic.style.textColor ? { textColor: topic.style.textColor } : {}),
    ...(topic.style.branchColor ? { branchColor: topic.style.branchColor } : {}),
  }

  return {
    topicId: topic.topicId,
    title: topic.title,
    parentTopicId: topic.parentTopicId,
    childTopicIds: [...topic.childTopicIds],
    aiLocked: topic.aiLocked,
    ...(topic.note.trim() ? { note: topic.note } : {}),
    ...(hasMeaningfulMetadata(topic) ? { metadata } : {}),
    ...(hasMeaningfulStyle(topic) ? { style } : {}),
  }
}

function buildCompactImportTopic(topic: AiDocumentTopicContext): CompactImportTopicSummary {
  const notePreview = truncateImportNotePreview(topic.note)
  return {
    topicId: topic.topicId,
    title: topic.title,
    parentTopicId: topic.parentTopicId,
    childTopicIds: [...topic.childTopicIds],
    aiLocked: topic.aiLocked,
    ...(notePreview ? { notePreview } : {}),
  }
}

function buildTextImportPromptContext(request: TextImportRequest): BuiltTextImportPromptContext {
  const topicsById = new Map(request.context.topics.map((topic) => [topic.topicId, topic]))
  const focusedTopicIds = new Set<string>()
  const focusRoots = new Set<string>()

  if (request.context.focus.activeTopicId) {
    focusRoots.add(request.context.focus.activeTopicId)
  }
  request.context.focus.selectedTopicIds.forEach((topicId) => focusRoots.add(topicId))
  if (request.anchorTopicId) {
    focusRoots.add(request.anchorTopicId)
  }

  if (focusRoots.size === 0) {
    focusRoots.add(request.context.rootTopicId)
  }

  focusRoots.forEach((topicId) => {
    collectAncestorTopicIds(topicsById, topicId, focusedTopicIds)
    collectDescendantTopicIds(topicsById, topicId, 2, focusedTopicIds)
  })

  const focusedTopics: CompactImportTopicSummary[] = []
  const compactTopics: CompactImportTopicSummary[] = []

  request.context.topics.forEach((topic) => {
    if (focusedTopicIds.has(topic.topicId)) {
      focusedTopics.push(buildFocusedImportTopic(topic))
      return
    }

    compactTopics.push(buildCompactImportTopic(topic))
  })

  const promptContext = {
    documentId: request.documentId,
    documentTitle: request.documentTitle,
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    source: {
      sourceName: request.sourceName,
      sourceType: request.sourceType,
      rawText: request.rawText,
      rawTextLength: request.rawText.length,
      preprocessedHintCount: request.preprocessedHints.length,
      preprocessedHints: request.preprocessedHints.map((hint) => ({
        id: hint.id,
        kind: hint.kind,
        text: hint.text,
        level: hint.level,
        lineStart: hint.lineStart,
        lineEnd: hint.lineEnd,
        sourcePath: hint.sourcePath,
        language: hint.language,
        items: hint.items,
        checked: hint.checked,
        rows: hint.rows,
      })),
    },
    focus: request.context.focus,
    mapSummary: {
      rootTopicId: request.context.rootTopicId,
      topicCount: request.context.topicCount,
      focusedTopicCount: focusedTopics.length,
      compactTopicCount: compactTopics.length,
    },
    focusedTopics,
    compactTopics,
  }

  const promptContextText = JSON.stringify(promptContext, null, 2)

  return {
    promptContextText,
    focusedTopicCount: focusedTopics.length,
    compactTopicCount: compactTopics.length,
    notePreviewCount: compactTopics.filter((topic) => typeof topic.notePreview === 'string').length,
    preprocessedHintCount: request.preprocessedHints.length,
    promptContextLength: promptContextText.length,
  }
}

function buildTextImportPrompt(
  prompt: LoadedSystemPrompt,
  promptContextText: string,
  mode: 'primary' | 'repair' = 'primary',
): string {
  return [
    prompt.fullPrompt,
    '',
    'Text import goal:',
    '- Return valid JSON only.',
    '- Deeply analyze the source text and the full current mind map before proposing changes.',
     '- First decide whether the input looks like markdown, plain text, meeting notes, checklist, rough notes, or mixed material.',
     '- Preserve all source information. Do not omit content just because you also summarized it.',
     '- Use the preprocessing hints only as clues, not as a rigid schema.',
     '- When structure is clear, headings and lists may become mind-map nodes.',
     '- When the source is dialogue, chat, or meeting back-and-forth, prefer finer-grained nodes for decisions, questions, action items, disagreements, and next steps instead of collapsing everything into one note.',
     '- When the source contains tables or semi-structured data, preserve the full table in note text and, when helpful, create finer-grained nodes for headers, entities, rows, or comparisons.',
     '- When the source is long-form prose without explicit markdown structure, infer a concise hierarchy of themes or sections, but keep the original text preserved in the relevant notes.',
     '- Paragraphs, quotes, code blocks, tables, and ambiguous long-form content must remain fully preserved in note text on the relevant node, even if you also create structured child nodes from them.',
     '- Treat the selected anchor topic as the preferred insertion point, but use the full graph to deduplicate or merge safely.',
    '- Use low risk only for clearly safe additions or merges. Use high risk for rename, move, delete, overwrite, ambiguous merge, locked-node conflicts, or any structural change that may surprise the user.',
    '- Locked nodes have aiLocked=true. You may read them. You may create_child under a locked node or create_sibling around a locked node, but you must not update_topic, move_topic, or delete_topic on a locked node.',
    '- Every high-risk operation should reference a conflictId, and every conflict should explain the user-facing reason clearly.',
    '- previewNodes must be a flat array. Do not output nested children objects.',
    '- Every preview node must include: id, parentId, order, title, note, relation, matchedTopicId, reason.',
    '- parentId must be null for top-level preview nodes or the id of another preview node.',
    '- order must be a stable integer among siblings, starting from 0 when possible.',
    '- operations must use existing topic references as topic:<realTopicId>. If you need temporary references for newly created nodes, use resultRef and then ref:<resultRef>.',
    mode === 'repair'
      ? '- This is a repair attempt because the previous output was not schema-compatible or structurally valid. Be extra conservative and produce only flat previewNodes plus valid operations/conflicts.'
      : '- Prefer a complete, stable import preview on the first attempt.',
    '',
    'Current import context:',
    promptContextText,
  ].join('\n')
}

function buildTextImportSemanticAdjudicationPrompt(
  request: TextImportSemanticAdjudicationRequest,
  prompt: LoadedSystemPrompt,
): string {
  return [
    prompt.fullPrompt,
    '',
    'Semantic adjudication goal:',
    '- Return valid JSON only.',
    '- Judge each candidate pair independently and conservatively.',
    '- Use same_topic only when the import node and target clearly refer to the same concept and can be auto-merged safely.',
    '- Use partial_overlap when the concepts overlap materially but the imported source still adds distinct nuance.',
    '- Use conflict when the pair covers the same apparent topic but contains materially conflicting claims or framing.',
    '- Use distinct when they should remain separate nodes.',
    '- confidence=high means the app may auto-merge note content and, when multiple mergedTitle values are consistent, auto-update titles.',
    '- confidence=medium means the app will keep the result as a review suggestion.',
    '- mergedTitle should be null unless a concise unified title is clearly better than both originals.',
    '- mergedSummary should preserve key观点、步骤、数据，不要丢来源含义。',
    '- evidence must be a short user-facing reason grounded in the provided snapshots.',
    '',
    'Candidate batch context:',
    JSON.stringify(request, null, 2),
  ].join('\n')
}

function isRetryableImportError(error: CodexBridgeError): boolean {
  if (error.code === 'schema_invalid') {
    return true
  }

  const text = `${error.message}\n${error.rawMessage ?? ''}`.toLowerCase()
  return (
    text.includes('schema') ||
    text.includes('导入预览') ||
    text.includes('导入预览节点') ||
    text.includes('preview') ||
    text.includes('parent') ||
    text.includes('conflict') ||
    text.includes('duplicate') ||
    text.includes('invalid')
  )
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

function summarizeCodexEventText(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return fallback
  }

  try {
    const parsed = JSON.parse(trimmed) as { summary?: unknown; assistantMessage?: unknown }
    if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
      return `已生成结构化结果：${summarizeLogText(parsed.summary.trim(), 120) ?? parsed.summary.trim()}`
    }
    if (typeof parsed.assistantMessage === 'string' && parsed.assistantMessage.trim()) {
      return summarizeLogText(parsed.assistantMessage.trim(), 120) ?? parsed.assistantMessage.trim()
    }
  } catch {
    // Structured import often returns JSON text; if it is not valid JSON, fall through to plain-text summary.
  }

  return summarizeLogText(trimmed, 120) ?? fallback
}

function extractCodexUsageSummary(event: CodexJsonEvent): string | null {
  const usage =
    (event as { usage?: Record<string, unknown> }).usage ??
    (event as { turn?: { usage?: Record<string, unknown> } }).turn?.usage

  if (!usage || typeof usage !== 'object') {
    return null
  }

  const inputTokens =
    typeof usage.input_tokens === 'number'
      ? usage.input_tokens
      : typeof usage.inputTokens === 'number'
        ? usage.inputTokens
        : null
  const outputTokens =
    typeof usage.output_tokens === 'number'
      ? usage.output_tokens
      : typeof usage.outputTokens === 'number'
        ? usage.outputTokens
        : null

  const parts = [
    inputTokens !== null ? `输入 ${inputTokens.toLocaleString()} tokens` : null,
    outputTokens !== null ? `输出 ${outputTokens.toLocaleString()} tokens` : null,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join('，') : null
}

function summarizeCodexImportEvent(event: CodexJsonEvent): string {
  const eventType = typeof event.type === 'string' && event.type ? event.type : 'unknown_event'

  if (eventType === 'turn.started') {
    return 'Codex 已开始分析导入内容'
  }

  if (eventType === 'turn.completed') {
    const usageSummary = extractCodexUsageSummary(event)
    return usageSummary
      ? `Codex 已完成生成（${usageSummary}）`
      : 'Codex 已完成生成'
  }

  if (eventType === 'turn.failed' || eventType === 'error') {
    return (
      summarizeLogText(event.error?.message ?? event.message, 120) ??
      'Codex 运行失败'
    )
  }

  const delta = extractAssistantDelta(event)
  if (delta) {
    return summarizeCodexEventText(delta, 'Codex 正在输出内容')
  }

  if (eventType === 'item.completed') {
    const itemType =
      typeof event.item?.type === 'string' && event.item.type ? event.item.type : 'unknown_item'
    if (itemType === 'agent_message') {
      return summarizeCodexEventText(event.item?.text, 'Codex 已完成一条消息')
    }
    return `Codex 已完成 ${itemType}`
  }

  if (typeof event.message === 'string' && event.message.trim()) {
    return summarizeLogText(event.message, 120) ?? eventType
  }

  if (typeof event.item?.message === 'string' && event.item.message.trim()) {
    return summarizeLogText(event.item.message, 120) ?? eventType
  }

  return eventType
}

function mapCodexImportEvent(
  attempt: TextImportRunnerAttempt,
  event: CodexJsonEvent,
  at: number,
  requestId?: string,
): TextImportCodexEventUpdate | null {
  const eventType = typeof event.type === 'string' && event.type ? event.type : 'unknown_event'
  if (eventType === 'thread.started') {
    return null
  }

  return {
    attempt,
    eventType,
    at,
    summary: summarizeCodexImportEvent(event),
    rawJson: JSON.stringify(event, null, 2),
    requestId,
  }
}

interface CodexImportAttemptRuntimeState {
  spawnStartedAt: number | null
  latestEventAt: number | null
  latestEventType: string | null
  latestEventSummary: string | null
  sawTurnStarted: boolean
  sawContentEvent: boolean
  sawCompletedMessage: boolean
}

interface ImportRuntimeExplainerContext {
  sourceName: string
  promptContext: BuiltTextImportPromptContext
  attemptState: CodexImportAttemptRuntimeState
  attempt: TextImportRunnerAttempt
  stage: TextImportRunStage
  at: number
  requestId?: string
}

function createCodexImportAttemptRuntimeState(): CodexImportAttemptRuntimeState {
  return {
    spawnStartedAt: null,
    latestEventAt: null,
    latestEventType: null,
    latestEventSummary: null,
    sawTurnStarted: false,
    sawContentEvent: false,
    sawCompletedMessage: false,
  }
}

function formatImportDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    : `${totalSeconds}s`
}

function formatImportEvidenceCount(label: string, count: number): string {
  return `${label} ${count.toLocaleString()}`
}

function summarizeDiagnosticText(value: string): string {
  return summarizeLogText(value, 120) ?? value
}

function classifyCodexDiagnosticLine(
  rawLine: string,
): { category: TextImportCodexDiagnosticCategory; message: string } | null {
  const trimmed = rawLine.trim()
  if (!trimmed) {
    return null
  }

  const lower = trimmed.toLowerCase()

  if (
    lower.includes('plugin sync failed') ||
    lower.includes('featured plugin ids cache failed')
  ) {
    return {
      category: 'noise',
      message: '插件目录同步失败（403），已降级为噪音诊断。',
    }
  }

  if (lower.includes('shell snapshot not supported yet for powershell')) {
    return {
      category: 'capability_gap',
      message: '当前环境不支持 PowerShell shell snapshot。',
    }
  }

  if (
    (lower.includes('thread/read failed') && lower.includes('includeturns')) ||
    lower.includes('ephemeral threads do not support includeturns')
  ) {
    return {
      category: 'capability_gap',
      message: 'ephemeral 线程不支持 includeTurns 回读。',
    }
  }

  if (
    lower.includes('invalid_json_schema') ||
    lower.includes('schema must have') ||
    lower.includes('request_failed') ||
    lower.includes('non-zero') ||
    lower.includes('exit code')
  ) {
    return {
      category: 'actionable',
      message: summarizeDiagnosticText(trimmed),
    }
  }

  if (lower.includes('error') || lower.includes('failed')) {
    return {
      category: 'actionable',
      message: summarizeDiagnosticText(trimmed),
    }
  }

  return null
}

function createCodexDiagnostic(
  attempt: TextImportRunnerAttempt,
  category: TextImportCodexDiagnosticCategory,
  rawLine: string,
  at: number,
  requestId: string | undefined,
  message?: string,
): TextImportCodexDiagnosticUpdate {
  return {
    attempt,
    category,
    at,
    message: message ?? summarizeDiagnosticText(rawLine),
    rawLine,
    requestId,
  }
}

function updateImportAttemptRuntimeState(
  state: CodexImportAttemptRuntimeState,
  event: CodexJsonEvent,
  at: number,
  summary: string,
): void {
  const eventType = typeof event.type === 'string' && event.type ? event.type : 'unknown_event'
  state.latestEventAt = at
  state.latestEventType = eventType
  state.latestEventSummary = summary

  if (eventType === 'turn.started') {
    state.sawTurnStarted = true
  }

  if (extractAssistantDelta(event)) {
    state.sawContentEvent = true
  }

  if (eventType === 'item.completed' && event.item?.type === 'agent_message') {
    state.sawContentEvent = true
    state.sawCompletedMessage = true
  }
}

function getExplainerAttemptForStage(stage: TextImportRunStage): TextImportRunnerAttempt | null {
  switch (stage) {
    case 'starting_codex_primary':
    case 'waiting_codex_primary':
    case 'parsing_primary_result':
      return 'primary'
    case 'repairing_structure':
    case 'starting_codex_repair':
    case 'waiting_codex_repair':
    case 'parsing_repair_result':
      return 'repair'
    default:
      return null
  }
}

function buildRuntimeExplainerEvidence(
  context: ImportRuntimeExplainerContext,
  silentForMs: number | null,
): string[] {
  const evidence = [
    `导入源 ${context.sourceName}`,
    formatImportEvidenceCount('Prompt', context.promptContext.promptContextLength) + ' chars',
    formatImportEvidenceCount('焦点节点', context.promptContext.focusedTopicCount),
    formatImportEvidenceCount('背景摘要节点', context.promptContext.compactTopicCount),
  ]

  if (context.promptContext.preprocessedHintCount > 0) {
    evidence.push(formatImportEvidenceCount('预处理线索', context.promptContext.preprocessedHintCount))
  }

  if (context.promptContext.notePreviewCount > 0) {
    evidence.push(formatImportEvidenceCount('摘要 note 预览', context.promptContext.notePreviewCount))
  }

  if (context.attemptState.latestEventType) {
    evidence.push(`最新真实事件 ${context.attemptState.latestEventType}`)
  }

  if (silentForMs !== null) {
    evidence.push(`距上次真实事件 ${formatImportDuration(silentForMs)}`)
  }

  return evidence
}

function buildTextImportRuntimeExplainer(
  context: ImportRuntimeExplainerContext,
): TextImportCodexExplainerUpdate | null {
  const silenceSinceLastEventMs =
    context.attemptState.latestEventAt !== null
      ? Math.max(0, context.at - context.attemptState.latestEventAt)
      : context.attemptState.spawnStartedAt !== null
        ? Math.max(0, context.at - context.attemptState.spawnStartedAt)
        : null
  const evidence = buildRuntimeExplainerEvidence(context, silenceSinceLastEventMs)
  let headline: string | null = null
  let reason: string | null = null

  switch (context.stage) {
    case 'starting_codex_primary':
      headline = '正在启动主导入运行'
      reason = '推断：bridge 已经完成上下文准备，正在启动主导入请求并等待 Codex 建立首个运行回合。'
      break
    case 'waiting_codex_primary':
      if (!context.attemptState.sawTurnStarted) {
        headline = '正在读取导入源与脑图上下文'
        reason =
          '推断：Codex 已启动，但首个真实 CLI 事件还没返回；当前仍在装载导入文本、脑图焦点节点和压缩背景节点，所以结果尚未可见。'
        break
      }

      if (!context.attemptState.sawContentEvent) {
        headline = '正在比较导入内容与现有脑图结构'
        reason =
          '推断：已经收到 turn.started，但还没有内容型事件；Codex 很可能正在把导入文本与当前脑图结构做对齐判断，所以还没进入结果起草阶段。'
        break
      }

      if (!context.attemptState.sawCompletedMessage) {
        headline = '正在起草结构化导入结果'
        reason =
          '推断：已经收到内容型 CLI 事件，但回合尚未结束；Codex 正在补全结构化导入结果，因此当前等待发生在结果生成阶段。'
        break
      }

      headline = '候选结果已生成，正在完成回合并准备最终输出'
      reason =
        '推断：agent_message 已经完成，但 turn.completed 还没有到达；Codex 仍在收尾当前回合，并准备把最终输出交给 bridge 做后续校验。'
      break
    case 'parsing_primary_result':
    case 'parsing_repair_result':
      headline = '正在校验和标准化导入结果'
      reason =
        '推断：真实 CLI 生成已经结束，当前耗时来自 bridge 的 schema 校验、字段归一化和预览构建，而不是 Codex 继续生成。'
      break
    case 'repairing_structure':
    case 'starting_codex_repair':
    case 'waiting_codex_repair':
      if (!context.attemptState.sawTurnStarted) {
        headline = '正在修正不兼容的导入结构'
        reason =
          '推断：主结果没有直接通过结构要求，系统已进入 repair 重试；当前等待属于结构修正阶段，而不是首次导入生成。'
        break
      }

      if (!context.attemptState.sawContentEvent) {
        headline = '正在比对主结果并修正结构约束'
        reason =
          '推断：repair 回合已经开始，但还没有内容型事件；Codex 正在对照主结果和目标 schema 重新组织输出。'
        break
      }

      headline = '正在生成修正后的结构化结果'
      reason =
        '推断：repair 回合已经开始产出内容，但仍未完成；Codex 正在重试生成满足当前结构要求的导入结果。'
      break
    default:
      return null
  }

  return {
    attempt: context.attempt,
    at: context.at,
    headline,
    reason,
    evidence,
    requestId: context.requestId,
  }
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
  previewTextImport(request: TextImportRequest, options?: TextImportPreviewOptions): Promise<TextImportResponse>
  previewMarkdownImport(
    request: TextImportRequest,
    options?: TextImportPreviewOptions,
  ): Promise<TextImportResponse>
  adjudicateTextImportCandidates(
    request: TextImportSemanticAdjudicationRequest,
  ): Promise<TextImportSemanticAdjudicationResponse>
}

interface CreateCodexBridgeOptions {
  runner?: CodexRunner
  promptStore?: SystemPromptStore
  logInfo?: (message: string) => void
  logError?: (message: string) => void
  now?: () => number
}

const STATUS_PROMPT_FALLBACK_SUMMARY = '系统 Prompt 加载失败'
const STATUS_PROMPT_FALLBACK_VERSION = 'unavailable'

function createStatusRequestFailedIssue(message: string): CodexBridgeIssue {
  return {
    code: 'request_failed',
    message,
  }
}

export function createCodexBridge(options?: CreateCodexBridgeOptions): CodexBridge {
  const runner = options?.runner ?? createCodexRunner()
  const promptStore = options?.promptStore ?? createSystemPromptStore()
  const logInfo = options?.logInfo ?? console.log
  const logError = options?.logError ?? console.error
  const now = options?.now ?? Date.now

  const buildStatus = async (): Promise<CodexStatus> => {
    const [runnerStatusResult, loadedPromptResult] = await Promise.allSettled([
      runner.getStatus(),
      promptStore.loadPrompt(),
    ])

    const runnerStatus =
      runnerStatusResult.status === 'fulfilled'
        ? runnerStatusResult.value
        : {
            cliInstalled: false,
            loggedIn: false,
            authProvider: null,
            ready: false,
            issues: [
              createStatusRequestFailedIssue(
                runnerStatusResult.reason instanceof Error
                  ? `本机 Codex 状态检查失败：${runnerStatusResult.reason.message}`
                  : '本机 Codex 状态检查失败，请查看 bridge 日志后重试。',
              ),
            ],
          }

    const promptIssue =
      loadedPromptResult.status === 'rejected'
        ? createStatusRequestFailedIssue(
            loadedPromptResult.reason instanceof Error
              ? `系统 Prompt 加载失败：${loadedPromptResult.reason.message}`
              : '系统 Prompt 加载失败，请查看 bridge 日志后重试。',
          )
        : null

    const issues = promptIssue
      ? [...runnerStatus.issues, promptIssue]
      : runnerStatus.issues

    const loadedPrompt =
      loadedPromptResult.status === 'fulfilled'
        ? loadedPromptResult.value
        : {
            summary: STATUS_PROMPT_FALLBACK_SUMMARY,
            version: STATUS_PROMPT_FALLBACK_VERSION,
            fullPrompt: '',
          }

    return {
      ...runnerStatus,
      ready: runnerStatus.ready && promptIssue === null,
      issues,
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

    async adjudicateTextImportCandidates(request) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptStore.loadPrompt()
      const attemptStartedAt = now()

      try {
        const rawText = await runner.execute(
          buildTextImportSemanticAdjudicationPrompt(request, loadedPrompt),
          SEMANTIC_ADJUDICATION_RESPONSE_SCHEMA,
          {
            onObservation: (event: CodexExecutionObservation) => {
              logInfo(
          formatSemanticLog(request.jobId, {
            event: 'runner',
            phase: event.phase,
            kind: event.kind,
            promptLength: event.promptLength,
            elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
            exitCode: event.exitCode,
            hadJsonEvent: event.hadJsonEvent,
            stdoutLength: event.stdoutLength,
            stderrLength: event.stderrLength,
                }),
              )
            },
          },
        )

        const normalized = normalizeSemanticAdjudicationPayload(
          parseSemanticAdjudicationPayload(rawText),
        )

        logInfo(
          formatSemanticLog(request.jobId, {
            event: 'attempt_completed',
            durationMs: now() - attemptStartedAt,
            candidateCount: request.candidates.length,
            decisionCount: normalized.decisions.length,
            warningCount: normalized.warnings?.length ?? 0,
          }),
        )
        return normalized
      } catch (error) {
        const normalizedError = normalizeBridgeError(error)
        logError(
          formatSemanticLog(request.jobId, {
            event: 'attempt_failed',
            durationMs: now() - attemptStartedAt,
            code: normalizedError.code,
            message: summarizeLogText(normalizedError.message),
            rawMessage: summarizeLogText(normalizedError.rawMessage),
          }),
        )
        throw normalizedError
      }
    },

    async previewTextImport(request, options) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
          undefined,
          'loading_prompt',
        )
      }

      const requestId = options?.requestId
      const topicCount = request.context.topicCount
      const promptContext = buildTextImportPromptContext(request)
      const attemptRuntimeState: Record<TextImportRunnerAttempt, CodexImportAttemptRuntimeState> = {
        primary: createCodexImportAttemptRuntimeState(),
        repair: createCodexImportAttemptRuntimeState(),
      }
      const emittedDiagnostics = new Set<string>()
      let latestExplainerSignature: string | null = null
      const emitCodexDiagnostic = (diagnostic: TextImportCodexDiagnosticUpdate): void => {
        const diagnosticKey = `${diagnostic.attempt}:${diagnostic.category}:${diagnostic.rawLine}`
        if (emittedDiagnostics.has(diagnosticKey)) {
          return
        }

        emittedDiagnostics.add(diagnosticKey)
        options?.onCodexDiagnostic?.(diagnostic)
        logInfo(
          formatImportLog(requestId, {
            event: 'diagnostic',
            attempt: diagnostic.attempt,
            category: diagnostic.category,
            message: summarizeLogText(diagnostic.message),
          }),
        )
      }
      const emitCodexExplainer = (
        stage: TextImportRunStage,
        at = now(),
      ): void => {
        const attempt = getExplainerAttemptForStage(stage)
        if (!attempt) {
          return
        }

        const explainer = buildTextImportRuntimeExplainer({
          sourceName: request.sourceName,
          promptContext,
          attemptState: attemptRuntimeState[attempt],
          attempt,
          stage,
          at,
          requestId,
        })

        if (!explainer) {
          return
        }

        const signature = JSON.stringify({
          attempt: explainer.attempt,
          headline: explainer.headline,
          reason: explainer.reason,
          evidence: explainer.evidence,
        })

        if (signature === latestExplainerSignature) {
          return
        }

        latestExplainerSignature = signature
        options?.onCodexExplainer?.(explainer)
        logInfo(
          formatImportLog(requestId, {
            event: 'explainer',
            attempt: explainer.attempt,
            stage,
            headline: summarizeLogText(explainer.headline, 80),
            reason: summarizeLogText(explainer.reason, 120),
          }),
        )
      }
      const emitImportStatus = (
        stage: TextImportRunStage,
        message: string,
        durationMs?: number,
      ): void => {
        options?.onStatus?.({
          stage,
          message,
          durationMs,
        })
        logInfo(
          formatImportLog(requestId, {
            event: 'status',
            stage,
            durationMs,
            sourceName: request.sourceName,
            topicCount,
          }),
        )
        emitCodexExplainer(stage)
      }
      const emitRunnerObservation = (
        attempt: TextImportRunnerAttempt,
        observation: TextImportRunnerObservationUpdate,
      ): void => {
        options?.onRunnerObservation?.(observation)
        logInfo(
          formatImportLog(requestId, {
            event: 'runner',
            attempt,
            phase: observation.phase,
            kind: observation.kind,
            promptLength: observation.promptLength,
            elapsedSinceSpawnMs: observation.elapsedSinceSpawnMs,
            elapsedSinceLastEventMs: observation.elapsedSinceLastEventMs,
            exitCode: observation.exitCode,
            hadJsonEvent: observation.hadJsonEvent,
          }),
        )
      }
      const emitCodexEvent = (
        attempt: TextImportRunnerAttempt,
        event: CodexJsonEvent,
      ): void => {
        const eventAt = now()
        const mapped = mapCodexImportEvent(attempt, event, eventAt, requestId)
        if (!mapped) {
          return
        }

        updateImportAttemptRuntimeState(
          attemptRuntimeState[attempt],
          event,
          eventAt,
          mapped.summary,
        )
        options?.onCodexEvent?.(mapped)
      }
      emitImportStatus(
        'analyzing_source',
        `已压缩导入上下文：保留 ${promptContext.focusedTopicCount} 个焦点节点，压缩 ${promptContext.compactTopicCount} 个背景节点。`,
      )
      logInfo(
        formatImportLog(requestId, {
          event: 'context_prepared',
          sourceName: request.sourceName,
          topicCount,
          focusedTopicCount: promptContext.focusedTopicCount,
          compactTopicCount: promptContext.compactTopicCount,
          notePreviewCount: promptContext.notePreviewCount,
          preprocessedHintCount: promptContext.preprocessedHintCount,
          promptContextLength: promptContext.promptContextLength,
        }),
      )

      const promptLoadStartedAt = now()
      let loadedPrompt: LoadedSystemPrompt
      try {
        loadedPrompt = await promptStore.loadPrompt()
      } catch (error) {
        const promptError = withImportStage(error, 'loading_prompt')
        logError(
          formatImportLog(requestId, {
            event: 'prompt_load_failed',
            stage: promptError.stage,
            code: promptError.code,
            durationMs: now() - promptLoadStartedAt,
            message: summarizeLogText(promptError.message),
            rawMessage: summarizeLogText(promptError.rawMessage),
          }),
        )
        throw promptError
      }
      emitImportStatus(
        'loading_prompt',
        '已加载系统提示词，正在准备导入分析…',
        now() - promptLoadStartedAt,
      )

      const executeImportAttempt = async (
        mode: 'primary' | 'repair',
      ): Promise<TextImportResponse> => {
        const attemptStartedAt = now()
        const startingStage =
          mode === 'primary' ? 'starting_codex_primary' : 'starting_codex_repair'
        const waitingStage =
          mode === 'primary' ? 'waiting_codex_primary' : 'waiting_codex_repair'
        const parsingStage =
          mode === 'primary' ? 'parsing_primary_result' : 'parsing_repair_result'
        let currentStage: TextImportRunStage = startingStage
        let spawnStartedAt: number | null = null

        emitImportStatus(
          startingStage,
          mode === 'primary'
            ? '正在启动 Codex 导入分析…'
            : '正在启动 Codex 结构修正…',
        )

        try {
          currentStage = waitingStage
          emitImportStatus(
            waitingStage,
            mode === 'primary'
              ? 'Codex 正在分析全文与整张脑图…'
              : 'Codex 正在修正导入结构…',
          )

          const rawText = await runner.execute(
            buildTextImportPrompt(loadedPrompt, promptContext.promptContextText, mode),
            IMPORT_RESPONSE_SCHEMA,
            {
              onEvent: (event: CodexJsonEvent) => {
                emitCodexEvent(mode, event)
                emitCodexExplainer(currentStage, now())
              },
              onStderrLine: (line: string) => {
                const classified = classifyCodexDiagnosticLine(line)
                if (!classified) {
                  return
                }

                emitCodexDiagnostic(
                  createCodexDiagnostic(
                    mode,
                    classified.category,
                    line,
                    now(),
                    requestId,
                    classified.message,
                  ),
                )
              },
              onObservation: (event: CodexExecutionObservation) => {
                if (event.phase === 'spawn_started') {
                  spawnStartedAt = event.timestampMs
                  attemptRuntimeState[mode].spawnStartedAt = event.timestampMs
                }
                emitRunnerObservation(mode, {
                  attempt: mode,
                  phase: event.phase,
                  kind: event.kind,
                  promptLength: event.promptLength,
                  elapsedSinceSpawnMs:
                    spawnStartedAt === null ? undefined : event.timestampMs - spawnStartedAt,
                  elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
                  exitCode: event.exitCode,
                  hadJsonEvent: event.hadJsonEvent,
                })
                emitCodexExplainer(currentStage, event.timestampMs)
              },
            },
          )

          currentStage = parsingStage
          const parsingStartedAt = now()
          emitImportStatus(
            parsingStage,
            mode === 'primary'
              ? '正在解析主导入结果…'
              : '正在解析结构修正结果…',
          )

          const normalized = normalizeImportPayload(request, parseImportPayload(rawText))

          logInfo(
            formatImportLog(requestId, {
              event: 'attempt_completed',
              attempt: mode,
              durationMs: now() - attemptStartedAt,
              parseDurationMs: now() - parsingStartedAt,
              previewNodeCount: normalized.previewNodes.length,
              operationCount: normalized.operations.length,
              conflictCount: normalized.conflicts.length,
            }),
          )

          return normalized
        } catch (error) {
          const stagedError = withImportStage(error, currentStage)
          if (stagedError.rawMessage || stagedError.message) {
            emitCodexDiagnostic(
              createCodexDiagnostic(
                mode,
                stagedError.code === 'schema_invalid' || stagedError.code === 'request_failed'
                  ? 'actionable'
                  : 'capability_gap',
                stagedError.rawMessage ?? stagedError.message,
                now(),
                requestId,
                stagedError.message,
              ),
            )
          }
          logError(
            formatImportLog(requestId, {
              event: 'attempt_failed',
              attempt: mode,
              stage: stagedError.stage,
              durationMs: now() - attemptStartedAt,
              code: stagedError.code,
              message: summarizeLogText(stagedError.message),
              rawMessage: summarizeLogText(stagedError.rawMessage),
            }),
          )
          throw stagedError
        }
      }

      try {
        return await executeImportAttempt('primary')
      } catch (error) {
        const normalizedError = withImportStage(error, 'waiting_codex_primary')

        if (!isRetryableImportError(normalizedError)) {
          throw normalizedError
        }

        emitImportStatus('repairing_structure', '主导入结果需要修正，正在准备重试…')

        try {
          return await executeImportAttempt('repair')
        } catch (repairError) {
          const normalizedRepairError = withImportStage(repairError, 'waiting_codex_repair')
          throw new CodexBridgeError(
            normalizedRepairError.code,
            'Codex 导入结构修正失败',
            normalizedRepairError.issues,
            normalizedRepairError.rawMessage ?? normalizedRepairError.message,
            normalizedRepairError.stage,
          )
        }
      }
    },

    async previewMarkdownImport(request, options) {
      return this.previewTextImport(request, options)
    },
  }
}
