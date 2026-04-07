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

export const TOPIC_STICKERS = [
  'smile',
  'party',
  'heart',
  'star',
  'fire',
  'rocket',
  'bulb',
  'target',
  'coffee',
  'clap',
  'rainbow',
  'sparkles',
] as const

export type TopicSticker = (typeof TOPIC_STICKERS)[number]

export type TopicType = 'normal' | 'milestone' | 'task'

export interface TopicMetadata {
  labels: string[]
  markers: TopicMarker[]
  stickers: TopicSticker[]
  type?: TopicType
}

export type TopicRichTextVersion = 1

export interface TopicRichTextTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  link?: string
}

export interface TopicRichTextParagraphBlock {
  type: 'paragraph'
  children: TopicRichTextTextRun[]
}

export interface TopicRichTextListItem {
  children: TopicRichTextTextRun[]
}

export interface TopicRichTextBulletListBlock {
  type: 'bullet_list'
  items: TopicRichTextListItem[]
}

export type TopicRichTextBlock = TopicRichTextParagraphBlock | TopicRichTextBulletListBlock

export interface TopicRichTextDocument {
  version: TopicRichTextVersion
  blocks: TopicRichTextBlock[]
}

export type TopicStyleEmphasis = 'normal' | 'focus'
export type TopicStyleVariant = 'default' | 'soft' | 'solid'

export interface TopicLayout {
  offsetX: number
  offsetY: number
  semanticGroupKey?: string | null
  priority?: 'primary' | 'secondary' | 'supporting' | null
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
  stickers?: TopicSticker[] | null
  type?: TopicType | null
}

export interface TopicNode {
  id: string
  parentId: string | null
  childIds: string[]
  title: string
  note: string
  noteRich: TopicRichTextDocument | null
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
