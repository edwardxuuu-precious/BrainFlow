import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiMessage, CodexSettings, CodexStatus } from '../../../../shared/ai-contract'
import { AiSidebar } from './AiSidebar'

const readyStatus: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '完整系统提示词摘要',
  systemPromptVersion: 'abc123',
  systemPrompt: 'system prompt full text',
}

const settings: CodexSettings = {
  businessPrompt: '用自然语言理解用户，并把有效改动直接落到脑图里。',
  updatedAt: 1,
  version: 'settings-v1',
}

function renderSidebar(overrides?: Partial<ComponentProps<typeof AiSidebar>>) {
  const props: ComponentProps<typeof AiSidebar> = {
    selectedTopics: [{ topicId: 'topic_1', title: '中心主题', isActive: true }],
    sessionList: [
      {
        documentId: 'doc_1',
        documentTitle: '测试脑图',
        sessionId: 'session_default',
        title: '新对话',
        updatedAt: 1,
        archivedAt: null,
      },
    ],
    activeSessionId: 'session_default',
    archivedSessions: [],
    status: readyStatus,
    statusError: null,
    statusFeedback: null,
    settings,
    settingsError: null,
    runStage: 'idle',
    streamingStatusText: '',
    messages: [
      {
        id: 'msg_1',
        role: 'assistant',
        content: '这里是一条 AI 回答。',
        createdAt: 1,
      } satisfies AiMessage,
    ],
    streamingText: '',
    error: null,
    lastExecutionError: null,
    draft: '',
    isSending: false,
    isCheckingStatus: false,
    isLoadingSettings: false,
    isSavingSettings: false,
    isLoadingArchivedSessions: false,
    lastAppliedSummary: null,
    canUndoLastApplied: false,
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onUndoLastApplied: vi.fn(),
    onRevalidate: vi.fn(),
    onLoadSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onResetSettings: vi.fn(),
    onLoadArchivedSessions: vi.fn(),
    onCreateSession: vi.fn(),
    onSwitchSession: vi.fn(),
    onArchiveSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRestoreArchivedSession: vi.fn(),
    onDeleteArchivedSession: vi.fn(),
    ...overrides,
  }

  render(<AiSidebar {...props} />)
  return props
}

describe('AiSidebar', () => {
  it('renders focus chips and messages, and can check codex status', async () => {
    const props = renderSidebar()

    expect(screen.getByText('这里是一条 AI 回答。')).toBeInTheDocument()
    expect(screen.getByText('中心主题')).toBeInTheDocument()
    expect(screen.getByText('整张脑图')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '检查状态' }))
    expect(props.onRevalidate).toHaveBeenCalledTimes(1)
  })

  it('auto expands service remediation and shows service-specific composer copy', () => {
    renderSidebar({
      selectedTopics: [],
      status: null,
      statusError: '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。',
    })

    expect(screen.getByText('当前未连接到本机 Codex 服务，AI 发送能力已暂停。')).toBeInTheDocument()
    expect(
      screen.getByText('本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查服务' })).toBeInTheDocument()
    expect(screen.getByText('本机 Codex 服务未连接，请先运行 pnpm dev 或 pnpm dev:server。')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('当前无法发送，请先启动本机 Codex 服务。')).toBeDisabled()
    expect(
      screen.getByText('完整日志请查看本地启动终端或 bridge 输出，本页不展示原始日志内容。'),
    ).toBeInTheDocument()
  })

  it('shows verification remediation when codex needs verification', () => {
    renderSidebar({
      status: {
        ...readyStatus,
        ready: false,
        loggedIn: false,
        issues: [{ code: 'verification_required', message: '请重新验证。' }],
      },
    })

    expect(screen.getByText('当前 Codex 验证信息不可用，修复登录或订阅后才能继续发送。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新验证' })).toBeInTheDocument()
    expect(screen.getByText('当前 Codex 需要重新验证，请运行 codex login --device-auth 后再试。')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('当前无法发送，请先完成 Codex 重新验证。')).toBeDisabled()
  })

  it('shows execution failures separately from the ready status', () => {
    renderSidebar({
      statusFeedback: {
        tone: 'success',
        message: '已重新检查，本机 Codex 当前可用。',
      },
      lastExecutionError: {
        code: 'schema_invalid',
        message: '本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。',
      },
    })

    expect(screen.getByText('已重新检查，本机 Codex 当前可用。')).toBeInTheDocument()
    expect(screen.getByText('最近一次执行失败')).toBeInTheDocument()
    expect(screen.getByText(/这不是登录问题，重新验证不会解决/)).toBeInTheDocument()
    expect(screen.getByText('本地 AI bridge 格式错误')).toBeInTheDocument()
  })

  it('allows toggling status details while checking without revalidating again', async () => {
    const props = renderSidebar({
      isCheckingStatus: true,
    })

    expect(
      screen.getByText('已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '检查中' }))

    expect(props.onRevalidate).not.toHaveBeenCalled()
    expect(
      screen.queryByText('已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。'),
    ).not.toBeInTheDocument()
  })

  it('shows the last applied summary and supports undo', async () => {
    const props = renderSidebar({
      lastAppliedSummary: '已新增 5 个 GTM 子主题',
      canUndoLastApplied: true,
    })

    expect(screen.getByLabelText('最近已应用改动')).toBeInTheDocument()
    expect(screen.getByText('已新增 5 个 GTM 子主题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(props.onUndoLastApplied).toHaveBeenCalledTimes(1)
  })

  it('opens the settings dialog and saves prompt changes', async () => {
    const props = renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: 'AI 设置' }))
    expect(screen.getByRole('dialog', { name: 'AI 全局设置' })).toBeInTheDocument()

    const editor = screen.getByRole('textbox', { name: '业务 Prompt 编辑器' })
    await userEvent.clear(editor)
    await userEvent.type(editor, '新的业务 Prompt')
    await userEvent.click(screen.getByRole('button', { name: '保存并立刻生效' }))

    expect(props.onSaveSettings).toHaveBeenCalledWith('新的业务 Prompt')
  })

})
