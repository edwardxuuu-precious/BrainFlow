import type {
  AiImportOperation,
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
  TextImportConflict,
  TextImportPreviewItem,
  TextImportRequest,
  TextImportResponse,
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
  rawMessage?: string

  constructor(
    code: CodexBridgeIssue['code'] | 'invalid_request',
    message: string,
    issues?: CodexBridgeIssue[],
    rawMessage?: string,
  ) {
    super(message)
    this.name = 'CodexBridgeError'
    this.code = code
    this.issues = issues
    this.rawMessage = rawMessage
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

  if (issue) {
    return new CodexBridgeError(issue.code, issue.message, [issue], rawMessage)
  }

  return new CodexBridgeError(
    'request_failed',
    error instanceof Error ? error.message : 'Codex 请求失败。',
    undefined,
    error instanceof Error ? error.message : undefined,
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

function buildTextImportPrompt(
  request: TextImportRequest,
  prompt: LoadedSystemPrompt,
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
  previewTextImport(
    request: TextImportRequest,
    options?: { onStatus?: (message: string) => void },
  ): Promise<TextImportResponse>
  previewMarkdownImport(
    request: TextImportRequest,
    options?: { onStatus?: (message: string) => void },
  ): Promise<TextImportResponse>
}

interface CreateCodexBridgeOptions {
  runner?: CodexRunner
  promptStore?: SystemPromptStore
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

    async previewTextImport(request, options) {
      const status = await buildStatus()
      if (!status.ready) {
        throw new CodexBridgeError(
          'verification_required',
          '当前 Codex 验证信息不可用，请尽快重新验证。',
          status.issues,
        )
      }

      const loadedPrompt = await promptStore.loadPrompt()

      const executeImportAttempt = async (
        mode: 'primary' | 'repair',
      ): Promise<TextImportResponse> => {
        const rawText = await runner.execute(
          buildTextImportPrompt(request, loadedPrompt, mode),
          IMPORT_RESPONSE_SCHEMA,
        )
        return normalizeImportPayload(request, parseImportPayload(rawText))
      }

      try {
        return await executeImportAttempt('primary')
      } catch (error) {
        const normalizedError = normalizeBridgeError(error)

        if (!isRetryableImportError(normalizedError)) {
          throw normalizedError
        }

        options?.onStatus?.('正在修正导入结构…')

        try {
          return await executeImportAttempt('repair')
        } catch (repairError) {
          const normalizedRepairError = normalizeBridgeError(repairError)
          throw new CodexBridgeError(
            normalizedRepairError.code,
            'Codex 导入结构修正失败',
            normalizedRepairError.issues,
            normalizedRepairError.rawMessage ?? normalizedRepairError.message,
          )
        }
      }
    },

    async previewMarkdownImport(request, options) {
      return this.previewTextImport(request, options)
    },
  }
}
