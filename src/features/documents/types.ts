export type BranchSide = 'auto' | 'left' | 'right'

export const TOPIC_MARKERS = [
  'important',
  'question',
  'idea',
  'warning',
  'decision',
  'blocked',
] as const

export type TopicMarker = (typeof TOPIC_MARKERS)[number]

export const TOPIC_TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TopicTaskStatus = (typeof TOPIC_TASK_STATUSES)[number]

export const TOPIC_TASK_PRIORITIES = ['low', 'medium', 'high'] as const
export type TopicTaskPriority = (typeof TOPIC_TASK_PRIORITIES)[number]

export interface TopicTask {
  status: TopicTaskStatus
  priority: TopicTaskPriority
  dueDate: string | null
}

export const TOPIC_LINK_TYPES = ['web', 'topic', 'local'] as const
export type TopicLinkType = (typeof TOPIC_LINK_TYPES)[number]

export interface TopicLink {
  id: string
  type: TopicLinkType
  label: string
  href?: string
  targetTopicId?: string
  path?: string
}

export const TOPIC_ATTACHMENT_SOURCES = ['local', 'url'] as const
export type TopicAttachmentSource = (typeof TOPIC_ATTACHMENT_SOURCES)[number]

export interface TopicAttachmentRef {
  id: string
  name: string
  uri: string
  source: TopicAttachmentSource
  mimeType?: string | null
}

export interface TopicMetadata {
  labels: string[]
  markers: TopicMarker[]
  task: TopicTask | null
  links: TopicLink[]
  attachments: TopicAttachmentRef[]
}

export type TopicStyleEmphasis = 'normal' | 'focus'
export type TopicStyleVariant = 'default' | 'soft' | 'solid'

export interface TopicLayout {
  offsetX: number
  offsetY: number
}

export interface TopicStyle {
  emphasis: TopicStyleEmphasis
  variant: TopicStyleVariant
  background?: string
  textColor?: string
  branchColor?: string
}

export interface TopicStylePatch {
  emphasis?: TopicStyleEmphasis | null
  variant?: TopicStyleVariant | null
  background?: string | null
  textColor?: string | null
  branchColor?: string | null
}

export interface TopicMetadataPatch {
  labels?: string[] | null
  markers?: TopicMarker[] | null
  task?: TopicTask | null
  links?: TopicLink[] | null
  attachments?: TopicAttachmentRef[] | null
}

export interface TopicNode {
  id: string
  parentId: string | null
  childIds: string[]
  title: string
  note: string
  aiLocked: boolean
  isCollapsed: boolean
  branchSide: BranchSide
  layout?: TopicLayout
  metadata: TopicMetadata
  style: TopicStyle
}

export interface MindMapTheme {
  id: string
  name: string
  canvas: string
  surface: string
  panel: string
  text: string
  mutedText: string
  accent: string
  grid: string
  branchPalette: string[]
}

export interface MindMapViewport {
  x: number
  y: number
  zoom: number
}

export interface MindMapEditorChromeState {
  leftSidebarOpen: boolean
  rightSidebarOpen: boolean
}

export interface MindMapWorkspaceState {
  selectedTopicId: string | null
  chrome: MindMapEditorChromeState
  hierarchyCollapsedTopicIds: string[]
}

export interface MindMapDocument {
  id: string
  title: string
  rootTopicId: string
  topics: Record<string, TopicNode>
  createdAt: number
  updatedAt: number
  viewport: MindMapViewport
  workspace: MindMapWorkspaceState
  theme: MindMapTheme
}

export interface DocumentSummary {
  id: string
  title: string
  updatedAt: number
  topicCount: number
  previewColor: string
}

export interface DocumentService {
  createDocument(title?: string): Promise<MindMapDocument>
  listDocuments(): Promise<DocumentSummary[]>
  getDocument(id: string): Promise<MindMapDocument | null>
  saveDocument(doc: MindMapDocument): Promise<void>
  deleteDocument(id: string): Promise<void>
  duplicateDocument(id: string): Promise<string>
}
