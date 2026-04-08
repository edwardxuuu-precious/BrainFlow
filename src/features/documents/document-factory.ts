import { defaultTheme } from './theme'
import { createDefaultTopicMetadata, createDefaultTopicStyle } from './topic-defaults'
import type { MindMapDocument, TopicNode } from './types'

function createId(prefix: 'doc' | 'topic'): string {
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
}

function createTopic(
  id: string,
  title: string,
  parentId: string | null,
  branchSide: TopicNode['branchSide'],
): TopicNode {
  return {
    id,
    parentId,
    childIds: [],
    title,
    note: '',
    noteRich: null,
    aiLocked: false,
    isCollapsed: false,
    branchSide,
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: null,
    },
    metadata: createDefaultTopicMetadata(),
    style: createDefaultTopicStyle(),
  }
}

export function createMindMapDocument(title = '未命名脑图'): MindMapDocument {
  const now = Date.now()
  const rootId = createId('topic')
  const leftId = createId('topic')
  const rightId = createId('topic')

  const root = createTopic(rootId, '中心主题', null, 'auto')
  root.childIds = [leftId, rightId]

  const left = createTopic(leftId, '分支一', rootId, 'left')
  const right = createTopic(rightId, '分支二', rootId, 'right')

  return {
    id: createId('doc'),
    title,
    rootTopicId: rootId,
    topics: {
      [rootId]: root,
      [leftId]: left,
      [rightId]: right,
    },
    knowledgeImports: {},
    createdAt: now,
    updatedAt: now,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    workspace: {
      selectedTopicId: rootId,
      chrome: {
        leftSidebarOpen: false,
        rightSidebarOpen: true,
      },
      hierarchyCollapsedTopicIds: [],
      activeImportBundleId: null,
      activeKnowledgeViewId: null,
    },
    theme: defaultTheme,
  }
}
