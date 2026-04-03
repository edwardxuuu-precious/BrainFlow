import {
  ReactFlow,
  SelectionMode,
  type NodeMouseHandler,
  type ReactFlowInstance,
  useNodesState,
} from '@xyflow/react'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopicNode } from '../../components/topic-node/TopicNode'
import { Button, IconButton, StatusPill, ToolbarGroup } from '../../components/ui'
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
import { getTopicLayout } from '../../features/editor/tree-operations'
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
    currentNode.data.side === nextNode.data.side
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

function formatSaveState(isDirty: boolean, savedAt: number | null): string {
  if (isDirty) {
    return '未保存'
  }

  if (!savedAt) {
    return '本地自动保存'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(savedAt)
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
  const startEditing = useEditorStore((state) => state.startEditing)
  const stopEditing = useEditorStore((state) => state.stopEditing)
  const renameDocument = useEditorStore((state) => state.renameDocument)
  const renameTopic = useEditorStore((state) => state.renameTopic)
  const addChild = useEditorStore((state) => state.addChild)
  const addSibling = useEditorStore((state) => state.addSibling)
  const updateNote = useEditorStore((state) => state.updateNote)
  const removeTopic = useEditorStore((state) => state.removeTopic)
  const setBranchSide = useEditorStore((state) => state.setBranchSide)
  const setTopicOffset = useEditorStore((state) => state.setTopicOffset)
  const resetTopicOffset = useEditorStore((state) => state.resetTopicOffset)
  const setTopicAiLocked = useEditorStore((state) => state.setTopicAiLocked)
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
  const chrome = document?.workspace.chrome
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
      selectedTopicIds.map((topicId) => ({
        topicId,
        title: document?.topics[topicId]?.title ?? '已删除节点',
        isActive: topicId === activeTopicId,
      })),
    [activeTopicId, document, selectedTopicIds],
  )
  const rightSidebarTabs = (
    <EditorSidebarTabs activeTab={rightPanelTab} onChange={setRightPanelTab} />
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
    if (rightPanelTab !== 'ai') {
      return
    }

    if (!aiStatus && !aiIsCheckingStatus) {
      void aiRefreshStatus()
    }
  }, [aiIsCheckingStatus, aiRefreshStatus, aiStatus, rightPanelTab])

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
        tabs={rightSidebarTabs}
        selectedTopics={aiSelectedTopics}
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
        onRevalidate={() => void (aiStatus?.ready ? aiRefreshStatus() : aiRevalidateStatus())}
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
        tabs={rightSidebarTabs}
        topic={selectionCount > 1 ? null : selectedTopic}
        selectionCount={selectionCount}
        isRoot={isRoot}
        isFirstLevel={isFirstLevel}
        draftTitle={draftTitle}
        isInspectorEditing={isInspectorEditing}
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
        onNoteChange={(note) => activeTopicId && updateNote(activeTopicId, note)}
        onBranchSideChange={(side) => activeTopicId && setBranchSide(activeTopicId, side)}
        onToggleAiLock={(aiLocked) => activeTopicId && setTopicAiLocked(activeTopicId, aiLocked)}
        onResetPosition={() => activeTopicId && resetTopicOffset(activeTopicId)}
      />
    )

  return (
    <main className={styles.page} style={themeVariables}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.brandBlock}>
            <span className={styles.wordmark}>BrainFlow</span>
            <StatusPill tone="soft">Document / Title</StatusPill>
          </div>
          <Button type="button" tone="secondary" iconStart="back" onClick={() => navigate('/')}>
            返回文档
          </Button>
          <div className={styles.titleWrap}>
            <input
              className={styles.titleInput}
              value={document.title}
              aria-label="脑图标题"
              onChange={(event) => renameDocument(event.target.value)}
            />
            <StatusPill tone={isDirty ? 'accent' : 'soft'}>
              {formatSaveState(isDirty, lastSavedAt)}
            </StatusPill>
          </div>
        </div>

        <ToolbarGroup className={styles.topbarRight}>
          <IconButton
            label="撤销"
            icon="undo"
            tone="secondary"
            onClick={undo}
            disabled={history.length === 0}
          />
          <IconButton
            label="重做"
            icon="redo"
            tone="secondary"
            onClick={redo}
            disabled={future.length === 0}
          />
          <Button type="button" tone="secondary" iconStart="export" onClick={() => exportDocumentAsJson(document)}>
            导出 JSON
          </Button>
          <Button type="button" tone="primary" iconStart="export" onClick={() => void handleExportPng()}>
            导出 PNG
          </Button>
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
              className={styles.leftSidebar}
              onSelect={handleHierarchySelect}
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
                  className={styles.drawerPanel}
                  mode="drawer"
                  onSelect={handleHierarchySelect}
                  onPrimaryAction={() => addChild(activeTopicId ?? document.rootTopicId)}
                  onCollapse={closeLeftSidebar}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div className={styles.canvasColumn}>
          <div className={styles.canvasToolbar}>
            <ToolbarGroup className={styles.canvasHint}>
              <StatusPill tone="soft">Canvas</StatusPill>
              <span>左键框选可直接建立多选</span>
              <span>按住 Space 拖动画布</span>
            </ToolbarGroup>
            <Button type="button" tone="secondary" iconStart="fitView" onClick={() => void handleFitView()}>
              适应视图
            </Button>
          </div>

          <div ref={canvasRef} className={styles.canvasFrame}>
            <ReactFlow
              nodes={nodes}
              edges={layout.renderEdges}
              nodeTypes={nodeTypes}
              nodesConnectable={false}
              panOnDrag={isSpacePressed}
              selectionOnDrag
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              zoomOnScroll
              zoomOnDoubleClick={false}
              onInit={(instance) => {
                reactFlowRef.current = instance
                setReactFlowInstance(instance)
              }}
              onNodesChange={(changes) => {
                onNodesChange(changes)
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
            renderRightSidebar('docked', styles.rightSidebar, closeRightSidebar)
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
