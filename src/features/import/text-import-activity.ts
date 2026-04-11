import type {
  TextImportProgressEntry,
  TextImportTraceEntry,
  TextImportTraceAttempt,
} from '../../../shared/ai-contract'
import type { TextImportJobMode, TextImportJobType } from './text-import-job'

export type TextImportActivityKind =
  | 'attempt_marker'
  | 'request'
  | 'lifecycle'
  | 'commentary'
  | 'tool_group'
  | 'waiting'
  | 'local_status'

export interface TextImportActivityBlockBase {
  id: string
  kind: TextImportActivityKind
  timestampMs: number
  attempt: TextImportTraceAttempt
  currentFileName: string | null
}

export interface TextImportActivityMessageBlock extends TextImportActivityBlockBase {
  kind: 'attempt_marker' | 'request' | 'lifecycle' | 'commentary' | 'waiting' | 'local_status'
  message: string
}

export interface TextImportActivityToolGroupBlock extends TextImportActivityBlockBase {
  kind: 'tool_group'
  summary: string
  lines: string[]
}

export type TextImportActivityBlock =
  | TextImportActivityMessageBlock
  | TextImportActivityToolGroupBlock

interface BuildTextImportActivityOptions {
  jobMode: TextImportJobMode | null
  jobType: TextImportJobType | null
  traceEntries: TextImportTraceEntry[]
  progressEntries: TextImportProgressEntry[]
  statusText: string
}

type ToolCategory = 'command' | 'search' | 'web' | 'other'

interface ToolLine {
  category: ToolCategory
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeActivityText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}

function normalizeActivityDelta(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function humanizeToolType(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim()
}

function getNestedValue(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

function firstString(value: unknown, paths: ReadonlyArray<readonly string[]>): string | null {
  for (const path of paths) {
    const candidate = getNestedValue(value, path)
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
    if (Array.isArray(candidate) && candidate.every((part) => typeof part === 'string')) {
      const joined = candidate.join(' ').trim()
      if (joined) {
        return joined
      }
    }
  }
  return null
}

function isAssistantItemType(value: string | null): boolean {
  return value === 'agent_message' || value === 'reasoning'
}

function extractTraceDelta(payload: unknown): string | null {
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

function extractCommentary(entry: TextImportTraceEntry): { text: string; finalized: boolean } | null {
  if (entry.channel !== 'codex') {
    return null
  }

  const payload = isRecord(entry.payload) ? entry.payload : null
  const item = payload && isRecord(payload.item) ? payload.item : null
  const itemType = typeof item?.type === 'string' ? item.type : null

  if (entry.eventType === 'item.delta') {
    if (itemType && !isAssistantItemType(itemType)) {
      return null
    }
    const delta = extractTraceDelta(entry.payload)
    if (!delta) {
      return null
    }
    return {
      text: delta,
      finalized: false,
    }
  }

  if (entry.eventType !== 'item.completed' || !isAssistantItemType(itemType)) {
    return null
  }

  const finalText =
    (typeof item?.text === 'string' && item.text) ||
    (typeof item?.message === 'string' && item.message) ||
    extractTraceDelta(entry.payload)

  if (!finalText) {
    return null
  }

  return {
    text: finalText,
    finalized: true,
  }
}

function buildAttemptMarker(entry: TextImportTraceEntry): TextImportActivityMessageBlock {
  return {
    id: `attempt_${entry.id}`,
    kind: 'attempt_marker',
    timestampMs: entry.timestampMs,
    attempt: entry.attempt,
    currentFileName: entry.currentFileName ?? null,
    message: '主结果需要修复，正在进入修复重试。',
  }
}

function buildRequestMessage(entry: TextImportTraceEntry): string | null {
  if (entry.channel !== 'request' || entry.eventType !== 'request.dispatched') {
    return null
  }

  if (entry.attempt === 'repair') {
    return '已发送结构修复请求。'
  }

  if (entry.attempt === 'local') {
    return '已启动本地导入分析。'
  }

  return '已发送结构化导入请求。'
}

function buildRunnerMessage(
  entry: TextImportTraceEntry,
  assistantCompletedAttempts: ReadonlySet<TextImportTraceAttempt>,
): string | null {
  if (entry.channel !== 'runner') {
    return null
  }

  const payload = isRecord(entry.payload) ? entry.payload : null
  switch (entry.eventType) {
    case 'spawn_started':
      return entry.attempt === 'repair' ? '已启动 Codex 修复进程。' : '已启动 Codex 导入进程。'
    case 'first_json_event':
      return '已收到首个 Codex 事件。'
    case 'heartbeat': {
      const elapsedSinceLastEventMs =
        payload && typeof payload.elapsedSinceLastEventMs === 'number'
          ? payload.elapsedSinceLastEventMs
          : null
      const elapsedSeconds =
        elapsedSinceLastEventMs === null ? null : Math.max(1, Math.floor(elapsedSinceLastEventMs / 1000))
      return entry.attempt === 'repair'
        ? `仍在等待 Codex 修复结果${elapsedSeconds === null ? '' : `，已等待 ${elapsedSeconds}s`}。`
        : `仍在等待 Codex 返回${elapsedSeconds === null ? '' : `，已等待 ${elapsedSeconds}s`}。`
    }
    case 'completed': {
      const exitCode = payload && typeof payload.exitCode === 'number' ? payload.exitCode : undefined
      if (exitCode && exitCode !== 0) {
        return `Codex 运行已结束，退出码 ${exitCode}。`
      }
      if (assistantCompletedAttempts.has(entry.attempt)) {
        return null
      }
      return entry.attempt === 'repair' ? 'Codex 修复运行已结束。' : 'Codex 运行已结束。'
    }
    default:
      return null
  }
}

function extractToolLine(entry: TextImportTraceEntry): ToolLine | null {
  if (entry.channel !== 'codex') {
    return null
  }
  if (entry.eventType !== 'item.started' && entry.eventType !== 'item.completed') {
    return null
  }

  const payload = isRecord(entry.payload) ? entry.payload : null
  const item = payload && isRecord(payload.item) ? payload.item : null
  const itemType = typeof item?.type === 'string' ? item.type : null
  if (!itemType || isAssistantItemType(itemType)) {
    return null
  }

  const command = firstString(entry.payload, [
    ['item', 'command'],
    ['item', 'commandLine'],
    ['item', 'command_line'],
    ['item', 'cmd'],
    ['item', 'argv'],
    ['item', 'args'],
    ['item', 'input', 'command'],
    ['item', 'input', 'commandLine'],
    ['item', 'input', 'command_line'],
    ['item', 'input', 'argv'],
    ['item', 'input', 'args'],
    ['item', 'arguments', 'command'],
    ['item', 'arguments', 'commandLine'],
    ['item', 'arguments', 'command_line'],
    ['item', 'arguments', 'argv'],
    ['item', 'arguments', 'args'],
    ['command'],
    ['commandLine'],
    ['command_line'],
    ['cmd'],
    ['argv'],
    ['args'],
  ])
  const query = firstString(entry.payload, [
    ['item', 'query'],
    ['item', 'searchQuery'],
    ['item', 'search_query'],
    ['item', 'input', 'query'],
    ['item', 'input', 'searchQuery'],
    ['item', 'input', 'search_query'],
    ['query'],
    ['searchQuery'],
    ['search_query'],
  ])
  const url = firstString(entry.payload, [
    ['item', 'url'],
    ['item', 'href'],
    ['item', 'input', 'url'],
    ['item', 'input', 'href'],
    ['url'],
    ['href'],
  ])

  if (command || itemType.includes('command')) {
    return {
      category: 'command',
      text: command ? `已运行 ${command}` : '已运行命令',
    }
  }

  if (query || itemType.includes('search')) {
    return {
      category: 'search',
      text: query ? `已搜索网页 (${query})` : '已搜索网页',
    }
  }

  if (url || itemType.includes('browser') || itemType.includes('navigate') || itemType.includes('web')) {
    return {
      category: 'web',
      text: url ? `已访问网页 (${url})` : '已访问网页',
    }
  }

  return {
    category: 'other',
    text: `已执行 ${humanizeToolType(itemType)}`,
  }
}

function createToolSummary(lines: ToolLine[]): string {
  const counts = lines.reduce(
    (accumulator, line) => {
      accumulator[line.category] += 1
      return accumulator
    },
    {
      command: 0,
      search: 0,
      web: 0,
      other: 0,
    } satisfies Record<ToolCategory, number>,
  )

  const parts: string[] = []
  if (counts.command > 0) {
    parts.push(`已运行 ${counts.command} 个命令`)
  }
  if (counts.search > 0) {
    parts.push(`搜索网页 ${counts.search} 次`)
  }
  if (counts.web > 0) {
    parts.push(`访问网页 ${counts.web} 次`)
  }
  if (counts.other > 0) {
    parts.push(`执行 ${counts.other} 个工具步骤`)
  }

  return parts.length > 0 ? `${parts.join('，')}。` : '已执行工具步骤。'
}

function buildLocalActivityBlocks(
  progressEntries: TextImportProgressEntry[],
  statusText: string,
): TextImportActivityBlock[] {
  const dedupedBlocks: TextImportActivityBlock[] = []

  for (const entry of progressEntries) {
    const message = normalizeActivityText(entry.message)
    if (!message) {
      continue
    }

    const previous = dedupedBlocks.at(-1)
    if (
      previous?.kind === 'local_status' &&
      previous.attempt === entry.attempt &&
      previous.currentFileName === (entry.currentFileName ?? null) &&
      previous.message === message
    ) {
      continue
    }

    dedupedBlocks.push({
      id: entry.id,
      kind: 'local_status',
      timestampMs: entry.timestampMs,
      attempt: entry.attempt,
      currentFileName: entry.currentFileName ?? null,
      message,
    })
  }

  if (dedupedBlocks.length === 0 && statusText.trim()) {
    dedupedBlocks.push({
      id: 'local_status_fallback',
      kind: 'local_status',
      timestampMs: Date.now(),
      attempt: 'local',
      currentFileName: null,
      message: normalizeActivityText(statusText),
    })
  }

  return dedupedBlocks
}

export function buildTextImportActivityBlocks(
  options: BuildTextImportActivityOptions,
): TextImportActivityBlock[] {
  if (options.jobMode === 'local_markdown') {
    return buildLocalActivityBlocks(options.progressEntries, options.statusText)
  }

  const traceEntries = [...options.traceEntries].sort((left, right) =>
    left.sequence === right.sequence
      ? left.timestampMs - right.timestampMs
      : left.sequence - right.sequence,
  )
  const assistantCompletedAttempts = new Set<TextImportTraceAttempt>()
  for (const entry of traceEntries) {
    const commentary = extractCommentary(entry)
    if (commentary?.finalized) {
      assistantCompletedAttempts.add(entry.attempt)
    }
  }

  const blocks: TextImportActivityBlock[] = []
  let currentToolGroup:
    | {
        id: string
        timestampMs: number
        attempt: TextImportTraceAttempt
        currentFileName: string | null
        lines: ToolLine[]
      }
    | null = null
  let insertedRepairMarker = false

  const flushToolGroup = () => {
    if (!currentToolGroup || currentToolGroup.lines.length === 0) {
      currentToolGroup = null
      return
    }

    blocks.push({
      id: currentToolGroup.id,
      kind: 'tool_group',
      timestampMs: currentToolGroup.timestampMs,
      attempt: currentToolGroup.attempt,
      currentFileName: currentToolGroup.currentFileName,
      summary: createToolSummary(currentToolGroup.lines),
      lines: currentToolGroup.lines.map((line) => line.text),
    })
    currentToolGroup = null
  }

  for (const entry of traceEntries) {
    if (entry.attempt === 'repair' && !insertedRepairMarker) {
      flushToolGroup()
      blocks.push(buildAttemptMarker(entry))
      insertedRepairMarker = true
    }

    const commentary = extractCommentary(entry)
    if (commentary) {
      flushToolGroup()
      const message = commentary.finalized
        ? normalizeActivityText(commentary.text)
        : normalizeActivityDelta(commentary.text)
      if (!message.trim()) {
        continue
      }

      const previous = blocks.at(-1)
      if (
        previous?.kind === 'commentary' &&
        previous.attempt === entry.attempt &&
        previous.currentFileName === (entry.currentFileName ?? null)
      ) {
        if (commentary.finalized) {
          previous.message =
            message.includes(previous.message) || previous.message.includes(message)
              ? message
              : `${previous.message}\n${message}`
          previous.timestampMs = entry.timestampMs
        } else {
          previous.message += message
          previous.timestampMs = entry.timestampMs
        }
        continue
      }

      blocks.push({
        id: entry.id,
        kind: 'commentary',
        timestampMs: entry.timestampMs,
        attempt: entry.attempt,
        currentFileName: entry.currentFileName ?? null,
        message,
      })
      continue
    }

    const toolLine = extractToolLine(entry)
    if (toolLine) {
      if (
        currentToolGroup &&
        currentToolGroup.attempt === entry.attempt &&
        currentToolGroup.currentFileName === (entry.currentFileName ?? null)
      ) {
        currentToolGroup.timestampMs = entry.timestampMs
        if (currentToolGroup.lines.at(-1)?.text !== toolLine.text) {
          currentToolGroup.lines.push(toolLine)
        }
      } else {
        flushToolGroup()
        currentToolGroup = {
          id: entry.id,
          timestampMs: entry.timestampMs,
          attempt: entry.attempt,
          currentFileName: entry.currentFileName ?? null,
          lines: [toolLine],
        }
      }
      continue
    }

    flushToolGroup()

    const requestMessage = buildRequestMessage(entry)
    if (requestMessage) {
      blocks.push({
        id: entry.id,
        kind: 'request',
        timestampMs: entry.timestampMs,
        attempt: entry.attempt,
        currentFileName: entry.currentFileName ?? null,
        message: requestMessage,
      })
      continue
    }

    const runnerMessage = buildRunnerMessage(entry, assistantCompletedAttempts)
    if (runnerMessage) {
      blocks.push({
        id: entry.id,
        kind: entry.eventType === 'heartbeat' ? 'waiting' : 'lifecycle',
        timestampMs: entry.timestampMs,
        attempt: entry.attempt,
        currentFileName: entry.currentFileName ?? null,
        message: runnerMessage,
      })
    }
  }

  flushToolGroup()

  return blocks
}

export function formatTextImportActivityLead(
  currentFileName: string | null,
  message: string,
  isBatch: boolean,
): string {
  if (!isBatch || !currentFileName) {
    return message
  }
  return `${currentFileName} | ${message}`
}
