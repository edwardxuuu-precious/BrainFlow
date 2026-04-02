import type {
  AiSelectedTopicContext,
  AiSelectionContext,
} from '../../../shared/ai-contract'
import type { MindMapDocument } from '../documents/types'

function uniqueTopicIds(topicIds: string[]): string[] {
  return Array.from(new Set(topicIds.filter(Boolean)))
}

function getAncestorTitles(document: MindMapDocument, topicId: string): string[] {
  const titles: string[] = []
  let cursor = document.topics[topicId]

  while (cursor?.parentId) {
    const parent = document.topics[cursor.parentId]
    if (!parent) {
      break
    }

    titles.unshift(parent.title)
    cursor = parent
  }

  return titles
}

function buildRelationSummary(
  document: MindMapDocument,
  selectedTopicIds: string[],
): string[] {
  const selectedSet = new Set(selectedTopicIds)

  return selectedTopicIds.flatMap((topicId) => {
    const topic = document.topics[topicId]
    if (!topic) {
      return []
    }

    return topic.childIds
      .filter((childId) => selectedSet.has(childId))
      .map((childId) => `${topic.title} -> ${document.topics[childId]?.title ?? childId}`)
  })
}

export function buildAiContext(
  document: MindMapDocument,
  selectedTopicIds: string[],
  activeTopicId: string | null,
): AiSelectionContext {
  const normalizedIds = uniqueTopicIds(selectedTopicIds).filter((topicId) => document.topics[topicId])
  const selectedSet = new Set(normalizedIds)
  const topics: AiSelectedTopicContext[] = normalizedIds
    .map((topicId) => document.topics[topicId])
    .filter((topic): topic is MindMapDocument['topics'][string] => Boolean(topic))
    .map((topic) => ({
      topicId: topic.id,
      title: topic.title,
      note: topic.note,
      ancestorTitles: getAncestorTitles(document, topic.id),
      childTitles: topic.childIds
        .map((childId) => document.topics[childId]?.title)
        .filter((title): title is string => Boolean(title)),
      selectedChildTitles: topic.childIds
        .filter((childId) => selectedSet.has(childId))
        .map((childId) => document.topics[childId]?.title)
        .filter((title): title is string => Boolean(title)),
      selectedParentTitle:
        topic.parentId && selectedSet.has(topic.parentId)
          ? (document.topics[topic.parentId]?.title ?? null)
          : null,
    }))

  return {
    documentTitle: document.title,
    activeTopicId,
    selectedTopicIds: normalizedIds,
    topics,
    relationSummary: buildRelationSummary(document, normalizedIds),
  }
}
