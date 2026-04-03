import {
  ReactFlow,
  SelectionMode,
  type NodeMouseHandler,
  type ReactFlowInstance,
  useNodesState,
} from '@xyflow/react'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { EditorSidebarTabs } from '../../features/editor/components/EditorSidebarTabs'
import { HierarchySidebar } from '../../features/editor/components/HierarchySidebar'

import { PropertiesPanel } from '../../features/editor/components/PropertiesPanel'
import { SidebarRail } from '../../features/editor/components/SidebarRail'
import { getEditorSnapshot, useEditorStore } from '../../features/editor/editor-store'
import { exportCanvasAsPng, exportDocumentAsJson } from '../../features/editor/exporters'
import { layoutMindMap, type MindMapFlowNode } from '../../features/editor/layout'
import { getTopicAncestorIds, getTopicLayout } from '../../features/editor/tree-operations'
import { useEditorShortcuts } from '../../features/editor/use-editor-shortcuts'
import styles from './MapEditorPage.module.css'

interface MapEditorPageProps {
  service?: DocumentService
}

const SAVE_DEBOUNCE_MS = 320
const DESKTOP_BREAKPOINT = 1200
const TABLET_BREAKPOINT = 780
const HIERARCHY_SIDEBAR_ID = 'editor-hierarchy-sidebar'
const RIGHT_SIDEBAR_ID = 'editor-right-sidebar'
const nodeTypes = { topic: TopicNode }

interface DragSnapshot {
  topicId: string
  positions: Map<string, { x: number; y: number }>
  movingIds: Set<string>
}

interface RenameDraft {
  topicId: string | null
  value: string
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile'
type RightPanelTab = 'inspector' | 'ai'

function areFlowNodesEquivalent(
  currentNode: MindMapFlowNode,
  nextNode: MindMapFlowNode,
): boolean {
  return (
    currentNode.id === nextNode.id &&
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
  const canvasRef = useRef<HTMLDivElement>(null)
  const reactFlowRef = useRef<ReactFlowInstance<MindMapFlowNode> | null>(null)
  const initializedViewportRef = useRef<string | null>(null)
  const lastViewportRef = useRef<MindMapDocument['viewport'] | null>(null)
  const additiveSelectionRef = useRef(false)
  const additiveSelectionUntilRef = useRef(0)
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)
  const nodesRef = useRef<MindMapFlowNode[]>([])
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [renameDraft, setRenameDraft] = useState<RenameDraft>({ topicId: null, value: '' })
  const [aiDraft, setAiDraft] = useState('')
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('inspector')
  const [rightSidebarWidth, setRightSidebarWidth] = useState(300)

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
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt)
  const setDocument = useEditorStore((state) => state.setDocument)
  const setSelection = useEditorStore((state) => state.setSelection)
  const toggleTopicSelection = useEditorStore((state) => state.toggleTopicSelection)
  const clearSelection = useEditorStore((state) => state.clearSelection)
  const toggleHierarchyBranch = useEditorStore((state) => state.toggleHierarchyBranch)
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameDocument = useEditorStore((state) => state.renameDocument)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const addChild = useEditorStore((state) => state.addChild)
  const addSibling = useEditorStore((state) => state.addSibling)
  const updateNoteRich = useEditorStore((state) => state.updateNoteRich)
  const updateTopicMetadata = useEditorStore((state) => state.updateTopicMetadata)
  const updateTopicStyle = useEditorStore((state) => state.updateTopicStyle)
  const updateTopicsStyle = useEditorStore((state) => state.updateTopicsStyle)
  const removeTopic = useEditorStore((state) => state.removeTopic)
  const setBranchSide = useEditorStore((state) => state.setBranchSide)
  const setTopicOffset = useEditorStore((state) => state.setTopicOffset)
  const resetTopicOffset = useEditorStore((state) => state.resetTopicOffset)
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

  useEditorShortcuts()

  const layout = useMemo(() => (document ? layoutMindMap(document) : null), [document])
  const selectedTopic = activeTopicId && document ? document.topics[activeTopicId] ?? null : null
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
  const leftSidebarOpen = chrome?.leftSidebarOpen ?? true
  const rightSidebarOpen = chrome?.rightSidebarOpen ?? true
  const isDesktop = viewportMode === 'desktop'
  const isTablet = viewportMode === 'tablet'
  const isMobile = viewportMode === 'mobile'
  const isLeftDrawerOpen = isTablet && leftSidebarOpen && !rightSidebarOpen
  const isRightDrawerOpen = isTablet && rightSidebarOpen && !leftSidebarOpen
  const isAnyDrawerOpen = isLeftDrawerOpen || isRightDrawerOpen
  const isInspectorEditing =
    editingSurface === 'inspector' && editingTopicId === activeTopicId && !!activeTopicId
  const draftTitle =
    renameDraft.topicId === selectedTopic?.id ? renameDraft.value : (selectedTopic?.title ?? '')
  const aiSelectedTopics = useMemo(
    () =>
      aiContextTopicIds.map((topicId) => ({
        topicId,
        title: document?.topics[topicId]?.title ?? '已删除节点',
        isActive: topicId === activeTopicId,
      })),
    [activeTopicId, document, aiContextTopicIds],
  )
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
  const handleRemoveContextTopic = useCallback((topicId: string) => {
    setAiContextTopicIds((prev) => prev.filter((id) => id !== topicId))
  }, [])
  const handleToggleFullDocument = useCallback(() => {
    setUseFullDocument((prev) => !prev)
  }, [])
  const handleStartCanvasPick = useCallback(() => {
    setIsPickingCanvasNode(true)
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

  const rightSidebarTabs = (onCollapse?: () => void) => (
    <EditorSidebarTabs
      controlsId={RIGHT_SIDEBAR_ID}
      activeTab={rightPanelTab}
      onChange={setRightPanelTab}
      onCollapse={onCollapse}
    />
  )

  const canUndoLastApplied =
    !!aiLastAppliedChange &&
    history.length === aiLastAppliedChange.historyLength &&
    document?.updatedAt === aiLastAppliedChange.documentUpdatedAt
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
    const syncViewportMode = () => {
      setViewportMode(getViewportMode(window.innerWidth))
    }

    syncViewportMode()
    window.addEventListener('resize', syncViewportMode)
    return () => window.removeEventListener('resize', syncViewportMode)
  }, [])

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
      const nextNodes = layout.renderNodes.map((node) => ({
        ...node,
        draggable: !(editingSurface === 'canvas' && node.id === editingTopicId),
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
  }, [editingSurface, editingTopicId, layout, setNodes])

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

      if (isLeftDrawerOpen) {
        setSidebarOpen('left', false)
      }

      if (isRightDrawerOpen) {
        setSidebarOpen('right', false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAnyDrawerOpen, isLeftDrawerOpen, isRightDrawerOpen, isTablet, setSidebarOpen])

  if (!document || !layout) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>正在载入脑图…</div>
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

  const handleRenameFromInspector = () => {
    if (!activeTopicId || !selectedTopic) {
      return
    }

    setRenameDraft({ topicId: activeTopicId, value: selectedTopic.title })
    startEditing(activeTopicId, 'inspector')
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

  const openLeftSidebar = () => {
    if (isTablet) {
      setSidebarOpen('right', false)
    }

    setSidebarOpen('left', true)
  }

  const closeLeftSidebar = () => {
    setSidebarOpen('left', false)
  }

  const openRightSidebar = () => {
    if (isTablet) {
      setSidebarOpen('left', false)
    }

    setSidebarOpen('right', true)
  }

  const closeRightSidebar = () => {
    setSidebarOpen('right', false)
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

  const handleNodeClick: NodeMouseHandler<MindMapFlowNode> = (event, node) => {
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
  }

  const renderRightSidebar = (
    mode: 'docked' | 'drawer',
    className: string,
    onCollapse?: () => void,
  ) =>
    rightPanelTab === 'ai' ? (
      <AiSidebar
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        tabs={rightSidebarTabs(onCollapse)}
        selectedTopics={aiSelectedTopics}
        allTopics={aiAllTopics}
        useFullDocument={useFullDocument}
        onToggleFullDocument={handleToggleFullDocument}
        onAddContextTopic={handleAddContextTopic}
        onRemoveContextTopic={handleRemoveContextTopic}
        onCanvasPick={handleStartCanvasPick}
        sessionList={aiSessionList}
        activeSessionId={aiActiveSessionId}
        archivedSessions={aiArchivedSessions}
        status={aiStatus}
        statusError={aiStatusError}
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
        onCollapse={onCollapse}
      />
    ) : (
      <PropertiesPanel
        id={RIGHT_SIDEBAR_ID}
        className={className}
        mode={mode}
        tabs={rightSidebarTabs(onCollapse)}
        topic={selectionCount > 1 ? null : selectedTopic}
        selectionCount={selectionCount}
        selectedLockedCount={selectedLockedCount}
        selectedUnlockedCount={selectedUnlockedCount}
        isRoot={isRoot}
        isFirstLevel={isFirstLevel}
        draftTitle={draftTitle}
        isInspectorEditing={isInspectorEditing}
        theme={{
          surface: document.theme.surface,
          text: document.theme.text,
          accent: document.theme.accent,
        }}
        topicOptions={topicOptions}
        onCollapse={onCollapse}
        onRenameStart={handleRenameFromInspector}
        onRenameChange={(value) =>
          setRenameDraft({
            topicId: activeTopicId,
            value,
          })
        }
        onRenameCommit={handleRenameCommit}
        onRenameCancel={handleRenameCancel}
        onAddChild={() => activeTopicId && addChild(activeTopicId)}
        onAddSibling={() => activeTopicId && addSibling(activeTopicId)}
        onDelete={() => activeTopicId && removeTopic(activeTopicId)}
        onNoteChange={(noteRich) => activeTopicId && updateNoteRich(activeTopicId, noteRich)}
        onMetadataChange={(patch) => activeTopicId && updateTopicMetadata(activeTopicId, patch)}
        onStyleChange={(patch) => activeTopicId && updateTopicStyle(activeTopicId, patch)}
        onApplyStyleToSelected={(patch) => updateTopicsStyle(selectedTopicIds, patch)}
        onBranchSideChange={(side) => activeTopicId && setBranchSide(activeTopicId, side)}
        onToggleAiLock={(aiLocked) => activeTopicId && setTopicAiLocked(activeTopicId, aiLocked)}
        onLockSelected={() => setTopicsAiLocked(selectedTopicIds.filter((topicId) => !document.topics[topicId]?.aiLocked), true)}
        onUnlockSelected={() => setTopicsAiLocked(selectedTopicIds.filter((topicId) => document.topics[topicId]?.aiLocked), false)}
        onResetPosition={() => activeTopicId && resetTopicOffset(activeTopicId)}
      />
    )

  return (
    <main className={styles.page} style={themeVariables}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.brandBlock} onClick={() => navigate('/')}>
            <span className={styles.wordmark}>BrainFlow</span>
          </button>
          <div className={styles.titleWrap}>
            <input
              className={styles.titleInput}
              value={document.title}
              aria-label="脑图标题"
              onChange={(event) => renameDocument(event.target.value)}
            />
            <SaveIndicator lastSavedAt={lastSavedAt} isDirty={isDirty} />
          </div>
        </div>

        <ToolbarGroup className={styles.topbarRight}>
          <IconButton
            label="撤销"
            icon="undo"
            tone="secondary"
            size="sm"
            onClick={undo}
            disabled={history.length === 0}
          />
          <IconButton
            label="重做"
            icon="redo"
            tone="secondary"
            size="sm"
            onClick={redo}
            disabled={future.length === 0}
          />
          <button type="button" className={styles.exportButton} onClick={() => exportDocumentAsJson(document)}>
            导出 JSON
          </button>
          <button type="button" className={styles.exportButtonPrimary} onClick={() => void handleExportPng()}>
            导出 PNG
          </button>
        </ToolbarGroup>
      </header>

      <section className={styles.workspace} data-viewport-mode={viewportMode}>
        {isDesktop ? (
          leftSidebarOpen ? (
            <HierarchySidebar
              id={HIERARCHY_SIDEBAR_ID}
              document={document}
              activeTopicId={activeTopicId}
              selectedTopicIds={selectedTopicIds}
              collapsedTopicIds={visibleHierarchyCollapsedTopicIds}
              className={styles.leftSidebar}
              onSelect={handleHierarchySelect}
              onToggleBranch={toggleHierarchyBranch}
              onPrimaryAction={() => addChild(activeTopicId ?? document.rootTopicId)}
              onCollapse={closeLeftSidebar}
            />
          ) : (
            <SidebarRail
              side="left"
              controlsId={HIERARCHY_SIDEBAR_ID}
              expanded={false}
              label="显示层级栏"
              className={styles.leftRail}
              onToggle={openLeftSidebar}
            />
          )
        ) : null}

        {isTablet ? (
          <>
            <SidebarRail
              side="left"
              controlsId={HIERARCHY_SIDEBAR_ID}
              expanded={isLeftDrawerOpen}
              label="显示层级栏"
              className={styles.leftRail}
              onToggle={isLeftDrawerOpen ? closeLeftSidebar : openLeftSidebar}
            />
            {isAnyDrawerOpen ? (
              <button
                type="button"
                aria-label="关闭侧边栏遮罩"
                className={styles.drawerBackdrop}
                onClick={isLeftDrawerOpen ? closeLeftSidebar : closeRightSidebar}
              />
            ) : null}
            {isLeftDrawerOpen ? (
              <div className={`${styles.drawerShell} ${styles.leftDrawer}`} data-side="left">
                <HierarchySidebar
                  id={HIERARCHY_SIDEBAR_ID}
                  document={document}
                  activeTopicId={activeTopicId}
                  selectedTopicIds={selectedTopicIds}
                  collapsedTopicIds={visibleHierarchyCollapsedTopicIds}
                  className={styles.drawerPanel}
                  mode="drawer"
                  onSelect={handleHierarchySelect}
                  onToggleBranch={toggleHierarchyBranch}
                  onPrimaryAction={() => addChild(activeTopicId ?? document.rootTopicId)}
                  onCollapse={closeLeftSidebar}
                />
              </div>
            ) : null}
          </>
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
              panOnDrag={isSpacePressed ? true : [1]}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              zoomOnScroll
              zoomOnDoubleClick={false}
              deleteKeyCode={null}
              onInit={(instance) => {
                reactFlowRef.current = instance
                setReactFlowInstance(instance)
              }}
              onNodesChange={(changes) => {
                // Filter out remove changes - we handle deletion via keyboard shortcuts
                const filteredChanges = changes.filter((change) => change.type !== 'remove')
                if (filteredChanges.length > 0) {
                  onNodesChange(filteredChanges)
                }
              }}
              onSelectionChange={({ nodes: selectedNodes }) => {
                const selectedFromCanvas = selectedNodes.map((node) => node.id)
                if (selectedFromCanvas.length === 0) {
                  return
                }

                const snapshot = getEditorSnapshot()
                const isAdditiveSelection =
                  additiveSelectionRef.current || Date.now() < additiveSelectionUntilRef.current
                const nextSelectedTopicIds = isAdditiveSelection
                  ? mergeTopicSelection(snapshot.selectedTopicIds, selectedFromCanvas)
                  : selectedFromCanvas
                const nextActiveTopicId = nextSelectedTopicIds.includes(snapshot.activeTopicId ?? '')
                  ? snapshot.activeTopicId
                  : selectedFromCanvas.at(-1) ?? null
                const hasSameSelection =
                  snapshot.selectedTopicIds.length === nextSelectedTopicIds.length &&
                  snapshot.selectedTopicIds.every(
                    (topicId, index) => topicId === nextSelectedTopicIds[index],
                  )

                if (hasSameSelection && snapshot.activeTopicId === nextActiveTopicId) {
                  return
                }

                setSelection(nextSelectedTopicIds, nextActiveTopicId)
              }}
              onPaneClick={() => clearSelection()}
              onNodeClick={handleNodeClick}
              onNodeDragStart={(_, node) => {
                dragSnapshotRef.current = {
                  topicId: node.id,
                  positions: new Map(layout.renderNodes.map((item) => [item.id, { ...item.position }])),
                  movingIds: collectSubtreeIds(document, node.id),
                }
                setSelection([node.id], node.id)
              }}
              onNodeDrag={(_, node) => {
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
              }}
              onNodeDragStop={(_, node) => {
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
                const currentOffset = getTopicLayout(document.topics[node.id])

                setTopicOffset(node.id, currentOffset.offsetX + deltaX, currentOffset.offsetY + deltaY)
              }}
              onMoveEnd={(_, viewport) => {
                if (isSameViewport(lastViewportRef.current, viewport)) {
                  return
                }

                lastViewportRef.current = viewport
                setViewport(viewport)
              }}
              fitView={false}
            />
            <div className={styles.canvasControls}>
              <IconButton label="放大" icon="add" tone="secondary" onClick={() => void handleZoomIn()} />
              <IconButton label="缩小" icon="minus" tone="secondary" onClick={() => void handleZoomOut()} />
              <IconButton label="适应视图" icon="fitView" tone="secondary" onClick={() => void handleFitView()} />
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
              {renderRightSidebar('docked', styles.rightSidebar, closeRightSidebar)}
            </div>
          ) : (
            <SidebarRail
              side="right"
              controlsId={RIGHT_SIDEBAR_ID}
              expanded={false}
              label="显示检查器"
              className={styles.rightRail}
              onToggle={openRightSidebar}
            />
          )
        ) : null}

        {isTablet ? (
          <>
            {isRightDrawerOpen ? (
              <div className={`${styles.drawerShell} ${styles.rightDrawer}`} data-side="right">
                {renderRightSidebar('drawer', styles.drawerPanel, closeRightSidebar)}
              </div>
            ) : null}
            <SidebarRail
              side="right"
              controlsId={RIGHT_SIDEBAR_ID}
              expanded={isRightDrawerOpen}
              label="显示检查器"
              className={styles.rightRail}
              onToggle={isRightDrawerOpen ? closeRightSidebar : openRightSidebar}
            />
          </>
        ) : null}

        {isMobile ? renderRightSidebar('drawer', styles.mobileInspector) : null}
      </section>
    </main>
  )
}
