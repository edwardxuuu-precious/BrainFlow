import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiCanvasProposal, AiMessage, CodexStatus } from '../../../../shared/ai-contract'
import { AiSidebar } from './AiSidebar'

const proposal: AiCanvasProposal = {
  id: 'proposal_1',
  summary: '补充两个子主题',
  baseDocumentUpdatedAt: 1,
  operations: [
    {
      type: 'create_child',
      parentTopicId: 'topic_1',
      title: '方向一',
    },
  ],
}

const readyStatus: CodexStatus = {
  cliInstalled: true,
  loggedIn: true,
  authProvider: 'ChatGPT',
  ready: true,
  issues: [],
  systemPromptSummary: '仅基于当前选区回答。',
  systemPromptVersion: 'abc123',
  systemPrompt: 'system prompt full text',
}

function renderSidebar(overrides?: Partial<ComponentProps<typeof AiSidebar>>) {
  const props: ComponentProps<typeof AiSidebar> = {
    selectedTopics: [{ topicId: 'topic_1', title: '中心主题', isActive: true }],
    status: readyStatus,
    statusError: null,
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
    draft: '',
    isSending: false,
    isCheckingStatus: false,
    proposal: null,
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onApplyProposal: vi.fn(),
    onDismissProposal: vi.fn(),
    onRevalidate: vi.fn(),
    resolveTopicTitle: () => '中心主题',
    ...overrides,
  }

  render(<AiSidebar {...props} />)
  return props
}

describe('AiSidebar', () => {
  it('renders selected-context chips and messages', async () => {
    const props = renderSidebar()

    expect(screen.getByText('Codex for BrainFlow')).toBeInTheDocument()
    expect(screen.getByText('这里是一条 AI 回答。')).toBeInTheDocument()
    expect(screen.getByText('中心主题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '重新验证' }))
    expect(props.onRevalidate).toHaveBeenCalledTimes(1)
  })

  it('shows proposal review and requires explicit apply', async () => {
    const props = renderSidebar({ proposal })

    expect(screen.getByLabelText('AI 提案审批')).toBeInTheDocument()
    expect(screen.getByText('补充两个子主题')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '应用到脑图' }))
    expect(props.onApplyProposal).toHaveBeenCalledTimes(1)
  })

  it('disables sending and shows remediation when codex is unavailable', () => {
    renderSidebar({
      selectedTopics: [],
      status: {
        ...readyStatus,
        ready: false,
        loggedIn: false,
        issues: [{ code: 'verification_required', message: '请重新验证。' }],
      },
    })

    expect(screen.getByText(/当前 Codex 验证信息不可用/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送给 AI' })).toBeDisabled()
  })
})
