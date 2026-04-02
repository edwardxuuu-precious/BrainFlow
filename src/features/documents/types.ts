export type BranchSide = 'auto' | 'left' | 'right'

export interface TopicLayout {
  offsetX: number
  offsetY: number
}

export interface TopicStyle {
  emphasis?: 'normal' | 'focus'
  background?: string
  textColor?: string
}

export interface TopicNode {
  id: string
  parentId: string | null
  childIds: string[]
  title: string
  note: string
  isCollapsed: boolean
  branchSide: BranchSide
  layout?: TopicLayout
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
