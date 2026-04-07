import type {
  AiContextScope,
  AiDocumentTopicContext,
  AiSelectionContext,
} from '../../../shared/ai-contract'
import { normalizeTopicMetadata, normalizeTopicStyle } from '../documents/topic-defaults'
import type { MindMapDocument } from '../documents/types'

interface BuildAiContextOptions {
  useFullDocument?: boolean
  manualContextTopicIds?: string[]
}

function uniqueTopicIds(topicIds: string[]): string[] {
  return Array.from(new Set(topicIds.filter(Boolean)))
}

function serializeTopic(
  document: MindMapDocument,
  topicId: string,
  includedIds?: ReadonlySet<string>,
): AiDocumentTopicContext {
  const topic = document.topics[topicId]
  return {
    topicId: topic.id,
    title: topic.title,
    note: topic.note,
    metadata: normalizeTopicMetadata(topic.metadata),
    style: normalizeTopicStyle(topic.style),
    parentTopicId: topic.parentId,
    childTopicIds: includedIds ? topic.childIds.filter((childId) => includedIds.has(childId)) : [...topic.childIds],
    aiLocked: topic.aiLocked,
  }
}

function createRootShellTopic(document: MindMapDocument): AiDocumentTopicContext {
  return {
    ...serializeTopic(document, document.rootTopicId, new Set([document.rootTopicId])),
    note: '',
    childTopicIds: [],
  }
}

function collectAncestorTopicIds(
  document: MindMapDocument,
  topicId: string,
  target: Set<string>,
): void {
  let currentId: string | null = topicId

  while (currentId) {
    const topic: MindMapDocument['topics'][string] | undefined = document.topics[currentId]
    if (!topic) {
      return
    }
    if (target.has(topic.id)) {
      currentId = topic.parentId
      continue
    }
    target.add(topic.id)
    currentId = topic.parentId
  }
}

function resolveFocusTopicIds(
  document: MindMapDocument,
  selectedTopicIds: string[],
  activeTopicId: string | null,
  manualContextTopicIds: string[],
): string[] {
  return uniqueTopicIds([
    ...manualContextTopicIds,
    ...selectedTopicIds,
    ...(activeTopicId ? [activeTopicId] : []),
  ]).filter((topicId) => Boolean(document.topics[topicId]))
}

function buildRelationSummary(
  document: MindMapDocument,
  selectedTopicIds: string[],
): string[] {
  const selectedSet = new Set(selectedTopicIds)

  return selectedTopicIds.flatMap((topicId) => {
    const topic: MindMapDocument['topics'][string] | undefined = document.topics[topicId]
    if (!topic) {
      return []
    }

    return topic.childIds
      .filter((childId) => selectedSet.has(childId))
      .map((childId) => `${topic.title} -> ${document.topics[childId]?.title ?? childId}`)
  })
}

function createContext(
  document: MindMapDocument,
  scope: AiContextScope,
  topics: AiDocumentTopicContext[],
  selectedTopicIds: string[],
  activeTopicId: string | null,
): AiSelectionContext {
  return {
    documentTitle: document.title,
    rootTopicId: document.rootTopicId,
    scope,
    topicCount: topics.length,
    topics,
    focus: {
      activeTopicId,
      selectedTopicIds,
      relationSummary: buildRelationSummary(document, selectedTopicIds),
    },
  }
}

export function buildAiContext(
  document: MindMapDocument,
  selectedTopicIds: string[],
  activeTopicId: string | null,
  options?: BuildAiContextOptions,
): AiSelectionContext {
  const useFullDocument = options?.useFullDocument ?? true
  const focusTopicIds = resolveFocusTopicIds(
    document,
    selectedTopicIds,
    activeTopicId,
    options?.manualContextTopicIds ?? [],
  )

  if (useFullDocument) {
    const topics = Object.values(document.topics).map((topic) => serializeTopic(document, topic.id))
    return createContext(
      document,
      'full_document',
      topics,
      focusTopicIds,
      activeTopicId && document.topics[activeTopicId] ? activeTopicId : null,
    )
  }

  if (focusTopicIds.length === 0) {
    return createContext(
      document,
      'empty',
      [createRootShellTopic(document)],
      [],
      null,
    )
  }

  const includedIds = new Set<string>([document.rootTopicId])
  focusTopicIds.forEach((topicId) => collectAncestorTopicIds(document, topicId, includedIds))
  const topics = Object.values(document.topics)
    .filter((topic) => includedIds.has(topic.id))
    .map((topic) => serializeTopic(document, topic.id, includedIds))

  return createContext(
    document,
    'focused_subset',
    topics,
    focusTopicIds,
    activeTopicId && includedIds.has(activeTopicId) ? activeTopicId : null,
  )
}
