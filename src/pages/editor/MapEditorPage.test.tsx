import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AiConversation, CodexSettings, CodexStatus } from '../../../shared/ai-contract'
import { fetchCodexStatus } from '../../features/ai/ai-client'
import { resetAiStore, seedAiConversation } from '../../features/ai/ai-store'
import { createMindMapDocument } from '../../features/documents/document-factory'
import type { DocumentService, MindMapDocument } from '../../features/documents/types'
import { resetEditorStore } from '../../features/editor/editor-store'
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

vi.mock('@xyflow/react', async () => {
  const React = await import('react')

  function ReactFlowMock(props: { onInit?: (instance: unknown) => void }) {
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

    return <div data-testid="react-flow-canvas" />
  }

  return {
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
      return [nodes, setNodes, vi.fn()]
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

describe('MapEditorPage', () => {
  beforeEach(() => {
    resetEditorStore()
    resetAiStore()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    })
    window.dispatchEvent(new Event('resize'))
  })

  it('switches between details, markers, format and AI from the top toolbar without shared sidebar tabs', async () => {
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

    const detailButton = await screen.findByRole('button', { name: '详情' })
    if (!screen.queryByRole('heading', { name: '节点详情' })) {
      await userEvent.click(detailButton)
    }
    expect(screen.getByRole('heading', { name: '节点详情' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Root focus' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '标记' }))
    expect(screen.getByRole('heading', { name: '节点标记' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重点' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '格式' }))
    expect(screen.getByRole('heading', { name: '样式与画布' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '画布' }))
    expect(screen.getByRole('button', { name: 'Cupertino Slate' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'AI' }))

    await screen.findByText('Launch plan')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '智能协作' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: '节点详情' })).not.toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'AI' }))

    await waitFor(() => {
      expect(screen.queryByText('Launch plan')).not.toBeInTheDocument()
    })

    await userEvent.click(detailButton)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '节点详情' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Root focus' })).toBeInTheDocument()
    })
  })

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

    const titleDisplay = await screen.findByRole('button', { name: '画布名称：Canvas title' })
    expect(screen.queryByRole('textbox', { name: '编辑画布名称' })).not.toBeInTheDocument()

    await userEvent.dblClick(titleDisplay)

    const titleInput = screen.getByRole('textbox', { name: '编辑画布名称' })
    expect(titleInput).toHaveValue('Canvas title')
    expect(titleInput).toHaveFocus()
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

    await screen.findByRole('button', { name: 'AI' })
    await waitFor(() => expect(vi.mocked(fetchCodexStatus).mock.calls.length).toBeGreaterThan(0))
    const initialCallCount = vi.mocked(fetchCodexStatus).mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await screen.findByRole('button', { name: '重新检查服务' })
    const stabilizedCallCount = vi.mocked(fetchCodexStatus).mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(stabilizedCallCount).toBeGreaterThanOrEqual(initialCallCount)
    expect(vi.mocked(fetchCodexStatus)).toHaveBeenCalledTimes(stabilizedCallCount)
  })
})
