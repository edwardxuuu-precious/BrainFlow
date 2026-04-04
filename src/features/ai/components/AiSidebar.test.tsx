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
    statusFailureKind: null,
    statusFeedback: null,
    settings,
    settingsError: null,
    runStage: 'idle',
    streamingStatusText: '',
    messages: [
      {
        id: 'msg_1',
        role: 'assistant',
        content: '这里是一条 AI 回复。',
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

    expect(screen.getByText('这里是一条 AI 回复。')).toBeInTheDocument()
    expect(screen.getByText('中心主题')).toBeInTheDocument()
    expect(screen.getByText('整张脑图')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '检查状态' }))
    expect(props.onRevalidate).toHaveBeenCalledTimes(1)
  })

  it('shows service remediation when the local bridge is unavailable', () => {
    renderSidebar({
      selectedTopics: [],
      status: null,
      statusFailureKind: 'bridge_unavailable',
      statusError: '本机 Codex bridge 无响应，请确认本机 bridge 已启动，并检查 8787 端口服务。',
    })

    expect(screen.getByText('当前未连接到本机 Codex 服务，AI 发送能力已暂停。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查服务' })).toBeInTheDocument()
    expect(screen.getByText('本机 Codex 服务未连接，请先运行 pnpm dev 或 pnpm dev:web。')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('当前无法发送，请先启动本机 Codex 服务。')).toBeDisabled()
  })

  it('shows dedicated remediation when bridge status checks fail internally', () => {
    renderSidebar({
      status: null,
      statusFailureKind: 'bridge_internal_error',
      statusError: '本机 Codex bridge 在线，但状态检查失败，请查看 bridge 日志后重试。',
    })

    expect(screen.getByText('本机 Codex bridge 在线，但状态检查失败；修复 bridge 内部错误后才能继续发送。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查状态' })).toBeInTheDocument()
    expect(screen.getByText('本机 Codex bridge 在线，但状态检查失败，请查看 bridge 日志并重新检查状态。')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('当前无法发送，请先修复状态检查失败的问题。')).toBeDisabled()
  })

  it('treats request_failed issues as internal status failures even with a 200 status payload', () => {
    renderSidebar({
      status: {
        ...readyStatus,
        ready: false,
        issues: [{ code: 'request_failed', message: '系统 Prompt 加载失败：ENOENT' }],
      },
    })

    expect(screen.getAllByText('状态检查失败')).toHaveLength(2)
    expect(screen.getByText('系统 Prompt 加载失败：ENOENT')).toBeInTheDocument()
    expect(screen.queryByText('当前 Codex 验证信息不可用，修复登录或订阅后才能继续发送。')).not.toBeInTheDocument()
  })

  it('shows dedicated remediation when bridge cannot resolve the codex cli', () => {
    renderSidebar({
      status: {
        ...readyStatus,
        cliInstalled: false,
        loggedIn: false,
        ready: false,
        authProvider: null,
        issues: [
          {
            code: 'cli_missing',
            message: 'bridge 未能从 PATH 或常见本机路径解析到 codex CLI。',
          },
        ],
      },
    })

    expect(screen.getByText('当前 bridge 没有解析到可用的本机 Codex CLI，修复命令解析后才能继续发送。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新检查 CLI' })).toBeInTheDocument()
    expect(screen.getByText('当前 bridge 未解析到本机 Codex CLI，请确认安装后重新运行 pnpm dev 或 pnpm dev:server。')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('当前无法发送，请先让 bridge 识别本机 Codex CLI。')).toBeDisabled()
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
    expect(screen.getByText(/这是应用端格式问题，不是登录问题/)).toBeInTheDocument()
    expect(screen.getAllByText('本地 AI bridge 的输出 schema 与当前 Codex CLI 不兼容。')).toHaveLength(2)
  })

  it('allows toggling status details while checking without revalidating again', async () => {
    const props = renderSidebar({
      isCheckingStatus: true,
    })

    expect(screen.getByText('已检测到本机 Codex CLI 与 ChatGPT 登录状态，可以直接基于当前脑图发起对话。')).toBeInTheDocument()

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
