import { ReactFlow, type ReactFlowInstance, useNodesState } from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TopicNode } from '../../components/topic-node/TopicNode'
import {
  documentService,
  setRecentDocumentId,
} from '../../features/documents/document-service'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { PropertiesPanel } from '../../features/editor/components/PropertiesPanel'
import { useEditorStore } from '../../features/editor/editor-store'
import { exportCanvasAsPng, exportDocumentAsJson } from '../../features/editor/exporters'
import { layoutMindMap, type MindMapFlowNode } from '../../features/editor/layout'
import { getTopicLayout } from '../../features/editor/tree-operations'
import { useEditorShortcuts } from '../../features/editor/use-editor-shortcuts'
import styles from './MapEditorPage.module.css'

interface MapEditorPageProps {
  service?: DocumentService
}

const SAVE_DEBOUNCE_MS = 320
const nodeTypes = { topic: TopicNode }

interface DragSnapshot {
  topicId: string
  positions: Map<string, { x: number; y: number }>
  movingIds: Set<string>
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
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)
  const nodesRef = useRef<MindMapFlowNode[]>([])
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<MindMapFlowNode> | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<MindMapFlowNode>([])

  const document = useEditorStore((state) => state.document)
  const selectedTopicId = useEditorStore((state) => state.selectedTopicId)
  const history = useEditorStore((state) => state.history)
  const future = useEditorStore((state) => state.future)
  const isDirty = useEditorStore((state) => state.isDirty)
  const lastSavedAt = useEditorStore((state) => state.lastSavedAt)
  const setDocument = useEditorStore((state) => state.setDocument)
  const setSelectedTopicId = useEditorStore((state) => state.setSelectedTopicId)
  const startEditing = useEditorStore((state) => state.startEditing)
  const renameDocument = useEditorStore((state) => state.renameDocument)
  const addChild = useEditorStore((state) => state.addChild)
  const addSibling = useEditorStore((state) => state.addSibling)
  const updateNote = useEditorStore((state) => state.updateNote)
  const removeTopic = useEditorStore((state) => state.removeTopic)
  const setBranchSide = useEditorStore((state) => state.setBranchSide)
  const setTopicOffset = useEditorStore((state) => state.setTopicOffset)
  const resetTopicOffset = useEditorStore((state) => state.resetTopicOffset)
  const setViewport = useEditorStore((state) => state.setViewport)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const markDocumentSaved = useEditorStore((state) => state.markSaved)

  useEditorShortcuts()

  const layout = useMemo(() => (document ? layoutMindMap(document) : null), [document])
  const selectedTopic = selectedTopicId && document ? document.topics[selectedTopicId] ?? null : null
  const isRoot = !!document && selectedTopicId === document.rootTopicId
  const isFirstLevel = !!selectedTopic && selectedTopic.parentId === document?.rootTopicId

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
    if (!document || !isDirty) {
      return
    }

    const timeoutId = window.setTimeout(async () => {
      await service.saveDocument(document)
      markDocumentSaved()
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [document, isDirty, markDocumentSaved, service])

  useEffect(() => {
    if (!layout || dragSnapshotRef.current) {
      return
    }

    setNodes(
      layout.renderNodes.map((node) => ({
        ...node,
        selected: node.id === selectedTopicId,
      })),
    )
  }, [layout, selectedTopicId, setNodes])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    if (!reactFlowInstance || !document || !layout) {
      return
    }

    if (initializedViewportRef.current === document.id) {
      return
    }

    initializedViewportRef.current = document.id
    window.requestAnimationFrame(() => {
      const viewport = document.viewport
      if (viewport.zoom !== 1 || viewport.x !== 0 || viewport.y !== 0) {
        reactFlowInstance.setViewport(viewport, { duration: 0 })
      } else {
        reactFlowInstance.fitView({ padding: 0.24, duration: 0 })
      }
    })
  }, [document, layout, reactFlowInstance])

  useEffect(() => {
    const resetSpaceMode = () => setIsSpacePressed(false)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isTypingElement(event.target)) {
        return
      }

      event.preventDefault()
      setIsSpacePressed(true)
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', resetSpaceMode)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', resetSpaceMode)
    }
  }, [])

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

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <button type="button" className={styles.ghostButton} onClick={() => navigate('/')}>
            返回文档
          </button>
          <div className={styles.titleWrap}>
            <input
              className={styles.titleInput}
              value={document.title}
              aria-label="脑图标题"
              onChange={(event) => renameDocument(event.target.value)}
            />
            <span className={styles.saveState}>{formatSaveState(isDirty, lastSavedAt)}</span>
          </div>
        </div>

        <div className={styles.topbarRight}>
          <button type="button" className={styles.ghostButton} onClick={undo} disabled={history.length === 0}>
            撤销
          </button>
          <button type="button" className={styles.ghostButton} onClick={redo} disabled={future.length === 0}>
            重做
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => exportDocumentAsJson(document)}>
            导出 JSON
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void handleExportPng()}>
            导出 PNG
          </button>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.canvasColumn}>
          <div className={styles.canvasToolbar}>
            <div className={styles.canvasHint}>
              <span>拖拽节点可微调位置</span>
              <span>按住 Space 拖动画布</span>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => void handleFitView()}>
              适应视图
            </button>
          </div>

          <div ref={canvasRef} className={styles.canvasFrame}>
            <ReactFlow
              nodes={nodes}
              edges={layout.renderEdges}
              nodeTypes={nodeTypes}
              nodesConnectable={false}
              panOnDrag={isSpacePressed}
              selectionOnDrag={false}
              zoomOnScroll
              zoomOnDoubleClick={false}
              onInit={(instance) => {
                reactFlowRef.current = instance
                setReactFlowInstance(instance)
              }}
              onNodesChange={onNodesChange}
              onPaneClick={() => setSelectedTopicId(null)}
              onNodeClick={(_, node) => setSelectedTopicId(node.id)}
              onNodeDragStart={(_, node) => {
                dragSnapshotRef.current = {
                  topicId: node.id,
                  positions: new Map(layout.renderNodes.map((item) => [item.id, { ...item.position }])),
                  movingIds: collectSubtreeIds(document, node.id),
                }
                setSelectedTopicId(node.id)
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
                      selected: currentNode.id === selectedTopicId,
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
                setViewport(viewport)
              }}
              fitView={false}
            />
          </div>
        </div>

        <aside className={styles.inspector}>
          <PropertiesPanel
            topic={selectedTopic}
            isRoot={isRoot}
            isFirstLevel={isFirstLevel}
            onRename={() => selectedTopicId && startEditing(selectedTopicId)}
            onAddChild={() => selectedTopicId && addChild(selectedTopicId)}
            onAddSibling={() => selectedTopicId && addSibling(selectedTopicId)}
            onDelete={() => selectedTopicId && removeTopic(selectedTopicId)}
            onNoteChange={(note) => selectedTopicId && updateNote(selectedTopicId, note)}
            onBranchSideChange={(side) => selectedTopicId && setBranchSide(selectedTopicId, side)}
            onResetPosition={() => selectedTopicId && resetTopicOffset(selectedTopicId)}
          />
        </aside>
      </section>
    </main>
  )
}
