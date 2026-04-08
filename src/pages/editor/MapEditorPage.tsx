import {
  ReactFlow,
  SelectionMode,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
  useNodesState,
} from '@xyflow/react'
import {
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { TopicNode } from '../../components/topic-node/TopicNode'
import { IconButton, ToolbarGroup } from '../../components/ui'
import { SaveIndicator } from '../../components/SaveIndicator'
import { AiSidebar } from '../../features/ai/components/AiSidebar'
import { useAiStore } from '../../features/ai/ai-store'
import {
  documentService,
  setRecentDocumentId,
} from '../../features/documents/document-service'
import type {
  DocumentService,
  MindMapDocument,
  TopicMarker,
  TopicNode as MindMapTopic,
  TopicSticker,
} from '../../features/documents/types'
import { FormatPanel } from '../../features/editor/components/FormatPanel'
import { HierarchySidebar } from '../../features/editor/components/HierarchySidebar'
import { MarkersPanel } from '../../features/editor/components/MarkersPanel'
import { TextImportDialog } from '../../features/import/components/TextImportDialog'
import {
  getLegacyGtmRepairAvailability,
  repairKnowledgeImportBundle,
} from '../../features/import/knowledge-import'
import { useTextImportStore } from '../../features/import/text-import-store'
import { PropertiesPanel } from '../../features/editor/components/PropertiesPanel'
import { SidebarRail } from '../../features/editor/components/SidebarRail'
import { getEditorSnapshot, useEditorStore } from '../../features/editor/editor-store'
import { exportCanvasAsPng, exportDocumentAsJson } from '../../features/editor/exporters'
import { layoutMindMap, type MindMapFlowNode } from '../../features/editor/layout'
import { getTopicAncestorIds, getTopicLayout } from '../../features/editor/tree-operations'
import { useEditorShortcuts } from '../../features/editor/use-editor-shortcuts'
import {
  workspaceStorageService,
  type WorkspaceStorageStatus,
} from '../../features/storage/services/workspace-storage-service'
import styles from './MapEditorPage.module.css'
import revertIcon from '/revert.png'
import contentIcon from '/content.png'
import nodeIcon from '/node.png'
import symbolIcon from '/symbol.png'
import designIcon from '/design.png'
import agentsIcon from '/agents.png'

interface MapEditorPageProps {
  service?: DocumentService
}

const SAVE_DEBOUNCE_MS = 320
const DESKTOP_BREAKPOINT = 1200
const TABLET_BREAKPOINT = 780
const HOVER_SUBMENU_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'
const RIGHT_SIDEBAR_ID = 'editor-right-sidebar'
const nodeTypes = { topic: TopicNode }
const reactFlowProOptions = { hideAttribution: true }
const reactFlowMultiSelectionKeyCode = ['Meta', 'Control', 'Shift']
const reactFlowMiddleMousePanButtons = [1]

interface DragSnapshot {
  topicId: string
  positions: Map<string, { x: number; y: number }>
  movingIds: Set<string>
}

interface RenameDraft {
  topicId: string | null
  value: string
}

interface BoxSelectionSession {
  isBoxSelecting: boolean
  selectionStartedAt: number
  baseSelectedTopicIds: string[]
  baseActiveTopicId: string | null
  isAdditive: boolean
  pendingSelectedTopicIds: string[]
  pendingActiveTopicId: string | null
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
type RightPanelMode = 'outline' | 'details' | 'markers' | 'format' | 'ai'
type MarkerSubtab = 'markers' | 'stickers'
type FormatSubtab = 'topic' | 'canvas'

function createEmptyStorageStatus(): WorkspaceStorageStatus {
  return {
    mode: 'local-only',
    workspaceName: null,
    localSavedAt: null,
    cloudSyncedAt: null,
    isOnline: true,
    isSyncing: false,
    conflicts: [],
    pendingImportReport: null,
    migrationAvailable: true,
    lastSyncError: null,
  }
}

function areFlowNodesEquivalent(
  currentNode: MindMapFlowNode,
  nextNode: MindMapFlowNode,
): boolean {
  return (
    currentNode.id === nextNode.id &&
    currentNode.selected === nextNode.selected &&
    currentNode.position.x === nextNode.position.x &&
    currentNode.position.y === nextNode.position.y &&
    currentNode.draggable === nextNode.draggable &&
    currentNode.style?.width === nextNode.style?.width &&
    currentNode.style?.height === nextNode.style?.height &&
    currentNode.data.title === nextNode.data.title &&
    currentNode.data.note === nextNode.data.note &&
    currentNode.data.isCollapsed === nextNode.data.isCollapsed &&
    currentNode.data.childCount === nextNode.data.childCount &&
    currentNode.data.branchColor === nextNode.data.branchColor &&
    currentNode.data.side === nextNode.data.side &&
    currentNode.data.aiLocked === nextNode.data.aiLocked &&
    JSON.stringify(currentNode.data.metadata) === JSON.stringify(nextNode.data.metadata) &&
    JSON.stringify(currentNode.data.style) === JSON.stringify(nextNode.data.style)
  )
}

function isTypingElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (element.isContentEditable) {
    return true
  }

  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

function hasMultiSelectModifier(event: MouseEvent | React.MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey
}

function mergeTopicSelection(currentTopicIds: string[], nextTopicIds: string[]): string[] {
  return Array.from(new Set([...currentTopicIds, ...nextTopicIds]))
}

function haveSameTopicIdSet(currentTopicIds: string[], nextTopicIds: string[]): boolean {
  if (currentTopicIds.length !== nextTopicIds.length) {
    return false
  }

  const nextTopicIdSet = new Set(nextTopicIds)
  return currentTopicIds.every((topicId) => nextTopicIdSet.has(topicId))
}

function resolveCanvasSelection(
  baseSelectedTopicIds: string[],
  baseActiveTopicId: string | null,
  selectedFromCanvas: string[],
  isAdditiveSelection: boolean,
) {
  const nextSelectedTopicIds = isAdditiveSelection
    ? mergeTopicSelection(baseSelectedTopicIds, selectedFromCanvas)
    : selectedFromCanvas
  const nextActiveTopicId = nextSelectedTopicIds.includes(baseActiveTopicId ?? '')
    ? baseActiveTopicId
    : selectedFromCanvas.at(-1) ?? null

  return {
    nextSelectedTopicIds,
    nextActiveTopicId,
  }
}

function isSameViewport(
  current: MindMapDocument['viewport'] | null,
  next: MindMapDocument['viewport'],
): boolean {
  if (!current) {
    return false
  }

  return (
    Math.abs(current.x - next.x) < 0.5 &&
    Math.abs(current.y - next.y) < 0.5 &&
    Math.abs(current.zoom - next.zoom) < 0.001
  )
}

function getViewportMode(width: number): ViewportMode {
  if (width >= DESKTOP_BREAKPOINT) {
    return 'desktop'
  }

  if (width >= TABLET_BREAKPOINT) {
    return 'tablet'
  }

  return 'mobile'
}

function canUseHoverSubmenu(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(HOVER_SUBMENU_MEDIA_QUERY).matches
  )
}

function buildLayoutCacheKey(document: MindMapDocument): string {
  return JSON.stringify({
    rootTopicId: document.rootTopicId,
    topics: document.topics,
    theme: document.theme,
  })
}

function collectSubtreeIds(document: MindMapDocument, topicId: string) {
  const queue = [topicId]
  const ids = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || ids.has(currentId)) {
      continue
    }

    ids.add(currentId)
    queue.push(...document.topics[currentId].childIds)
  }

  return ids
}

export function MapEditorPage({ service = documentService }: MapEditorPageProps) {
  const navigate = useNavigate()
  const { documentId } = useParams()
  const textImportInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const reactFlowRef = useRef<ReactFlowInstance<MindMapFlowNode> | null>(null)
  const initializedViewportRef = useRef<string | null>(null)
  const lastViewportRef = useRef<MindMapDocument['viewport'] | null>(null)
  const additiveSelectionRef = useRef(false)
  const additiveSelectionUntilRef = useRef(0)
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)
  const nodesRef = useRef<MindMapFlowNode[]>([])
  const boxSelectionSessionRef = useRef<BoxSelectionSession | null>(null)
  const layoutCacheRef = useRef<{ key: string; layout: ReturnType<typeof layoutMindMap> } | null>(null)
  const documentTitleInputRef = useRef<HTMLInputElement>(null)
  const skipDocumentTitleBlurRef = useRef(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [renameDraft, setRenameDraft] = useState<RenameDraft>({ topicId: null, value: '' })
  const [documentTitleDraft, setDocumentTitleDraft] = useState('')
  const [isEditingDocumentTitle, setIsEditingDocumentTitle] = useState(false)
  const [aiDraft, setAiDraft] = useState('')
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('details')
  const [markerSubtab, setMarkerSubtab] = useState<MarkerSubtab>('markers')
  const [formatSubtab, setFormatSubtab] = useState<FormatSubtab>('topic')
  const [rightSidebarWidth, setRightSidebarWidth] = useState(300)
  const [mainMenuOpen, setMainMenuOpen] = useState(false)
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false)
  const mainMenuRef = useRef<HTMLDivElement>(null)
  const mainMenuDropdownRef = useRef<HTMLDivElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const [supportsHoverSubmenu, setSupportsHoverSubmenu] = useState(() => canUseHoverSubmenu())
  const [storageStatus, setStorageStatus] = useState<WorkspaceStorageStatus>(() =>
    typeof window === 'undefined' ? createEmptyStorageStatus() : workspaceStorageService.getStatus(),
  )

  useEffect(() => {
    setPortalContainer(window.document.body)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(HOVER_SUBMENU_MEDIA_QUERY)
    const syncSupportsHoverSubmenu = () => {
      setSupportsHoverSubmenu(mediaQuery.matches)
    }

    syncSupportsHoverSubmenu()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncSupportsHoverSubmenu)
      return () => mediaQuery.removeEventListener('change', syncSupportsHoverSubmenu)
    }

    mediaQuery.addListener(syncSupportsHoverSubmenu)
    return () => mediaQuery.removeListener(syncSupportsHoverSubmenu)
  }, [])

  const [useFullDocument, setUseFullDocument] = useState(true)
  const [aiContextTopicIds, setAiContextTopicIds] = useState<string[]>([])
  const [isPickingCanvasNode, setIsPickingCanvasNode] = useState(false)
  const [viewportMode, setViewportMode] = useState<ViewportMode>(() =>
    typeof window === 'undefined' ? 'desktop' : getViewportMode(window.innerWidth),
  )
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<MindMapFlowNode> | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapFlowNode>([])

  const document = useEditorStore((state) => state.document)
  const activeTopicId = useEditorStore((state) => state.activeTopicId)
  const selectedTopicIds = useEditorStore((state) => state.selectedTopicIds)
  const editingTopicId = useEditorStore((state) => state.editingTopicId)
  const editingSurface = useEditorStore((state) => state.editingSurface)
  const history = useEditorStore((state) => state.history)
  const future = useEditorStore((state) => state.future)
  const isDirty = useEditorStore((state) => state.isDirty)
  const hasPendingWorkspaceSave = useEditorStore((state) => state.hasPendingWorkspaceSave)
  const setDocument = useEditorStore((state) => state.setDocument)
  const setSelection = useEditorStore((state) => state.setSelection)
  const toggleTopicSelection = useEditorStore((state) => state.toggleTopicSelection)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const toggleHierarchyBranch = useEditorStore((state) => state.toggleHierarchyBranch)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameDocument = useEditorStore((state) => state.renameDocument)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const addChild = useEditorStore((state) => state.addChild)
  const updateNoteRich = useEditorStore((state) => state.updateNoteRich)
  const updateTopicMetadata = useEditorStore((state) => state.updateTopicMetadata)
  const updateTopicStyle = useEditorStore((state) => state.updateTopicStyle)
  const updateTopicsStyle = useEditorStore((state) => state.updateTopicsStyle)
  const toggleTopicMarker = useEditorStore((state) => state.toggleTopicMarker)
  const toggleTopicSticker = useEditorStore((state) => state.toggleTopicSticker)
  const updateDocumentTheme = useEditorStore((state) => state.updateDocumentTheme)
  const applyDocumentTheme = useEditorStore((state) => state.applyDocumentTheme)
  const setBranchSide = useEditorStore((state) => state.setBranchSide)
  const setTopicOffset = useEditorStore((state) => state.setTopicOffset)
  const setTopicAiLocked = useEditorStore((state) => state.setTopicAiLocked)
  const setTopicsAiLocked = useEditorStore((state) => state.setTopicsAiLocked)
  const setViewport = useEditorStore((state) => state.setViewport)
  const setSidebarOpen = useEditorStore((state) => state.setSidebarOpen)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const markDocumentSaved = useEditorStore((state) => state.markSaved)

  const aiHydrate = useAiStore((state) => state.hydrate)
  const aiActiveSessionId = useAiStore((state) => state.activeSessionId)
  const aiSessionList = useAiStore((state) => state.sessionList)
  const aiArchivedSessions = useAiStore((state) => state.archivedSessions)
  const aiMessages = useAiStore((state) => state.messages)
  const aiIsSending = useAiStore((state) => state.isSending)
  const aiIsCheckingStatus = useAiStore((state) => state.isCheckingStatus)
  const aiIsLoadingSettings = useAiStore((state) => state.isLoadingSettings)
  const aiIsSavingSettings = useAiStore((state) => state.isSavingSettings)
  const aiIsLoadingArchivedSessions = useAiStore((state) => state.isLoadingArchivedSessions)
  const aiRunStage = useAiStore((state) => state.runStage)
  const aiStreamingStatusText = useAiStore((state) => state.streamingStatusText)
  const aiStreamingText = useAiStore((state) => state.streamingText)
  const aiError = useAiStore((state) => state.error)
  const aiStatus = useAiStore((state) => state.status)
  const aiStatusError = useAiStore((state) => state.statusError)
  const aiStatusFailureKind = useAiStore((state) => state.statusFailureKind)
  const aiStatusFeedback = useAiStore((state) => state.statusFeedback)
  const aiLastExecutionError = useAiStore((state) => state.lastExecutionError)
  const aiSettings = useAiStore((state) => state.settings)
  const aiSettingsError = useAiStore((state) => state.settingsError)
  const aiLastAppliedChange = useAiStore((state) => state.lastAppliedChange)
  const aiCreateSession = useAiStore((state) => state.createSession)
  const aiSwitchSession = useAiStore((state) => state.switchSession)
  const aiArchiveSession = useAiStore((state) => state.archiveSession)
  const aiDeleteSession = useAiStore((state) => state.deleteSession)
  const aiLoadArchivedSessions = useAiStore((state) => state.loadArchivedSessions)
  const aiRestoreArchivedSession = useAiStore((state) => state.restoreArchivedSession)
  const aiDeleteArchivedSession = useAiStore((state) => state.deleteArchivedSession)
  const aiSendMessage = useAiStore((state) => state.sendMessage)
  const aiRefreshStatus = useAiStore((state) => state.refreshStatus)
  const aiRevalidateStatus = useAiStore((state) => state.revalidateStatus)
  const aiLoadSettings = useAiStore((state) => state.loadSettings)
  const aiSaveSettings = useAiStore((state) => state.saveSettings)
  const aiResetSettings = useAiStore((state) => state.resetSettings)
  const aiUndoLastAppliedChange = useAiStore((state) => state.undoLastAppliedChange)
  const textImportOpen = useTextImportStore((state) => state.open)
  const textImportClose = useTextImportStore((state) => state.close)
  const textImportResetSession = useTextImportStore((state) => state.resetSession)
  const textImportPreviewFiles = useTextImportStore((state) => state.previewFiles)
  const textImportPreviewText = useTextImportStore((state) => state.previewText)
  const textImportSetDraftSourceName = useTextImportStore((state) => state.setDraftSourceName)
  const textImportSetDraftText = useTextImportStore((state) => state.setDraftText)
  const textImportPlanningSummaries = useTextImportStore((state) => state.planningSummaries)
  const textImportPresetOverride = useTextImportStore((state) => state.presetOverride)
  const textImportSetPresetOverride = useTextImportStore((state) => state.setPresetOverride)
  const textImportArchetypeOverride = useTextImportStore((state) => state.archetypeOverride)
  const textImportAnchorMode = useTextImportStore((state) => state.anchorMode)
  const textImportSetAnchorMode = useTextImportStore((state) => state.setAnchorMode)
  const textImportRerunPreviewWithPreset = useTextImportStore((state) => state.rerunPreviewWithPreset)
  const textImportSetArchetypeOverride = useTextImportStore((state) => state.setArchetypeOverride)
  const textImportRerunPreviewWithArchetype = useTextImportStore((state) => state.rerunPreviewWithArchetype)
  const textImportToggleConflictApproval = useTextImportStore(
    (state) => state.toggleConflictApproval,
  )
  const textImportConfirmDraft = useTextImportStore((state) => state.confirmDraft)
  const textImportRenamePreviewNode = useTextImportStore((state) => state.renamePreviewNode)
  const textImportPromotePreviewNode = useTextImportStore((state) => state.promotePreviewNode)
  const textImportDemotePreviewNode = useTextImportStore((state) => state.demotePreviewNode)
  const textImportDeletePreviewNode = useTextImportStore((state) => state.deletePreviewNode)
  const textImportApplyPreview = useTextImportStore((state) => state.applyPreview)
  const textImportIsOpen = useTextImportStore((state) => state.isOpen)
  const textImportSourceName = useTextImportStore((state) => state.sourceName)
  const textImportSourceType = useTextImportStore((state) => state.sourceType)
  const textImportSourceFiles = useTextImportStore((state) => state.sourceFiles)
  const textImportRawText = useTextImportStore((state) => state.rawText)
  const textImportDraftSourceName = useTextImportStore((state) => state.draftSourceName)
  const textImportDraftText = useTextImportStore((state) => state.draftText)
  const textImportPreprocessedHints = useTextImportStore((state) => state.preprocessedHints)
  const textImportPreview = useTextImportStore((state) => state.preview)
  const textImportDraftTree = useTextImportStore((state) => state.draftTree)
  const textImportPreviewTree = useTextImportStore((state) => state.previewTree)
  const textImportDraftConfirmed = useTextImportStore((state) => state.draftConfirmed)
  const textImportCrossFileMergeSuggestions = useTextImportStore(
    (state) => state.crossFileMergeSuggestions,
  )
  const textImportApprovedConflictIds = useTextImportStore(
    (state) => state.approvedConflictIds,
  )
  const textImportStatusText = useTextImportStore((state) => state.statusText)
  const textImportProgress = useTextImportStore((state) => state.progress)
  const textImportProgressIndeterminate = useTextImportStore((state) => state.progressIndeterminate)
  const textImportActiveJobMode = useTextImportStore((state) => state.activeJobMode)
  const textImportActiveJobType = useTextImportStore((state) => state.activeJobType)
  const textImportFileCount = useTextImportStore((state) => state.fileCount)
  const textImportCompletedFileCount = useTextImportStore(
    (state) => state.completedFileCount,
  )
  const textImportCurrentFileName = useTextImportStore((state) => state.currentFileName)
  const textImportSemanticMergeStage = useTextImportStore(
    (state) => state.semanticMergeStage,
  )
  const textImportSemanticCandidateCount = useTextImportStore(
    (state) => state.semanticCandidateCount,
  )
  const textImportSemanticAdjudicatedCount = useTextImportStore(
    (state) => state.semanticAdjudicatedCount,
  )
  const textImportSemanticFallbackCount = useTextImportStore(
    (state) => state.semanticFallbackCount,
  )
  const textImportModeHint = useTextImportStore((state) => state.modeHint)
  const textImportError = useTextImportStore((state) => state.error)
  const textImportIsPreviewing = useTextImportStore((state) => state.isPreviewing)
  const textImportIsApplying = useTextImportStore((state) => state.isApplying)
  const textImportPreviewStartedAt = useTextImportStore((state) => state.previewStartedAt)
  const textImportPreviewFinishedAt = useTextImportStore((state) => state.previewFinishedAt)
  const textImportApplyProgress = useTextImportStore((state) => state.applyProgress)
  const textImportAppliedCount = useTextImportStore((state) => state.appliedCount)
  const textImportTotalOperations = useTextImportStore((state) => state.totalOperations)
  const textImportCurrentApplyLabel = useTextImportStore((state) => state.currentApplyLabel)
  const activeTextImportBundle =
    document?.workspace.activeImportBundleId
      ? document.knowledgeImports[document.workspace.activeImportBundleId] ?? null
      : null
  const textImportRepairAvailability = useMemo(
    () => getLegacyGtmRepairAvailability(activeTextImportBundle),
    [activeTextImportBundle],
  )

  useEditorShortcuts()

  const { layout, layoutError } = useMemo(() => {
    if (!document) {
      return { layout: null, layoutError: null as Error | null }
    }

    try {
      const layoutCacheKey = buildLayoutCacheKey(document)
      if (layoutCacheRef.current?.key === layoutCacheKey) {
        return { layout: layoutCacheRef.current.layout, layoutError: null as Error | null }
      }

      const nextLayout = layoutMindMap(document)
      layoutCacheRef.current = {
        key: layoutCacheKey,
        layout: nextLayout,
      }
      return { layout: nextLayout, layoutError: null as Error | null }
    } catch (error) {
      layoutCacheRef.current = null
      const resolvedError = error instanceof Error ? error : new Error('Unknown layout error')
      console.error('Failed to render mind map layout.', {
        documentId: document.id,
        error: resolvedError,
      })
      return { layout: null, layoutError: resolvedError }
    }
  }, [document])
  const selectedTopic = activeTopicId && document ? document.topics[activeTopicId] ?? null : null
  const textImportRootLabel = document ? document.topics[document.rootTopicId]?.title ?? 'Document root' : 'Document root'
  const textImportCurrentSelectionLabel = selectedTopic?.title ?? null
  const selectedTopics = useMemo(
    () =>
      document
        ? selectedTopicIds
            .map((topicId) => document.topics[topicId])
            .filter((topic): topic is MindMapTopic => !!topic)
        : [],
    [document, selectedTopicIds],
  )
  const isRoot = !!document && activeTopicId === document.rootTopicId
  const isFirstLevel = !!selectedTopic && selectedTopic.parentId === document?.rootTopicId
  const selectionCount = selectedTopicIds.length
  const selectedLockedCount = selectedTopicIds.reduce((count, topicId) => {
    return count + (document?.topics[topicId]?.aiLocked ? 1 : 0)
  }, 0)
  const selectedUnlockedCount = selectionCount - selectedLockedCount
  const chrome = document?.workspace.chrome
  const visibleHierarchyCollapsedTopicIds = useMemo(() => {
    const hierarchyCollapsedTopicIds = document?.workspace.hierarchyCollapsedTopicIds ?? []
    if (!document || !activeTopicId || !document.topics[activeTopicId]) {
      return hierarchyCollapsedTopicIds
    }

    const visiblePath = new Set(getTopicAncestorIds(document, activeTopicId))
    return hierarchyCollapsedTopicIds.filter((topicId) => !visiblePath.has(topicId))
  }, [activeTopicId, document])
  const rightSidebarOpen = chrome?.rightSidebarOpen ?? true
  const isDesktop = viewportMode === 'desktop'
  const isTablet = viewportMode === 'tablet'
  const isMobile = viewportMode === 'mobile'
  const useHoverExportSubmenu = isDesktop && supportsHoverSubmenu
  const isRightDrawerOpen = isTablet && rightSidebarOpen
  const isAnyDrawerOpen = isRightDrawerOpen
  const isInspectorEditing =
    editingSurface === 'inspector' && editingTopicId === activeTopicId && !!activeTopicId
  const draftTitle =
    renameDraft.topicId === selectedTopic?.id ? renameDraft.value : (selectedTopic?.title ?? '')
  const aiCanvasSelectedTopics = useMemo(
    () =>
      selectedTopicIds
        .filter((topicId) => Boolean(document?.topics[topicId]))
        .map((topicId) => ({
          topicId,
          title: document?.topics[topicId]?.title ?? '已删除节点',
          isActive: topicId === activeTopicId,
        })),
    [activeTopicId, document, selectedTopicIds],
  )
  const aiManualSelectedTopics = useMemo(
    () =>
      aiContextTopicIds
        .filter((topicId) => Boolean(document?.topics[topicId]))
        .map((topicId) => ({
          topicId,
          title: document?.topics[topicId]?.title ?? '已删除节点',
          isActive: topicId === activeTopicId,
        })),
    [activeTopicId, document, aiContextTopicIds],
  )
  const aiEffectiveTopics = useMemo(() => {
    const seen = new Set<string>()
    return [...aiCanvasSelectedTopics, ...aiManualSelectedTopics].filter((topic) => {
      if (seen.has(topic.topicId)) {
        return false
      }
      seen.add(topic.topicId)
      return true
    })
  }, [aiCanvasSelectedTopics, aiManualSelectedTopics])
  const aiAllTopics = useMemo(
    () =>
      document
        ? Object.values(document.topics).map((topic) => ({
            topicId: topic.id,
            title: topic.title,
          }))
        : [],
    [document],
  )
  const topicOptions = useMemo(
    () =>
      document
        ? Object.values(document.topics).map((topic) => ({
            id: topic.id,
            title: topic.title,
          }))
        : [],
    [document],
  )
  const handleAddContextTopic = useCallback((topicId: string) => {
    setAiContextTopicIds((prev) => [...new Set([...prev, topicId])])
  }, [])
  const closeMainMenu = useCallback(() => {
    setExportSubmenuOpen(false)
    setMainMenuOpen(false)
  }, [])
  const handleMainMenuToggle = useCallback(() => {
    setExportSubmenuOpen(false)
    setMainMenuOpen((previous) => !previous)
  }, [])
  const handleExportMenuClick = useCallback(() => {
    if (useHoverExportSubmenu) {
      setExportSubmenuOpen(true)
      return
    }

    setExportSubmenuOpen((previous) => !previous)
  }, [useHoverExportSubmenu])
  const handleExportMenuPointerEnter = useCallback(() => {
    if (!useHoverExportSubmenu) {
      return
    }

    setExportSubmenuOpen(true)
  }, [useHoverExportSubmenu])
  const handleExportMenuPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!useHoverExportSubmenu) {
        return
      }

      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
        return
      }

      setExportSubmenuOpen(false)
    },
    [useHoverExportSubmenu],
  )
  const handleExportMenuBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    setExportSubmenuOpen(false)
  }, [])
  const handleExportMenuFocus = useCallback(() => {
    if (!useHoverExportSubmenu) {
      return
    }

    setExportSubmenuOpen(true)
  }, [useHoverExportSubmenu])
  const handleRemoveContextTopic = useCallback((topicId: string) => {
    setAiContextTopicIds((prev) => prev.filter((id) => id !== topicId))
  }, [])
  const handleToggleFullDocument = useCallback(() => {
    setUseFullDocument((prev) => !prev)
  }, [])
  const handleStartCanvasPick = useCallback(() => {
    setIsPickingCanvasNode(true)
  }, [])
  const handleStopCanvasPick = useCallback(() => {
    setIsPickingCanvasNode(false)
  }, [])

  // Resize handlers for right sidebar
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    globalThis.document.body.style.cursor = 'ew-resize'
    globalThis.document.body.style.userSelect = 'none'
    
    const handleMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX
      const clampedWidth = Math.max(260, Math.min(600, newWidth))
      setRightSidebarWidth(clampedWidth)
    }
    
    const handleUp = () => {
      globalThis.document.body.style.cursor = ''
      globalThis.document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  const canUndoLastApplied =
    !!aiLastAppliedChange &&
    history.length === aiLastAppliedChange.historyLength &&
    document?.updatedAt === aiLastAppliedChange.documentUpdatedAt
  const textImportButtonLabel = textImportIsPreviewing
    ? textImportActiveJobType === 'batch'
      ? `智能导入 ${textImportCompletedFileCount}/${Math.max(1, textImportFileCount)}`
      : `智能导入 ${textImportProgress}%`
    : textImportIsApplying
      ? `应用中 ${textImportAppliedCount}/${Math.max(1, textImportTotalOperations)}`
    : textImportPreview
      ? textImportActiveJobType === 'batch'
        ? '智能导入（批次可应用）'
        : '智能导入（可应用）'
      : '智能导入'
  const themeVariables = useMemo(
    () =>
      document
        ? ({
            '--document-canvas': document.theme.canvas,
            '--document-surface': document.theme.surface,
            '--document-panel': document.theme.panel,
            '--document-text': document.theme.text,
            '--document-muted': document.theme.mutedText,
            '--document-accent': document.theme.accent,
            '--document-grid': document.theme.grid,
          } as CSSProperties)
        : undefined,
    [document],
  )

  useEffect(() => {
    return workspaceStorageService.subscribe(setStorageStatus)
  }, [])

  useEffect(() => {
    if (!documentId) {
      navigate('/', { replace: true })
      return
    }

    let cancelled = false

    const loadDocument = async () => {
      const nextDocument = await service.getDocument(documentId)

      if (cancelled) {
        return
      }

      if (!nextDocument) {
        navigate('/', { replace: true })
        return
      }

      setDocument(nextDocument)
      setRecentDocumentId(nextDocument.id)
      initializedViewportRef.current = null
    }

    void loadDocument()

    return () => {
      cancelled = true
    }
  }, [documentId, navigate, service, setDocument])

  useEffect(() => {
    if (!document?.id) {
      return
    }

    void aiHydrate(document.id, document.title).then(() => {
      setAiDraft('')
    })
  }, [aiHydrate, document?.id, document?.title])

  useEffect(() => {
    if (isEditingDocumentTitle) {
      return
    }

    setDocumentTitleDraft(document?.title ?? '')
  }, [document?.title, isEditingDocumentTitle])

  useEffect(() => {
    if (!isEditingDocumentTitle) {
      return
    }

    documentTitleInputRef.current?.focus()
    documentTitleInputRef.current?.select()
  }, [isEditingDocumentTitle])

  useEffect(() => {
    const syncViewportMode = () => {
      setViewportMode(getViewportMode(window.innerWidth))
    }

    syncViewportMode()
    window.addEventListener('resize', syncViewportMode)
    return () => window.removeEventListener('resize', syncViewportMode)
  }, [])

  // Close main menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : null
      const clickedInsideTrigger =
        !!mainMenuRef.current &&
        (eventPath ? eventPath.includes(mainMenuRef.current) : mainMenuRef.current.contains(event.target as Node))
      const clickedInsideDropdown =
        !!mainMenuDropdownRef.current &&
        (eventPath
          ? eventPath.includes(mainMenuDropdownRef.current)
          : mainMenuDropdownRef.current.contains(event.target as Node))

      if (!clickedInsideTrigger && !clickedInsideDropdown) {
        closeMainMenu()
      }
    }

    if (mainMenuOpen) {
      window.document.addEventListener('mousedown', handleClickOutside)
      return () => window.document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [closeMainMenu, mainMenuOpen])

  useEffect(() => {
    if (!mainMenuOpen) {
      setExportSubmenuOpen(false)
    }
  }, [mainMenuOpen])

  useEffect(() => {
    if (!document || (!isDirty && !hasPendingWorkspaceSave)) {
      return
    }

    const timeoutId = window.setTimeout(async () => {
      await service.saveDocument(document)
      markDocumentSaved()
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [document, hasPendingWorkspaceSave, isDirty, markDocumentSaved, service])

  useEffect(() => {
    if (!layout || dragSnapshotRef.current) {
      return
    }

    setNodes((currentNodes) => {
      const currentNodeLookup = new Map(currentNodes.map((node) => [node.id, node]))
      const selectedSet = new Set(selectedTopicIds)
      const isBoxSelecting = boxSelectionSessionRef.current?.isBoxSelecting ?? false
      const nextNodes = layout.renderNodes.map((node) => ({
        ...node,
        draggable: !(editingSurface === 'canvas' && node.id === editingTopicId),
        selected: isBoxSelecting
          ? currentNodeLookup.get(node.id)?.selected ?? false
          : selectedSet.has(node.id),
      }))

      if (
        currentNodes.length === nextNodes.length &&
        currentNodes.every((currentNode, index) =>
          areFlowNodesEquivalent(currentNode, nextNodes[index]),
        )
      ) {
        return currentNodes
      }

      return nextNodes
    })
  }, [editingSurface, editingTopicId, layout, selectedTopicIds, setNodes])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    if (!reactFlowInstance || !document || !layout || nodes.length === 0) {
      return
    }

    if (initializedViewportRef.current === document.id) {
      return
    }

    initializedViewportRef.current = document.id
    lastViewportRef.current = document.viewport
    window.requestAnimationFrame(() => {
      const viewport = document.viewport
      if (viewport.zoom !== 1 || viewport.x !== 0 || viewport.y !== 0) {
        reactFlowInstance.setViewport(viewport, { duration: 0 })
      } else {
        reactFlowInstance.fitView({ padding: 0.24, duration: 0 })
      }
    })
  }, [document, layout, nodes.length, reactFlowInstance])

  useEffect(() => {
    const resetSpaceMode = () => setIsSpacePressed(false)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control') {
        additiveSelectionRef.current = true
        additiveSelectionUntilRef.current = Date.now() + 400
      }

      if (event.code !== 'Space' || isTypingElement(event.target)) {
        return
      }

      event.preventDefault()
      setIsSpacePressed(true)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift' || event.key === 'Meta' || event.key === 'Control') {
        additiveSelectionRef.current = false
        additiveSelectionUntilRef.current = Date.now() + 400
      }

      if (event.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    const handleBlur = () => {
      additiveSelectionRef.current = false
      additiveSelectionUntilRef.current = 0
      boxSelectionSessionRef.current = null
      resetSpaceMode()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  useEffect(() => {
    if (!isTablet || !isAnyDrawerOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (isRightDrawerOpen) {
        setSidebarOpen('right', false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAnyDrawerOpen, isRightDrawerOpen, isTablet, setSidebarOpen])

  const layoutRenderNodes = layout?.renderNodes ?? []

  const handleNodeClick = useCallback<NodeMouseHandler<MindMapFlowNode>>((event, node) => {
    // If in canvas picking mode for AI context, add the node to context
    if (isPickingCanvasNode) {
      handleAddContextTopic(node.id)
      // Don't exit picking mode if holding Ctrl/Shift, allow multi-select
      if (!hasMultiSelectModifier(event)) {
        setIsPickingCanvasNode(false)
      }
      return
    }

    if (hasMultiSelectModifier(event)) {
      toggleTopicSelection(node.id)
      return
    }

    setSelection([node.id], node.id)
  }, [handleAddContextTopic, isPickingCanvasNode, setSelection, toggleTopicSelection])

  const handleReactFlowInit = useCallback((instance: ReactFlowInstance<MindMapFlowNode>) => {
    reactFlowRef.current = instance
    setReactFlowInstance(instance)
  }, [])

  const handleCanvasNodesChange = useCallback(
    (changes: NodeChange<MindMapFlowNode>[]) => {
      const filteredChanges = changes.filter((change) => change.type !== 'remove')
      if (filteredChanges.length === 0) {
        return
      }

      onNodesChange(filteredChanges)
    },
    [onNodesChange],
  )

  const handleCanvasSelectionStart = useCallback((event: ReactMouseEvent) => {
    const snapshot = getEditorSnapshot()
    const isAdditiveSelection =
      hasMultiSelectModifier(event) ||
      additiveSelectionRef.current ||
      Date.now() < additiveSelectionUntilRef.current
    const initialSelection = isAdditiveSelection ? snapshot.selectedTopicIds : []
    const initialActiveTopicId =
      isAdditiveSelection && initialSelection.includes(snapshot.activeTopicId ?? '')
        ? snapshot.activeTopicId
        : null

    boxSelectionSessionRef.current = {
      isBoxSelecting: true,
      selectionStartedAt: Date.now(),
      baseSelectedTopicIds: snapshot.selectedTopicIds,
      baseActiveTopicId: snapshot.activeTopicId,
      isAdditive: isAdditiveSelection,
      pendingSelectedTopicIds: initialSelection,
      pendingActiveTopicId: initialActiveTopicId,
    }
  }, [])

  const handleCanvasSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Array<{ id: string }> }) => {
      const selectedFromCanvas = selectedNodes.map((node) => node.id)
      const selectionSession = boxSelectionSessionRef.current

      if (selectionSession?.isBoxSelecting) {
        const { nextSelectedTopicIds, nextActiveTopicId } = resolveCanvasSelection(
          selectionSession.baseSelectedTopicIds,
          selectionSession.baseActiveTopicId,
          selectedFromCanvas,
          selectionSession.isAdditive,
        )

        boxSelectionSessionRef.current = {
          ...selectionSession,
          pendingSelectedTopicIds: nextSelectedTopicIds,
          pendingActiveTopicId: nextActiveTopicId,
        }
        return
      }

      if (selectedFromCanvas.length === 0) {
        return
      }

      const snapshot = getEditorSnapshot()
      const isAdditiveSelection =
        additiveSelectionRef.current || Date.now() < additiveSelectionUntilRef.current
      const { nextSelectedTopicIds, nextActiveTopicId } = resolveCanvasSelection(
        snapshot.selectedTopicIds,
        snapshot.activeTopicId,
        selectedFromCanvas,
        isAdditiveSelection,
      )
      const hasSameSelection = haveSameTopicIdSet(
        snapshot.selectedTopicIds,
        nextSelectedTopicIds,
      )

      if (hasSameSelection && snapshot.activeTopicId === nextActiveTopicId) {
        return
      }

      setSelection(nextSelectedTopicIds, nextActiveTopicId)
    },
    [setSelection],
  )

  const handleCanvasSelectionEnd = useCallback(() => {
    const selectionSession = boxSelectionSessionRef.current
    boxSelectionSessionRef.current = null

    if (!selectionSession?.isBoxSelecting) {
      return
    }

    const snapshot = getEditorSnapshot()
    const hasSameSelection = haveSameTopicIdSet(
      snapshot.selectedTopicIds,
      selectionSession.pendingSelectedTopicIds,
    )

    if (
      selectionSession.pendingSelectedTopicIds.length === 0 &&
      !selectionSession.isAdditive
    ) {
      if (snapshot.selectedTopicIds.length > 0 || snapshot.activeTopicId !== null) {
        clearSelection()
      }
      return
    }

    if (hasSameSelection && snapshot.activeTopicId === selectionSession.pendingActiveTopicId) {
      return
    }

    setSelection(
      selectionSession.pendingSelectedTopicIds,
      selectionSession.pendingActiveTopicId,
    )
  }, [clearSelection, setSelection])

  const handleCanvasPaneClick = useCallback(() => {
    const snapshot = getEditorSnapshot()
    const isAdditiveSelection =
      additiveSelectionRef.current || Date.now() < additiveSelectionUntilRef.current

    if (!isAdditiveSelection && snapshot.selectedTopicIds.length > 0) {
      clearSelection()
    }
  }, [clearSelection])

  const handleCanvasNodeDragStart = useCallback(
    (_: React.MouseEvent, node: MindMapFlowNode) => {
      dragSnapshotRef.current = {
        topicId: node.id,
        positions: new Map(layoutRenderNodes.map((item) => [item.id, { ...item.position }])),
        movingIds: collectSubtreeIds(document!, node.id),
      }
      setSelection([node.id], node.id)
    },
    [document, layoutRenderNodes, setSelection],
  )

  const handleCanvasNodeDrag = useCallback(
    (_: React.MouseEvent, node: MindMapFlowNode) => {
      const snapshot = dragSnapshotRef.current
      if (!snapshot || snapshot.topicId !== node.id) {
        return
      }

      const origin = snapshot.positions.get(node.id)
      if (!origin) {
        return
      }

      const deltaX = node.position.x - origin.x
      const deltaY = node.position.y - origin.y

      setNodes((currentNodes) =>
        currentNodes.map((currentNode) => {
          const basePosition = snapshot.positions.get(currentNode.id) ?? currentNode.position
          const isMovingNode = snapshot.movingIds.has(currentNode.id)

          return {
            ...currentNode,
            position: isMovingNode
              ? {
                  x: basePosition.x + deltaX,
                  y: basePosition.y + deltaY,
                }
              : basePosition,
          }
        }),
      )
    },
    [setNodes],
  )

  const handleCanvasNodeDragStop = useCallback(
    (_: React.MouseEvent, node: MindMapFlowNode) => {
      const snapshot = dragSnapshotRef.current
      dragSnapshotRef.current = null

      if (!snapshot || snapshot.topicId !== node.id) {
        return
      }

      const origin = snapshot.positions.get(node.id)
      if (!origin) {
        return
      }

      const currentNode =
        nodesRef.current.find((currentItem) => currentItem.id === node.id) ?? node
      const deltaX = Math.round(currentNode.position.x - origin.x)
      const deltaY = Math.round(currentNode.position.y - origin.y)
      const currentOffset = getTopicLayout(document!.topics[node.id])

      setTopicOffset(node.id, currentOffset.offsetX + deltaX, currentOffset.offsetY + deltaY)
    },
    [document, setTopicOffset],
  )

  const handleCanvasMoveEnd = useCallback(
    (_: MouseEvent | TouchEvent | null, viewport: MindMapDocument['viewport']) => {
      if (isSameViewport(lastViewportRef.current, viewport)) {
        return
      }

      lastViewportRef.current = viewport
      setViewport(viewport)
    },
    [setViewport],
  )

  if (layoutError) {
    return (
      <main className={styles.page}>
        <div className={styles.errorState}>
          <h1 className={styles.errorTitle}>脑图暂时无法打开</h1>
          <p className={styles.errorDescription}>
            当前文档数据存在异常，页面已阻止白屏。请先返回首页，再重新打开或复制这份文档。
          </p>
          <div className={styles.errorActions}>
            <button type="button" className={styles.errorButton} onClick={() => navigate('/', { replace: true })}>
              返回首页
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!document || !layout) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>正在加载脑图…</div>
      </main>
    )
  }

  const handleFitView = async () => {
    await reactFlowRef.current?.fitView({ padding: 0.24, duration: 180 })
  }

  const handleZoomIn = async () => {
    await reactFlowRef.current?.zoomIn({ duration: 160 })
  }

  const handleZoomOut = async () => {
    await reactFlowRef.current?.zoomOut({ duration: 160 })
  }

  const handleExportPng = async () => {
    if (!canvasRef.current) {
      return
    }

    const previousViewport = reactFlowRef.current?.getViewport()

    await exportCanvasAsPng(canvasRef.current, document, async () => {
      await reactFlowRef.current?.fitView({ padding: 0.24, duration: 160 })
    })

    if (previousViewport) {
      reactFlowRef.current?.setViewport(previousViewport, { duration: 0 })
    }
  }

  const handleOpenTextImport = () => {
    textImportOpen()
  }

  const handleTextImportFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (files.length === 0 || !document) {
      return
    }

    await textImportPreviewFiles(
      document,
      {
        activeTopicId,
        selectedTopicIds,
      },
      files,
    )
  }

  const handleGenerateTextImportPreview = async () => {
    if (!document) {
      return
    }

    await textImportPreviewText(document, {
      activeTopicId,
      selectedTopicIds,
    })
  }

  const shouldRerunTextImportSettings = Boolean(
    textImportSourceFiles.length > 0 || textImportPreview || textImportIsPreviewing,
  )

  const handleChangeTextImportPreset = async (
    preset: Parameters<typeof textImportRerunPreviewWithPreset>[2],
  ) => {
    if (!document) {
      return
    }

    if (!shouldRerunTextImportSettings) {
      textImportSetPresetOverride(preset)
      return
    }

    await textImportRerunPreviewWithPreset(document, {
      activeTopicId,
      selectedTopicIds,
    }, preset)
  }

  const handleChangeTextImportArchetype = async (archetype: Parameters<typeof textImportRerunPreviewWithArchetype>[2]) => {
    if (!document) {
      return
    }

    if (!shouldRerunTextImportSettings) {
      textImportSetArchetypeOverride(archetype)
      return
    }

    await textImportRerunPreviewWithArchetype(document, {
      activeTopicId,
      selectedTopicIds,
    }, archetype)
  }

  const handleApplyTextImport = async () => {
    const result = await textImportApplyPreview(document)
    if (!result) {
      return
    }

    useEditorStore
      .getState()
      .applyExternalDocument(result.document, result.selectedTopicId ?? activeTopicId)
    textImportResetSession()
    textImportClose()
    await reactFlowRef.current?.fitView({ padding: 0.24, duration: 180 })
  }

  const handleRepairCurrentImport = async () => {
    if (!document?.workspace.activeImportBundleId) {
      return
    }

    const result = repairKnowledgeImportBundle(document, document.workspace.activeImportBundleId)
    if (!result) {
      return
    }

    useEditorStore
      .getState()
      .applyExternalDocument(result.document, result.selectedTopicId ?? activeTopicId)
    textImportResetSession()
    textImportClose()
    await reactFlowRef.current?.fitView({ padding: 0.24, duration: 180 })
  }

  const handleRenameCommit = () => {
    if (!activeTopicId) {
      stopEditing()
      return
    }

    renameTopic(activeTopicId, draftTitle)
    stopEditing()
  }

  const handleRenameCancel = () => {
    setRenameDraft({ topicId: selectedTopic?.id ?? null, value: selectedTopic?.title ?? '' })
    stopEditing()
  }

  const startDocumentTitleEditing = () => {
    setDocumentTitleDraft(document.title)
    setIsEditingDocumentTitle(true)
  }

  const commitDocumentTitle = () => {
    renameDocument(documentTitleDraft)
    setIsEditingDocumentTitle(false)
  }

  const cancelDocumentTitleEditing = () => {
    setDocumentTitleDraft(document.title)
    setIsEditingDocumentTitle(false)
  }

  const openRightSidebar = () => {
    setSidebarOpen('right', true)
  }

  const closeRightSidebar = () => {
    setSidebarOpen('right', false)
  }

  const openSidebarMode = (mode: RightPanelMode) => {
    setRightPanelMode(mode)
    setSidebarOpen('right', true)
  }

  const handleTopbarModeClick = (mode: RightPanelMode) => {
    if (rightSidebarOpen && rightPanelMode === mode) {
      closeRightSidebar()
      return
    }

    openSidebarMode(mode)
  }

  const handleSendAiMessage = async () => {
    if (!aiDraft.trim()) {
      return
    }

    const nextDraft = aiDraft
    setAiDraft('')
    await aiSendMessage(
      document,
      {
        activeTopicId,
        selectedTopicIds,
        useFullDocument,
        manualContextTopicIds: aiContextTopicIds,
      },
      nextDraft,
    )
  }

  const handleHierarchySelect = (topicId: string, additive = false) => {
    if (additive) {
      toggleTopicSelection(topicId)
      return
    }

    setSelection([topicId], topicId)
  }

  const handleToggleMarker = (marker: TopicMarker) => {
    if (selectedTopicIds.length === 0) {
      return
    }

    toggleTopicMarker(selectedTopicIds, marker)
  }

  const handleToggleSticker = (sticker: TopicSticker) => {
    if (selectedTopicIds.length === 0) {
      return
    }

    toggleTopicSticker(selectedTopicIds, sticker)
  }

  const renderRightSidebar = (
    mode: 'docked' | 'drawer',
    className: string,
  ) =>
    rightPanelMode === 'outline' ? (
      <HierarchySidebar
        id={RIGHT_SIDEBAR_ID}
        document={document}
        activeTopicId={activeTopicId}
        selectedTopicIds={selectedTopicIds}
        collapsedTopicIds={visibleHierarchyCollapsedTopicIds}
        className={className}
        mode={mode}
        onSelect={handleHierarchySelect}
        onToggleBranch={toggleHierarchyBranch}
        onPrimaryAction={() => addChild(activeTopicId ?? document.rootTopicId)}
      />
    ) : rightPanelMode === 'ai' ? (
      <AiSidebar
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        effectiveTopics={aiEffectiveTopics}
        manualTopics={aiManualSelectedTopics}
        canvasTopics={aiCanvasSelectedTopics}
        allTopics={aiAllTopics}
        useFullDocument={useFullDocument}
        onToggleFullDocument={handleToggleFullDocument}
        onAddContextTopic={handleAddContextTopic}
        onRemoveContextTopic={handleRemoveContextTopic}
        onCanvasPick={handleStartCanvasPick}
        onCancelCanvasPick={handleStopCanvasPick}
        sessionList={aiSessionList}
        activeSessionId={aiActiveSessionId}
        archivedSessions={aiArchivedSessions}
        status={aiStatus}
        statusError={aiStatusError}
        statusFailureKind={aiStatusFailureKind}
        statusFeedback={aiStatusFeedback}
        messages={aiMessages}
        runStage={aiRunStage}
        streamingStatusText={aiStreamingStatusText}
        streamingText={aiStreamingText}
        error={aiError}
        lastExecutionError={aiLastExecutionError}
        draft={aiDraft}
        isSending={aiIsSending}
        isCheckingStatus={aiIsCheckingStatus}
        settings={aiSettings}
        settingsError={aiSettingsError}
        isLoadingSettings={aiIsLoadingSettings}
        isSavingSettings={aiIsSavingSettings}
        isLoadingArchivedSessions={aiIsLoadingArchivedSessions}
        lastAppliedSummary={aiLastAppliedChange?.summary ?? null}
        canUndoLastApplied={canUndoLastApplied}
        onDraftChange={setAiDraft}
        onSend={() => void handleSendAiMessage()}
        onUndoLastApplied={aiUndoLastAppliedChange}
        onRevalidate={() =>
          void (aiStatus === null || aiStatus.ready ? aiRefreshStatus() : aiRevalidateStatus())
        }
        onLoadSettings={() => void aiLoadSettings()}
        onSaveSettings={(businessPrompt) => void aiSaveSettings(businessPrompt)}
        onResetSettings={() => void aiResetSettings()}
        onLoadArchivedSessions={() => void aiLoadArchivedSessions()}
        onCreateSession={() => void aiCreateSession()}
        onSwitchSession={(sessionId) => void aiSwitchSession(sessionId)}
        onArchiveSession={(sessionId) => void aiArchiveSession(sessionId)}
        onDeleteSession={(sessionId) => void aiDeleteSession(sessionId)}
        onRestoreArchivedSession={(docId, sessionId) =>
          void aiRestoreArchivedSession(docId, sessionId)
        }
        onDeleteArchivedSession={(docId, sessionId) =>
          void aiDeleteArchivedSession(docId, sessionId)
        }
        resolveTopicTitle={(topicId) => document.topics[topicId]?.title ?? '已删除节点'}
      />
    ) : rightPanelMode === 'markers' ? (
      <MarkersPanel
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        selectedTopics={selectedTopics}
        activeSubtab={markerSubtab}
        onSubtabChange={setMarkerSubtab}
        onToggleMarker={handleToggleMarker}
        onToggleSticker={handleToggleSticker}
      />
    ) : rightPanelMode === 'format' ? (
      <FormatPanel
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        topic={selectionCount > 1 ? null : selectedTopic}
        selectionCount={selectionCount}
        isFirstLevel={isFirstLevel}
        activeSubtab={formatSubtab}
        theme={document.theme}
        onSubtabChange={setFormatSubtab}
        onStyleChange={(patch) => activeTopicId && updateTopicStyle(activeTopicId, patch)}
        onApplyStyleToSelected={(patch) => updateTopicsStyle(selectedTopicIds, patch)}
        onBranchSideChange={(side) => activeTopicId && setBranchSide(activeTopicId, side)}
        onUpdateTheme={updateDocumentTheme}
        onApplyThemePreset={applyDocumentTheme}
      />
    ) : (
      <PropertiesPanel
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        topic={selectionCount > 1 ? null : selectedTopic}
        selectionCount={selectionCount}
        selectedLockedCount={selectedLockedCount}
        selectedUnlockedCount={selectedUnlockedCount}
        isRoot={isRoot}
        isFirstLevel={isFirstLevel}
        draftTitle={draftTitle}
        isInspectorEditing={isInspectorEditing}
        topicOptions={topicOptions}
        availableLabels={document ? Array.from(new Set(Object.values(document.topics).flatMap((t) => t.metadata.labels))) : []}
        onRenameChange={(value) =>
          setRenameDraft({
            topicId: activeTopicId,
            value,
          })
        }
        onRenameCommit={handleRenameCommit}
        onRenameCancel={handleRenameCancel}
        onNoteChange={(noteRich) => activeTopicId && updateNoteRich(activeTopicId, noteRich)}
        onMetadataChange={(patch) => activeTopicId && updateTopicMetadata(activeTopicId, patch)}
        onToggleAiLock={(aiLocked) => activeTopicId && setTopicAiLocked(activeTopicId, aiLocked)}
        onLockSelected={() => setTopicsAiLocked(selectedTopicIds.filter((topicId) => !document.topics[topicId]?.aiLocked), true)}
        onUnlockSelected={() => setTopicsAiLocked(selectedTopicIds.filter((topicId) => document.topics[topicId]?.aiLocked), false)}
      />
    )

  return (
    <main className={styles.page} style={themeVariables}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.mainMenuContainer} ref={mainMenuRef}>
            <button
              type="button"
              className={styles.hamburgerButton}
              onClick={handleMainMenuToggle}
              aria-expanded={mainMenuOpen}
              aria-label="打开菜单"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            {mainMenuOpen && portalContainer && (
              createPortal(
                <div
                  ref={mainMenuDropdownRef}
                  className={styles.mainMenuDropdown}
                  style={{ position: 'fixed', top: '48px', left: '12px', zIndex: 100000 }}
                >
                  <div
                    className={styles.menuItemWithSubmenu}
                    onPointerEnter={handleExportMenuPointerEnter}
                    onPointerLeave={handleExportMenuPointerLeave}
                    onFocus={handleExportMenuFocus}
                    onBlur={handleExportMenuBlur}
                  >
                    <button
                      type="button"
                      className={styles.menuItem}
                      onClick={handleExportMenuClick}
                      aria-expanded={exportSubmenuOpen}
                      aria-haspopup="menu"
                    >
                      <span>导出</span>
                      <svg
                        className={`${styles.submenuArrow} ${exportSubmenuOpen ? styles.submenuArrowOpen : ''}`}
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path d="M4.5 2L8 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {exportSubmenuOpen && (
                      <div className={styles.submenu} role="menu" aria-label="导出格式">
                        <button
                          type="button"
                          className={styles.submenuItem}
                          role="menuitem"
                          onClick={() => {
                            exportDocumentAsJson(document)
                            closeMainMenu()
                          }}
                        >
                          导出 JSON
                        </button>
                        <button
                          type="button"
                          className={styles.submenuItem}
                          role="menuitem"
                          onClick={() => {
                            void handleExportPng()
                            closeMainMenu()
                          }}
                        >
                          导出 PNG
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      closeMainMenu()
                      navigate('/settings')
                    }}
                  >
                    数据存储与同步
                  </button>
                </div>,
                portalContainer
              )
            )}
          </div>
          <button type="button" className={styles.brandBlock} onClick={() => navigate('/')}>
            <span className={styles.wordmark}>BrainFlow</span>
          </button>
          <div className={styles.titleWrap}>
            {isEditingDocumentTitle ? (
              <input
                ref={documentTitleInputRef}
                className={styles.titleInput}
                value={documentTitleDraft}
                aria-label="编辑画布名称"
                onBlur={() => {
                  if (skipDocumentTitleBlurRef.current) {
                    skipDocumentTitleBlurRef.current = false
                    return
                  }

                  commitDocumentTitle()
                }}
                onChange={(event) => setDocumentTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    skipDocumentTitleBlurRef.current = true
                    commitDocumentTitle()
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    skipDocumentTitleBlurRef.current = true
                    cancelDocumentTitleEditing()
                  }
                }}
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                className={styles.titleDisplay}
                aria-label={`画布名称：${document.title}`}
                onDoubleClick={startDocumentTitleEditing}
                onKeyDown={(event) => {
                  if (event.key === 'F2' || event.key === 'Enter') {
                    event.preventDefault()
                    startDocumentTitleEditing()
                  }
                }}
              >
                {document.title}
              </div>
            )}
            <SaveIndicator
              localSavedAt={storageStatus.localSavedAt}
              cloudSyncedAt={storageStatus.cloudSyncedAt}
              isDirty={isDirty}
              isSyncing={storageStatus.isSyncing}
              hasConflict={storageStatus.conflicts.length > 0}
            />
          </div>
        </div>

        <ToolbarGroup className={styles.topbarRight}>
            <input
              ref={textImportInputRef}
              type="file"
              hidden
              multiple
              onChange={(event) => void handleTextImportFileSelected(event)}
            />
          <button
            type="button"
            className={styles.iconButton}
            onClick={undo}
            disabled={history.length === 0}
            aria-label="撤销"
          >
            <img src={revertIcon} alt="撤销" style={{ width: 16, height: 16, display: 'block' }} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={redo}
            disabled={future.length === 0}
            aria-label="重做"
          >
            <img src={revertIcon} alt="重做" style={{ width: 16, height: 16, display: 'block', transform: 'scaleX(-1)' }} />
          </button>
          <button
            type="button"
            className={styles.topbarToolButton}
            data-active={rightSidebarOpen && rightPanelMode === 'outline'}
            onClick={() => handleTopbarModeClick('outline')}
          >
            <img src={contentIcon} alt="目录" style={{ width: 20, height: 20, display: 'block' }} />
            <span>目录</span>
          </button>
          <button
            type="button"
            className={styles.topbarToolButton}
            data-active={rightSidebarOpen && rightPanelMode === 'details'}
            onClick={() => handleTopbarModeClick('details')}
          >
            <img src={nodeIcon} alt="节点" style={{ width: 20, height: 20, display: 'block' }} />
            <span>节点</span>
          </button>
          <button
            type="button"
            className={styles.topbarToolButton}
            data-active={rightSidebarOpen && rightPanelMode === 'markers'}
            onClick={() => handleTopbarModeClick('markers')}
          >
            <img src={symbolIcon} alt="标记" style={{ width: 20, height: 20, display: 'block' }} />
            <span>标记</span>
          </button>
          <button
            type="button"
            className={styles.topbarToolButton}
            data-active={rightSidebarOpen && rightPanelMode === 'format'}
            onClick={() => handleTopbarModeClick('format')}
          >
            <img src={designIcon} alt="格式" style={{ width: 20, height: 20, display: 'block' }} />
            <span>格式</span>
          </button>
          <button
            type="button"
            className={styles.topbarToolButton}
            data-active={rightSidebarOpen && rightPanelMode === 'ai'}
            onClick={() => handleTopbarModeClick('ai')}
          >
            <img src={agentsIcon} alt="AI" style={{ width: 20, height: 20, display: 'block' }} />
            <span>AI</span>
          </button>
          <button
            type="button"
            className={styles.exportButtonPrimary}
            onClick={handleOpenTextImport}
          >
            {textImportButtonLabel}
          </button>
        </ToolbarGroup>
      </header>

      <section className={styles.workspace} data-viewport-mode={viewportMode}>
        {isTablet && isAnyDrawerOpen ? (
          <button
            type="button"
            aria-label="关闭侧边栏遮罩"
            className={styles.drawerBackdrop}
            onClick={closeRightSidebar}
          />
        ) : null}

        <div className={styles.canvasColumn}>
          <div
            ref={canvasRef}
            className={styles.canvasFrame}
            onMouseDownCapture={(event) => {
              if (event.button === 1) {
                event.preventDefault()
              }
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={layout.renderEdges}
              nodeTypes={nodeTypes}
              nodesConnectable={false}
              panActivationKeyCode="Space"
              panOnDrag={isSpacePressed ? true : reactFlowMiddleMousePanButtons}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={reactFlowMultiSelectionKeyCode}
              zoomOnScroll
              zoomOnDoubleClick={false}
              deleteKeyCode={null}
              proOptions={reactFlowProOptions}
              onInit={handleReactFlowInit}
              onNodesChange={handleCanvasNodesChange}
              onSelectionStart={handleCanvasSelectionStart}
              onSelectionChange={handleCanvasSelectionChange}
              onSelectionEnd={handleCanvasSelectionEnd}
              onPaneClick={handleCanvasPaneClick}
              onNodeClick={handleNodeClick}
              onNodeDragStart={handleCanvasNodeDragStart}
              onNodeDrag={handleCanvasNodeDrag}
              onNodeDragStop={handleCanvasNodeDragStop}
              onMoveEnd={handleCanvasMoveEnd}
              fitView={false}
            />
            <div className={styles.canvasControls}>
              <IconButton label="放大" icon="add" tone="ghost" onClick={() => void handleZoomIn()} />
              <IconButton label="缩小" icon="minus" tone="ghost" onClick={() => void handleZoomOut()} />
              <IconButton label="适应视图" icon="fitView" tone="ghost" onClick={() => void handleFitView()} />
            </div>
          </div>
        </div>

        {isDesktop ? (
          rightSidebarOpen ? (
            <div 
              className={styles.rightSidebarWrapper} 
              style={{ width: rightSidebarWidth }}
            >
              <div 
                className={styles.resizeHandle} 
                onMouseDown={handleResizeStart}
                title="拖拽调整宽度"
              />
              {renderRightSidebar('docked', styles.rightSidebar)}
            </div>
          ) : (
            <SidebarRail
              side="right"
              controlsId={RIGHT_SIDEBAR_ID}
              expanded={false}
              label="显示右侧栏"
              className={styles.rightRail}
              onToggle={openRightSidebar}
            />
          )
        ) : null}

        {isTablet ? (
          <>
            {isRightDrawerOpen ? (
              <div className={`${styles.drawerShell} ${styles.rightDrawer}`} data-side="right">
                {renderRightSidebar('drawer', styles.drawerPanel)}
              </div>
            ) : null}
            <SidebarRail
              side="right"
              controlsId={RIGHT_SIDEBAR_ID}
              expanded={isRightDrawerOpen}
              label="显示右侧栏"
              className={styles.rightRail}
              onToggle={isRightDrawerOpen ? closeRightSidebar : openRightSidebar}
            />
          </>
        ) : null}

        {isMobile && rightSidebarOpen
          ? renderRightSidebar('drawer', styles.mobileInspector)
          : null}
      </section>
        <TextImportDialog
          open={textImportIsOpen}
          sourceName={textImportSourceName}
          sourceType={textImportSourceType}
          sourceFiles={textImportSourceFiles}
          rawText={textImportRawText}
          draftSourceName={textImportDraftSourceName}
          draftText={textImportDraftText}
          preprocessedHints={textImportPreprocessedHints}
          preview={textImportPreview}
          draftTree={textImportDraftTree}
          previewTree={textImportPreviewTree}
          draftConfirmed={textImportDraftConfirmed}
          crossFileMergeSuggestions={textImportCrossFileMergeSuggestions}
          approvedConflictIds={textImportApprovedConflictIds}
          statusText={textImportStatusText}
          progress={textImportProgress}
          progressIndeterminate={textImportProgressIndeterminate}
          modeHint={textImportModeHint}
          error={textImportError}
          isPreviewing={textImportIsPreviewing}
          isApplying={textImportIsApplying}
          previewStartedAt={textImportPreviewStartedAt}
          previewFinishedAt={textImportPreviewFinishedAt}
          jobMode={textImportActiveJobMode}
          jobType={textImportActiveJobType}
          fileCount={textImportFileCount}
          completedFileCount={textImportCompletedFileCount}
          currentFileName={textImportCurrentFileName}
          semanticMergeStage={textImportSemanticMergeStage}
          semanticCandidateCount={textImportSemanticCandidateCount}
          semanticAdjudicatedCount={textImportSemanticAdjudicatedCount}
          semanticFallbackCount={textImportSemanticFallbackCount}
          applyProgress={textImportApplyProgress}
          appliedCount={textImportAppliedCount}
          totalOperations={textImportTotalOperations}
          currentApplyLabel={textImportCurrentApplyLabel}
          planningSummaries={textImportPlanningSummaries}
          presetOverride={textImportPresetOverride}
          archetypeOverride={textImportArchetypeOverride}
          anchorMode={textImportAnchorMode}
          documentRootLabel={textImportRootLabel}
          currentSelectionLabel={textImportCurrentSelectionLabel}
          repairLabel="修复当前导入"
          repairDescription={
            textImportRepairAvailability.isLegacyGtmBundle
              ? textImportRepairAvailability.canRepair
                ? '检测到旧版 GTM 模板导入。将基于当前 bundle 保存的原始 sources 重新构建并替换画布结构。'
                : textImportRepairAvailability.reason
              : null
          }
          repairDisabled={!textImportRepairAvailability.canRepair}
          onClose={textImportClose}
          onChooseFile={() => textImportInputRef.current?.click()}
          onPresetChange={(value) => void handleChangeTextImportPreset(value)}
          onArchetypeChange={(value) => void handleChangeTextImportArchetype(value)}
          onAnchorModeChange={textImportSetAnchorMode}
          onDraftSourceNameChange={textImportSetDraftSourceName}
          onDraftTextChange={textImportSetDraftText}
          onGenerateFromText={() => void handleGenerateTextImportPreview()}
          onToggleConflict={textImportToggleConflictApproval}
          onConfirmDraft={textImportConfirmDraft}
          onRenamePreviewNode={textImportRenamePreviewNode}
          onPromotePreviewNode={textImportPromotePreviewNode}
          onDemotePreviewNode={textImportDemotePreviewNode}
          onDeletePreviewNode={textImportDeletePreviewNode}
          onApply={() => void handleApplyTextImport()}
          onRepair={textImportRepairAvailability.isLegacyGtmBundle ? () => void handleRepairCurrentImport() : undefined}
        />
    </main>
  )
}

