// frontend/src/v2/pages/Login.tsx
//
// 登录页 —— 保留设计版 "三层架构连通图"（Source → Semantic → Application），
// 同时将所有色彩/交互语义收敛到 v2 设计 tokens（--accent/--violet/--success/
// --bg-surface/...），并通过 v2 的 apiClient / Toast / observability 契约走登录。
//
// 结构：
//   ┌──────────────────────────┬────────────────────────────┐
//   │ 左：品牌 Hero（始终深色） │ 右：登录表单（surface 背板） │
//   │ · Logo                    │ · 欢迎标题 / 描述           │
//   │ · 3 列连通图 + 流动点      │ · 用户名 / 密码 + 记住我    │
//   │ · 平台标语 / 版权         │ · 登录按钮                   │
//   │                          │ · 分割线 + 飞书 SSO          │
//   └──────────────────────────┴────────────────────────────┘
// 交互：
//   · password toggle（眼睛图标）
//   · ⌘↵ / Enter 提交
//   · SSO 回调 ?token=xxx / ?error=xxx（飞书 callback 302 回登录页）
//   · 已登录态（有 access token）直接重定向到 ?redirect 或 /dashboard
// 统一：
//   · 颜色：仅使用 tokens + color-mix 做透明叠加；品牌 Hero 的深底使用局部 CSS 变量，
//     不与主题 tokens 耦合（Hero 永远深色，与 light/dark 主题解耦）。
//   · 请求：apiClient（带 /api/v1 前缀与 401 拦截）。
//   · 事件：obs.track(ev.loginSucceeded)。
//   · i18n：所有可见文案通过 t()；连接层内的产品/技术名保持英文原文。
//
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  Box,
  Command as CommandIcon,
  Database,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Layers,
  LayoutDashboard,
  Loader2,
  Lock,
  LogIn,
  MessageCircle,
  MessageSquare,
  Shield,
  Sun,
  User,
  Zap,
} from 'lucide-react'
import { Button, Kbd } from '@v2/components/ui'
import { useToast } from '@v2/components/ui/Toast'
import { apiClient, getAccessToken, setAccessToken } from '@v2/api/client'
import { useTheme } from '@v2/components/ThemeProvider'
import { ev, obs } from '@v2/observability'
import { t } from '@v2/i18n'
import type { LoginResponse } from './login-utils'
import { extractLoginToken } from './login-utils'

async function loginRequest(username: string, password: string): Promise<string> {
  const res = await apiClient.post<LoginResponse>('/auth/login', {
    username,
    password,
  })
  const token = extractLoginToken(res.data)
  if (!token) {
    throw new Error(t('login.error.missingToken', '登录接口未返回 token'))
  }
  return token
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const { effectiveTheme, toggle } = useTheme()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo =
    (location.state as { from?: string } | null)?.from ??
    searchParams.get('redirect') ??
    '/dashboard'

  // 飞书 SSO 回调：后端 302 带 ?token=xxx 或 ?error=xxx 回到 /login
  useEffect(() => {
    const ssoToken = searchParams.get('token')
    const ssoError = searchParams.get('error')
    if (ssoToken) {
      setAccessToken(ssoToken)
      obs.track(ev.loginSucceeded('feishu'))
      navigate(redirectTo, { replace: true })
      return
    }
    if (ssoError) {
      toast.show(decodeURIComponent(ssoError), 'danger')
    }
    // 仅订阅 query 的变化，toast/navigate 稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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
      toast.show(
        err instanceof Error ? err.message : t('login.error.default', '登录失败'),
        'danger',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleFeishuLogin = () => {
    window.location.href = '/api/v1/auth/feishu/authorize'
  }

  return (
    <div
      className="flex min-h-screen"
      data-testid="login-screen"
      style={{ background: 'var(--bg-surface)' }}
    >
      {/* ───────── 左：品牌 Hero + 连通图 ───────── */}
      <BrandPanel />

      {/* ───────── 右：登录表单 ───────── */}
      <section
        className="relative flex flex-1 items-center justify-center px-6 py-10 lg:px-16"
        style={{ background: 'var(--bg-surface)' }}
      >
        {/* 右上角主题切换 */}
        <button
          type="button"
          className="rail-btn absolute right-4 top-4"
          onClick={toggle}
          title={
            effectiveTheme === 'dark'
              ? t('theme.toLight', '切换为浅色')
              : t('theme.toDark', '切换为深色')
          }
          aria-label={t('theme.toggle', '切换主题')}
        >
          <Sun size={14} />
        </button>

        <form onSubmit={handleSubmit} className="flex w-full max-w-[420px] flex-col gap-6">
          {/* Logo + 标题 */}
          <div className="flex flex-col gap-2">
            <div className="mb-1 flex items-center gap-2.5">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-[10px] text-white"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent) 0%, var(--violet) 100%)',
                }}
              >
                <Box className="h-[22px] w-[22px]" />
              </div>
              <span
                className="text-[22px] font-extrabold tracking-[1px]"
                style={{ color: 'var(--text-1)' }}
              >
                CUBIC³
              </span>
            </div>
            <h1
              className="text-[26px] font-bold leading-tight"
              style={{ color: 'var(--text-1)' }}
            >
              {t('login.welcome', '欢迎回来')}
            </h1>
            <p className="text-[13px]" style={{ color: 'var(--text-3)' }}>
              {t('login.desc.v2', '登录以继续使用 Cubic³ 数据平台')}
            </p>
          </div>

          {/* 用户名 */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-username"
              className="text-[12px] font-medium"
              style={{ color: 'var(--text-2)' }}
            >
              {t('login.username', '用户名')}
            </label>
            <div
              className="flex h-11 items-center gap-2.5 rounded-lg border px-3.5 transition-colors focus-within:ring-2"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border)',
                // 使用 tokens 作为 focus 环颜色
                ['--tw-ring-color' as string]:
                  'color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              <User className="h-4 w-4 shrink-0" style={{ color: 'var(--text-4)' }} />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder={t('login.username.placeholder', '管理员账号')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-full flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--text-1)' }}
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="login-password"
              className="text-[12px] font-medium"
              style={{ color: 'var(--text-2)' }}
            >
              {t('login.password', '密码')}
            </label>
            <div
              className="flex h-11 items-center gap-2.5 rounded-lg border px-3.5 transition-colors focus-within:ring-2"
              style={{
                background: 'var(--bg-surface)',
                borderColor: 'var(--border)',
                ['--tw-ring-color' as string]:
                  'color-mix(in srgb, var(--accent) 20%, transparent)',
              }}
            >
              <Lock className="h-4 w-4 shrink-0" style={{ color: 'var(--text-4)' }} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('login.password.placeholder', '请输入密码')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-full flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--text-1)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="transition-colors"
                style={{ color: 'var(--text-4)' }}
                aria-label={
                  showPassword
                    ? t('login.password.hide', '隐藏密码')
                    : t('login.password.show', '显示密码')
                }
                aria-pressed={showPassword}
                aria-controls="login-password"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 记住我 + 忘记密码 */}
          <div className="flex items-center justify-between text-[12px]">
            <label className="flex cursor-pointer items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>{t('login.remember', '记住登录状态')}</span>
            </label>
            <button
              type="button"
              className="hover:underline"
              style={{ color: 'var(--accent-text)' }}
              onClick={() =>
                toast.show(t('login.forgot.hint', '请联系平台管理员重置密码'), 'info')
              }
            >
              {t('login.forgot', '忘记密码？')}
            </button>
          </div>

          {/* 登录按钮 */}
          <Button type="submit" variant="primary" className="h-11 w-full justify-center" disabled={submitting}>
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <LogIn size={14} />
            )}
            <span className="tracking-[1px]">{t('login.submit', '登录')}</span>
            {!submitting && <ArrowRight size={14} />}
          </Button>

          {/* 分割线 */}
          <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-4)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
            <span>{t('login.divider', '其他登录方式')}</span>
            <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
          </div>

          {/* 飞书 SSO */}
          <button
            type="button"
            onClick={handleFeishuLogin}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border text-[13px] transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-2)',
              background: 'var(--bg-surface)',
            }}
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            {t('login.feishu', '飞书登录')}
          </button>

          {/* 调试 & 快捷键提示 */}
          <div
            className="flex items-center justify-between text-[11px]"
            style={{ color: 'var(--text-4)' }}
          >
            <span>
              {t('login.bypass.hint', '调试可设')}{' '}
              <code style={{ color: 'var(--text-3)' }}>VITE_AUTH_BYPASS=1</code>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> {t('login.submit', '登录')}
            </span>
          </div>

          {/* 条款 */}
          <p className="text-center text-[11px]" style={{ color: 'var(--text-4)' }}>
            {t('login.terms', '登录即表示您同意平台的使用条款和隐私政策')}
          </p>
        </form>
      </section>
    </div>
  )
}

/* ==========================================================================
 * 品牌 Hero —— Source → Semantic → Application 三层架构连通图
 *   色彩：只用 --accent / --violet / --success tokens，透明度通过 color-mix 叠加。
 *   底色：保持深色渐变（无论 light/dark 主题），作为 Hero 的固定品牌质感。
 * ========================================================================== */
function BrandPanel() {
  const sourceItems: Array<{ icon: typeof Database; label: string }> = [
    { icon: Database, label: 'MaxCompute' },
    { icon: Database, label: 'MySQL' },
    { icon: Database, label: 'ClickHouse' },
    { icon: Database, label: 'PostgreSQL' },
  ]
  const semanticItems: Array<{ icon: typeof Layers; label: string }> = [
    { icon: Layers, label: 'Data Model' },
    { icon: Shield, label: 'Access Control' },
    { icon: Zap, label: 'Query Engine' },
    { icon: HardDrive, label: 'Caching' },
  ]
  const applicationItems: Array<{ icon: typeof LayoutDashboard; label: string }> = [
    { icon: LayoutDashboard, label: 'Dashboards' },
    { icon: MessageSquare, label: 'AI Chat' },
    { icon: FileText, label: 'Reports' },
    { icon: Bell, label: 'Alerts' },
  ]
  const year = new Date().getFullYear()

  // BrandPanel 是深底 Hero 场景，与 light/dark 主题解耦。
  // 在此 scope 声明自己的"层色板"：语义对齐 v2 tokens（accent/violet/success），
  // 但数值选用 dark-hero 可读性更好的变体（避免 light token 在深底上过闷）。
  const heroPalette: React.CSSProperties = {
    ['--brand-src' as string]: '#4f8cff' /* ≈ dark accent */,
    ['--brand-sem' as string]: '#8b5cf6' /* ≈ bright violet */,
    ['--brand-app' as string]: '#22c55e' /* ≈ dark success */,
  }

  return (
    <section
      className="relative hidden w-[54%] overflow-hidden lg:flex lg:flex-col"
      style={{
        // 深色 brand Hero：accent → violet → near-black，固定不随主题变
        background:
          'linear-gradient(160deg, #0b1120 0%, color-mix(in srgb, var(--accent) 35%, #0b1120) 40%, color-mix(in srgb, var(--violet) 30%, #0b1120) 100%)',
        ...heroPalette,
      }}
    >
      {/* 细网格装饰 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          maskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 65%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at top right, black 0%, transparent 65%)',
        }}
      />
      {/* violet 光晕 */}
      <div
        className="pointer-events-none absolute -bottom-24 -left-24 h-[320px] w-[320px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--brand-sem) 55%, transparent)' }}
      />

      {/* Logo */}
      <div className="absolute left-10 top-10 z-10 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-[10px]"
          style={{
            background:
              'linear-gradient(135deg, var(--brand-src) 0%, var(--brand-sem) 100%)',
          }}
        >
          <Box className="h-[22px] w-[22px] text-white" />
        </div>
        <div>
          <div className="text-[22px] font-extrabold tracking-wide text-white">
            CUBIC<span className="align-super text-sm">3</span>
          </div>
          <div className="text-[11px] text-white/60">
            {t('login.brand.subtitle', '3 Layers · Source · Semantic · Application')}
          </div>
        </div>
      </div>

      {/* 三层架构可视化 */}
      <div className="absolute left-5 right-5 top-[180px] z-10 flex items-start">
        <LayerColumn
          label={t('login.brand.col.source', 'SOURCE')}
          tokenVar="var(--brand-src)"
          items={sourceItems}
          width={175}
        />

        <FlowStream leftVar="var(--brand-src)" rightVar="var(--brand-sem)" />

        <LayerColumn
          label={t('login.brand.col.semantic', 'SEMANTIC')}
          tokenVar="var(--brand-sem)"
          items={semanticItems}
          width={220}
        />

        <FlowStream leftVar="var(--brand-sem)" rightVar="var(--brand-app)" />

        <LayerColumn
          label={t('login.brand.col.application', 'APPLICATION')}
          tokenVar="var(--brand-app)"
          items={applicationItems}
          width={195}
        />
      </div>

      {/* 描述段 */}
      <div className="absolute bottom-[118px] left-10 z-10 max-w-[640px]">
        <p className="mb-5 text-[14px] font-semibold leading-relaxed text-white/80">
          {t('login.brand.heroTitle', '从数据接入到价值交付的统一工作台')}
        </p>
        <p className="text-[12px] leading-[1.8] text-white/45">
          {t(
            'login.brand.heroDesc',
            '覆盖 Source 异构数据源接入、Semantic 语义建模与治理、Application 数据应用编排，一站式连接数据全链路，帮助团队高效释放数据价值。',
          )}
        </p>
      </div>

      {/* 标语 + 版权 */}
      <div className="absolute bottom-10 left-10 z-10">
        <p className="mb-1.5 text-[13px] text-white/55">
          {t('login.brand.slogan', '数据驱动每一个决策')}
        </p>
        <p className="text-[11px] text-white/30">
          © {year} CUBIC³ · v2 ·{' '}
          <span className="inline-flex items-center gap-1">
            <CommandIcon size={10} /> {t('login.brand.paletteHint', '⌘K 调出命令面板')}
          </span>
        </p>
      </div>
    </section>
  )
}

/* 单列（Source/Semantic/Application） */
function LayerColumn({
  label,
  tokenVar,
  items,
  width,
}: {
  label: string
  tokenVar: string
  items: Array<{ icon: React.ComponentType<{ className?: string }>; label: string }>
  width: number
}) {
  return (
    <div
      className="rounded-2xl p-4 pt-5"
      style={{
        width,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid color-mix(in srgb, ${tokenVar} 25%, transparent)`,
      }}
    >
      <p
        className="mb-3.5 text-[10px] font-bold tracking-[2px]"
        style={{ color: tokenVar }}
      >
        {label}
      </p>
      <div className="flex flex-col gap-3.5">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-center gap-2 rounded-full px-4 py-2"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: `1px solid color-mix(in srgb, ${tokenVar} 20%, transparent)`,
                color: tokenVar,
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[12px] font-medium text-white/80">{item.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* 三行"流动连接点"：左→右由 tokenLeft 渐变到 tokenRight */
function FlowStream({ leftVar, rightVar }: { leftVar: string; rightVar: string }) {
  // 每行 7 个点：大小由中间向两端递减；颜色按位置从 leftVar 混到 rightVar，并随 idx 叠加 alpha
  const rows = [0, 1, 2]
  const dotSize = (i: number) => (i === 3 || i === 4 ? 4 : i === 0 || i === 6 ? 2 : 3)
  const dotColor = (i: number) => {
    // i=0 → pure leftVar 20%, i=6 → pure rightVar 20%，中间渐变到 100%
    const t = i / 6 // 0..1
    const alpha = 0.3 + 0.7 * (1 - Math.abs(0.5 - t) * 2) // 峰值在中间
    // 左半段偏左色，右半段偏右色
    const mixPct = Math.round(t * 100)
    return `color-mix(in srgb, color-mix(in srgb, ${leftVar} ${100 - mixPct}%, ${rightVar}) ${Math.round(
      alpha * 100,
    )}%, transparent)`
  }

  return (
    <div className="mx-1 mt-[60px] flex flex-col gap-[45px]">
      {rows.map((r) => (
        <div key={r} className="flex items-center gap-[7px]">
          {Array.from({ length: 7 }, (_, i) => {
            const size = dotSize(i)
            return (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: dotColor(i),
                  // 沿 row 错开动画延时，营造"流动"感
                  animation: 'v2-login-flow 3.6s ease-in-out infinite',
                  animationDelay: `${r * 0.25 + i * 0.15}s`,
                }}
              />
            )
          })}
        </div>
      ))}

      <style>{`
        @keyframes v2-login-flow {
          0%, 100% { opacity: 0.55; transform: translateX(-2px); }
          50%      { opacity: 1;    transform: translateX(2px);  }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="v2-login-flow"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
