import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AiProviderInfo } from '../../../../shared/ai-contract'
import { ProviderCard } from './ProviderCard'

const provider: AiProviderInfo = {
  type: 'kimi-code',
  name: 'Kimi Code',
  description: '代码模型 API',
  ready: false,
  requiresApiKey: true,
  features: {
    streaming: true,
    structuredOutput: true,
    contextInjection: true,
  },
}

describe('ProviderCard', () => {
  it('allows testing when a provider config exists even if validation is currently failing', async () => {
    const onTest = vi.fn()

    render(
      <ProviderCard
        provider={provider}
        selected={false}
        onSelect={vi.fn()}
        onTest={onTest}
        canTest
      />,
    )

    const button = screen.getByRole('button', { name: '测试连接' })
    expect(button).toBeEnabled()

    await userEvent.click(button)
    expect(onTest).toHaveBeenCalledTimes(1)
  })

  it('keeps the test button disabled when the provider is still missing configuration', () => {
    render(
      <ProviderCard
        provider={provider}
        selected={false}
        onSelect={vi.fn()}
        onTest={vi.fn()}
        canTest={false}
      />,
    )

    expect(screen.getByRole('button', { name: '测试连接' })).toBeDisabled()
  })
})
