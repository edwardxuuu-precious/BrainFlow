import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType, CSSProperties } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AiConversation, CodexSettings, CodexStatus } from '../../../shared/ai-contract'
import { fetchCodexStatus } from '../../features/ai/ai-client'
import { resetAiStore, seedAiConversation } from '../../features/ai/ai-store'
import { createMindMapDocument } from '../../features/documents/document-factory'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { resetEditorStore, useEditorStore } from '../../features/editor/editor-store'
import { MapEditorPage } from './MapEditorPage'

const readyStatus: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: 'ready',
  systemPromptVersion: 'v1',
  systemPrompt: 'system prompt',
}

const settings: CodexSettings = {
  businessPrompt: 'Default prompt',
  updatedAt: 1,
  version: 'settings-v1',
}

const reactFlowTesting = vi.hoisted(() => ({
  handleNodesChange: null as ((changes: unknown[]) => void) | null,
  handleSelectionStart: null as ((event: unknown) => void) | null,
  handleSelectionChange: null as ((payload: { nodes: Array<{ id: string }> }) => void) | null,
  handleSelectionEnd: null as ((event: unknown) => void) | null,
  lastOnSelectionStart: undefined as ((event: unknown) => void) | undefined,
  lastOnSelectionChange: undefined as ((payload: { nodes: Array<{ id: string }> }) => void) | undefined,
  lastOnSelectionEnd: undefined as ((event: unknown) => void) | undefined,
  lastOnPaneClick: undefined as (() => void) | undefined,
  lastOnNodeDragStart: undefined as ((event: unknown, node: unknown) => void) | undefined,
  lastOnNodeDrag: undefined as ((event: unknown, node: unknown) => void) | undefined,
  lastOnNodeDragStop: undefined as ((event: unknown, node: unknown) => void) | undefined,
  lastOnMoveEnd: undefined as ((event: unknown, viewport: unknown) => void) | undefined,
  lastPanOnDrag: undefined as boolean | readonly number[] | undefined,
  lastMultiSelectionKeyCode: undefined as string | readonly string[] | null | undefined,
  lastProOptions: undefined as { hideAttribution?: boolean } | undefined,
  onSelectionStartRefChanges: 0,
  onSelectionChangeRefChanges: 0,
  onSelectionEndRefChanges: 0,
  onPaneClickRefChanges: 0,
  onNodeDragStartRefChanges: 0,
  onNodeDragRefChanges: 0,
  onNodeDragStopRefChanges: 0,
  onMoveEndRefChanges: 0,
  panOnDragRefChanges: 0,
  multiSelectionKeyCodeRefChanges: 0,
  proOptionsRefChanges: 0,
  onNodesChangeMock: vi.fn(),
}))

const textImportTesting = vi.hoisted(() => ({
  lastDialogProps: null as Record<string, unknown> | null,
  state: {
    open: vi.fn(),
    close: vi.fn(),
    resetSession: vi.fn(),
    previewFiles: vi.fn(),
    previewText: vi.fn(),
    setDraftSourceName: vi.fn(),
    setDraftText: vi.fn(),
    planningSummaries: [],
    presetOverride: null,
    setPresetOverride: vi.fn(),
    archetypeOverride: null,
    rerunPreviewWithPreset: vi.fn(),
    setArchetypeOverride: vi.fn(),
    rerunPreviewWithArchetype: vi.fn(),
    toggleConflictApproval: vi.fn(),
    confirmDraft: vi.fn(),
    renamePreviewNode: vi.fn(),
    promotePreviewNode: vi.fn(),
    demotePreviewNode: vi.fn(),
    deletePreviewNode: vi.fn(),
    applyPreview: vi.fn(),
    isOpen: false,
    sourceName: '',
    sourceType: 'text',
    sourceFiles: [],
    rawText: '',
    draftSourceName: '',
    draftText: '',
    preprocessedHints: [],
    preview: null,
    draftTree: [],
    previewTree: [],
    draftConfirmed: false,
    crossFileMergeSuggestions: [],
    approvedConflictIds: [],
    statusText: '',
    progress: 0,
    progressIndeterminate: false,
    activeJobMode: null,
    activeJobType: null,
    fileCount: 0,
    completedFileCount: 0,
    currentFileName: null,
    semanticMergeStage: null,
    semanticCandidateCount: 0,
    semanticAdjudicatedCount: 0,
    semanticFallbackCount: 0,
    modeHint: null,
    error: null,
    isPreviewing: false,
    isApplying: false,
    previewStartedAt: null,
    previewFinishedAt: null,
    applyProgress: 0,
    appliedCount: 0,
    totalOperations: 0,
    currentApplyLabel: null,
  },
}))

vi.mock('@xyflow/react', async () => {
  const React = await import('react')

  function ReactFlowMock(props: {
    onInit?: (instance: unknown) => void
    nodes?: Array<{
      id: string
      type?: string
      data: unknown
      position: { x: number; y: number }
      style?: CSSProperties
      selected?: boolean
    }>
    nodeTypes?: Record<string, ComponentType<Record<string, unknown>>>
    onNodesChange?: (changes: unknown[]) => void
    onSelectionStart?: (event: unknown) => void
    onSelectionChange?: (payload: { nodes: Array<{ id: string }> }) => void
    onSelectionEnd?: (event: unknown) => void
    onPaneClick?: () => void
    onNodeDragStart?: (event: unknown, node: unknown) => void
    onNodeDrag?: (event: unknown, node: unknown) => void
    onNodeDragStop?: (event: unknown, node: unknown) => void
    onMoveEnd?: (event: unknown, viewport: unknown) => void
    panOnDrag?: boolean | readonly number[]
    multiSelectionKeyCode?: string | readonly string[] | null
    proOptions?: { hideAttribution?: boolean }
  }) {
    if (
      reactFlowTesting.lastOnSelectionStart !== undefined &&
      reactFlowTesting.lastOnSelectionStart !== props.onSelectionStart
    ) {
      reactFlowTesting.onSelectionStartRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnSelectionChange !== undefined &&
      reactFlowTesting.lastOnSelectionChange !== props.onSelectionChange
    ) {
      reactFlowTesting.onSelectionChangeRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnSelectionEnd !== undefined &&
      reactFlowTesting.lastOnSelectionEnd !== props.onSelectionEnd
    ) {
      reactFlowTesting.onSelectionEndRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnPaneClick !== undefined &&
      reactFlowTesting.lastOnPaneClick !== props.onPaneClick
    ) {
      reactFlowTesting.onPaneClickRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnNodeDragStart !== undefined &&
      reactFlowTesting.lastOnNodeDragStart !== props.onNodeDragStart
    ) {
      reactFlowTesting.onNodeDragStartRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnNodeDrag !== undefined &&
      reactFlowTesting.lastOnNodeDrag !== props.onNodeDrag
    ) {
      reactFlowTesting.onNodeDragRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnNodeDragStop !== undefined &&
      reactFlowTesting.lastOnNodeDragStop !== props.onNodeDragStop
    ) {
      reactFlowTesting.onNodeDragStopRefChanges += 1
    }
    if (
      reactFlowTesting.lastOnMoveEnd !== undefined &&
      reactFlowTesting.lastOnMoveEnd !== props.onMoveEnd
    ) {
      reactFlowTesting.onMoveEndRefChanges += 1
    }
    if (
      reactFlowTesting.lastPanOnDrag !== undefined &&
      reactFlowTesting.lastPanOnDrag !== props.panOnDrag
    ) {
      reactFlowTesting.panOnDragRefChanges += 1
    }
    if (
      reactFlowTesting.lastMultiSelectionKeyCode !== undefined &&
      reactFlowTesting.lastMultiSelectionKeyCode !== props.multiSelectionKeyCode
    ) {
      reactFlowTesting.multiSelectionKeyCodeRefChanges += 1
    }
    if (
      reactFlowTesting.lastProOptions !== undefined &&
      reactFlowTesting.lastProOptions !== props.proOptions
    ) {
      reactFlowTesting.proOptionsRefChanges += 1
    }

    reactFlowTesting.lastOnSelectionStart = props.onSelectionStart
    reactFlowTesting.lastOnSelectionChange = props.onSelectionChange
    reactFlowTesting.lastOnSelectionEnd = props.onSelectionEnd
    reactFlowTesting.lastOnPaneClick = props.onPaneClick
    reactFlowTesting.lastOnNodeDragStart = props.onNodeDragStart
    reactFlowTesting.lastOnNodeDrag = props.onNodeDrag
    reactFlowTesting.lastOnNodeDragStop = props.onNodeDragStop
    reactFlowTesting.lastOnMoveEnd = props.onMoveEnd
    reactFlowTesting.lastPanOnDrag = props.panOnDrag
    reactFlowTesting.lastMultiSelectionKeyCode = props.multiSelectionKeyCode
    reactFlowTesting.lastProOptions = props.proOptions
    reactFlowTesting.handleNodesChange = props.onNodesChange ?? null
    reactFlowTesting.handleSelectionStart = props.onSelectionStart ?? null
    reactFlowTesting.handleSelectionChange = props.onSelectionChange ?? null
    reactFlowTesting.handleSelectionEnd = props.onSelectionEnd ?? null

    React.useEffect(() => {
      props.onInit?.({
        fitView: vi.fn(),
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        setViewport: vi.fn(),
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      })
      // The real canvas only initializes the instance once on mount.
      // Keeping this stable avoids a render loop in the page test.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div
        data-testid="react-flow-canvas"
        onClick={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }

          props.onSelectionChange?.({ nodes: [] })
          props.onPaneClick?.()
        }}
      >
        {(props.nodes ?? []).map((node) => {
          const NodeComponent = node.type ? props.nodeTypes?.[node.type] : null

          if (!NodeComponent) {
            return null
          }

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={node.style}
              onClick={(event) => event.stopPropagation()}
            >
              <NodeComponent
                id={node.id}
                data={node.data}
                type={node.type}
                selected={Boolean(node.selected)}
                dragging={false}
                zIndex={0}
                isConnectable={false}
                positionAbsoluteX={node.position.x}
                positionAbsoluteY={node.position.y}
              />
            </div>
          )
        })}
      </div>
    )
  }

  return {
    Handle: () => null,
    Position: {
      Left: 'left',
      Right: 'right',
      Top: 'top',
      Bottom: 'bottom',
    },
    ReactFlow: ReactFlowMock,
    SelectionMode: {
      Partial: 'partial',
    },
    useNodesState: (initialNodes: unknown[] = []) => {
      const [nodes, setNodes] = React.useState(initialNodes)
      return [nodes, setNodes, reactFlowTesting.onNodesChangeMock]
    },
  }
})

vi.mock('../../features/ai/ai-client', () => ({
  fetchCodexStatus: vi.fn(async () => readyStatus),
  revalidateCodexStatus: vi.fn(async () => readyStatus),
  fetchCodexSettings: vi.fn(async () => settings),
  saveCodexSettings: vi.fn(async (businessPrompt: string) => ({
    ...settings,
    businessPrompt,
  })),
  resetCodexSettings: vi.fn(async () => settings),
  streamCodexChat: vi.fn(),
}))

vi.mock('../../features/import/components/TextImportDialog', () => ({
  TextImportDialog: (props: { open: boolean; onApply: () => void }) => {
    textImportTesting.lastDialogProps = props as unknown as Record<string, unknown>
    if (!props.open) {
      return null
    }

    return (
      <button type="button" onClick={props.onApply}>
        mock apply import
      </button>
    )
  },
}))

vi.mock('../../features/import/text-import-store', () => {
  return {
    useTextImportStore: <T,>(selector: (store: typeof textImportTesting.state) => T) =>
      selector(textImportTesting.state),
  }
})

vi.mock('/revert.png', () => ({ default: 'revert.png' }))
vi.mock('/content.png', () => ({ default: 'content.png' }))
vi.mock('/node.png', () => ({ default: 'node.png' }))
vi.mock('/symbol.png', () => ({ default: 'symbol.png' }))
vi.mock('/design.png', () => ({ default: 'design.png' }))
vi.mock('/agents.png', () => ({ default: 'agents.png' }))

function createService(document: MindMapDocument): DocumentService {
  return {
    createDocument: vi.fn(async () => document),
    listDocuments: vi.fn(async () => []),
    getDocument: vi.fn(async (documentId: string) => (documentId === document.id ? document : null)),
    saveDocument: vi.fn(async () => undefined),
    deleteDocument: vi.fn(async () => undefined),
    duplicateDocument: vi.fn(async () => document.id),
  }
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function countSelectedCanvasNodes(): number {
  const canvas = screen.getByTestId('react-flow-canvas')
  return canvas.querySelectorAll('[data-selected="true"]').length
}

describe('MapEditorPage', () => {
  beforeEach(() => {
    resetEditorStore()
    resetAiStore()
    textImportTesting.lastDialogProps = null
    Object.assign(textImportTesting.state, {
      planningSummaries: [],
      presetOverride: null,
      archetypeOverride: null,
      isOpen: false,
      sourceName: '',
      sourceType: 'text',
      sourceFiles: [],
      rawText: '',
      draftSourceName: '',
      draftText: '',
      preprocessedHints: [],
      preview: null,
      draftTree: [],
      previewTree: [],
      draftConfirmed: false,
      crossFileMergeSuggestions: [],
      approvedConflictIds: [],
      statusText: '',
      progress: 0,
      progressIndeterminate: false,
      activeJobMode: null,
      activeJobType: null,
      fileCount: 0,
      completedFileCount: 0,
      currentFileName: null,
      semanticMergeStage: null,
      semanticCandidateCount: 0,
      semanticAdjudicatedCount: 0,
      semanticFallbackCount: 0,
      modeHint: null,
      error: null,
      isPreviewing: false,
      isApplying: false,
      previewStartedAt: null,
      previewFinishedAt: null,
      applyProgress: 0,
      appliedCount: 0,
      totalOperations: 0,
      currentApplyLabel: null,
    })
    textImportTesting.state.open.mockReset()
    textImportTesting.state.close.mockReset()
    textImportTesting.state.resetSession.mockReset()
    textImportTesting.state.previewFiles.mockReset()
    textImportTesting.state.previewText.mockReset()
    textImportTesting.state.setDraftSourceName.mockReset()
    textImportTesting.state.setDraftText.mockReset()
    textImportTesting.state.setPresetOverride.mockReset()
    textImportTesting.state.rerunPreviewWithPreset.mockReset()
    textImportTesting.state.setArchetypeOverride.mockReset()
    textImportTesting.state.rerunPreviewWithArchetype.mockReset()
    textImportTesting.state.toggleConflictApproval.mockReset()
    textImportTesting.state.confirmDraft.mockReset()
    textImportTesting.state.renamePreviewNode.mockReset()
    textImportTesting.state.promotePreviewNode.mockReset()
    textImportTesting.state.demotePreviewNode.mockReset()
    textImportTesting.state.deletePreviewNode.mockReset()
    textImportTesting.state.applyPreview.mockReset()
    reactFlowTesting.handleNodesChange = null
    reactFlowTesting.handleSelectionStart = null
    reactFlowTesting.handleSelectionChange = null
    reactFlowTesting.handleSelectionEnd = null
    reactFlowTesting.lastOnSelectionStart = undefined
    reactFlowTesting.lastOnSelectionChange = undefined
    reactFlowTesting.lastOnSelectionEnd = undefined
    reactFlowTesting.lastOnPaneClick = undefined
    reactFlowTesting.lastOnNodeDragStart = undefined
    reactFlowTesting.lastOnNodeDrag = undefined
    reactFlowTesting.lastOnNodeDragStop = undefined
    reactFlowTesting.lastOnMoveEnd = undefined
    reactFlowTesting.lastPanOnDrag = undefined
    reactFlowTesting.lastMultiSelectionKeyCode = undefined
    reactFlowTesting.lastProOptions = undefined
    reactFlowTesting.onSelectionStartRefChanges = 0
    reactFlowTesting.onSelectionChangeRefChanges = 0
    reactFlowTesting.onSelectionEndRefChanges = 0
    reactFlowTesting.onPaneClickRefChanges = 0
    reactFlowTesting.onNodeDragStartRefChanges = 0
    reactFlowTesting.onNodeDragRefChanges = 0
    reactFlowTesting.onNodeDragStopRefChanges = 0
    reactFlowTesting.onMoveEndRefChanges = 0
    reactFlowTesting.panOnDragRefChanges = 0
    reactFlowTesting.multiSelectionKeyCodeRefChanges = 0
    reactFlowTesting.proOptionsRefChanges = 0
    reactFlowTesting.onNodesChangeMock.mockReset()
    mockMatchMedia(true)
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    })
    window.dispatchEvent(new Event('resize'))
  })

  it('switches between outline, details, markers, format and AI from the top toolbar without shared sidebar tabs', async () => {
    const document = createMindMapDocument('Editor regression')
    const rootTopic = document.topics[document.rootTopicId]
    rootTopic.title = 'Root focus'
    rootTopic.note = 'Inspector note'

    const conversation: AiConversation = {
      documentId: document.id,
      documentTitle: document.title,
      sessionId: 'session_launch',
      title: 'Launch plan',
      messages: [],
      updatedAt: 1,
      archivedAt: null,
    }

    await seedAiConversation(conversation)

    const service = createService(document)
    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    const outlineButton = await screen.findByRole('button', {
      name: /^\u76ee\u5f55 \u76ee\u5f55$/u,
    })
    const detailButton = await screen.findByRole('button', {
      name: /^\u8282\u70b9 \u8282\u70b9$/u,
    })

    await userEvent.click(outlineButton)
    expect(screen.getAllByText(/\u76ee\u5f55/u).length).toBeGreaterThan(0)
    const outlineNav = screen.getByRole('navigation', { name: /\u4e3b\u9898\u5c42\u7ea7/u })
    expect(outlineNav).toBeInTheDocument()
    const outlineTopicButton = within(outlineNav).getByText('Root focus').closest('button')
    expect(outlineTopicButton).not.toBeNull()
    await userEvent.click(outlineTopicButton!)

    if (!screen.queryByRole('heading', { name: 'Root focus' })) {
      await userEvent.click(detailButton)
    }
    expect(screen.getByRole('heading', { name: 'Root focus' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /\u663e\u793a\u5c42\u7ea7\u680f/u })).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /^\u6807\u8bb0 \u6807\u8bb0$/u }),
    )
    expect(screen.getByRole('button', { name: /\u91cd\u70b9/u })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /^\u683c\u5f0f \u683c\u5f0f$/u }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^\u753b\u5e03$/u }))
    expect(screen.getByRole('button', { name: 'Cupertino Slate' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^AI AI$/ }))

    await screen.findByText('Launch plan')

    await userEvent.click(screen.getByRole('button', { name: /^AI AI$/ }))

    await waitFor(() => {
      expect(screen.queryByText('Launch plan')).not.toBeInTheDocument()
    })

    await userEvent.click(detailButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Root focus' })).toBeInTheDocument()
    })
  }, 15000)

  it('shows the canvas title as text and enters edit mode on double click', async () => {
    const document = createMindMapDocument('Canvas title')
    const service = createService(document)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    const titleDisplay = await screen.findByRole('button', {
      name: /\u753b\u5e03\u540d\u79f0\uff1aCanvas title/u,
    })
    expect(
      screen.queryByRole('textbox', { name: /\u7f16\u8f91\u753b\u5e03\u540d\u79f0/u }),
    ).not.toBeInTheDocument()

    await userEvent.dblClick(titleDisplay)

    const titleInput = screen.getByRole('textbox', { name: /\u7f16\u8f91\u753b\u5e03\u540d\u79f0/u })
    expect(titleInput).toHaveValue('Canvas title')
    expect(titleInput).toHaveFocus()
  })

  it('syncs Ctrl+A selection into the canvas, clears on blank canvas click, and replaces stale highlights', async () => {
    const document = createMindMapDocument('Selection sync')
    const service = createService(document)
    const rootTitle = document.topics[document.rootTopicId].title
    const branchTitle = document.topics[document.topics[document.rootTopicId].childIds[0]].title

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: new RegExp(`画布名称：${document.title}`) })
    expect(countSelectedCanvasNodes()).toBe(1)

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })

    await waitFor(() => {
      expect(countSelectedCanvasNodes()).toBe(Object.keys(document.topics).length)
    })

    await userEvent.click(screen.getByTestId('react-flow-canvas'))

    await waitFor(() => {
      expect(countSelectedCanvasNodes()).toBe(0)
    })

    await userEvent.click(
      screen.getByRole('button', { name: /^\u8282\u70b9 \u8282\u70b9$/u }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^\u76ee\u5f55 \u76ee\u5f55$/u }),
    )
    const outlineNav = await screen.findByRole('navigation', { name: /\u4e3b\u9898\u5c42\u7ea7/u })
    const branchButton = within(outlineNav).getByText(branchTitle).closest('button')
    expect(branchButton).not.toBeNull()
    await userEvent.click(branchButton!)

    await waitFor(() => {
      expect(countSelectedCanvasNodes()).toBe(1)
    })
    const canvas = screen.getByTestId('react-flow-canvas')
    expect(within(canvas).getByText(rootTitle).closest('[data-selected]')).toHaveAttribute('data-selected', 'false')
    expect(within(canvas).getByText(branchTitle).closest('[data-selected]')).toHaveAttribute('data-selected', 'true')
  })

  it('defers box selection store updates until the selection gesture ends', async () => {
    const document = createMindMapDocument('Deferred box selection')
    const service = createService(document)
    const [firstId, secondId] = document.topics[document.rootTopicId].childIds
    const setSelectionSpy = vi.spyOn(useEditorStore.getState(), 'setSelection')

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: new RegExp(`画布名称：${document.title}`) })

    expect(useEditorStore.getState().selectedTopicIds).toEqual([document.rootTopicId])

    act(() => {
      reactFlowTesting.handleSelectionStart?.({
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      })
      reactFlowTesting.handleSelectionChange?.({
        nodes: [{ id: firstId }, { id: secondId }],
      })
    })

    expect(setSelectionSpy).not.toHaveBeenCalled()
    expect(useEditorStore.getState().selectedTopicIds).toEqual([document.rootTopicId])
    expect(useEditorStore.getState().activeTopicId).toBe(document.rootTopicId)

    act(() => {
      reactFlowTesting.handleSelectionEnd?.({
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
      })
    })

    await waitFor(() => {
      expect(useEditorStore.getState().selectedTopicIds).toEqual([firstId, secondId])
      expect(useEditorStore.getState().activeTopicId).toBe(secondId)
    })
    expect(setSelectionSpy).toHaveBeenCalledTimes(1)

    setSelectionSpy.mockRestore()
  })

  it('shows a recovery message instead of blanking when the document layout is invalid', async () => {
    const document = createMindMapDocument('Broken layout')
    const branchId = document.topics[document.rootTopicId].childIds[0]
    document.topics[branchId].childIds = ['missing-topic']
    const service = createService(document)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '脑图暂时无法打开' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回首页' })).toBeInTheDocument()

    consoleError.mockRestore()
  })

  it('renders the selected long topic title fully in both the canvas and inspector', async () => {
    const document = createMindMapDocument('Long title page')
    const branchId = document.topics[document.rootTopicId].childIds[0]
    const longTitle = '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment'
    document.topics[branchId].title = longTitle
    document.workspace.selectedTopicId = branchId
    const service = createService(document)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    const inspectorHeading = await screen.findByRole('heading', { name: longTitle })
    await waitFor(() => {
      expect(
        globalThis.document.querySelector(`[data-node-id="${branchId}"] [data-title-tier]`),
      ).toBeTruthy()
    })
    const resolvedCanvasTitle = globalThis.document.querySelector(
      `[data-node-id="${branchId}"] [data-title-tier]`,
    ) as HTMLElement

    expect(resolvedCanvasTitle).toHaveTextContent(longTitle)
    expect(resolvedCanvasTitle.getAttribute('data-title-tier')).toBe('small')
    expect(resolvedCanvasTitle.getAttribute('style')).toContain('--topic-title-font-size: 14px')
    expect(inspectorHeading).toHaveAttribute('data-title-tier', 'small')
    expect(inspectorHeading.getAttribute('style')).toContain('--topic-title-font-size: 14px')
  })

  it('keeps the export submenu open while interacting with the portal menu and closes it on outside click', async () => {
    const document = createMindMapDocument('Export menu')
    const service = createService(document)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByLabelText(/\u6253\u5f00\u83dc\u5355/u))
    const exportButton = await screen.findByRole('button', { name: /\u5bfc\u51fa/u })

    await userEvent.hover(exportButton)
    expect(await screen.findByRole('menu', { name: /\u5bfc\u51fa\u683c\u5f0f/u })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /JSON/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /PNG/i })).toBeInTheDocument()

    await userEvent.click(exportButton)
    expect(screen.getByRole('menu', { name: /\u5bfc\u51fa\u683c\u5f0f/u })).toBeInTheDocument()

    await userEvent.click(globalThis.document.body)

    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /\u5bfc\u51fa\u683c\u5f0f/u })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /\u5bfc\u51fa/u })).not.toBeInTheDocument()
    })
  })

  it('opens the export submenu on click when hover interactions are unavailable', async () => {
    mockMatchMedia(false)

    const document = createMindMapDocument('Touch export menu')
    const service = createService(document)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await userEvent.click(await screen.findByLabelText(/\u6253\u5f00\u83dc\u5355/u))
    const exportButton = await screen.findByRole('button', { name: /\u5bfc\u51fa/u })

    expect(screen.queryByRole('menu', { name: /\u5bfc\u51fa\u683c\u5f0f/u })).not.toBeInTheDocument()

    await userEvent.click(exportButton)

    expect(await screen.findByRole('menu', { name: /\u5bfc\u51fa\u683c\u5f0f/u })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /JSON/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /PNG/i })).toBeInTheDocument()
  })

  it('does not keep auto-refreshing codex status when the bridge is unavailable', async () => {
    const document = createMindMapDocument('Bridge down')
    const service = createService(document)
    vi.mocked(fetchCodexStatus).mockRejectedValue(new Error('bridge down'))

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: /^AI AI$/ })
    await waitFor(() => expect(vi.mocked(fetchCodexStatus).mock.calls.length).toBeGreaterThan(0))
    const initialCallCount = vi.mocked(fetchCodexStatus).mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: /^AI AI$/ }))
    await screen.findByRole('button', { name: /\u91cd\u65b0\u68c0\u67e5\u670d\u52a1/u })
    const stabilizedCallCount = vi.mocked(fetchCodexStatus).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(stabilizedCallCount).toBeGreaterThanOrEqual(initialCallCount)
    expect(vi.mocked(fetchCodexStatus)).toHaveBeenCalledTimes(stabilizedCallCount)
  })

  it('resets and closes the import session after apply succeeds', async () => {
    const document = createMindMapDocument('Import apply')
    const importedDocument = createMindMapDocument('Imported result')
    const service = createService(document)

    textImportTesting.state.isOpen = true
    textImportTesting.state.applyPreview.mockResolvedValue({
      document: importedDocument,
      selectedTopicId: importedDocument.rootTopicId,
      summary: 'Applied import preview.',
      warnings: [],
    })

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('button', { name: 'mock apply import' })
    await userEvent.click(screen.getByRole('button', { name: 'mock apply import' }))

    await waitFor(() => expect(textImportTesting.state.applyPreview).toHaveBeenCalled())
    expect(textImportTesting.state.resetSession).toHaveBeenCalledTimes(1)
    expect(textImportTesting.state.close).toHaveBeenCalledTimes(1)
  })

  it('keeps critical ReactFlow handler and config props stable across unrelated rerenders', async () => {
    const document = createMindMapDocument('Stable flow props')
    const service = createService(document)

    render(
      <MemoryRouter initialEntries={[`/map/${document.id}`]}>
        <Routes>
          <Route path="/map/:documentId" element={<MapEditorPage service={service} />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('button', {
      name: new RegExp(`画布名称：${document.title}`),
    })
    await waitFor(() => expect(vi.mocked(fetchCodexStatus).mock.calls.length).toBeGreaterThan(0))

    const baseline = {
      onSelectionStartRefChanges: reactFlowTesting.onSelectionStartRefChanges,
      onSelectionChangeRefChanges: reactFlowTesting.onSelectionChangeRefChanges,
      onSelectionEndRefChanges: reactFlowTesting.onSelectionEndRefChanges,
      onPaneClickRefChanges: reactFlowTesting.onPaneClickRefChanges,
      onNodeDragStartRefChanges: reactFlowTesting.onNodeDragStartRefChanges,
      onNodeDragRefChanges: reactFlowTesting.onNodeDragRefChanges,
      onNodeDragStopRefChanges: reactFlowTesting.onNodeDragStopRefChanges,
      onMoveEndRefChanges: reactFlowTesting.onMoveEndRefChanges,
      panOnDragRefChanges: reactFlowTesting.panOnDragRefChanges,
      multiSelectionKeyCodeRefChanges: reactFlowTesting.multiSelectionKeyCodeRefChanges,
      proOptionsRefChanges: reactFlowTesting.proOptionsRefChanges,
    }

    await userEvent.click(
      screen.getByRole('button', { name: /^\u76ee\u5f55 \u76ee\u5f55$/u }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^\u6807\u8bb0 \u6807\u8bb0$/u }),
    )
    await userEvent.click(await screen.findByLabelText(/\u6253\u5f00\u83dc\u5355/u))
    await userEvent.click(globalThis.document.body)

    expect(reactFlowTesting.onSelectionStartRefChanges).toBe(
      baseline.onSelectionStartRefChanges,
    )
    expect(reactFlowTesting.onSelectionChangeRefChanges).toBe(
      baseline.onSelectionChangeRefChanges,
    )
    expect(reactFlowTesting.onSelectionEndRefChanges).toBe(
      baseline.onSelectionEndRefChanges,
    )
    expect(reactFlowTesting.onPaneClickRefChanges).toBe(
      baseline.onPaneClickRefChanges,
    )
    expect(reactFlowTesting.onNodeDragStartRefChanges).toBe(
      baseline.onNodeDragStartRefChanges,
    )
    expect(reactFlowTesting.onNodeDragRefChanges).toBe(
      baseline.onNodeDragRefChanges,
    )
    expect(reactFlowTesting.onNodeDragStopRefChanges).toBe(
      baseline.onNodeDragStopRefChanges,
    )
    expect(reactFlowTesting.onMoveEndRefChanges).toBe(
      baseline.onMoveEndRefChanges,
    )
    expect(reactFlowTesting.panOnDragRefChanges).toBe(
      baseline.panOnDragRefChanges,
    )
    expect(reactFlowTesting.multiSelectionKeyCodeRefChanges).toBe(
      baseline.multiSelectionKeyCodeRefChanges,
    )
    expect(reactFlowTesting.proOptionsRefChanges).toBe(
      baseline.proOptionsRefChanges,
    )
  })
})
