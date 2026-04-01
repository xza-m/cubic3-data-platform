/**
 * 登录页
 * 左右分栏布局：左侧品牌展示区（三层架构可视化）+ 右侧登录表单
 * 支持：账号密码登录 / 飞书 SSO 登录
 */
import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Box,
  Database,
  Layers,
  Shield,
  Zap,
  HardDrive,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Bell,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  MessageCircle,
  User,
  Lock,
} from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // 处理飞书 SSO 回调：URL 中的 ?token=xxx 或 ?error=xxx
  useEffect(() => {
    const token = searchParams.get('token')
    const callbackError = searchParams.get('error')

    if (token) {
      localStorage.setItem('auth_token', token)
      navigate('/dashboard', { replace: true })
    } else if (callbackError) {
      setError(decodeURIComponent(callbackError))
    }
  }, [searchParams, navigate])

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.message || '登录失败，请检查用户名和密码')
        return
      }

      // 存储 token，与 client.ts 拦截器保持一致
      localStorage.setItem('auth_token', data.token || data.data?.token)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleFeishuLogin = () => {
    // 飞书 SSO：跳转到后端飞书 OAuth 授权入口
    window.location.href = '/api/v1/auth/feishu/authorize'
  }

  /* ---- 三层架构数据 ---- */
  const sourceItems = [
    { icon: Database, label: 'MaxCompute' },
    { icon: Database, label: 'MySQL' },
    { icon: Database, label: 'ClickHouse' },
    { icon: Database, label: 'PostgreSQL' },
  ]
  const semanticItems = [
    { icon: Layers, label: 'Data Model' },
    { icon: Shield, label: 'Access Control' },
    { icon: Zap, label: 'Query Engine' },
    { icon: HardDrive, label: 'Caching' },
  ]
  const applicationItems = [
    { icon: LayoutDashboard, label: 'Dashboards' },
    { icon: MessageSquare, label: 'AI Chat' },
    { icon: FileText, label: 'Reports' },
    { icon: Bell, label: 'Alerts' },
  ]

  /* ---- 流动连接点渲染 ---- */
  const FlowDots = ({ colors, className }: { colors: string[]; className?: string }) => (
    <div className={`flex items-center gap-[7px] ${className ?? ''}`}>
      {colors.map((c, i) => (
        <div
          key={i}
          className={`rounded-full ${i === 0 || i === 6 ? 'w-0.5 h-0.5' : i === 3 || i === 4 ? 'w-1 h-1' : 'w-[3px] h-[3px]'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]" data-testid="login-screen">
      {/* ===== 左侧品牌区 ===== */}
      <div className="hidden lg:flex lg:w-[54%] relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0B1120 0%, #162044 40%, #1E1B4B 100%)',
        }}
      >
        {/* Logo 区域 */}
        <div className="absolute top-10 left-12 flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#2563EB] to-[#6366F1] flex items-center justify-center">
            <Box className="w-[22px] h-[22px] text-white" />
          </div>
          <div>
            <span className="text-white text-[22px] font-extrabold font-['Inter'] tracking-wide">CUBIC</span>
            <span className="text-white text-[22px] font-extrabold font-['Inter'] align-super text-sm">3</span>
            <p className="text-white/60 text-xs font-['Inter']">3 Layers: Source, Semantic, Application</p>
          </div>
        </div>

        {/* 三层架构可视化 */}
        <div className="absolute top-[180px] left-5 right-5 flex items-start">
          {/* SOURCE 列 */}
          <div className="w-[175px] rounded-2xl border border-[#3B82F625] bg-white/[0.024] p-4 pt-5">
            <p className="text-[#3B82F6] text-[10px] font-bold tracking-[2px] font-['Inter'] mb-3.5">SOURCE</p>
            <div className="flex flex-col gap-3.5">
              {sourceItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-full bg-white/[0.07] border border-[#3B82F620] px-4 py-2">
                  <item.icon className="w-3.5 h-3.5 text-[#3B82F6] shrink-0" />
                  <span className="text-white/80 text-xs font-medium font-['Inter']">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 左侧流动连接点 */}
          <div className="flex flex-col gap-[45px] mt-[60px] mx-1">
            <FlowDots colors={['#3B82F630', '#3B82F660', '#818CF8AA', '#818CF8DD', '#818CF8FF', '#818CF8BB', '#818CF870']} />
            <FlowDots colors={['#818CF870', '#818CF8BB', '#818CF8FF', '#818CF8DD', '#818CF8AA', '#3B82F660', '#3B82F630']} />
            <FlowDots colors={['#3B82F630', '#3B82F660', '#818CF8AA', '#818CF8EE', '#818CF8FF', '#818CF8AA', '#818CF860']} />
          </div>

          {/* SEMANTIC 列 */}
          <div className="w-[220px] rounded-2xl border border-[#818CF830] bg-white/[0.04] p-4 pt-5">
            <p className="text-[#818CF8] text-[10px] font-bold tracking-[2px] font-['Inter'] mb-3.5">SEMANTIC</p>
            <div className="flex flex-col gap-3.5">
              {semanticItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-full bg-white/[0.07] border border-[#818CF820] px-4 py-2">
                  <item.icon className="w-3.5 h-3.5 text-[#818CF8] shrink-0" />
                  <span className="text-white/80 text-xs font-medium font-['Inter']">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 右侧流动连接点 */}
          <div className="flex flex-col gap-[45px] mt-[60px] mx-1">
            <FlowDots colors={['#818CF850', '#818CF8AA', '#10B981CC', '#10B981EE', '#10B981FF', '#10B981BB', '#10B98160']} />
            <FlowDots colors={['#10B98160', '#10B981BB', '#10B981FF', '#10B981DD', '#818CF8AA', '#818CF860', '#818CF830']} />
            <FlowDots colors={['#818CF830', '#818CF860', '#10B981CC', '#10B981EE', '#10B981FF', '#10B981AA', '#10B98150']} />
          </div>

          {/* APPLICATION 列 */}
          <div className="w-[195px] rounded-2xl border border-[#10B98125] bg-white/[0.024] p-4 pt-5">
            <p className="text-[#10B981] text-[10px] font-bold tracking-[2px] font-['Inter'] mb-3.5">APPLICATION</p>
            <div className="flex flex-col gap-3.5">
              {applicationItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-full bg-white/[0.07] border border-[#10B98120] px-4 py-2">
                  <item.icon className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span className="text-white/80 text-xs font-medium font-['Inter']">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部描述 */}
        <div className="absolute bottom-[120px] left-10 max-w-[660px] z-10">
          <p className="text-white/70 text-sm font-semibold leading-relaxed mb-6">
            从数据接入到价值交付的统一工作台
          </p>
          <p className="text-white/[0.38] text-xs leading-[1.8]">
            覆盖 Source 异构数据源接入、Semantic 语义建模与治理、Application 数据应用编排，一站式连接数据全链路，帮助团队高效释放数据价值。
          </p>
        </div>

        {/* 底部 tagline 和 copyright */}
        <div className="absolute bottom-10 left-12 z-10">
          <p className="text-white/50 text-sm mb-1.5">数据驱动每一个决策</p>
          <p className="text-white/30 text-[11px]">&copy; 2026 CUBIC&sup3; &middot; v2.0.0</p>
        </div>
      </div>

      {/* ===== 右侧登录区 ===== */}
      <div className="flex-1 flex items-center justify-center bg-white px-20 py-[60px]">
        <div className="w-full max-w-[420px] flex flex-col gap-7">
          {/* Logo + 标题 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#2563EB] to-[#6366F1] flex items-center justify-center">
                <Box className="w-[22px] h-[22px] text-white" />
              </div>
              <span className="text-[#0F172A] text-2xl font-extrabold font-['Inter'] tracking-[1px]">CUBIC&sup3;</span>
            </div>
            <h1 className="text-[#0F172A] text-[28px] font-bold font-['Inter']">欢迎回来</h1>
            <p className="text-[#64748B] text-sm font-['Inter']">登录以继续使用数据平台</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* 表单 */}
          <form onSubmit={handlePasswordLogin} className="flex flex-col gap-5">
            {/* 用户名 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-[#0F172A] text-[13px] font-medium font-['Inter']">
                用户名
              </label>
              <div className="flex items-center gap-2.5 h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition-all">
                <User className="w-4 h-4 text-[#94A3B8] shrink-0" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 h-full bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none font-['Inter']"
                />
              </div>
            </div>

            {/* 密码 */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[#0F172A] text-[13px] font-medium font-['Inter']">
                密码
              </label>
              <div className="flex items-center gap-2.5 h-11 px-3.5 rounded-lg border border-[#E2E8F0] bg-white focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition-all">
                <Lock className="w-4 h-4 text-[#94A3B8] shrink-0" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 h-full bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] outline-none font-['Inter']"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[#94A3B8] hover:text-[#64748B] transition-colors cursor-pointer"
                  aria-label={showPassword ? '隐藏输入内容' : '显示输入内容'}
                  aria-pressed={showPassword}
                  aria-controls="password"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* 记住我 + 忘记密码 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[#E2E8F0] text-[#2563EB] focus:ring-[#2563EB]/20"
                />
                <span className="text-[#64748B] text-xs font-['Inter']">记住登录状态</span>
              </label>
              <button type="button" className="text-[#2563EB] text-xs font-['Inter'] hover:underline cursor-pointer">
                忘记密码？
              </button>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-[10px] bg-gradient-to-b from-[#2563EB] to-[#6366F1] text-white text-[15px] font-semibold font-['Inter'] tracking-[2px] flex items-center justify-center gap-2 shadow-[0_4px_16px_#2563EB30] hover:shadow-[0_6px_20px_#2563EB40] disabled:opacity-60 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登 录
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* 分割线 */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[#E2E8F0]" />
            <span className="text-[#94A3B8] text-xs font-['Inter']">其他登录方式</span>
            <div className="flex-1 h-px bg-[#E2E8F0]" />
          </div>

          {/* 飞书登录 */}
          <button
            type="button"
            onClick={handleFeishuLogin}
            className="w-full h-11 rounded-[10px] border border-[#E2E8F0] bg-white text-[#64748B] text-sm font-['Inter'] flex items-center justify-center gap-2.5 hover:bg-[#F8FAFC] transition-colors cursor-pointer"
          >
            <MessageCircle className="w-[18px] h-[18px] text-[#64748B]" />
            飞书登录
          </button>

          {/* 底部条款 */}
          <p className="text-[#94A3B8] text-[11px] font-['Inter'] text-center">
            登录即表示您同意平台的使用条款和隐私政策
          </p>
        </div>
      </div>
    </div>
  )
}
