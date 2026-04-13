import type {
  TextImportArchetype,
  TextImportMergeSuggestion,
  TextImportPreviewNode,
  TextImportResponse,
  TextImportTraceEntry,
} from '../../../../shared/ai-contract'
import {
  formatTextImportArchetypeLabel,
  type TextImportSourcePlanningSummary,
} from '../../../../shared/text-import-semantics'
import type { SemanticMergeStage } from '../local-text-import-core'
import type { TextImportActivityBlock } from '../text-import-activity'
import type { TextImportJobMode } from '../text-import-job'
import type { TextImportErrorState } from '../text-import-store'

// --- Constants ---

export const SKILL_PHASES = [
  { id: 'detect', label: 'Detect type' },
  { id: 'logic', label: 'Build logic map' },
  { id: 'attach', label: 'Attach evidence / tasks' },
  { id: 'merge', label: 'Check merges' },
] as const

export const REVIEW_TABS = [
  { id: 'draft', label: 'Draft' },
  { id: 'merge', label: 'Merge' },
] as const

export type SkillPhaseId = (typeof SKILL_PHASES)[number]['id']
export type ReviewTab = (typeof REVIEW_TABS)[number]['id']

export const ARCHETYPE_OPTIONS: Array<{
  id: TextImportArchetype | null
  label: string
  description: string
}> = [
  {
    id: null,
    label: 'Auto detect',
    description: 'Let the skill detect whether the source is analysis, process, plan, or notes.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    description: 'Prefer claims, evidence, metrics, risks, and questions in source order.',
  },
  {
    id: 'process',
    label: 'Process',
    description: 'Prefer ordered sections and only extract tasks when the output is explicit.',
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Prefer decisions, risks, metrics, and explicit deliverable-oriented tasks.',
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Prefer concise sections, decisions, open questions, and source-backed evidence.',
  },
]

// --- Types ---

export type TraceFeedItem =
  | {
      kind: 'event'
      entry: TextImportTraceEntry
    }
  | {
      kind: 'delta'
      id: string
      timestampMs: number
      attempt: TextImportTraceEntry['attempt']
      channel: TextImportTraceEntry['channel']
      eventType: string
      currentFileName: string | null
      text: string
    }

// --- Pure functions ---

export function normalizeDisplayArchetype(
  archetype: TextImportArchetype | TextImportResponse['classification']['archetype'],
): 'analysis' | 'process' | 'plan' | 'notes' {
  switch (archetype) {
    case 'process':
    case 'method':
      return 'process'
    case 'plan':
      return 'plan'
    case 'notes':
    case 'meeting':
      return 'notes'
    default:
      return 'analysis'
  }
}

export function formatDocumentTypeLabel(
  archetype: TextImportArchetype | TextImportResponse['classification']['archetype'],
): string {
  return formatTextImportArchetypeLabel(normalizeDisplayArchetype(archetype))
}

export function formatSemanticRole(role: TextImportPreviewNode['semanticRole']): string | null {
  switch (role) {
    case 'claim':
    case 'summary':
      return 'Claim'
    case 'decision':
      return 'Decision'
    case 'task':
    case 'action':
      return 'Task'
    case 'risk':
      return 'Risk'
    case 'question':
      return 'Question'
    case 'metric':
      return 'Metric'
    case 'evidence':
      return 'Evidence'
    case 'section':
      return 'Section'
    default:
      return null
  }
}

export function formatSourceSpans(
  anchors: TextImportPreviewNode['sourceAnchors'] | undefined,
): string | null {
  if (!anchors?.length) {
    return null
  }

  return anchors.map((anchor) => `L${anchor.lineStart}-${anchor.lineEnd}`).join(', ')
}

export function formatPlanningConfidence(value: TextImportSourcePlanningSummary['confidence']): string {
  switch (value) {
    case 'high':
      return 'High confidence'
    case 'medium':
      return 'Medium confidence'
    case 'low':
    default:
      return 'Low confidence'
  }
}

export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${totalSeconds}s`
}

export function formatMergeConfidence(confidence: TextImportMergeSuggestion['confidence']): string {
  return confidence === 'high' ? 'High confidence' : 'Medium confidence'
}

export function describeSemanticStage(stage: SemanticMergeStage): string {
  switch (stage) {
    case 'candidate_generation':
      return 'Generating semantic candidates'
    case 'adjudicating':
      return 'Reviewing semantic matches'
    case 'review_ready':
      return 'Semantic review ready'
    default:
      return 'Not started'
  }
}

export function describePipeline(mode: TextImportJobMode | null): string {
  void mode
  return 'Skill-backed import'
}

export function countPreviewNodes(nodes: TextImportPreviewNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countPreviewNodes(node.children), 0)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function summarizeTraceText(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '(empty)'
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

export function extractTraceDelta(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return typeof payload === 'string' && payload ? payload : null
  }

  const item = isRecord(payload.item) ? payload.item : null
  if (item && typeof item.text_delta === 'string' && item.text_delta) {
    return item.text_delta
  }

  if (item && typeof item.delta === 'string' && item.delta) {
    return item.delta
  }

  if (typeof payload.delta === 'string' && payload.delta) {
    return payload.delta
  }

  if (typeof payload.message === 'string' && payload.message) {
    return payload.message
  }

  return null
}

export function formatTraceAttempt(attempt: TextImportTraceEntry['attempt']): string {
  switch (attempt) {
    case 'repair':
      return 'Repair'
    case 'local':
      return 'Local'
    case 'primary':
    default:
      return 'Primary'
  }
}

export function formatTraceChannel(channel: TextImportTraceEntry['channel']): string {
  switch (channel) {
    case 'runner':
      return 'Runner'
    case 'request':
      return 'Request'
    case 'codex':
    default:
      return 'Codex'
  }
}

export function formatTraceLead(
  currentFileName: string | null | undefined,
  message: string,
): string {
  return currentFileName ? `${currentFileName} | ${message}` : message
}

export function formatActivityKindLabel(kind: TextImportActivityBlock['kind']): string {
  switch (kind) {
    case 'attempt_marker':
      return '修复重试'
    case 'request':
      return '请求已发出'
    case 'tool_group':
      return '工具步骤'
    case 'waiting':
      return '等待返回'
    case 'local_status':
      return '本地导入'
    case 'lifecycle':
      return '过程事件'
    case 'commentary':
    default:
      return '运行说明'
  }
}

export function summarizeTracePayload(payload: unknown): string {
  if (!isRecord(payload)) {
    return typeof payload === 'string' ? summarizeTraceText(payload) : 'No payload'
  }

  const errorPayload = isRecord(payload.error) ? payload.error : null
  const directText =
    (typeof payload.message === 'string' && payload.message) ||
    (errorPayload && typeof errorPayload.message === 'string' && errorPayload.message) ||
    null
  if (directText) {
    return summarizeTraceText(directText)
  }

  const parts: string[] = []
  for (const key of [
    'kind',
    'phase',
    'sourceName',
    'promptLength',
    'elapsedSinceLastEventMs',
    'exitCode',
    'stdoutLength',
    'stderrLength',
    'hadJsonEvent',
    'schemaEnabled',
  ] as const) {
    const value = payload[key]
    if (typeof value === 'string' && value) {
      parts.push(`${key}=${summarizeTraceText(value, 48)}`)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}=${String(value)}`)
    }
  }

  const item = isRecord(payload.item) ? payload.item : null
  if (item && typeof item.type === 'string') {
    parts.push(`item.type=${item.type}`)
  }

  if (parts.length > 0) {
    return parts.join(' | ')
  }

  try {
    return summarizeTraceText(JSON.stringify(payload))
  } catch {
    return 'Unable to summarize payload'
  }
}

export function formatTraceOffset(
  timestampMs: number,
  startedAt: number | null,
): string {
  if (startedAt === null || timestampMs <= startedAt) {
    return 'Just now'
  }

  return `+${formatElapsed(timestampMs - startedAt)}`
}

export function stringifyTracePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}

export function buildTraceFeedItems(traceEntries: TextImportTraceEntry[]): TraceFeedItem[] {
  const items: TraceFeedItem[] = []

  for (const entry of traceEntries) {
    const deltaText =
      entry.channel === 'codex' && entry.eventType === 'item.delta'
        ? extractTraceDelta(entry.payload)
        : null

    if (deltaText) {
      const previous = items.at(-1)
      if (
        previous?.kind === 'delta' &&
        previous.attempt === entry.attempt &&
        previous.channel === entry.channel &&
        previous.eventType === entry.eventType &&
        previous.currentFileName === (entry.currentFileName ?? null)
      ) {
        previous.text += deltaText
        previous.timestampMs = entry.timestampMs
        continue
      }

      items.push({
        kind: 'delta',
        id: entry.id,
        timestampMs: entry.timestampMs,
        attempt: entry.attempt,
        channel: entry.channel,
        eventType: entry.eventType,
        currentFileName: entry.currentFileName ?? null,
        text: deltaText,
      })
      continue
    }

    items.push({
      kind: 'event',
      entry,
    })
  }

  return items
}

export function resolveSkillPhase(options: {
  isApplying: boolean
  isPreviewing: boolean
  previewReady: boolean
  draftConfirmed: boolean
  semanticMergeStage: SemanticMergeStage
  progress: number
}): SkillPhaseId {
  if (options.isApplying || options.draftConfirmed || options.semanticMergeStage !== 'idle') {
    return 'merge'
  }

  if (options.previewReady) {
    return 'attach'
  }

  if (options.isPreviewing) {
    if (options.progress >= 60) {
      return 'attach'
    }
    if (options.progress >= 25) {
      return 'logic'
    }
  }

  return 'detect'
}

export function createPrimaryErrorSummary(error: TextImportErrorState): string {
  if (error.code === 'invalid_request') {
    return 'The import request was rejected before preview generation.'
  }

  if (error.kind === 'bridge_unavailable') {
    return error.status === 502 || error.status === 503 || error.status === 504
      ? 'The local Codex bridge is unavailable.'
      : error.message
  }

  if (error.kind === 'bridge_internal_error') {
    return 'The local Codex bridge failed while building the import preview.'
  }

  if (error.code === 'request_failed') {
    return 'The local Codex bridge failed while building the import preview.'
  }

  return error.message
}

export function createErrorDiagnostics(
  error: TextImportErrorState,
  currentFileName: string | null,
): { summary: string; meta: string | null; detail: string | null } {
  const summary = createPrimaryErrorSummary(error)
  const metaParts = [
    error.requestId ? `Request ${error.requestId}` : null,
    error.stage ? `Stage ${error.stage}` : null,
    currentFileName ? `File ${currentFileName}` : null,
    typeof error.status === 'number' ? `HTTP ${error.status}` : null,
  ].filter((part): part is string => Boolean(part))
  const detailSource = error.rawMessage ?? (error.message !== summary ? error.message : null)
  const detail = detailSource && detailSource !== summary ? detailSource : null

  return {
    summary,
    meta: metaParts.length > 0 ? metaParts.join(' | ') : null,
    detail,
  }
}
