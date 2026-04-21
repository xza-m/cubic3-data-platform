// frontend/src/v2/pages/Login.tsx
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CircleDot,
  Command as CommandIcon,
  Database,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Sun,
  Wifi,
} from 'lucide-react'
import { Button, Input, Kbd } from '@v2/components/ui'
import { useToast } from '@v2/components/ui/Toast'
import { getAccessToken, setAccessToken } from '@v2/api/client'
import { useTheme } from '@v2/components/ThemeProvider'
import { apiClient } from '@v2/api/client'
import { ev, obs } from '@v2/observability'
import { t } from '@v2/i18n'

// TODO(round-2): wire to useLoginMutation from @v2/hooks/auth when auth hook is wired
async function loginRequest(username: string, password: string): Promise<string> {
  const res = await apiClient.post<{ access_token: string }>('/auth/login', { username, password })
  return res.data.access_token
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { effectiveTheme, toggle } = useTheme()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo =
    (location.state as { from?: string } | null)?.from ??
    new URLSearchParams(location.search).get('redirect') ??
    '/dashboard'

  if (getAccessToken()) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!username.trim() || !password) {
      toast.show(t('login.validation.empty', '请输入用户名和密码'), 'warning')
      return
    }
    setSubmitting(true)
    try {
      const trimmedUser = username.trim()
      const token = await loginRequest(trimmedUser, password)
      setAccessToken(token)
      obs.track(ev.loginSucceeded(trimmedUser))
      toast.show({
        tone: 'success',
        title: t('login.success.title', '登录成功'),
        description: t('login.success.desc', '已写入 token，进入工作台'),
      })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('login.error.default', '登录失败'), 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <header
        className="flex h-9 items-center justify-between border-b px-3 text-[12px]"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            C³
          </div>
          <span className="text-1">{t('platform.name', 'Cubic³ 数据平台')}</span>
          <span className="text-3">{t('login.title', '登录')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rail-btn"
            onClick={toggle}
            title={effectiveTheme === 'dark' ? '切换为浅色' : '切换为深色'}
            aria-label={t('theme.toggle', '切换主题')}
          >
            <Sun size={12} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <BrandPanel />

        <section
          className="flex flex-1 items-center justify-center px-6"
          style={{ background: 'var(--bg-app)' }}
        >
          <form
            onSubmit={handleSubmit}
            className="surface w-full max-w-[380px] rounded-md border p-6"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <div className="text-[11px] uppercase tracking-wider text-3">
              {t('login.label', '登录')}
            </div>
            <h1 className="mt-1 text-[18px] font-semibold text-1">
              {t('login.heading', '进入工作台')}
            </h1>
            <p className="mt-1 text-[12px] leading-5 text-3">
              {t('login.desc', '使用平台账号登录。Token 将由 axios 拦截器统一注入请求头。')}
            </p>

            <div className="mt-5 space-y-3">
              <label className="block">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-3">
                  {t('login.username', '用户名')}
                </div>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.username.placeholder', '管理员账号')}
                  autoFocus
                  autoComplete="username"
                />
              </label>
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide text-3">
                  <span>{t('login.password', '密码')}</span>
                </div>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder={t('login.password.placeholder', '请输入密码')}
                  autoComplete="current-password"
                />
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="mt-5 w-full justify-center"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <LogIn size={12} />
              )}
              {t('login.submit', '登录')}
              <ArrowRight size={11} />
            </Button>

            <div className="mt-4 flex items-center justify-between text-[11px] text-3">
              <span>
                {t('login.bypass.hint', '调试可设')}{' '}
                <code className="text-2">VITE_AUTH_BYPASS=1</code>
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> {t('login.submit', '登录')}
              </span>
            </div>

            <div
              className="mt-5 border-t pt-3 text-[11px] text-3"
              style={{ borderColor: 'var(--border)' }}
            >
              {t('login.api.hint', '调用')}{' '}
              <code className="text-2">POST /api/v1/auth/login</code> ·{' '}
              {t('login.proxy.hint', '后端代理')}{' '}
              <code className="text-2">localhost:81</code>
            </div>
          </form>
        </section>
      </div>

      <footer
        className="flex h-6 items-center justify-between border-t px-3 text-[11px]"
        style={{ background: 'var(--bg-status)', borderColor: 'var(--border)', color: 'var(--text-3)' }}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <CircleDot size={10} className="text-[color:var(--success)]" />{' '}
            {t('status.backend', '后端 :81 在线')}
          </span>
          <span>{t('status.branch', '分支 main')}</span>
          <span>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> {t('status.palette', '命令面板（登录后可用）')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Wifi size={10} /> JWT
          </span>
          <span>v2 · {t('status.preview', '内部预览')}</span>
        </div>
      </footer>
    </div>
  )
}

function BrandPanel() {
  const features: Array<{ icon: typeof Brain; title: string; desc: string }> = [
    { icon: Brain, title: '本体语义', desc: '业务对象 / 指标 / 关系 / 治理 一体化' },
    { icon: Database, title: '业务语义', desc: 'Cube + 业务域 + 视图 + 诊断' },
    { icon: Sparkles, title: 'AI 协同', desc: 'Data Chat 与命令面板贯穿全平台' },
    { icon: ShieldCheck, title: '可治理', desc: '策略 / 一致性 / 审计 全程留痕' },
  ]
  return (
    <section
      className="relative hidden w-[420px] overflow-hidden lg:flex lg:flex-col"
      style={{
        background: 'linear-gradient(150deg, var(--accent) 0%, #1956d1 45%, #2a3142 100%)',
      }}
    >
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          maskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 65%)',
          WebkitMaskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 65%)',
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-[320px] w-[320px] rounded-full blur-3xl"
        style={{ background: 'rgba(139,92,246,0.45)' }}
      />

      <div className="relative z-10 flex flex-1 flex-col px-8 py-8 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-[13px] font-bold backdrop-blur">
            C³
          </div>
          <div>
            <div className="text-[14px] font-semibold">Cubic³ 数据平台</div>
            <div className="text-[11px] text-white/70">语义优先 · 数据驱动</div>
          </div>
        </div>

        <div className="mt-10">
          <div className="text-[13px] font-semibold text-white/90">全新设计系统</div>
          <div className="mt-1 text-[12px] leading-5 text-white/60">
            基于 demo 验证的 UIUX，严格对齐后端契约，无 mock 数据。
          </div>
        </div>

        <div className="mt-8 space-y-5">
          {features.map((f) => {
            const Icon = f.icon
            return (
              <div key={f.title} className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/15">
                  <Icon size={14} />
                </div>
                <div>
                  <div className="text-[12px] font-medium">{f.title}</div>
                  <div className="mt-0.5 text-[11px] text-white/60">{f.desc}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-8 text-[11px] text-white/40">
          <CommandIcon size={12} />
          <span>⌘K 调出命令面板</span>
        </div>
      </div>
    </section>
  )
}
