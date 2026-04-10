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
  KnowledgeImportBundle,
  KnowledgeSemanticEdge,
  KnowledgeSemanticNode,
  KnowledgeSource,
  KnowledgeSourceRef,
  KnowledgeView,
  KnowledgeViewProjection,
  TextImportSemanticAdjudicationRequest,
  TextImportSemanticAdjudicationResponse,
  TextImportSemanticDecision,
  TextImportConflict,
  TextImportClassification,
  TextImportNodePlan,
  TextImportPresentationHints,
  TextImportPreviewItem,
  TextImportRequest,
  TextImportResponse,
  TextImportRunStage,
  TextImportTemplateSlot,
  TextImportTemplateSummary,
} from '../shared/ai-contract.js'
import type {
  SyncAnalyzeConflictRequest,
  SyncAnalyzeConflictResponse,
  SyncConflictAnalysisConfidence,
  SyncConflictResolution,
} from '../shared/sync-contract.js'
import { sanitizeAiWritableMetadataPatch } from '../shared/ai-metadata-patch.js'
import {
  buildTextImportQualityWarnings,
  compileTextImportNodePlans,
  deriveTextImportNodePlansFromPreviewNodes,
} from '../shared/text-import-semantics.js'
import {
  compileSemanticLayerViews,
  normalizeDocumentStructureType,
} from '../shared/text-import-layering.js'
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
  presentation?: unknown
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

interface RawSyncConflictAnalysisPayload {
  recommendedResolution?: string | null
  confidence?: string | null
  summary?: string | null
  reasons?: string[] | null
  actionableResolutions?: string[] | null
  mergedPayload?: Record<string, unknown> | null
  analysisNote?: string | null
}

interface RawImportOperation extends RawProposalOperation {
  id?: string | null
  risk?: string | null
  conflictId?: string | null
  reason?: string | null
  targetFingerprint?: string | null
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
  semanticRole?: string | null
  confidence?: string | null
  sourceAnchors?: Array<{ lineStart?: number | null; lineEnd?: number | null }> | null
  templateSlot?: string | null
}

interface RawImportNodePlan {
  id?: string | null
  parentId?: string | null
  order?: number | null
  title?: string | null
  note?: string | null
  semanticRole?: string | null
  confidence?: string | null
  sourceAnchors?: Array<{ lineStart?: number | null; lineEnd?: number | null }> | null
  groupKey?: string | null
  priority?: string | null
  collapsedByDefault?: boolean | null
  templateSlot?: string | null
}

interface RawImportClassification {
  archetype?: string | null
  confidence?: number | null
  rationale?: string | null
  secondaryArchetype?: string | null
}

interface RawImportTemplateSummary {
  archetype?: string | null
  visibleSlots?: string[] | null
  foldedSlots?: string[] | null
}

interface RawKnowledgeSourceRef {
  sourceId?: string | null
  lineStart?: number | null
  lineEnd?: number | null
  pathTitles?: string[] | null
}

interface RawKnowledgeSource {
  id?: string | null
  type?: string | null
  title?: string | null
  raw_content?: string | null
  metadata?: Record<string, unknown> | null
}

interface RawKnowledgeSemanticTaskFields {
  status?: string | null
  owner?: string | null
  due_date?: string | null
  priority?: string | null
  depends_on?: string[] | null
  output?: string | null
  source_refs?: RawKnowledgeSourceRef[] | null
  definition_of_done?: string | null
}

interface RawKnowledgeSemanticNode {
  id?: string | null
  type?: string | null
  title?: string | null
  summary?: string | null
  detail?: string | null
  source_refs?: RawKnowledgeSourceRef[] | null
  confidence?: string | null
  task?: RawKnowledgeSemanticTaskFields | null
}

interface RawKnowledgeSemanticEdge {
  from?: string | null
  to?: string | null
  type?: string | null
  label?: string | null
  source_refs?: RawKnowledgeSourceRef[] | null
  confidence?: string | null
}

interface RawKnowledgeView {
  id?: string | null
  type?: string | null
  visible_node_ids?: string[] | null
  layout_type?: string | null
}

interface RawKnowledgeViewProjection {
  viewId?: string | null
  viewType?: string | null
  summary?: string | null
  nodePlans?: RawImportNodePlan[] | null
  previewNodes?: RawImportPreviewItem[] | null
  operations?: RawImportOperation[] | null
}

interface RawKnowledgeImportBundle {
  id?: string | null
  title?: string | null
  createdAt?: number | null
  anchorTopicId?: string | null
  defaultViewId?: string | null
  activeViewId?: string | null
  mountedRootTopicId?: string | null
  sources?: RawKnowledgeSource[] | null
  semanticNodes?: RawKnowledgeSemanticNode[] | null
  semanticEdges?: RawKnowledgeSemanticEdge[] | null
  views?: RawKnowledgeView[] | null
  viewProjections?: Record<string, RawKnowledgeViewProjection> | null
}

interface RawImportPayload {
  summary?: string | null
  classification?: RawImportClassification | null
  templateSummary?: RawImportTemplateSummary | null
  bundle?: RawKnowledgeImportBundle | null
  sources?: RawKnowledgeSource[] | null
  semanticNodes?: RawKnowledgeSemanticNode[] | null
  semanticEdges?: RawKnowledgeSemanticEdge[] | null
  views?: RawKnowledgeView[] | null
  viewProjections?: Record<string, RawKnowledgeViewProjection> | null
  defaultViewId?: string | null
  activeViewId?: string | null
  nodePlans?: RawImportNodePlan[] | null
  previewNodes?: RawImportPreviewItem[] | null
  operations?: RawImportOperation[] | null
  conflicts?: RawImportConflict[] | null
  warnings?: string[] | null
}

type DocumentToLogicMapNodeType =
  | 'section'
  | 'claim'
  | 'evidence'
  | 'task'
  | 'decision'
  | 'risk'
  | 'metric'
  | 'question'

interface RawDocumentToLogicMapSpan {
  line_start?: number | null
  line_end?: number | null
}

interface RawDocumentToLogicMapTask {
  status?: string | null
  output?: string | null
}

interface RawDocumentToLogicMapNode {
  id?: string | null
  parent_id?: string | null
  order?: number | null
  type?: string | null
  title?: string | null
  note?: string | null
  semantic_role?: string | null
  confidence?: number | string | null
  source_spans?: RawDocumentToLogicMapSpan[] | null
  task?: RawDocumentToLogicMapTask | null
}

interface RawDocumentToLogicMapPayload {
  spec_version?: string | null
  document_type?: string | null
  document_type_confidence?: number | null
  document_type_rationale?: string | null
  summary?: string | null
  nodes?: RawDocumentToLogicMapNode[] | null
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

type RawTextImportPayload = RawImportPayload | RawDocumentToLogicMapPayload

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

export interface TextImportPreviewOptions {
  requestId?: string
  onStatus?: (update: TextImportStatusUpdate) => void
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
  required: ['labels', 'markers', 'stickers', 'type'],
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
    stickers: {
      type: ['array', 'null'],
      items: {
        type: 'string',
        enum: ['smile', 'party', 'heart', 'star', 'fire', 'rocket', 'bulb', 'target', 'coffee', 'clap', 'rainbow', 'sparkles'],
      },
    },
    type: {
      type: ['string', 'null'],
      enum: ['normal', 'milestone', 'task', null],
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
    'presentation',
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
    presentation: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['collapsedByDefault', 'groupKey', 'priority'],
      properties: {
        collapsedByDefault: { type: ['boolean', 'null'] },
        groupKey: { type: ['string', 'null'] },
        priority: { type: ['string', 'null'], enum: ['primary', 'secondary', 'supporting', null] },
      },
    },
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
    'targetFingerprint',
  ],
  properties: {
    id: { type: ['string', 'null'] },
    risk: { type: ['string', 'null'], enum: ['low', 'high', null] },
    conflictId: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
    targetFingerprint: { type: ['string', 'null'] },
    ...OPERATION_SCHEMA.properties,
  },
} as const

const IMPORT_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'classification', 'templateSummary', 'nodePlans', 'previewNodes', 'operations', 'conflicts', 'warnings'],
  properties: {
    summary: { type: ['string', 'null'] },
    classification: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['archetype', 'confidence', 'rationale', 'secondaryArchetype'],
      properties: {
        archetype: { type: ['string', 'null'] },
        confidence: { type: ['number', 'null'] },
        rationale: { type: ['string', 'null'] },
        secondaryArchetype: { type: ['string', 'null'] },
      },
    },
    templateSummary: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['archetype', 'visibleSlots', 'foldedSlots'],
      properties: {
        archetype: { type: ['string', 'null'] },
        visibleSlots: { type: ['array', 'null'], items: { type: 'string' } },
        foldedSlots: { type: ['array', 'null'], items: { type: 'string' } },
      },
    },
    nodePlans: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'parentId', 'order', 'title', 'note', 'semanticRole', 'confidence', 'sourceAnchors', 'groupKey', 'priority', 'collapsedByDefault', 'templateSlot'],
        properties: {
          id: { type: ['string', 'null'] },
          parentId: { type: ['string', 'null'] },
          order: { type: ['integer', 'null'] },
          title: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          semanticRole: {
            type: ['string', 'null'],
            enum: ['section', 'summary', 'decision', 'action', 'risk', 'question', 'metric', 'timeline', 'evidence', null],
          },
          confidence: {
            type: ['string', 'null'],
            enum: ['high', 'medium', 'low', null],
          },
          sourceAnchors: {
            type: ['array', 'null'],
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['lineStart', 'lineEnd'],
              properties: {
                lineStart: { type: ['integer', 'null'] },
                lineEnd: { type: ['integer', 'null'] },
              },
            },
          },
          groupKey: { type: ['string', 'null'] },
          priority: { type: ['string', 'null'], enum: ['primary', 'secondary', 'supporting', null] },
          collapsedByDefault: { type: ['boolean', 'null'] },
          templateSlot: { type: ['string', 'null'] },
        },
      },
    },
    previewNodes: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'parentId', 'order', 'title', 'note', 'relation', 'matchedTopicId', 'reason', 'semanticRole', 'confidence', 'sourceAnchors', 'templateSlot'],
        properties: {
          id: { type: ['string', 'null'] },
          parentId: { type: ['string', 'null'] },
          order: { type: ['integer', 'null'] },
          title: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          relation: { type: ['string', 'null'], enum: ['new', 'merge', 'conflict', null] },
          matchedTopicId: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
          semanticRole: {
            type: ['string', 'null'],
            enum: ['section', 'summary', 'decision', 'action', 'risk', 'question', 'metric', 'timeline', 'evidence', null],
          },
          confidence: {
            type: ['string', 'null'],
            enum: ['high', 'medium', 'low', null],
          },
          sourceAnchors: {
            type: ['array', 'null'],
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['lineStart', 'lineEnd'],
              properties: {
                lineStart: { type: ['integer', 'null'] },
                lineEnd: { type: ['integer', 'null'] },
              },
            },
          },
          templateSlot: { type: ['string', 'null'] },
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

const DOCUMENT_TO_LOGIC_MAP_NODE_TYPES = [
  'section',
  'claim',
  'evidence',
  'task',
  'decision',
  'risk',
  'metric',
  'question',
] as const

void IMPORT_RESPONSE_SCHEMA

const DOCUMENT_TO_LOGIC_MAP_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'spec_version',
    'document_type',
    'document_type_confidence',
    'document_type_rationale',
    'summary',
    'nodes',
    'warnings',
  ],
  properties: {
    spec_version: { type: ['string', 'null'] },
    document_type: {
      type: ['string', 'null'],
      enum: ['analysis', 'process', 'plan', 'notes', null],
    },
    document_type_confidence: { type: ['number', 'null'] },
    document_type_rationale: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'] },
    nodes: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'parent_id',
          'order',
          'type',
          'title',
          'note',
          'semantic_role',
          'confidence',
          'source_spans',
          'task',
        ],
        properties: {
          id: { type: ['string', 'null'] },
          parent_id: { type: ['string', 'null'] },
          order: { type: ['integer', 'null'] },
          type: {
            type: ['string', 'null'],
            enum: [...DOCUMENT_TO_LOGIC_MAP_NODE_TYPES, null],
          },
          title: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
          semantic_role: {
            type: ['string', 'null'],
            enum: [...DOCUMENT_TO_LOGIC_MAP_NODE_TYPES, null],
          },
          confidence: { type: ['number', 'string', 'null'] },
          source_spans: {
            type: ['array', 'null'],
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['line_start', 'line_end'],
              properties: {
                line_start: { type: ['integer', 'null'] },
                line_end: { type: ['integer', 'null'] },
              },
            },
          },
          task: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['status', 'output'],
            properties: {
              status: {
                type: ['string', 'null'],
                enum: ['todo', 'in_progress', 'blocked', 'done', null],
              },
              output: { type: ['string', 'null'] },
            },
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

const SYNC_CONFLICT_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'recommendedResolution',
    'confidence',
    'summary',
    'reasons',
    'actionableResolutions',
    'mergedPayload',
    'analysisNote',
  ],
  properties: {
    recommendedResolution: {
      type: ['string', 'null'],
      enum: ['use_cloud', 'save_local_copy', 'merged_payload', null],
    },
    confidence: {
      type: ['string', 'null'],
      enum: ['high', 'medium', 'low', null],
    },
    summary: { type: ['string', 'null'] },
    reasons: {
      type: ['array', 'null'],
      items: { type: 'string' },
    },
    actionableResolutions: {
      type: ['array', 'null'],
      items: {
        type: 'string',
        enum: ['use_cloud', 'save_local_copy', 'merged_payload'],
      },
    },
    mergedPayload: {
      type: ['object', 'null'],
      additionalProperties: true,
    },
    analysisNote: { type: ['string', 'null'] },
  },
} as const

const VALID_TEMPLATE_SLOTS: TextImportTemplateSlot[] = [
  'goal',
  'use_cases',
  'prerequisites',
  'steps',
  'principles',
  'criteria',
  'pitfalls',
  'examples',
  'thesis',
  'claims',
  'evidence',
  'data',
  'limitations',
  'conclusion',
  'strategy',
  'actions',
  'owners',
  'timeline',
  'risks',
  'success_metrics',
  'summary',
  'key_results',
  'progress',
  'metrics',
  'blockers',
  'next_steps',
  'agenda',
  'decisions',
  'open_questions',
  'timepoints',
  'background',
  'issues',
  'causes',
  'impacts',
  'fixes',
  'preventions',
  'definition',
  'components',
  'mechanism',
  'categories',
  'comparisons',
  'cautions',
  'themes',
]

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

function normalizeConflictResolution(
  value: string | null | undefined,
): SyncConflictResolution | undefined {
  if (
    value === 'use_cloud' ||
    value === 'save_local_copy' ||
    value === 'merged_payload'
  ) {
    return value
  }

  return undefined
}

function normalizeConflictConfidence(
  value: string | null | undefined,
): SyncConflictAnalysisConfidence | undefined {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }

  return undefined
}

function normalizeObjectPayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function normalizeMetadataPatch(value: unknown): AiTopicMetadataPatch | undefined {
  return sanitizeAiWritableMetadataPatch(value)
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

function normalizePresentationHints(value: unknown): TextImportPresentationHints | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const raw = value as {
    collapsedByDefault?: unknown
    groupKey?: unknown
    priority?: unknown
  }

  const presentation: TextImportPresentationHints = {}

  if ('collapsedByDefault' in raw && typeof raw.collapsedByDefault === 'boolean') {
    presentation.collapsedByDefault = raw.collapsedByDefault
  }

  if ('groupKey' in raw) {
    presentation.groupKey = typeof raw.groupKey === 'string' ? raw.groupKey.trim() || null : null
  }

  if ('priority' in raw) {
    const priority = normalizeText(typeof raw.priority === 'string' ? raw.priority : undefined)
    if (priority && ['primary', 'secondary', 'supporting'].includes(priority)) {
      presentation.priority = priority as NonNullable<TextImportPresentationHints['priority']>
    }
  }

  return Object.keys(presentation).length > 0 ? presentation : undefined
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
        presentation: normalizePresentationHints(operation.presentation),
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
        presentation: normalizePresentationHints(operation.presentation),
        resultRef: normalizeText(operation.resultRef),
      }
    }

    case 'update_topic': {
      const target = createTargetReference(operation.target, operation.topicId)
      const title = normalizeText(operation.title)
      const note = normalizeNote(operation.note)
      const metadata = normalizeMetadataPatch(operation.metadata)
      const style = normalizeStylePatch(operation.style)
      const presentation = normalizePresentationHints(operation.presentation)
      if (!target || (title === undefined && note === undefined && !metadata && !style && !presentation)) {
        throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 update_topic 提案。')
      }

      return {
        type: 'update_topic',
        target,
        title,
        note,
        metadata,
        style,
        presentation,
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

function createImportTargetFingerprint(topic: AiDocumentTopicContext): string {
  return JSON.stringify({
    title: topic.title,
    note: topic.note,
    parentId: topic.parentTopicId,
    metadata: topic.metadata,
    style: topic.style,
  })
}

function resolveImportTargetFingerprint(
  request: TextImportRequest,
  operation: Extract<AiCanvasOperation, { type: 'update_topic' }>,
  rawOperation: RawImportOperation,
): string | undefined {
  if (!operation.target.startsWith('topic:')) {
    return normalizeText(rawOperation.targetFingerprint)
  }

  const topicId = operation.target.slice('topic:'.length)
  const topic = request.context.topics.find((candidate) => candidate.topicId === topicId)
  if (!topic) {
    throw new CodexBridgeError(
      'request_failed',
      `导入预览引用了不存在的目标主题: ${operation.target}`,
    )
  }

  return createImportTargetFingerprint(topic)
}

function normalizeImportOperation(
  request: TextImportRequest,
  operation: RawImportOperation,
): AiImportOperation {
  const risk = normalizeText(operation.risk)
  if (risk !== 'low' && risk !== 'high') {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入操作风险级别。')
  }

  const normalizedOperation = stripImportFormattingFields(normalizeOperation(operation))

  return {
    ...normalizedOperation,
    id: normalizeText(operation.id) ?? createImportOperationId(),
    risk,
    conflictId: normalizeText(operation.conflictId),
    reason: normalizeText(operation.reason),
    ...(normalizedOperation.type === 'update_topic'
      ? {
          targetFingerprint: resolveImportTargetFingerprint(
            request,
            normalizedOperation,
            operation,
          ),
        }
      : {}),
  }
}

function stripImportFormattingFields(operation: AiCanvasOperation): AiCanvasOperation {
  switch (operation.type) {
    case 'create_child':
      return {
        type: 'create_child',
        parent: operation.parent,
        title: operation.title,
        note: operation.note,
        resultRef: operation.resultRef,
      }

    case 'create_sibling':
      return {
        type: 'create_sibling',
        anchor: operation.anchor,
        title: operation.title,
        note: operation.note,
        resultRef: operation.resultRef,
      }

    case 'update_topic':
      return {
        type: 'update_topic',
        target: operation.target,
        title: operation.title,
        note: operation.note,
      }

    default:
      return operation
  }
}

function normalizeSourceAnchors(
  value: RawImportPreviewItem['sourceAnchors'] | RawImportNodePlan['sourceAnchors'],
): TextImportPreviewItem['sourceAnchors'] {
  if (!Array.isArray(value)) {
    return undefined
  }

  const anchors = value
    .map((anchor) => ({
      lineStart:
        typeof anchor?.lineStart === 'number' && Number.isInteger(anchor.lineStart)
          ? anchor.lineStart
          : null,
      lineEnd:
        typeof anchor?.lineEnd === 'number' && Number.isInteger(anchor.lineEnd)
          ? anchor.lineEnd
          : null,
    }))
    .filter(
      (anchor): anchor is { lineStart: number; lineEnd: number } =>
        anchor.lineStart !== null && anchor.lineEnd !== null,
    )

  return anchors.length > 0 ? anchors : undefined
}

function normalizeTemplateSlot(
  value: string | null | undefined,
): TextImportTemplateSlot | null {
  const normalized = normalizeText(value)
  return normalized && VALID_TEMPLATE_SLOTS.includes(normalized as TextImportTemplateSlot)
    ? (normalized as TextImportTemplateSlot)
    : null
}

function createFallbackImportClassification(request: TextImportRequest): TextImportClassification {
  return {
    archetype: request.archetype ?? 'mixed',
    confidence: request.archetype ? 1 : 0.4,
    rationale: request.archetype
      ? `The request explicitly selected the ${request.archetype} archetype.`
      : 'No explicit classification was returned, so the bridge kept a mixed fallback.',
    secondaryArchetype: null,
  }
}

function normalizeImportClassification(
  value: RawImportClassification | null | undefined,
  request: TextImportRequest,
): TextImportClassification {
  const fallback = createFallbackImportClassification(request)
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const archetype = normalizeText(value.archetype)
  const confidence = typeof value.confidence === 'number' ? value.confidence : fallback.confidence
  const rationale = normalizeText(value.rationale)
  const secondaryArchetype = normalizeText(value.secondaryArchetype)

  return {
    archetype:
      archetype &&
      ['method', 'argument', 'plan', 'report', 'meeting', 'postmortem', 'knowledge', 'mixed'].includes(archetype)
        ? (archetype as TextImportClassification['archetype'])
        : fallback.archetype,
    confidence: Math.max(0, Math.min(1, confidence)),
    rationale: rationale ?? fallback.rationale,
    secondaryArchetype:
      secondaryArchetype &&
      ['method', 'argument', 'plan', 'report', 'meeting', 'postmortem', 'knowledge', 'mixed'].includes(secondaryArchetype)
        ? (secondaryArchetype as NonNullable<TextImportClassification['secondaryArchetype']>)
        : null,
  }
}

function normalizeImportTemplateSummary(
  value: RawImportTemplateSummary | null | undefined,
  classification: TextImportClassification,
): TextImportTemplateSummary {
  if (!value || typeof value !== 'object') {
    return {
      archetype: classification.archetype,
      visibleSlots: [],
      foldedSlots: [],
    }
  }

  return {
    archetype:
      normalizeText(value.archetype) &&
      ['method', 'argument', 'plan', 'report', 'meeting', 'postmortem', 'knowledge', 'mixed'].includes(normalizeText(value.archetype) as string)
        ? (normalizeText(value.archetype) as TextImportTemplateSummary['archetype'])
        : classification.archetype,
    visibleSlots:
      (normalizeStringArray(value.visibleSlots) ?? []).filter((slot): slot is TextImportTemplateSlot =>
        VALID_TEMPLATE_SLOTS.includes(slot as TextImportTemplateSlot),
      ) ?? [],
    foldedSlots:
      (normalizeStringArray(value.foldedSlots) ?? []).filter((slot): slot is TextImportTemplateSlot =>
        VALID_TEMPLATE_SLOTS.includes(slot as TextImportTemplateSlot),
      ) ?? [],
  }
}

function normalizeKnowledgeSourceRef(
  value: RawKnowledgeSourceRef | null | undefined,
): KnowledgeSourceRef | null {
  const sourceId = normalizeText(value?.sourceId)
  if (!sourceId) {
    return null
  }

  return {
    sourceId,
    lineStart: typeof value?.lineStart === 'number' ? Math.max(1, Math.floor(value.lineStart)) : 1,
    lineEnd: typeof value?.lineEnd === 'number' ? Math.max(1, Math.floor(value.lineEnd)) : 1,
    pathTitles: normalizeStringArray(value?.pathTitles) ?? [],
  }
}

function normalizeKnowledgeSource(
  value: RawKnowledgeSource | null | undefined,
  request: TextImportRequest,
  fallbackId: string,
): KnowledgeSource {
  const sourceType = normalizeText(value?.type) ?? request.sourceType

  return {
    id: normalizeText(value?.id) ?? fallbackId,
    type:
      sourceType === 'paste' || sourceType === 'file'
        ? sourceType
        : request.sourceType,
    title: normalizeText(value?.title) ?? request.sourceName,
    raw_content: normalizeText(value?.raw_content) ?? request.rawText,
    metadata:
      value?.metadata && typeof value.metadata === 'object'
        ? value.metadata
        : { sourceName: request.sourceName },
  }
}

function normalizeKnowledgeSemanticNodeType(value: string | null | undefined): KnowledgeSemanticNode['type'] | null {
  switch (value) {
    case 'section':
    case 'claim':
    case 'evidence':
    case 'task':
    case 'decision':
    case 'risk':
    case 'metric':
    case 'question':
      return value
    case 'topic':
    case 'goal':
    case 'project':
    case 'review':
      return 'section'
    case 'insight':
      return 'claim'
    case 'criterion':
      return 'metric'
    default:
      return null
  }
}

function normalizeKnowledgeSemanticNode(
  value: RawKnowledgeSemanticNode | null | undefined,
): KnowledgeSemanticNode | null {
  const id = normalizeText(value?.id)
  const type = normalizeText(value?.type)
  const title = normalizeText(value?.title)
  const normalizedType = normalizeKnowledgeSemanticNodeType(type)
  if (!id || !normalizedType || !title) {
    return null
  }

  return {
    id,
    type: normalizedType,
    title,
    summary: normalizeText(value?.summary) ?? '',
    detail: normalizeText(value?.detail) ?? '',
    source_refs: (value?.source_refs ?? [])
      .map((item) => normalizeKnowledgeSourceRef(item))
      .filter((item): item is KnowledgeSourceRef => item !== null),
    confidence:
      value?.confidence === 'high' || value?.confidence === 'low' ? value.confidence : 'medium',
    task:
      value?.task && typeof value.task === 'object'
        ? {
            status:
              value.task.status === 'in_progress' ||
              value.task.status === 'blocked' ||
              value.task.status === 'done'
                ? value.task.status
                : 'todo',
            owner: normalizeText(value.task.owner) ?? null,
            due_date: normalizeText(value.task.due_date) ?? null,
            priority:
              value.task.priority === 'low' || value.task.priority === 'high'
                ? value.task.priority
                : value.task.priority === 'medium'
                  ? 'medium'
                  : null,
            depends_on: normalizeStringArray(value.task.depends_on) ?? [],
            output: normalizeText(value.task.output) ?? null,
            source_refs: (value.task.source_refs ?? [])
              .map((item) => normalizeKnowledgeSourceRef(item))
              .filter((item): item is KnowledgeSourceRef => item !== null),
            definition_of_done: normalizeText(value.task.definition_of_done) ?? null,
          }
        : null,
  }
}

function normalizeKnowledgeSemanticEdge(
  value: RawKnowledgeSemanticEdge | null | undefined,
): KnowledgeSemanticEdge | null {
  const from = normalizeText(value?.from)
  const to = normalizeText(value?.to)
  const type = normalizeText(value?.type)
  if (
    !from ||
    !to ||
    !type ||
    !['belongs_to', 'supports', 'contradicts', 'contrasts_with', 'leads_to', 'depends_on', 'derived_from'].includes(type)
  ) {
    return null
  }

  return {
    from,
    to,
    type: (type === 'contradicts' ? 'contrasts_with' : type) as KnowledgeSemanticEdge['type'],
    label: normalizeText(value?.label) ?? null,
    source_refs: (value?.source_refs ?? [])
      .map((item) => normalizeKnowledgeSourceRef(item))
      .filter((item): item is KnowledgeSourceRef => item !== null),
    confidence:
      value?.confidence === 'high' || value?.confidence === 'low' ? value.confidence : 'medium',
  }
}

function normalizeKnowledgeView(value: RawKnowledgeView | null | undefined): KnowledgeView | null {
  const id = normalizeText(value?.id)
  const type = normalizeText(value?.type)
  if (!id || !type || !['archive_view', 'thinking_view', 'execution_view'].includes(type)) {
    return null
  }

  return {
    id,
    type: type as KnowledgeView['type'],
    visible_node_ids: normalizeStringArray(value?.visible_node_ids) ?? [],
    layout_type:
      value?.layout_type === 'archive' || value?.layout_type === 'execution'
        ? value.layout_type
        : 'mindmap',
  }
}

function normalizeKnowledgeViewProjection(
  request: TextImportRequest,
  value: RawKnowledgeViewProjection | null | undefined,
  fallbackViewId: string,
): KnowledgeViewProjection {
  const viewId = normalizeText(value?.viewId) ?? fallbackViewId
  const viewType =
    value?.viewType === 'archive_view' ||
    value?.viewType === 'execution_view' ||
    value?.viewType === 'thinking_view'
      ? value.viewType
      : fallbackViewId.endsWith('_archive')
        ? 'archive_view'
        : fallbackViewId.endsWith('_execution')
          ? 'execution_view'
          : 'thinking_view'
  const nodePlans = Array.isArray(value?.nodePlans)
    ? value.nodePlans.map(normalizeImportNodePlan)
    : []
  if (nodePlans.length > 0) {
    const compiled = compileTextImportNodePlans({
      insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
      nodePlans,
    })
    return {
      viewId,
      viewType,
      summary: normalizeText(value?.summary) ?? `${viewType} projection`,
      nodePlans,
      previewNodes: compiled.previewNodes,
      operations: compiled.operations,
    }
  }

  const previewNodes = Array.isArray(value?.previewNodes)
    ? validateImportPreviewItems(value.previewNodes.map(normalizeImportPreviewItem))
    : []
  if (previewNodes.length > 0) {
    const derivedNodePlans = deriveTextImportNodePlansFromPreviewNodes({ previewNodes })
    const compiled = compileTextImportNodePlans({
      insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
      nodePlans: derivedNodePlans,
    })
    return {
      viewId,
      viewType,
      summary: normalizeText(value?.summary) ?? `${viewType} projection`,
      nodePlans: derivedNodePlans,
      previewNodes: compiled.previewNodes,
      operations: compiled.operations,
    }
  }

  return {
    viewId,
    viewType,
    summary: normalizeText(value?.summary) ?? `${viewType} projection`,
    nodePlans: [],
    previewNodes: [],
    operations: Array.isArray(value?.operations)
      ? value.operations.map((operation) => normalizeImportOperation(request, operation))
      : [],
  }
}

function normalizeImportPreviewItem(value: RawImportPreviewItem): TextImportPreviewItem {
  const title = normalizeText(value.title)
  const relation = normalizeText(value.relation)
  const semanticRole = normalizeText(value.semanticRole)
  const confidence = normalizeText(value.confidence)
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
    semanticRole:
      semanticRole &&
      ['section', 'claim', 'task', 'decision', 'risk', 'question', 'metric', 'evidence', 'summary', 'action', 'timeline'].includes(
        semanticRole,
      )
        ? (semanticRole as TextImportPreviewItem['semanticRole'])
        : undefined,
    confidence:
      confidence && ['high', 'medium', 'low'].includes(confidence)
        ? (confidence as TextImportPreviewItem['confidence'])
        : undefined,
    sourceAnchors: normalizeSourceAnchors(value.sourceAnchors),
    templateSlot: normalizeTemplateSlot(value.templateSlot),
  }
}

function normalizeImportNodePlan(value: RawImportNodePlan): TextImportNodePlan {
  const title = normalizeText(value.title)
  const semanticRole = normalizeText(value.semanticRole)
  const confidence = normalizeText(value.confidence)
  const order = typeof value.order === 'number' && Number.isInteger(value.order) ? value.order : null

  if (
    !title ||
    order === null ||
    !semanticRole ||
    !['section', 'claim', 'task', 'decision', 'risk', 'question', 'metric', 'evidence', 'summary', 'action', 'timeline'].includes(semanticRole) ||
    !confidence ||
    !['high', 'medium', 'low'].includes(confidence)
  ) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的导入节点计划。')
  }

  return {
    id: normalizeText(value.id) ?? createImportOperationId(),
    parentId: normalizeText(value.parentId) ?? null,
    order,
    title,
    note: normalizeNote(value.note) ?? null,
    semanticRole: semanticRole as TextImportNodePlan['semanticRole'],
    confidence: confidence as TextImportNodePlan['confidence'],
    sourceAnchors: normalizeSourceAnchors(value.sourceAnchors) ?? [],
    groupKey: normalizeText(value.groupKey) ?? null,
    priority:
      normalizeText(value.priority) && ['primary', 'secondary', 'supporting'].includes(normalizeText(value.priority) as string)
        ? (normalizeText(value.priority) as TextImportNodePlan['priority'])
        : null,
    collapsedByDefault: typeof value.collapsedByDefault === 'boolean' ? value.collapsedByDefault : null,
    templateSlot: normalizeTemplateSlot(value.templateSlot),
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

function normalizeSyncConflictAnalysisPayload<TPayload>(
  request: SyncAnalyzeConflictRequest<TPayload>,
  rawPayload: RawSyncConflictAnalysisPayload,
): SyncAnalyzeConflictResponse<TPayload> {
  const recommendedResolution = normalizeConflictResolution(rawPayload.recommendedResolution)
  const confidence = normalizeConflictConfidence(rawPayload.confidence) ?? null
  const summary =
    normalizeText(rawPayload.summary) ??
    'Codex 已完成冲突分析，但没有返回摘要。'
  const reasons = (rawPayload.reasons ?? [])
    .map((item) => normalizeText(item))
    .filter((item): item is string => !!item)
  const actionableResolutions = (rawPayload.actionableResolutions ?? [])
    .map((item) => normalizeConflictResolution(item))
    .filter((item): item is SyncConflictResolution => !!item)
    .filter((value, index, array) => array.indexOf(value) === index)
  const mergedPayload = normalizeObjectPayload(rawPayload.mergedPayload) as TPayload | null

  if (
    recommendedResolution === 'merged_payload' &&
    !mergedPayload
  ) {
    throw new CodexBridgeError(
      'schema_invalid',
      '冲突分析返回了 merged_payload，但缺少完整 mergedPayload。',
    )
  }

  if (
    recommendedResolution &&
    actionableResolutions.length > 0 &&
    !actionableResolutions.includes(recommendedResolution)
  ) {
    throw new CodexBridgeError(
      'schema_invalid',
      '冲突分析返回的 recommendedResolution 不在 actionableResolutions 中。',
    )
  }

  const fallbackActionable = request.conflict.actionableResolutions.filter(
    (value): value is SyncConflictResolution =>
      value === 'use_cloud' || value === 'save_local_copy' || value === 'merged_payload',
  )

  return {
    analysisSource: 'ai',
    recommendedResolution:
      recommendedResolution ??
      (fallbackActionable.includes('save_local_copy') ? 'save_local_copy' : fallbackActionable[0] ?? null),
    confidence,
    summary,
    reasons,
    actionableResolutions: actionableResolutions.length > 0 ? actionableResolutions : fallbackActionable,
    mergedPayload,
    analyzedAt: Date.now(),
    analysisNote: normalizeText(rawPayload.analysisNote) ?? null,
  }
}

function normalizeImportPayload(
  request: TextImportRequest,
  rawPayload: RawImportPayload,
): TextImportResponse {
  const normalizedWarnings = (rawPayload.warnings ?? [])
    .map((item) => normalizeText(item))
    .filter((item): item is string => !!item)
  const classification = normalizeImportClassification(rawPayload.classification, request)
  const templateSummary = normalizeImportTemplateSummary(rawPayload.templateSummary, classification)
  const normalizedSources =
    (rawPayload.sources ?? rawPayload.bundle?.sources ?? []).map((source, index) =>
      normalizeKnowledgeSource(source, request, `source_${index + 1}`),
    )
  const normalizedSemanticNodes = (rawPayload.semanticNodes ?? rawPayload.bundle?.semanticNodes ?? [])
    .map((item) => normalizeKnowledgeSemanticNode(item))
    .filter((item): item is KnowledgeSemanticNode => item !== null)
  const normalizedSemanticEdges = (rawPayload.semanticEdges ?? rawPayload.bundle?.semanticEdges ?? [])
    .map((item) => normalizeKnowledgeSemanticEdge(item))
    .filter((item): item is KnowledgeSemanticEdge => item !== null)
  let normalizedViews = (rawPayload.views ?? rawPayload.bundle?.views ?? [])
    .map((item) => normalizeKnowledgeView(item))
    .filter((item): item is KnowledgeView => item !== null)
  let normalizedViewProjections = Object.fromEntries(
    Object.entries(rawPayload.viewProjections ?? rawPayload.bundle?.viewProjections ?? {}).map(
      ([viewId, projection]) => [
        viewId,
        normalizeKnowledgeViewProjection(request, projection, viewId),
      ],
    ),
  )
  let compiledDefaultViewId: string | null = null
  let compiledActiveViewId: string | null = null
  const hasLayerPayload =
    rawPayload.bundle !== undefined ||
    (rawPayload.sources?.length ?? 0) > 0 ||
    (rawPayload.semanticNodes?.length ?? 0) > 0 ||
    (rawPayload.semanticEdges?.length ?? 0) > 0 ||
    (rawPayload.views?.length ?? 0) > 0 ||
    rawPayload.viewProjections !== undefined

  if (hasLayerPayload) {
    const bundleId =
      normalizeText(rawPayload.bundle?.id) ??
      `bundle_${Math.random().toString(36).slice(2, 8)}`
    const bundleTitle =
      normalizeText(rawPayload.bundle?.title) ??
      normalizeText(rawPayload.summary) ??
      request.sourceName

    if (Object.keys(normalizedViewProjections).length === 0) {
      const compiledViews = compileSemanticLayerViews({
        bundleId,
        bundleTitle,
        sources:
          normalizedSources.length > 0
            ? normalizedSources
            : [normalizeKnowledgeSource(null, request, 'source_1')],
        semanticNodes: normalizedSemanticNodes,
        semanticEdges: normalizedSemanticEdges,
        fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
        documentType: normalizeDocumentStructureType(classification.archetype),
      })
      normalizedViews = compiledViews.views
      normalizedViewProjections = compiledViews.viewProjections
      compiledDefaultViewId = compiledViews.defaultViewId
      compiledActiveViewId = compiledViews.activeViewId
    }

    if (normalizedViews.length === 0) {
      normalizedViews = Object.values(normalizedViewProjections).map((projection) => ({
        id: projection.viewId,
        type: projection.viewType,
        visible_node_ids: projection.previewNodes.map((node) => node.id),
        layout_type:
          projection.viewType === 'archive_view'
            ? 'archive'
            : projection.viewType === 'execution_view'
              ? 'execution'
              : 'mindmap',
      }))
    }

    const defaultViewId =
      normalizeText(rawPayload.defaultViewId) ??
      normalizeText(rawPayload.bundle?.defaultViewId) ??
      compiledDefaultViewId ??
      normalizedViews[0]?.id ??
      Object.keys(normalizedViewProjections)[0] ??
      null
    const activeViewId =
      normalizeText(rawPayload.activeViewId) ??
      normalizeText(rawPayload.bundle?.activeViewId) ??
      compiledActiveViewId ??
      defaultViewId
    const selectedViewId =
      (activeViewId && normalizedViewProjections[activeViewId] ? activeViewId : null) ??
      (defaultViewId && normalizedViewProjections[defaultViewId] ? defaultViewId : null) ??
      Object.keys(normalizedViewProjections)[0] ??
      null
    const selectedProjection = selectedViewId ? normalizedViewProjections[selectedViewId] : null
    const qualityWarnings = buildTextImportQualityWarnings({
      previewNodes: selectedProjection?.previewNodes ?? [],
      nodeBudget: request.nodeBudget,
    })
    const bundle: KnowledgeImportBundle = {
      id: bundleId,
      title: bundleTitle,
      createdAt:
        typeof rawPayload.bundle?.createdAt === 'number' ? rawPayload.bundle.createdAt : Date.now(),
      anchorTopicId: normalizeText(rawPayload.bundle?.anchorTopicId) ?? request.anchorTopicId,
      defaultViewId: defaultViewId ?? selectedViewId ?? `${bundleId}_thinking`,
      activeViewId: selectedViewId ?? defaultViewId ?? `${bundleId}_thinking`,
      mountedRootTopicId: normalizeText(rawPayload.bundle?.mountedRootTopicId) ?? null,
      sources:
        normalizedSources.length > 0
          ? normalizedSources
          : [normalizeKnowledgeSource(null, request, 'source_1')],
      semanticNodes: normalizedSemanticNodes,
      semanticEdges: normalizedSemanticEdges,
      views: normalizedViews,
      viewProjections: normalizedViewProjections,
    }

    return {
      summary: normalizeText(rawPayload.summary) ?? '智能导入预览已生成。',
      baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
      anchorTopicId: request.anchorTopicId,
      classification,
      templateSummary,
      bundle,
      sources: bundle.sources,
      semanticNodes: bundle.semanticNodes,
      semanticEdges: bundle.semanticEdges,
      views: bundle.views,
      viewProjections: bundle.viewProjections,
      defaultViewId: bundle.defaultViewId,
      activeViewId: bundle.activeViewId,
      nodePlans: selectedProjection?.nodePlans ?? [],
      previewNodes: selectedProjection?.previewNodes ?? [],
      operations: selectedProjection?.operations ?? [],
      conflicts: (rawPayload.conflicts ?? []).map(normalizeImportConflict),
      warnings: [...new Set([...normalizedWarnings, ...qualityWarnings])],
    }
  }

  if (Array.isArray(rawPayload.nodePlans) && rawPayload.nodePlans.length > 0) {
    const nodePlans = rawPayload.nodePlans.map(normalizeImportNodePlan)
    const compiled = compileTextImportNodePlans({
      insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
      nodePlans,
    })
    const qualityWarnings = buildTextImportQualityWarnings({
      previewNodes: compiled.previewNodes,
      nodeBudget: request.nodeBudget,
    })

    return {
      summary: normalizeText(rawPayload.summary) ?? '智能导入预览已生成。',
      baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
      anchorTopicId: request.anchorTopicId,
      classification,
      templateSummary,
      bundle: null,
      sources: [],
      semanticNodes: [],
      semanticEdges: [],
      views: [],
      viewProjections: {},
      defaultViewId: null,
      activeViewId: null,
      nodePlans,
      previewNodes: compiled.previewNodes,
      operations: compiled.operations,
      conflicts: (rawPayload.conflicts ?? []).map(normalizeImportConflict),
      warnings: [...new Set([...normalizedWarnings, ...qualityWarnings])],
    }
  }

  const previewNodes = validateImportPreviewItems(
    (rawPayload.previewNodes ?? []).map(normalizeImportPreviewItem),
  )
  const nodePlans = deriveTextImportNodePlansFromPreviewNodes({
    previewNodes,
  })
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes,
    nodeBudget: request.nodeBudget,
  })

  return {
    summary: normalizeText(rawPayload.summary) ?? '智能导入预览已生成。',
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification,
    templateSummary,
    bundle: null,
    sources: [],
    semanticNodes: [],
    semanticEdges: [],
    views: [],
    viewProjections: {},
    defaultViewId: null,
    activeViewId: null,
    nodePlans,
    previewNodes,
    operations: (rawPayload.operations ?? []).map((operation) =>
      normalizeImportOperation(request, operation),
    ),
    conflicts: (rawPayload.conflicts ?? []).map(normalizeImportConflict),
    warnings: [...new Set([...normalizedWarnings, ...qualityWarnings])],
  }
}

function fallbackDocumentTypeForRequest(
  request: TextImportRequest,
): TextImportClassification['archetype'] {
  switch (request.archetype) {
    case 'process':
      return 'process'
    case 'plan':
      return 'plan'
    case 'notes':
      return 'notes'
    default:
      return 'analysis'
  }
}

function normalizeDocumentToLogicMapDocumentType(
  value: string | null | undefined,
  request: TextImportRequest,
): TextImportClassification['archetype'] {
  switch (value) {
    case 'analysis':
    case 'process':
    case 'plan':
    case 'notes':
      return value
    default:
      return fallbackDocumentTypeForRequest(request)
  }
}

function normalizeDocumentToLogicMapConfidence(
  value: number | string | null | undefined,
): TextImportNodePlan['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0.8) {
      return 'high'
    }
    if (value >= 0.55) {
      return 'medium'
    }
  }
  return 'low'
}

function normalizeDocumentToLogicMapNodeType(
  value: string | null | undefined,
): DocumentToLogicMapNodeType | null {
  switch (value) {
    case 'section':
    case 'claim':
    case 'evidence':
    case 'task':
    case 'decision':
    case 'risk':
    case 'metric':
    case 'question':
      return value
    default:
      return null
  }
}

function normalizeDocumentToLogicMapSourceAnchors(
  spans: RawDocumentToLogicMapSpan[] | null | undefined,
): TextImportNodePlan['sourceAnchors'] {
  return (spans ?? [])
    .map((span) => ({
      lineStart:
        typeof span.line_start === 'number' && Number.isInteger(span.line_start)
          ? span.line_start
          : null,
      lineEnd:
        typeof span.line_end === 'number' && Number.isInteger(span.line_end)
          ? span.line_end
          : null,
    }))
    .filter(
      (anchor): anchor is { lineStart: number; lineEnd: number } =>
        anchor.lineStart !== null && anchor.lineEnd !== null,
    )
}

type NormalizedDocumentToLogicMapNode = {
  id: string
  parentId: string | null
  order: number
  type: DocumentToLogicMapNodeType
  title: string
  note: string | null
  semanticRole: DocumentToLogicMapNodeType
  confidence: TextImportNodePlan['confidence']
  sourceAnchors: TextImportNodePlan['sourceAnchors']
  task:
    | {
        status: 'todo' | 'in_progress' | 'blocked' | 'done'
        output: string | null
      }
    | null
}

function normalizeDocumentToLogicMapNode(
  value: RawDocumentToLogicMapNode,
  fallbackOrder: number,
): NormalizedDocumentToLogicMapNode {
  const id = normalizeText(value.id)
  const type = normalizeDocumentToLogicMapNodeType(normalizeText(value.type))
  const semanticRole =
    normalizeDocumentToLogicMapNodeType(normalizeText(value.semantic_role)) ?? type
  const title = normalizeText(value.title)
  const order =
    typeof value.order === 'number' && Number.isInteger(value.order) ? value.order : fallbackOrder

  if (!id || !type || !semanticRole || !title) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的 document-to-logic-map 节点。')
  }

  const taskStatus =
    value.task?.status === 'todo' ||
    value.task?.status === 'in_progress' ||
    value.task?.status === 'blocked' ||
    value.task?.status === 'done'
      ? value.task.status
      : 'todo'

  return {
    id,
    parentId: normalizeText(value.parent_id) ?? null,
    order,
    type,
    title,
    note: normalizeText(value.note) ?? null,
    semanticRole: type,
    confidence: normalizeDocumentToLogicMapConfidence(value.confidence),
    sourceAnchors: normalizeDocumentToLogicMapSourceAnchors(value.source_spans),
    task:
      type === 'task'
        ? {
            status: taskStatus,
            output: normalizeText(value.task?.output) ?? null,
          }
        : null,
  }
}

function createDocumentToLogicMapSource(request: TextImportRequest): KnowledgeSource {
  const headings = request.preprocessedHints
    .filter((hint) => hint.kind === 'heading')
    .map((hint) => ({
      level: hint.level,
      title: hint.text,
      lineStart: hint.lineStart,
      lineEnd: hint.lineEnd,
      pathTitles: hint.sourcePath,
    }))
  const segments = request.preprocessedHints.map((hint) => ({
    kind: hint.kind,
    text: hint.text,
    lineStart: hint.lineStart,
    lineEnd: hint.lineEnd,
    pathTitles: hint.sourcePath,
  }))

  return {
    id: 'source_1',
    type: request.sourceType,
    title: request.sourceName.replace(/\.[^.]+$/, '') || 'Imported source',
    raw_content: request.rawText,
    metadata: {
      sourceName: request.sourceName,
      headingCount: headings.length,
      headings,
      segments,
    },
  }
}

function buildDocumentToLogicMapSourceRefs(
  request: TextImportRequest,
  sourceId: string,
  anchors: TextImportNodePlan['sourceAnchors'],
): KnowledgeSourceRef[] {
  const seen = new Set<string>()
  const refs: KnowledgeSourceRef[] = []

  anchors.forEach((anchor) => {
    const matchingHint = request.preprocessedHints.find(
      (hint) => hint.lineStart === anchor.lineStart && hint.lineEnd === anchor.lineEnd,
    )
    const ref: KnowledgeSourceRef = {
      sourceId,
      lineStart: anchor.lineStart,
      lineEnd: anchor.lineEnd,
      pathTitles: matchingHint?.sourcePath ?? [],
    }
    const key = `${ref.sourceId}:${ref.lineStart}:${ref.lineEnd}:${ref.pathTitles.join('>')}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    refs.push(ref)
  })

  return refs
}

function buildDocumentToLogicMapNodePlans(
  nodes: NormalizedDocumentToLogicMapNode[],
): TextImportNodePlan[] {
  return nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    order: node.order,
    title: node.title,
    note: node.note,
    semanticRole: node.semanticRole,
    semanticType: node.type,
    confidence: node.confidence,
    sourceAnchors: node.sourceAnchors,
    groupKey: node.parentId ? null : 'root',
    priority:
      node.parentId === null
        ? 'primary'
        : node.type === 'evidence'
          ? 'supporting'
          : node.type === 'section' || node.type === 'claim'
            ? 'primary'
            : 'secondary',
    collapsedByDefault: node.type === 'evidence',
    templateSlot: null,
  }))
}

function buildDocumentToLogicMapSemanticNodes(
  request: TextImportRequest,
  sourceId: string,
  nodes: NormalizedDocumentToLogicMapNode[],
): KnowledgeSemanticNode[] {
  return nodes.map((node) => {
    const sourceRefs = buildDocumentToLogicMapSourceRefs(request, sourceId, node.sourceAnchors)
    return {
      id: node.id,
      type: node.type,
      title: node.title,
      summary: node.title,
      detail: node.note ?? '',
      source_refs: sourceRefs,
      confidence: node.confidence,
      task:
        node.type === 'task'
          ? {
              status: node.task?.status ?? 'todo',
              owner: null,
              due_date: null,
              priority: null,
              depends_on: [],
              output: node.task?.output ?? null,
              source_refs: sourceRefs,
              definition_of_done: null,
            }
          : null,
    }
  })
}

function buildDocumentToLogicMapSemanticEdges(
  request: TextImportRequest,
  sourceId: string,
  nodes: NormalizedDocumentToLogicMapNode[],
): KnowledgeSemanticEdge[] {
  const edges: KnowledgeSemanticEdge[] = []
  nodes.forEach((node) => {
    if (!node.parentId) {
      return
    }
    const sourceRefs = buildDocumentToLogicMapSourceRefs(request, sourceId, node.sourceAnchors)
    edges.push({
      from: node.id,
      to: node.parentId,
      type: 'belongs_to',
      label: null,
      source_refs: sourceRefs,
      confidence: node.confidence,
    })

    if (node.type === 'evidence' || node.type === 'metric') {
      edges.push({
        from: node.id,
        to: node.parentId,
        type: 'supports',
        label: null,
        source_refs: sourceRefs,
        confidence: node.confidence,
      })
    }
  })

  return edges
}

function normalizeDocumentToLogicMapPayload(
  request: TextImportRequest,
  rawPayload: RawDocumentToLogicMapPayload,
): TextImportResponse {
  const normalizedWarnings = (rawPayload.warnings ?? [])
    .map((item) => normalizeText(item))
    .filter((item): item is string => !!item)
  const classification: TextImportClassification = {
    archetype: normalizeDocumentToLogicMapDocumentType(rawPayload.document_type, request),
    confidence:
      typeof rawPayload.document_type_confidence === 'number' &&
      Number.isFinite(rawPayload.document_type_confidence)
        ? Math.max(0, Math.min(1, rawPayload.document_type_confidence))
        : 0.6,
    rationale:
      normalizeText(rawPayload.document_type_rationale) ??
      'No explicit document-type rationale was returned by document-to-logic-map.',
    secondaryArchetype: null,
  }
  const nodes = (rawPayload.nodes ?? []).map((node, index) =>
    normalizeDocumentToLogicMapNode(node, index),
  )
  const nodeIds = new Set<string>()
  nodes.forEach((node) => {
    if (nodeIds.has(node.id)) {
      throw new CodexBridgeError(
        'request_failed',
        `Codex 返回了重复的 document-to-logic-map 节点 id: ${node.id}`,
      )
    }
    nodeIds.add(node.id)
  })
  nodes.forEach((node) => {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      throw new CodexBridgeError(
        'request_failed',
        `Codex 返回了缺失父节点的 document-to-logic-map 节点: ${node.id}`,
      )
    }
  })

  const source = createDocumentToLogicMapSource(request)
  const nodePlans = buildDocumentToLogicMapNodePlans(nodes)
  const compiled = compileTextImportNodePlans({
    insertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    nodePlans,
  })
  const semanticNodes = buildDocumentToLogicMapSemanticNodes(request, source.id, nodes)
  const semanticEdges = buildDocumentToLogicMapSemanticEdges(request, source.id, nodes)
  const bundleId = `bundle_${Math.random().toString(36).slice(2, 8)}`
  const bundleTitle = normalizeText(rawPayload.summary) ?? source.title
  const compiledViews = compileSemanticLayerViews({
    bundleId,
    bundleTitle,
    sources: [source],
    semanticNodes,
    semanticEdges,
    fallbackInsertionParentTopicId: request.anchorTopicId ?? request.context.rootTopicId,
    documentType: normalizeDocumentStructureType(classification.archetype),
  })
  const qualityWarnings = buildTextImportQualityWarnings({
    previewNodes: compiled.previewNodes,
    nodeBudget: request.nodeBudget,
  })

  return {
    summary: normalizeText(rawPayload.summary) ?? '智能导入预览已生成。',
    baseDocumentUpdatedAt: request.baseDocumentUpdatedAt,
    anchorTopicId: request.anchorTopicId,
    classification,
    templateSummary: {
      archetype: classification.archetype,
      visibleSlots: [],
      foldedSlots: [],
    },
    bundle: {
      id: bundleId,
      title: bundleTitle,
      createdAt: Date.now(),
      anchorTopicId: request.anchorTopicId,
      defaultViewId: compiledViews.defaultViewId,
      activeViewId: compiledViews.activeViewId,
      mountedRootTopicId: null,
      sources: [source],
      semanticNodes,
      semanticEdges,
      views: compiledViews.views,
      viewProjections: compiledViews.viewProjections,
    },
    sources: [source],
    semanticNodes,
    semanticEdges,
    views: compiledViews.views,
    viewProjections: compiledViews.viewProjections,
    defaultViewId: compiledViews.defaultViewId,
    activeViewId: compiledViews.activeViewId,
    nodePlans,
    previewNodes: compiled.previewNodes,
    operations: compiled.operations,
    conflicts: [],
    warnings: [...new Set([...normalizedWarnings, ...qualityWarnings])],
  }
}

function normalizeTextImportPayload(
  request: TextImportRequest,
  rawPayload: RawTextImportPayload,
): TextImportResponse {
  if ('nodes' in rawPayload || 'document_type' in rawPayload) {
    return normalizeDocumentToLogicMapPayload(request, rawPayload as RawDocumentToLogicMapPayload)
  }

  return normalizeImportPayload(request, rawPayload as RawImportPayload)
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

function parseSyncConflictAnalysisPayload(
  rawText: string | null | undefined,
): RawSyncConflictAnalysisPayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空的冲突分析结果。')
  }

  const parsed = JSON.parse(rawText) as RawSyncConflictAnalysisPayload
  if (typeof parsed !== 'object' || parsed === null) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了无效的冲突分析结构。')
  }

  return parsed
}

function parseImportPayload(rawText: string | null | undefined): RawTextImportPayload {
  if (!rawText) {
    throw new CodexBridgeError('request_failed', 'Codex 返回了空的导入预览结果。')
  }

  const parsed = JSON.parse(rawText) as RawTextImportPayload
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
  const normalizedWarnings = (rawPayload.warnings ?? [])
    .map((item) => normalizeText(item))
    .filter((item): item is string => !!item)

  return {
    decisions: (rawPayload.decisions ?? []).map(normalizeSemanticDecision),
    warnings: normalizedWarnings,
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

function buildImportWaitingStatusMessage(
  mode: 'primary' | 'repair',
  elapsedSinceLastEventMs?: number,
): string {
  const baseMessage =
    mode === 'primary'
      ? 'Codex 正在分析全文与整张脑图…'
      : 'Codex 正在修正导入结构…'

  if (!elapsedSinceLastEventMs || elapsedSinceLastEventMs <= 0) {
    return baseMessage
  }

  const elapsedSeconds = Math.max(1, Math.round(elapsedSinceLastEventMs / 1000))
  return `${baseMessage} 已等待 ${elapsedSeconds}s，仍在运行。`
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

function buildChatScopeInstructions(request: AiChatRequest): string[] {
  switch (request.context.scope) {
    case 'focused_subset':
      return [
        '- Use only the provided subset graph context. Do not assume omitted branches or siblings exist.',
        '- If the subset is insufficient, ask for the missing context instead of inventing it.',
      ]
    case 'empty':
      return [
        '- No graph context was supplied beyond a minimal document shell. Rely on the user message first.',
        '- Before proposing structural edits, ask for more context when the request depends on missing map content.',
      ]
    case 'full_document':
    default:
      return [
        '- Use the full graph context to understand the request; treat focus selection only as a hint.',
      ]
  }
}

function buildChatPrompt(request: AiChatRequest, prompt: LoadedSystemPrompt): string {
  return [
    prompt.fullPrompt,
    '',
    'Stage 1 goal:',
    '- Reply in natural language only.',
    '- Do not output JSON, code blocks, XML, YAML, or pseudo-schema.',
    ...buildChatScopeInstructions(request),
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
    '- Markers and stickers are human-maintained fields. You may read existing markers/stickers from context, but you must not create or modify markers or stickers in proposal metadata.',
    '- Only use move_topic or delete_topic when the user explicitly asks to regroup, replace, delete, or reorganize existing content.',
    '- If the request is too ambiguous to apply safely, set needsMoreContext=true and ask one minimal clarification question in contextRequest.',
    ...buildChatScopeInstructions(request),
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

function buildSyncConflictAnalysisPrompt<TPayload>(
  request: SyncAnalyzeConflictRequest<TPayload>,
  prompt: LoadedSystemPrompt,
): string {
  return [
    prompt.fullPrompt,
    '',
    'Stage goal:',
    '- Return valid JSON only.',
    '- Analyze a sync conflict between local cache and cloud data.',
    '- Never suggest silent overwrite or automatic application.',
    '- Recommend exactly one of use_cloud, save_local_copy, or merged_payload.',
    '- Only recommend merged_payload when you can provide a complete mergedPayload object.',
    '- If a safe merge is not possible, do not fabricate partial patches.',
    '- Keep reasons concise and user-facing.',
    '',
    'Conflict request:',
    JSON.stringify(request, null, 2),
  ].join('\n')
}

interface CompactImportTopicSummary {
  topicId: string
  title: string
  parentTopicId: string | null
  childTopicIds: string[]
  aiLocked: boolean
  notePreview?: string
  metadata?: Partial<AiDocumentTopicContext['metadata']>
  style?: Partial<AiDocumentTopicContext['style']>
}

type ImportHintKind = TextImportRequest['preprocessedHints'][number]['kind']
type ImportSemanticHintKind = TextImportRequest['semanticHints'][number]['kind']

interface CompactImportHintSummary {
  totalCount: number
  structuredHintCount: number
  countsByKind: Partial<Record<ImportHintKind, number>>
  representativeHeadings: string[]
  representativePaths: string[]
  representativeListItems: string[]
  representativeTables: string[]
  codeBlockLanguages: string[]
}

interface CompactImportSemanticHintSummary {
  totalCount: number
  countsByKind: Partial<Record<ImportSemanticHintKind, number>>
  representativeItems: string[]
}

interface BuiltTextImportPromptContext {
  promptContextText: string
  focusedTopicCount: number
  compactTopicCount: number
  notePreviewCount: number
  focusedNotePreviewCount: number
  compactNotePreviewCount: number
  preprocessedHintCount: number
  structuredHintCount: number
  semanticHintCount: number
  promptContextLength: number
}

function hasMeaningfulMetadata(topic: AiDocumentTopicContext): boolean {
  return (
    topic.metadata.labels.length > 0 ||
    topic.metadata.markers.length > 0 ||
    (topic.metadata.stickers?.length ?? 0) > 0 ||
    Boolean(topic.metadata.type)
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

function appendUniqueSample(
  samples: string[],
  value: string,
  maxSamples: number,
): void {
  if (!value || samples.length >= maxSamples || samples.includes(value)) {
    return
  }

  samples.push(value)
}

function summarizeTextImportHints(
  hints: TextImportRequest['preprocessedHints'],
): CompactImportHintSummary {
  const countsByKind: Partial<Record<ImportHintKind, number>> = {}
  const representativeHeadings: string[] = []
  const representativePaths: string[] = []
  const representativeListItems: string[] = []
  const representativeTables: string[] = []
  const codeBlockLanguages: string[] = []
  let structuredHintCount = 0

  for (const hint of hints) {
    countsByKind[hint.kind] = (countsByKind[hint.kind] ?? 0) + 1

    if (
      hint.kind === 'heading' ||
      hint.kind === 'bullet_list' ||
      hint.kind === 'ordered_list' ||
      hint.kind === 'task_list' ||
      hint.kind === 'table'
    ) {
      structuredHintCount += 1
    }

    if (hint.sourcePath.length > 0) {
      appendUniqueSample(
        representativePaths,
        truncateImportNotePreview(hint.sourcePath.join(' > '), 96),
        8,
      )
    }

    if (hint.kind === 'heading') {
      appendUniqueSample(
        representativeHeadings,
        truncateImportNotePreview(hint.text, 96),
        8,
      )
      continue
    }

    if (
      hint.kind === 'bullet_list' ||
      hint.kind === 'ordered_list' ||
      hint.kind === 'task_list'
    ) {
      for (const item of hint.items ?? []) {
        appendUniqueSample(
          representativeListItems,
          truncateImportNotePreview(item, 84),
          8,
        )
      }
      continue
    }

    if (hint.kind === 'table') {
      const rowCount = hint.rows?.length ?? 0
      const columnCount = Math.max(0, ...(hint.rows ?? []).map((row) => row.length))
      appendUniqueSample(
        representativeTables,
        `${rowCount}r x ${columnCount}c @${hint.lineStart}-${hint.lineEnd}`,
        4,
      )
      continue
    }

    if (hint.kind === 'code_block' && hint.language?.trim()) {
      appendUniqueSample(codeBlockLanguages, hint.language.trim(), 4)
    }
  }

  return {
    totalCount: hints.length,
    structuredHintCount,
    countsByKind,
    representativeHeadings,
    representativePaths,
    representativeListItems,
    representativeTables,
    codeBlockLanguages,
  }
}

function summarizeTextImportSemanticHints(
  hints: TextImportRequest['semanticHints'],
): CompactImportSemanticHintSummary {
  const countsByKind: Partial<Record<ImportSemanticHintKind, number>> = {}
  const representativeItems: string[] = []

  for (const hint of hints) {
    countsByKind[hint.kind] = (countsByKind[hint.kind] ?? 0) + 1
    appendUniqueSample(
      representativeItems,
      `${hint.kind}: ${truncateImportNotePreview(hint.text, 72)}`,
      12,
    )
  }

  return {
    totalCount: hints.length,
    countsByKind,
    representativeItems,
  }
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

function buildFocusedImportTopic(
  topic: AiDocumentTopicContext,
  options?: { includeNotePreview?: boolean },
): CompactImportTopicSummary {
  const metadata = {
    ...(topic.metadata.labels.length > 0 ? { labels: topic.metadata.labels } : {}),
    ...(topic.metadata.markers.length > 0 ? { markers: topic.metadata.markers } : {}),
    ...((topic.metadata.stickers?.length ?? 0) > 0 ? { stickers: topic.metadata.stickers } : {}),
    ...(topic.metadata.type ? { type: topic.metadata.type } : {}),
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
    ...(options?.includeNotePreview
      ? { notePreview: truncateImportNotePreview(topic.note, 160) || undefined }
      : {}),
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
  const selectedTopicIds = new Set(request.context.focus.selectedTopicIds)

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
  const hintSummary = summarizeTextImportHints(request.preprocessedHints)
  const semanticHintSummary = summarizeTextImportSemanticHints(request.semanticHints)

  request.context.topics.forEach((topic) => {
    if (focusedTopicIds.has(topic.topicId)) {
      focusedTopics.push(
        buildFocusedImportTopic(topic, {
          includeNotePreview:
            topic.aiLocked ||
            topic.topicId === request.context.focus.activeTopicId ||
            selectedTopicIds.has(topic.topicId),
        }),
      )
      return
    }

    compactTopics.push(buildCompactImportTopic(topic))
  })
  const focusedNotePreviewCount = focusedTopics.filter((topic) => typeof topic.notePreview === 'string').length
  const compactNotePreviewCount = compactTopics.filter((topic) => typeof topic.notePreview === 'string').length
  const anchorTopic = topicsById.get(request.anchorTopicId ?? request.context.rootTopicId)
  const backgroundTopicTitles = compactTopics
    .slice(0, 8)
    .map((topic) => topic.title)
    .filter((title) => title.trim().length > 0)
  const documentTypeHint =
    request.archetype === 'analysis' ||
    request.archetype === 'process' ||
    request.archetype === 'plan' ||
    request.archetype === 'notes'
      ? request.archetype
      : null

  const promptContext = {
    spec_version: 'document-to-logic-map/v1',
    source: {
      name: request.sourceName,
      type: request.sourceType,
      raw_text: request.rawText,
    },
    document_context: {
      document_id: request.documentId,
      document_title: request.documentTitle,
      base_document_updated_at: request.baseDocumentUpdatedAt,
      anchor_topic_id: request.anchorTopicId,
    },
    map_context: {
      root_topic_id: request.context.rootTopicId,
      focused_topics: focusedTopics,
      background_topic_titles: backgroundTopicTitles,
    },
    preprocessed_hints: request.preprocessedHints.map((hint) => ({
      id: hint.id,
      kind: hint.kind,
      text: hint.text,
      raw: hint.raw,
      level: hint.level,
      line_start: hint.lineStart,
      line_end: hint.lineEnd,
      source_path: hint.sourcePath,
      language: hint.language ?? null,
      items: hint.items ?? null,
      checked: hint.checked ?? null,
      rows: hint.rows ?? null,
    })),
    options: {
      document_type_hint: documentTypeHint,
      max_total_nodes: request.nodeBudget?.maxTotalNodes ?? null,
      max_depth: request.nodeBudget?.maxDepth ?? null,
    },
    brainflow_context: {
      import_intent: request.intent,
      archetype_mode: request.archetypeMode ?? 'auto',
      content_profile: request.contentProfile ?? null,
      preprocessed_hint_count: hintSummary.totalCount,
      preprocessed_hint_summary: hintSummary,
      semantic_hint_count: semanticHintSummary.totalCount,
      semantic_hint_summary: semanticHintSummary,
      focus: request.context.focus,
      map_summary: {
        topic_count: request.context.topicCount,
        focused_topic_count: focusedTopics.length,
        compact_topic_count: compactTopics.length,
        focused_note_preview_count: focusedNotePreviewCount,
        compact_note_preview_count: compactNotePreviewCount,
        structured_hint_count: hintSummary.structuredHintCount,
        semantic_hint_count: semanticHintSummary.totalCount,
      },
      anchor_topic: anchorTopic
        ? buildFocusedImportTopic(anchorTopic, {
            includeNotePreview:
              anchorTopic.aiLocked ||
              anchorTopic.topicId === request.context.focus.activeTopicId ||
              selectedTopicIds.has(anchorTopic.topicId),
          })
        : null,
    },
  }

  const promptContextText = JSON.stringify(promptContext, null, 2)

  return {
    promptContextText,
    focusedTopicCount: focusedTopics.length,
    compactTopicCount: compactTopics.length,
    notePreviewCount: focusedNotePreviewCount + compactNotePreviewCount,
    focusedNotePreviewCount,
    compactNotePreviewCount,
    preprocessedHintCount: request.preprocessedHints.length,
    structuredHintCount: hintSummary.structuredHintCount,
    semanticHintCount: request.semanticHints.length,
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
    '- Analyze the source text and the current mind map before proposing changes.',
    '- Preserve source facts, but generate a document structure graph, not a brainstorming mind map.',
    '- Respect importIntent, archetype, archetypeMode, contentProfile, semanticHintSummary, and nodeBudget.',
    '- Classify the source into one document type first: analysis, process, plan, or notes.',
    '- Return classification and templateSummary even when you also return nodePlans.',
    '- Prefer semantic planning first. Build the nodePlans from source order: parse markdown blocks, classify each block, build an ordered logic spine, attach supporting evidence to the nearest section or claim, extract only strict executable tasks, compress labels, and preserve source anchors.',
    '- nodePlans must stay flat. Each node plan must include id, parentId, order, title, note, semanticRole, confidence, sourceAnchors, groupKey, priority, collapsedByDefault, and templateSlot.',
    '- Use semanticRole to distinguish section, summary, decision, action, risk, question, metric, timeline, and evidence.',
    '- Do not create empty template branches such as 适用场景, 检验标准, 数据, 证据, 核心观点, or 分论点 unless the source explicitly has that heading.',
    '- Do not put all evidence under one generic 证据 branch. Evidence, metrics, examples, quotes, and criteria must sit under the section or claim they support.',
    '- Create task nodes only when the text has an explicit action verb and a concrete output; principles, definitions, criteria, and background remain section, claim, metric, risk, question, or evidence nodes.',
    '- Use templateSlot only when the source explicitly names such a structure; otherwise keep it null.',
    '- sourceAnchors should cite the supporting line ranges from the imported source whenever possible.',
    '- Avoid generic titles, sibling explosions, and dumping long raw notes into leaf nodes.',
    '- Treat the selected anchor topic as the preferred insertion point, but do not mutate locked nodes or restructure existing topics unless the JSON fallback path clearly needs it.',
    mode === 'repair'
      ? '- This is a repair attempt because the previous output was not schema-compatible or structurally weak. Tighten the node plan, remove duplicates, and simplify titles.'
      : '- Prefer a complete, stable semantic node plan on the first attempt.',
    '',
    'Current import context:',
    promptContextText,
  ].join('\n')
}

function buildDocumentToLogicMapPrompt(
  prompt: LoadedSystemPrompt,
  promptContextText: string,
  mode: 'primary' | 'repair' = 'primary',
): string {
  return [
    prompt.fullPrompt,
    '',
    'Use the repo skill `document-to-logic-map` for this import.',
    '',
    'Import goal:',
    '- Return valid JSON only.',
    '- Follow the `document-to-logic-map/v1` input and output contracts exactly.',
    '- First classify the source as analysis, process, plan, or notes.',
    '- Normalize headings into wrapper, semantic, or archival headings before you build the spine.',
    '- Treat wrapper headings such as 说明, 备注, 对话记录, 用户, 助手, 文件格式, 本文说明, 当前对话整理, 对话整理, Markdown 记录, Turn n · User, and Turn n · Assistant as archival unless they clearly carry the thesis.',
    '- Wrapper headings must not become the first two visible levels of the logic map. Preserve them for archive handling instead.',
    '- For conversation-export documents, derive the spine from the user core question, the assistant main conclusion, and the assistant decomposition sections.',
    '- Choose the root from the highest-information semantic unit, such as the core question, thesis, main decision, or main job-to-be-done. Do not default the root to the file title.',
    '- Build the main spine in original source order instead of forcing a preset template.',
    '- Only use these node types: section, claim, evidence, task, decision, risk, metric, question.',
    '- `semantic_role` must equal `type` for every node.',
    '- Attach evidence and metrics to the nearest supporting claim, or the nearest section if no claim exists yet.',
    '- Create task nodes only when the text contains both a concrete action and a concrete output.',
    '- Do not invent placeholder parent nodes such as steps, use cases, criteria, data, evidence, or sub-arguments unless the source explicitly has that heading.',
    '- Do not let wrapper headings, archive branches, or source-outline nodes become the visible logic spine.',
    '- When the document type is analysis, preserve breadth at level 1. If you extract 4-8 peer sections, keep all of them visible instead of collapsing the document to one branch.',
    '- For analysis documents, each first-order section may expose 1-3 representative children: a claim, a metric/evidence/question, and a task only when both action and deliverable are explicit.',
    '- Keep titles short and move source detail into `note`.',
    '- Preserve source-grounded spans and confidence for every node.',
    mode === 'repair'
      ? '- This is a repair attempt because the previous output was not schema-compatible or structurally weak. Tighten the tree, remove duplicates, and keep the source order intact.'
      : '- Prefer a complete, stable logic tree on the first attempt.',
    '',
    'Skill input JSON:',
    promptContextText,
  ].join('\n')
}

void buildTextImportPrompt

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
  analyzeSyncConflict<TPayload>(
    request: SyncAnalyzeConflictRequest<TPayload>,
  ): Promise<SyncAnalyzeConflictResponse<TPayload>>
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

    async analyzeSyncConflict(request) {
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
          buildSyncConflictAnalysisPrompt(request, loadedPrompt),
          SYNC_CONFLICT_ANALYSIS_RESPONSE_SCHEMA,
        )
        return normalizeSyncConflictAnalysisPayload(request, parseSyncConflictAnalysisPayload(rawText))
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
          focusedNotePreviewCount: promptContext.focusedNotePreviewCount,
          compactNotePreviewCount: promptContext.compactNotePreviewCount,
          preprocessedHintCount: promptContext.preprocessedHintCount,
          structuredHintCount: promptContext.structuredHintCount,
          semanticHintCount: promptContext.semanticHintCount,
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
            buildImportWaitingStatusMessage(mode),
          )

          const rawText = await runner.execute(
            buildDocumentToLogicMapPrompt(loadedPrompt, promptContext.promptContextText, mode),
            DOCUMENT_TO_LOGIC_MAP_RESPONSE_SCHEMA,
            {
              onObservation: (event: CodexExecutionObservation) => {
                if (event.phase === 'heartbeat' && currentStage === waitingStage) {
                  emitImportStatus(
                    waitingStage,
                    buildImportWaitingStatusMessage(mode, event.elapsedSinceLastEventMs),
                    event.elapsedSinceLastEventMs,
                  )
                }

                logInfo(
                  formatImportLog(requestId, {
                    event: 'runner',
                    attempt: mode,
                    stage: currentStage,
                    timestampMs: event.timestampMs,
                    kind: event.kind,
                    stdoutLength: event.stdoutLength,
                    stderrLength: event.stderrLength,
                    phase: event.phase,
                    promptLength: event.promptLength,
                    elapsedSinceLastEventMs: event.elapsedSinceLastEventMs,
                    exitCode: event.exitCode,
                    hadJsonEvent: event.hadJsonEvent,
                  }),
                )
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

          const normalized = normalizeTextImportPayload(request, parseImportPayload(rawText))

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
