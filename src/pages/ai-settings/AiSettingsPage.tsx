import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, StatusPill } from '../../components/ui'
import { Input, TextArea } from '../../components/ui/Field'
import { useAiStore } from '../../features/ai/ai-store'
import { ProviderCard } from '../../features/ai/components/ProviderCard'
import { readJsonStorage } from '../../features/storage/utils/storage-helpers'
import styles from './AiSettingsPage.module.css'

const WORKSPACE_ID_KEY = 'brainflow-cloud-workspace-id'

interface ApiKeyInputState {
  apiKey: string
  model: string
  baseUrl: string
  isEditing: boolean
}

function createEmptyInput(config?: { model: string | null; baseUrl: string | null }): ApiKeyInputState {
  return {
    apiKey: '',
    model: config?.model ?? '',
    baseUrl: config?.baseUrl ?? '',
    isEditing: false,
  }
}

export function AiSettingsPage() {
  const navigate = useNavigate()
  const workspaceId = readJsonStorage<string>(WORKSPACE_ID_KEY) ?? undefined
  const aiStore = useAiStore()
  const settings = aiStore.settings ?? null
  const settingsError = aiStore.settingsError ?? null
  const isLoadingSettings = aiStore.isLoadingSettings ?? false
  const isSavingSettings = aiStore.isSavingSettings ?? false
  const loadSettings = aiStore.loadSettings ?? (async () => {})
  const saveSettings = aiStore.saveSettings ?? (async () => {})
  const resetSettings = aiStore.resetSettings ?? (async () => {})
  const availableProviders = aiStore.availableProviders ?? []
  const currentProvider = aiStore.currentProvider ?? 'codex'
  const isLoadingProviders = aiStore.isLoadingProviders ?? false
  const providerSwitchError = aiStore.providerSwitchError ?? null
  const loadAvailableProviders = aiStore.loadAvailableProviders ?? (async () => {})
  const switchProvider = aiStore.switchProvider ?? (async () => false)
  const testProvider = aiStore.testProvider ?? (async () => false)
  const providerConfigs = aiStore.providerConfigs ?? {}
  const isLoadingProviderConfig = aiStore.isLoadingProviderConfig ?? false
  const providerConfigError = aiStore.providerConfigError ?? null
  const loadProviderConfig = aiStore.loadProviderConfig ?? (async () => {})
  const saveProviderConfig = aiStore.saveProviderConfig ?? (async () => false)
  const deleteProviderConfig = aiStore.deleteProviderConfig ?? (async () => false)

  const [draft, setDraft] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [savingApiKey, setSavingApiKey] = useState<string | null>(null)
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, ApiKeyInputState>>({
    deepseek: createEmptyInput(),
    'kimi-code': createEmptyInput(),
  })
  const [testStatusMap, setTestStatusMap] = useState<Record<string, 'idle' | 'success' | 'error'>>({})
  const [testErrorMap, setTestErrorMap] = useState<Record<string, string | null>>({})

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void loadAvailableProviders()
  }, [loadAvailableProviders, workspaceId])

  useEffect(() => {
    if (settings && !hasEdited) {
      setDraft(settings.businessPrompt)
    }
  }, [settings, hasEdited])

  useEffect(() => {
    if (!workspaceId) {
      return
    }

    availableProviders.forEach((provider) => {
      if (provider.requiresApiKey) {
        void loadProviderConfig(provider.type, workspaceId)
      }
    })
  }, [workspaceId, availableProviders, loadProviderConfig])

  const handleSave = async () => {
    await saveSettings(hasEdited ? draft : (settings?.businessPrompt ?? draft))
    setHasEdited(false)
  }

  const handleReset = async () => {
    setHasEdited(false)
    await resetSettings()
  }

  const handleTestProvider = async (type: string) => {
    setTestingProvider(type)
    setTestStatusMap((prev) => ({ ...prev, [type]: 'idle' }))
    setTestErrorMap((prev) => ({ ...prev, [type]: null }))
    
    const valid = await testProvider(type, workspaceId)
    
    setTestingProvider(null)
    
    // Update test status
    if (valid) {
      setTestStatusMap((prev) => ({ ...prev, [type]: 'success' }))
    } else {
      const errorMsg = aiStore.providerSwitchError || '连接失败，请检查 API Key 配置'
      setTestStatusMap((prev) => ({ ...prev, [type]: 'error' }))
      setTestErrorMap((prev) => ({ ...prev, [type]: errorMsg }))
    }
    
    return valid
  }

  const handleClearTestStatus = (type: string) => {
    setTestStatusMap((prev) => ({ ...prev, [type]: 'idle' }))
    setTestErrorMap((prev) => ({ ...prev, [type]: null }))
  }

  const handleSaveApiKey = async (providerType: string) => {
    if (!workspaceId) {
      return
    }

    const input = apiKeyInputs[providerType]
    if (!input?.apiKey.trim()) {
      return
    }

    setSavingApiKey(providerType)
    const success = await saveProviderConfig(providerType, workspaceId, {
      apiKey: input.apiKey.trim(),
      model: input.model.trim() || undefined,
      baseUrl: input.baseUrl.trim() || undefined,
    })

    if (success) {
      setApiKeyInputs((prev) => ({
        ...prev,
        [providerType]: createEmptyInput({
          model: input.model.trim() || null,
          baseUrl: input.baseUrl.trim() || null,
        }),
      }))
      switchProvider(providerType)
    }

    setSavingApiKey(null)
  }

  const handleDeleteApiKey = async (providerType: string) => {
    if (!workspaceId) {
      return
    }

    await deleteProviderConfig(providerType, workspaceId)
    setApiKeyInputs((prev) => ({
      ...prev,
      [providerType]: createEmptyInput(),
    }))
  }

  const startEditingApiKey = (providerType: string) => {
    const config = providerConfigs[providerType]
    setApiKeyInputs((prev) => ({
      ...prev,
      [providerType]: {
        apiKey: '',
        model: config?.model ?? '',
        baseUrl: config?.baseUrl ?? '',
        isEditing: true,
      },
    }))
  }

  const cancelEditingApiKey = (providerType: string) => {
    const config = providerConfigs[providerType]
    setApiKeyInputs((prev) => ({
      ...prev,
      [providerType]: createEmptyInput(config),
    }))
  }

  const currentProviderInfo = availableProviders.find((provider) => provider.type === currentProvider)
  const apiKeyProviders = availableProviders.filter((provider) => provider.requiresApiKey)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <Button tone="ghost" iconStart="back" onClick={() => navigate(-1)}>
              返回
            </Button>
            <h1 className={styles.title}>AI 配置与设置</h1>
          </div>
          <div className={styles.headerMeta}>
            <StatusPill tone="soft">AI SETTINGS</StatusPill>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>AI 服务提供方</h2>
            <p className={styles.sectionDesc}>
              点击后会立即切换为全局默认 AI，并持久保存；下次启动也会继续使用这个选择。
            </p>
          </div>

          {isLoadingProviders ? (
            <div className={styles.loading}>正在加载可用 Provider...</div>
          ) : (
            <div className={styles.providerList}>
              {availableProviders.map((provider) => (
                <ProviderCard
                  key={provider.type}
                  provider={provider}
                  selected={currentProvider === provider.type}
                  onSelect={() => switchProvider(provider.type)}
                  onTest={() => handleTestProvider(provider.type)}
                  canTest={provider.requiresApiKey ? !!providerConfigs[provider.type]?.hasConfig : provider.ready}
                  isTesting={testingProvider === provider.type}
                  testStatus={testStatusMap[provider.type] ?? 'idle'}
                  testError={testErrorMap[provider.type] ?? null}
                  onClearTestStatus={() => handleClearTestStatus(provider.type)}
                />
              ))}
            </div>
          )}

          {providerSwitchError ? <div className={styles.error}>{providerSwitchError}</div> : null}

          {currentProviderInfo ? (
            <div className={styles.currentProviderInfo}>
              <StatusPill tone={currentProviderInfo.ready ? 'accent' : 'soft'}>
                {currentProviderInfo.ready ? '当前使用中' : '需要配置'}
              </StatusPill>
              <span className={styles.providerName}>{currentProviderInfo.name}</span>
            </div>
          ) : null}
        </section>

        {apiKeyProviders.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>API Key 配置</h2>
              <p className={styles.sectionDesc}>
                保存后会立即校验配置；切到对应 AI 后可以马上测试和使用。当前页面只保留 DeepSeek 与 Kimi Code。
              </p>
            </div>

            {!workspaceId ? <div className={styles.error}>请先选择工作区，再保存 API 配置。</div> : null}
            {providerConfigError ? <div className={styles.error}>{providerConfigError}</div> : null}

            <div className={styles.apiKeyList}>
              {apiKeyProviders.map((provider) => {
                const config = providerConfigs[provider.type]
                const hasConfig = config?.hasConfig
                const input = apiKeyInputs[provider.type] ?? createEmptyInput(config)
                const isEditing = input.isEditing

                return (
                  <div key={provider.type} className={styles.apiKeyCard}>
                    <div className={styles.apiKeyHeader}>
                      <div className={styles.apiKeyTitle}>
                        <span className={styles.apiKeyIcon}>
                          {provider.type === 'deepseek' ? '🧠' : '🤖'}
                        </span>
                        <span>{provider.name}</span>
                      </div>
                      <StatusPill tone={hasConfig ? 'accent' : 'soft'}>
                        {hasConfig ? '已配置' : '未配置'}
                      </StatusPill>
                    </div>

                    {hasConfig && !isEditing ? (
                      <div className={styles.apiKeyActions}>
                        <span className={styles.apiKeyHint}>API Key 已保存，不会在前端回显完整内容。</span>
                        <div className={styles.apiKeyButtonGroup}>
                          <Button
                            tone="ghost"
                            size="sm"
                            onClick={() => startEditingApiKey(provider.type)}
                          >
                            修改
                          </Button>
                          <Button
                            tone="secondary"
                            size="sm"
                            onClick={() => handleDeleteApiKey(provider.type)}
                            disabled={isLoadingProviderConfig}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.apiKeyForm}>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>
                            API Key <span className={styles.required}>*</span>
                          </label>
                          <Input
                            type="password"
                            placeholder={`输入 ${provider.name} API Key`}
                            value={input.apiKey}
                            onChange={(event) =>
                              setApiKeyInputs((prev) => ({
                                ...prev,
                                [provider.type]: {
                                  ...prev[provider.type],
                                  apiKey: event.target.value,
                                },
                              }))
                            }
                            disabled={savingApiKey === provider.type || isLoadingProviderConfig}
                          />
                        </div>

                        <div className={styles.apiKeyAdvanced}>
                          <div className={styles.formField}>
                            <label className={styles.formLabel}>模型（可选）</label>
                            <Input
                              placeholder={provider.type === 'deepseek' ? 'deepseek-chat' : '留空自动适配'}
                              value={input.model}
                              onChange={(event) =>
                                setApiKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.type]: {
                                    ...prev[provider.type],
                                    model: event.target.value,
                                  },
                                }))
                              }
                              disabled={savingApiKey === provider.type || isLoadingProviderConfig}
                            />
                          </div>

                          <div className={styles.formField}>
                            <label className={styles.formLabel}>自定义 Base URL（可选）</label>
                            <Input
                              placeholder={
                                provider.type === 'deepseek'
                                  ? 'https://api.deepseek.com'
                                  : '留空自动适配'
                              }
                              value={input.baseUrl}
                              onChange={(event) =>
                                setApiKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.type]: {
                                    ...prev[provider.type],
                                    baseUrl: event.target.value,
                                  },
                                }))
                              }
                              disabled={savingApiKey === provider.type || isLoadingProviderConfig}
                            />
                          </div>
                        </div>

                        <div className={styles.apiKeyFormActions}>
                          {isEditing ? (
                            <Button
                              tone="ghost"
                              onClick={() => cancelEditingApiKey(provider.type)}
                              disabled={savingApiKey === provider.type || isLoadingProviderConfig}
                            >
                              取消
                            </Button>
                          ) : null}
                          <Button
                            tone="primary"
                            onClick={() => handleSaveApiKey(provider.type)}
                            disabled={!input.apiKey.trim() || savingApiKey === provider.type || isLoadingProviderConfig}
                          >
                            {savingApiKey === provider.type ? '保存中...' : isEditing ? '更新并验证' : '保存并验证'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>业务 Prompt</h2>
            <p className={styles.sectionDesc}>定义 AI 的业务风格、输出偏好和默认执行行为。</p>
          </div>

          <div className={styles.promptCard}>
            <div className={styles.promptHeader}>
              <div className={styles.promptMeta}>
                <span>业务版本 {settings?.version ?? '未加载'}</span>
                <span>最后更新 {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : '-'}</span>
              </div>
            </div>

            <TextArea
              value={draft}
              rows={20}
              className={styles.promptField}
              disabled={isLoadingSettings || isSavingSettings}
              placeholder="在这里定义 AI 的业务风格、输出偏好和默认行为..."
              onChange={(event) => {
                setDraft(event.target.value)
                setHasEdited(true)
              }}
            />

            {settingsError ? <div className={styles.error}>{settingsError}</div> : null}

            <div className={styles.promptActions}>
              <Button
                tone="secondary"
                onClick={handleReset}
                disabled={isLoadingSettings || isSavingSettings}
              >
                恢复默认
              </Button>
              <Button
                tone="primary"
                onClick={handleSave}
                disabled={isLoadingSettings || isSavingSettings || (!hasEdited && draft === settings?.businessPrompt)}
              >
                {isSavingSettings ? '保存中...' : '保存并生效'}
              </Button>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>配置说明</h2>
          </div>

          <div className={styles.helpCard}>
            <h3>如何配置 DeepSeek</h3>
            <ol>
              <li>访问 <a href="https://platform.deepseek.com/" target="_blank" rel="noopener">DeepSeek 平台</a></li>
              <li>注册并登录账号</li>
              <li>创建 API Key</li>
              <li>在上方 API Key 配置区输入 Key 并保存</li>
            </ol>

            <h3>如何配置 Kimi Code</h3>
            <ol>
              <li>如果你要在 BrainFlow 里直连使用，请访问 <a href="https://platform.kimi.com/console/api-keys" target="_blank" rel="noopener">Kimi 开放平台</a> 创建开放平台 Key</li>
              <li>BrainFlow 当前不支持直接使用 Kimi Code 会员 Key（常见前缀 `sk-kimi-`）访问 `https://api.kimi.com/coding`；官方主要支持 Kimi CLI、Claude Code、Roo Code 等 Coding Agent</li>
              <li>如果你希望继续使用 Kimi Code 会员权益，请改走本地 CLI / 受支持 Agent 桥接，而不是在这里直填会员 Key</li>
              <li>在 BrainFlow 当前版本里，建议使用开放平台 Key，并把 Base URL 设为 `https://api.moonshot.cn`、模型优先填写 `kimi-k2.5`</li>
            </ol>

            <h3>关于业务 Prompt</h3>
            <p>业务 Prompt 修改后会立即生效，不需要重启服务。</p>

            <h3>安全说明</h3>
            <p>API Key 会按工作区保存到服务端，不会在前端展示完整明文，也不会共享给其他用户。</p>
          </div>
        </section>
      </main>
    </div>
  )
}
