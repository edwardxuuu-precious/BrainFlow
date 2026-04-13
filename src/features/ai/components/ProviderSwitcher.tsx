import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui'
import { getStoredWorkspaceId } from '../ai-client'
import { useAiStore } from '../ai-store'
import styles from './ProviderSwitcher.module.css'

function getProviderIcon(type: string): string {
  switch (type) {
    case 'codex':
      return '🤖'
    case 'deepseek':
      return '🧠'
    case 'kimi-code':
      return '💻'
    default:
      return '🤖'
  }
}

export function ProviderSwitcher() {
  const aiStore = useAiStore()
  const availableProviders = aiStore.availableProviders ?? []
  const currentProvider = aiStore.currentProvider ?? 'codex'
  const isLoadingProviders = aiStore.isLoadingProviders ?? false
  const providerSwitchError = aiStore.providerSwitchError ?? null
  const loadAvailableProviders = aiStore.loadAvailableProviders ?? (async () => {})
  const switchProvider = aiStore.switchProvider ?? (async () => false)
  const testProvider = aiStore.testProvider ?? (async () => false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [testStatusMap, setTestStatusMap] = useState<Record<string, 'idle' | 'success' | 'error'>>({})
  const [testErrorMap, setTestErrorMap] = useState<Record<string, string | null>>({})

  useEffect(() => {
    void loadAvailableProviders()
  }, [loadAvailableProviders])

  const handleSwitch = (type: string) => {
    switchProvider(type)
  }

  const handleTest = async (type: string) => {
    setTestingProvider(type)
    setTestStatusMap((prev) => ({ ...prev, [type]: 'idle' }))
    setTestErrorMap((prev) => ({ ...prev, [type]: null }))
    
    const valid = await testProvider(type, getStoredWorkspaceId())
    const errorMessage = useAiStore.getState().providerSwitchError
    
    setTestingProvider(null)
    
    if (valid) {
      setTestStatusMap((prev) => ({ ...prev, [type]: 'success' }))
    } else {
      setTestStatusMap((prev) => ({ ...prev, [type]: 'error' }))
      setTestErrorMap((prev) => ({ ...prev, [type]: errorMessage ?? '连接失败，请检查 API Key 配置' }))
    }
  }

  const handleClearTestStatus = (type: string) => {
    setTestStatusMap((prev) => ({ ...prev, [type]: 'idle' }))
    setTestErrorMap((prev) => ({ ...prev, [type]: null }))
  }

  if (isLoadingProviders) {
    return <div className={styles.container}>加载中...</div>
  }

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>AI Provider</h4>
      <div className={styles.list}>
        {availableProviders.map((provider) => {
          const testStatus = testStatusMap[provider.type] ?? 'idle'
          const testError = testErrorMap[provider.type] ?? null
          const showSuccess = testStatus === 'success'
          const showError = testStatus === 'error' && testError
          
          return (
            <div
              key={provider.type}
              className={`${styles.item} ${currentProvider === provider.type ? styles.active : ''}`}
            >
              <div className={styles.info} onClick={() => handleSwitch(provider.type)}>
                <span className={styles.icon}>{getProviderIcon(provider.type)}</span>
                <div className={styles.details}>
                  <span className={styles.name}>{provider.name}</span>
                  <span className={styles.status}>
                    {currentProvider === provider.type ? '当前使用' : provider.ready ? '可用' : '需配置'}
                  </span>
                </div>
              </div>
              <div className={styles.testSection}>
                {provider.ready ? (
                  <Button
                    size="sm"
                    tone="primary"
                    onClick={() => handleTest(provider.type)}
                    disabled={testingProvider === provider.type}
                  >
                    {testingProvider === provider.type ? '测试中' : '测试'}
                  </Button>
                ) : null}
                
                {showSuccess && (
                  <span className={styles.testSuccess}>✓ 连接成功</span>
                )}
                
                {showError && (
                  <div className={styles.errorSection}>
                    <span className={styles.testError}>✗ 连接失败</span>
                    <details className={styles.errorDetails}>
                      <summary>查看错误详情</summary>
                      <pre className={styles.errorContent}>{testError}</pre>
                    </details>
                    <button
                      className={styles.clearErrorBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleClearTestStatus(provider.type)
                      }}
                    >
                      清除
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {providerSwitchError ? <p className={styles.error}>{providerSwitchError}</p> : null}
    </div>
  )
}
