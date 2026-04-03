import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodexSettings, CodexStatus } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import { resetEditorStore, useEditorStore } from '../editor/editor-store'

vi.mock('./ai-client', () => ({
  fetchCodexStatus: vi.fn(),
  revalidateCodexStatus: vi.fn(),
  fetchCodexSettings: vi.fn(),
  saveCodexSettings: vi.fn(),
  resetCodexSettings: vi.fn(),
  streamCodexChat: vi.fn(),
}))

vi.mock('./ai-storage', () => ({
  createEmptyConversation: (documentId: string, documentTitle: string, sessionId = 'session_default') => ({
    documentId,
    documentTitle,
    sessionId,
    title: '新对话',
    archivedAt: null,
    messages: [],
    updatedAt: 0,
  }),
  getAiConversation: vi.fn(),
  listAiSessions: vi.fn(),
  listArchivedAiSessions: vi.fn(),
  archiveAiConversation: vi.fn(),
  restoreAiConversation: vi.fn(),
  deleteAiConversation: vi.fn(),
  saveAiConversation: vi.fn(),
}))

import {
  fetchCodexSettings,
  fetchCodexStatus,
  revalidateCodexStatus,
  resetCodexSettings,
  saveCodexSettings,
  streamCodexChat,
} from './ai-client'
import { getAiConversation, saveAiConversation } from './ai-storage'
import { resetAiStore, useAiStore } from './ai-store'
import { listAiSessions, listArchivedAiSessions } from './ai-storage'

const readyStatus: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: 'summary',
  systemPromptVersion: 'version',
  systemPrompt: 'full prompt',
}

const settings: CodexSettings = {
  businessPrompt: 'business prompt',
  updatedAt: 1,
  version: 'settings-v1',
}

describe('ai-store', () => {
  beforeEach(() => {
    resetAiStore()
    resetEditorStore()
    vi.clearAllMocks()

    vi.mocked(fetchCodexStatus).mockResolvedValue(readyStatus)
    vi.mocked(revalidateCodexStatus).mockResolvedValue(readyStatus)
    vi.mocked(fetchCodexSettings).mockResolvedValue(settings)
    vi.mocked(saveCodexSettings).mockResolvedValue(settings)
    vi.mocked(resetCodexSettings).mockResolvedValue(settings)
    vi.mocked(listAiSessions).mockResolvedValue([
      {
        documentId: 'doc_1',
        documentTitle: '测试脑图',
        sessionId: 'session_default',
        title: '新对话',
        updatedAt: 0,
        archivedAt: null,
      },
    ])
    vi.mocked(listArchivedAiSessions).mockResolvedValue([])
    vi.mocked(getAiConversation).mockResolvedValue({
      documentId: 'doc_1',
      documentTitle: '测试脑图',
      sessionId: 'session_default',
      title: '新对话',
      archivedAt: null,
      messages: [],
      updatedAt: 0,
    })
    vi.mocked(saveAiConversation).mockResolvedValue(undefined)
  })

  it('does not revalidate status when codex chat fails with schema_invalid', async () => {
    const document = createMindMapDocument()
    useEditorStore.getState().setDocument(document)
    useAiStore.setState({
      documentId: document.id,
      documentTitle: document.title,
      activeSessionId: 'session_default',
      activeSessionTitle: '新对话',
      sessionList: [
        {
          documentId: document.id,
          documentTitle: document.title,
          sessionId: 'session_default',
          title: '新对话',
          updatedAt: 0,
          archivedAt: null,
        },
      ],
      messages: [],
      status: readyStatus,
      statusError: null,
      statusFeedback: null,
      error: null,
      lastExecutionError: null,
    })

    vi.mocked(streamCodexChat).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'error',
        code: 'schema_invalid',
        message:
          '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。这不是登录问题，重新验证不会解决，请修复应用端格式后再试。',
      })
    })

    await useAiStore.getState().sendMessage(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      '帮我做一个 GTM 计划',
    )

    expect(vi.mocked(revalidateCodexStatus)).not.toHaveBeenCalled()
    expect(useAiStore.getState().lastExecutionError).toEqual(
      expect.objectContaining({
        code: 'schema_invalid',
      }),
    )
  })

  it('revalidates status for verification failures and stores a visible success feedback', async () => {
    const document = createMindMapDocument()
    useEditorStore.getState().setDocument(document)
    useAiStore.setState({
      documentId: document.id,
      documentTitle: document.title,
      activeSessionId: 'session_default',
      activeSessionTitle: '新对话',
      sessionList: [
        {
          documentId: document.id,
          documentTitle: document.title,
          sessionId: 'session_default',
          title: '新对话',
          updatedAt: 0,
          archivedAt: null,
        },
      ],
      messages: [],
      status: readyStatus,
      statusError: null,
      statusFeedback: null,
      error: null,
      lastExecutionError: null,
    })

    vi.mocked(streamCodexChat).mockImplementation(async (_request, onEvent) => {
      onEvent({
        type: 'error',
        code: 'verification_required',
        message: '当前 Codex 验证信息不可用，请尽快重新验证。',
      })
    })

    await useAiStore.getState().sendMessage(
      document,
      {
        activeTopicId: document.rootTopicId,
        selectedTopicIds: [document.rootTopicId],
      },
      '帮我做一个 GTM 计划',
    )

    await waitFor(() => {
      expect(vi.mocked(revalidateCodexStatus)).toHaveBeenCalledTimes(1)
      expect(useAiStore.getState().statusFeedback).toEqual({
        tone: 'success',
        message: '已重新验证，本机 Codex 当前可用。',
      })
    })
  })

  it('stores a success feedback when checking status while codex is already ready', async () => {
    await useAiStore.getState().refreshStatus()

    expect(useAiStore.getState().statusFeedback).toEqual({
      tone: 'success',
      message: '已重新检查，本机 Codex 当前可用。',
    })
  })
})
