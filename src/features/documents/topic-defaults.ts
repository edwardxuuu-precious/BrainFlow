import type {
  TopicAttachmentRef,
  TopicLink,
  TopicMetadata,
  TopicMetadataPatch,
  TopicMarker,
  TopicSticker,
  TopicStyle,
  TopicStylePatch,
  TopicTask,
  TopicTaskPriority,
  TopicTaskStatus,
} from './types'
import {
  TOPIC_ATTACHMENT_SOURCES,
  TOPIC_LINK_TYPES,
  TOPIC_MARKERS,
  TOPIC_STICKERS,
  TOPIC_TASK_PRIORITIES,
  TOPIC_TASK_STATUSES,
} from './types'

const DEFAULT_TASK_STATUS: TopicTaskStatus = 'todo'
const DEFAULT_TASK_PRIORITY: TopicTaskPriority = 'medium'

function createEntityId(prefix: 'link' | 'attachment'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function isMarker(value: string): value is TopicMarker {
  return (TOPIC_MARKERS as readonly string[]).includes(value)
}

function isSticker(value: string): value is TopicSticker {
  return (TOPIC_STICKERS as readonly string[]).includes(value)
}

function normalizeLabels(labels: string[] | null | undefined): string[] {
  return uniqueStrings((labels ?? []).map(normalizeText))
}

function normalizeMarkers(markers: TopicMarker[] | null | undefined): TopicMarker[] {
  return uniqueStrings((markers ?? []).filter((marker): marker is TopicMarker => isMarker(marker))).map(
    (marker) => marker as TopicMarker,
  )
}

function normalizeStickers(stickers: TopicSticker[] | null | undefined): TopicSticker[] {
  return uniqueStrings(
    (stickers ?? []).filter((sticker): sticker is TopicSticker => isSticker(sticker)),
  ).map((sticker) => sticker as TopicSticker)
}

function normalizeTask(task: TopicTask | null | undefined): TopicTask | null {
  if (!task) {
    return null
  }

  return {
    status: TOPIC_TASK_STATUSES.includes(task.status) ? task.status : DEFAULT_TASK_STATUS,
    priority: TOPIC_TASK_PRIORITIES.includes(task.priority) ? task.priority : DEFAULT_TASK_PRIORITY,
    dueDate: normalizeText(task.dueDate) || null,
  }
}

function normalizeLink(link: TopicLink, index: number): TopicLink | null {
  const type = TOPIC_LINK_TYPES.includes(link.type) ? link.type : null
  const label = normalizeText(link.label)

  if (!type || !label) {
    return null
  }

  const normalized: TopicLink = {
    id: normalizeText(link.id) || createEntityId('link'),
    type,
    label,
  }

  if (type === 'web') {
    const href = normalizeText(link.href)
    if (!href) {
      return null
    }

    normalized.href = href
  }

  if (type === 'topic') {
    const targetTopicId = normalizeText(link.targetTopicId)
    if (!targetTopicId) {
      return null
    }

    normalized.targetTopicId = targetTopicId
  }

  if (type === 'local') {
    const path = normalizeText(link.path) || normalizeText(link.href)
    if (!path) {
      return null
    }

    normalized.path = path
  }

  if (!normalized.id) {
    normalized.id = `link_${index}`
  }

  return normalized
}

function normalizeAttachment(
  attachment: TopicAttachmentRef,
  index: number,
): TopicAttachmentRef | null {
  const source = TOPIC_ATTACHMENT_SOURCES.includes(attachment.source) ? attachment.source : null
  const name = normalizeText(attachment.name)
  const uri = normalizeText(attachment.uri)

  if (!source || !name || !uri) {
    return null
  }

  return {
    id: normalizeText(attachment.id) || createEntityId('attachment') || `attachment_${index}`,
    name,
    uri,
    source,
    mimeType: normalizeText(attachment.mimeType) || null,
  }
}

export function createDefaultTopicMetadata(): TopicMetadata {
  return {
    labels: [],
    markers: [],
    stickers: [],
    task: null,
    links: [],
    attachments: [],
  }
}

export function createDefaultTopicStyle(): TopicStyle {
  return {
    emphasis: 'normal',
    variant: 'default',
  }
}

export function normalizeTopicMetadata(metadata?: Partial<TopicMetadata> | null): TopicMetadata {
  return {
    labels: normalizeLabels(metadata?.labels),
    markers: normalizeMarkers(metadata?.markers),
    stickers: normalizeStickers(metadata?.stickers),
    task: normalizeTask(metadata?.task),
    links: (metadata?.links ?? [])
      .map((link, index) => normalizeLink(link as TopicLink, index))
      .filter((link): link is TopicLink => !!link),
    attachments: (metadata?.attachments ?? [])
      .map((attachment, index) => normalizeAttachment(attachment as TopicAttachmentRef, index))
      .filter((attachment): attachment is TopicAttachmentRef => !!attachment),
    type: metadata?.type,
  }
}

export function normalizeTopicStyle(style?: Partial<TopicStyle> | null): TopicStyle {
  const base = createDefaultTopicStyle()

  return {
    emphasis: style?.emphasis === 'focus' ? 'focus' : base.emphasis,
    variant:
      style?.variant === 'soft' || style?.variant === 'solid' ? style.variant : base.variant,
    background: normalizeText(style?.background) || undefined,
    textColor: normalizeText(style?.textColor) || undefined,
    branchColor: normalizeText(style?.branchColor) || undefined,
  }
}

export function applyTopicMetadataPatch(
  current: TopicMetadata,
  patch: TopicMetadataPatch,
): TopicMetadata {
  return normalizeTopicMetadata({
    labels: 'labels' in patch ? patch.labels ?? [] : current.labels,
    markers: 'markers' in patch ? patch.markers ?? [] : current.markers,
    stickers: 'stickers' in patch ? patch.stickers ?? [] : current.stickers,
    task: 'task' in patch ? patch.task ?? null : current.task,
    links: 'links' in patch ? patch.links ?? [] : current.links,
    attachments: 'attachments' in patch ? patch.attachments ?? [] : current.attachments,
    type: 'type' in patch ? patch.type ?? undefined : current.type,
  })
}

export function applyTopicStylePatch(current: TopicStyle, patch: TopicStylePatch): TopicStyle {
  return normalizeTopicStyle({
    emphasis: 'emphasis' in patch ? patch.emphasis ?? 'normal' : current.emphasis,
    variant: 'variant' in patch ? patch.variant ?? 'default' : current.variant,
    background: 'background' in patch ? patch.background ?? undefined : current.background,
    textColor: 'textColor' in patch ? patch.textColor ?? undefined : current.textColor,
    branchColor: 'branchColor' in patch ? patch.branchColor ?? undefined : current.branchColor,
  })
}

export function createTopicLink(type: TopicLink['type'] = 'web'): TopicLink {
  return {
    id: createEntityId('link'),
    type,
    label: '',
  }
}

export function createTopicAttachmentRef(
  source: TopicAttachmentRef['source'] = 'url',
): TopicAttachmentRef {
  return {
    id: createEntityId('attachment'),
    name: '',
    uri: '',
    source,
    mimeType: null,
  }
}
