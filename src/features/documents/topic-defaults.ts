import type {
  TopicMetadata,
  TopicMetadataPatch,
  TopicMarker,
  TopicSticker,
  TopicStyle,
  TopicStylePatch,
} from './types'
import { TOPIC_MARKERS, TOPIC_STICKERS } from './types'

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

export function createDefaultTopicMetadata(): TopicMetadata {
  return {
    labels: [],
    markers: [],
    stickers: [],
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
