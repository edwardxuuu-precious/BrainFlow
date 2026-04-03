import type { AiDocumentTopicContext, AiSelectionContext } from '../../../shared/ai-contract'
import { normalizeTopicMetadata, normalizeTopicStyle } from '../documents/topic-defaults'
import type { MindMapDocument } from '../documents/types'

function uniqueTopicIds(topicIds: string[]): string[] {
  return Array.from(new Set(topicIds.filter(Boolean)))
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
  const topics: AiDocumentTopicContext[] = Object.values(document.topics).map((topic) => ({
    topicId: topic.id,
    title: topic.title,
    note: topic.note,
    metadata: normalizeTopicMetadata(topic.metadata),
    style: normalizeTopicStyle(topic.style),
    parentTopicId: topic.parentId,
    childTopicIds: [...topic.childIds],
    aiLocked: topic.aiLocked,
  }))

  return {
    documentTitle: document.title,
    rootTopicId: document.rootTopicId,
    topicCount: topics.length,
    topics,
    focus: {
      activeTopicId,
      selectedTopicIds: normalizedIds,
      relationSummary: buildRelationSummary(document, normalizedIds),
    },
  }
}
