/**
 * 登录页
 * 左右分栏布局：左侧品牌展示区 + 右侧登录表单
 * 支持：账号密码登录 / 飞书 SSO 登录
 */
import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Database,
  Zap,
  Shield,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
} from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loginMode, setLoginMode] = useState<'password' | 'feishu'>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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

  const features = [
    {
      icon: Database,
      title: '多源数据整合',
      desc: '支持 MaxCompute、MySQL 等多种数据源统一接入与管理',
    },
    {
      icon: Zap,
      title: '智能查询分析',
      desc: 'SQL 编辑器 + 自然语言问数，降低数据使用门槛',
    },
    {
      icon: Shield,
      title: '安全可靠',
      desc: '细粒度权限控制，数据操作全链路审计追踪',
    },
  ]

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ===== 左侧品牌区 ===== */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900">
        {/* 装饰性背景元素 */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-indigo-300 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-indigo-400 rounded-full blur-2xl" />
        </div>

        {/* 网格装饰 */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* 内容 */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">CUBIC3</h2>
              <p className="text-xs text-indigo-200">3 Layers: Source, Semantic, Application</p>
            </div>
          </div>

          {/* 价值主张 */}
          <div className="flex-1 flex flex-col justify-center -mt-8">
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-4">
              让数据驱动
              <br />
              <span className="text-indigo-200">每一个决策</span>
            </h1>
            <p className="text-indigo-200/80 text-lg max-w-md leading-relaxed mb-12">
              覆盖 Source 接入、Semantic 建模与 Application 编排的统一工作台，
              帮助团队高效释放数据价值。
            </p>

            {/* 特性列表 */}
            <div className="space-y-6">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4 group">
                  <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/15 flex-shrink-0 group-hover:bg-white/15 transition-colors duration-200">
                    <f.icon className="w-5 h-5 text-indigo-200" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm mb-0.5">
                      {f.title}
                    </h3>
                    <p className="text-indigo-300/80 text-sm leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 底部 */}
          <p className="text-indigo-300/50 text-xs">
            &copy; {new Date().getFullYear()} CUBIC3 &middot; v2.0.0
          </p>
        </div>
      </div>

      {/* ===== 右侧登录区 ===== */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* 移动端 Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">CUBIC3</h2>
              <p className="text-xs text-gray-500">3 Layers: Source, Semantic, Application</p>
            </div>
          </div>

          {/* 标题 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              欢迎登录
            </h2>
            <p className="text-gray-500 text-sm">
              请选择登录方式访问 CUBIC3
            </p>
          </div>

          {/* 登录方式切换 */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => {
                setLoginMode('password')
                setError('')
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                loginMode === 'password'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              账号密码登录
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMode('feishu')
                setError('')
              }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer ${
                loginMode === 'feishu'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              飞书登录
            </button>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm animate-fade-in">
              {error}
            </div>
          )}

          {/* ---- 账号密码表单 ---- */}
          {loginMode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-5 animate-fade-in">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  用户名
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  密码
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 px-4 pr-11 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm outline-none transition-all duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    登录中...
                  </>
                ) : (
                  <>
                    登录
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ---- 飞书 SSO 登录 ---- */}
          {loginMode === 'feishu' && (
            <div className="animate-fade-in">
              <div className="text-center mb-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
                  {/* 飞书 Logo SVG */}
                  <svg
                    viewBox="0 0 24 24"
                    className="w-8 h-8"
                    fill="none"
                  >
                    <path
                      d="M4.5 3.5L9.2 7.1C9.7 7.5 10 8.1 10 8.7V20.5L5.3 16.9C4.8 16.5 4.5 15.9 4.5 15.3V3.5Z"
                      fill="#3370FF"
                    />
                    <path
                      d="M10 8.7L14.7 5.1C15.5 4.5 16.6 4.5 17.4 5.1L19.5 6.7V15.3C19.5 15.9 19.2 16.5 18.7 16.9L14 20.5V11.9C14 11.3 13.7 10.7 13.2 10.3L10 8.7Z"
                      fill="#2B5FD9"
                    />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm">
                  点击下方按钮，将跳转至飞书进行身份验证
                </p>
              </div>

              <button
                type="button"
                onClick={handleFeishuLogin}
                className="w-full h-11 bg-[#3370FF] hover:bg-[#2B5FD9] active:bg-[#2451B8] text-white font-medium text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 cursor-pointer"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path
                    d="M4.5 3.5L9.2 7.1C9.7 7.5 10 8.1 10 8.7V20.5L5.3 16.9C4.8 16.5 4.5 15.9 4.5 15.3V3.5Z"
                    fill="white"
                  />
                  <path
                    d="M10 8.7L14.7 5.1C15.5 4.5 16.6 4.5 17.4 5.1L19.5 6.7V15.3C19.5 15.9 19.2 16.5 18.7 16.9L14 20.5V11.9C14 11.3 13.7 10.7 13.2 10.3L10 8.7Z"
                    fill="rgba(255,255,255,0.7)"
                  />
                </svg>
                使用飞书账号登录
              </button>
            </div>
          )}

          {/* 分割线 + 底部提示 */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-center text-xs text-gray-400">
              登录即表示您同意平台的使用条款和隐私政策
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
