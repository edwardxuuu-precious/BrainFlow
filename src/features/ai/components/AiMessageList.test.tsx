import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiMessage } from '../../../../shared/ai-contract'
import { AiMessageList } from './AiMessageList'

const baseProps = {
  runStage: 'idle' as const,
  streamingStatusText: '',
  error: null,
  executionError: null,
}

describe('AiMessageList', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
  })

  it('scrolls the completed assistant reply back to its start after streaming finishes', async () => {
    const scrollIntoViewMock = vi.mocked(HTMLElement.prototype.scrollIntoView)
    const userMessage: AiMessage = {
      id: 'msg_user',
      role: 'user',
      content: '请帮我整理一个完整方案',
      createdAt: 1,
    }

    const { rerender } = render(
      <AiMessageList
        {...baseProps}
        messages={[userMessage]}
        streamingText={'第一部分\n第二部分\n第三部分'}
      />,
    )

    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    rerender(
      <AiMessageList
        {...baseProps}
        runStage="completed"
        messages={[
          userMessage,
          {
            id: 'msg_assistant',
            role: 'assistant',
            content: '第一部分\n第二部分\n第三部分',
            createdAt: 2,
          },
        ]}
        streamingText=""
      />,
    )

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'start' })
    })
  })

  it('renders provider-specific execution titles for non-codex failures', () => {
    const userMessage: AiMessage = {
      id: 'msg_user',
      role: 'user',
      content: '请继续整理当前结构',
      createdAt: 1,
    }

    const { getByText } = render(
      <AiMessageList
        {...baseProps}
        messages={[userMessage]}
        streamingText=""
        providerType="kimi-code"
        executionError={{
          code: 'request_failed',
          message: 'Kimi Code 接口当前不支持此接入方式。',
          providerType: 'kimi-code',
        }}
      />,
    )

    expect(getByText('Kimi Code 执行失败')).toBeInTheDocument()
    expect(getByText('Kimi Code 接口当前不支持此接入方式。')).toBeInTheDocument()
  })
})
