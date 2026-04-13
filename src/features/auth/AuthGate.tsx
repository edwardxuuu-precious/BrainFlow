import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthSessionResponse } from '../../../shared/auth-contract'
import { Button, Input, StatusPill, SurfacePanel } from '../../components/ui'
import { AUTH_INVALID_EVENT } from './auth-events'
import { authSessionService, AuthSessionError } from './auth-session-service'
import styles from './AuthGate.module.css'

interface AuthGateProps {
  children: ReactNode
}

interface SessionState {
  loading: boolean
  session: AuthSessionResponse | null
  error: string | null
}

function createLoadingState(): SessionState {
  return {
    loading: true,
    session: null,
    error: null,
  }
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<SessionState>(createLoadingState)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const loadSession = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const session = await authSessionService.getSession()
      setState({
        loading: false,
        session,
        error: null,
      })
      if (session.username) {
        setUsername(session.username)
      }
    } catch (error) {
      setState({
        loading: false,
        session: null,
        error: error instanceof Error ? error.message : '加载登录状态失败。',
      })
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    const handleAuthInvalid = () => {
      void loadSession()
    }

    window.addEventListener(AUTH_INVALID_EVENT, handleAuthInvalid)
    window.addEventListener('focus', handleAuthInvalid)
    return () => {
      window.removeEventListener(AUTH_INVALID_EVENT, handleAuthInvalid)
      window.removeEventListener('focus', handleAuthInvalid)
    }
  }, [loadSession])

  const canonicalMismatch = useMemo(() => {
    const canonicalOrigin = state.session?.canonicalOrigin
    if (!canonicalOrigin || typeof window === 'undefined') {
      return null
    }

    return canonicalOrigin === window.location.origin ? null : canonicalOrigin
  }, [state.session?.canonicalOrigin])

  const handleLogin = async () => {
    setSubmitting(true)
    setLoginError(null)
    try {
      const session = await authSessionService.login(username.trim(), password)
      setPassword('')
      setState({
        loading: false,
        session,
        error: null,
      })
    } catch (error) {
      if (error instanceof AuthSessionError && error.status === 401) {
        setLoginError('用户名或密码错误。')
      } else {
        setLoginError(error instanceof Error ? error.message : '登录失败。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (state.loading) {
    return (
      <div className={styles.shell}>
        <SurfacePanel frosted className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.eyebrow}>FLOW</span>
            <h1 className={styles.title}>正在准备工作区</h1>
            <p className={styles.subtitle}>正在检查登录状态与工作区入口。</p>
          </div>
        </SurfacePanel>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className={styles.shell}>
        <SurfacePanel frosted className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.eyebrow}>FLOW</span>
            <h1 className={styles.title}>无法建立会话</h1>
            <p className={styles.subtitle}>{state.error}</p>
          </div>
          <div className={styles.actions}>
            <Button tone="primary" onClick={() => void loadSession()}>
              重试
            </Button>
          </div>
        </SurfacePanel>
      </div>
    )
  }

  if (canonicalMismatch) {
    return (
      <div className={styles.shell}>
        <SurfacePanel frosted className={styles.panel}>
          <div className={styles.header}>
            <StatusPill tone="soft">Canonical Origin</StatusPill>
            <h1 className={styles.title}>请从统一入口打开 FLOW</h1>
            <p className={styles.subtitle}>
              当前地址与配置的持久化入口不一致。为了避免 `localhost` 和 `127.0.0.1`
              产生两套独立数据，请切换到统一地址继续使用。
            </p>
          </div>
          <Button
            tone="primary"
            className={styles.linkButton}
            onClick={() => {
              window.location.href = `${canonicalMismatch}${window.location.pathname}${window.location.search}${window.location.hash}`
            }}
          >
            打开 {canonicalMismatch}
          </Button>
        </SurfacePanel>
      </div>
    )
  }

  if (state.session?.authMode === 'external' && !state.session.authenticated) {
    return (
      <div className={styles.shell}>
        <SurfacePanel frosted className={styles.panel}>
          <div className={styles.header}>
            <StatusPill tone="accent">Single User Auth</StatusPill>
            <span className={styles.eyebrow}>FLOW</span>
            <h1 className={styles.title}>登录后继续同步你的工作区</h1>
            <p className={styles.subtitle}>
              当前实例已启用服务端持久化。登录成功后，脑图和会话会以 Postgres 为主库进行同步与恢复。
            </p>
          </div>

          <div className={styles.form}>
            <label className={styles.label}>
              用户名
              <Input value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className={styles.label}>
              密码
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !submitting) {
                    event.preventDefault()
                    void handleLogin()
                  }
                }}
              />
            </label>
            {loginError ? <p className={styles.error}>{loginError}</p> : null}
            <div className={styles.actions}>
              <Button tone="primary" onClick={() => void handleLogin()} disabled={submitting}>
                {submitting ? '登录中…' : '登录'}
              </Button>
            </div>
            <p className={styles.helper}>
              登录态将通过同源 session cookie 保持。切换设备时，只需使用同一个账号登录即可看到同一工作区。
            </p>
          </div>
        </SurfacePanel>
      </div>
    )
  }

  return <>{children}</>
}
