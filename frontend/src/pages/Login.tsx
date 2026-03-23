import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, BarChart3, Eye, EyeOff, Loader2 } from 'lucide-react'

function MetaItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-[1.15rem] border border-[rgba(69,56,40,0.12)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8e7e6b]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[#2b241d]">{value}</div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loginMode, setLoginMode] = useState<'password' | 'feishu'>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const callbackError = searchParams.get('error')

    if (token) {
      localStorage.setItem('auth_token', token)
      navigate('/dashboard', { replace: true })
    } else if (callbackError) {
      setError(decodeURIComponent(callbackError))
    }
  }, [navigate, searchParams])

  const handlePasswordLogin = async (event: FormEvent) => {
    event.preventDefault()
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
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setError(payload?.message || '登录失败，请检查用户名和密码')
        return
      }

      localStorage.setItem('auth_token', payload.token || payload.data?.token)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleFeishuLogin = () => {
    window.location.href = '/api/v1/auth/feishu/authorize'
  }

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-[#201912]">
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.78),transparent_38%),radial-gradient(circle_at_bottom,rgba(222,210,190,0.32),transparent_34%)]" />

        <main className="relative mx-auto flex min-h-screen w-full max-w-[30rem] flex-col justify-center px-6 py-12">
          <div className="mb-8 flex items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-[rgba(69,56,40,0.12)] bg-[rgba(255,252,247,0.8)] px-4 py-2.5 shadow-[0_12px_32px_rgba(49,37,24,0.06)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2b241d] text-white">
                <BarChart3 className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight text-[#2b241d]">CUBIC3</div>
                <div className="text-[11px] tracking-[0.08em] text-[#8e7e6b]">Workspace access</div>
              </div>
            </div>
          </div>

          <section className="rounded-[2rem] border border-[rgba(69,56,40,0.12)] bg-[rgba(255,252,247,0.9)] p-7 shadow-[0_24px_60px_rgba(49,37,24,0.08)] backdrop-blur-sm sm:p-8">
            <div className="space-y-3 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e7e6b]">Sign in</div>
              <h1 className="text-[2rem] font-semibold tracking-[-0.045em] text-[#211a14]">登录工作台</h1>
              <p className="text-sm leading-6 text-[#6d5f52]">
                输入账号后进入 CUBIC3。当前页只保留登录方式、环境提示和必要状态，不再叠加品牌说明栏。
              </p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MetaItem label="当前环境" value="localhost:81" />
              <MetaItem label="备用账号" value="admin" />
            </div>

            <div className="mt-6 inline-flex w-full rounded-[1.1rem] bg-[rgba(74,61,45,0.08)] p-1">
              <button
                type="button"
                onClick={() => {
                  setLoginMode('password')
                  setError('')
                }}
                className={`flex-1 rounded-[0.95rem] px-4 py-2.5 text-sm font-medium transition-colors ${
                  loginMode === 'password'
                    ? 'bg-[rgba(255,252,247,0.96)] text-[#201912] shadow-[0_8px_20px_rgba(49,37,24,0.08)]'
                    : 'text-[#7a6b5d] hover:text-[#201912]'
                }`}
              >
                账号密码
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginMode('feishu')
                  setError('')
                }}
                className={`flex-1 rounded-[0.95rem] px-4 py-2.5 text-sm font-medium transition-colors ${
                  loginMode === 'feishu'
                    ? 'bg-[rgba(255,252,247,0.96)] text-[#201912] shadow-[0_8px_20px_rgba(49,37,24,0.08)]'
                    : 'text-[#7a6b5d] hover:text-[#201912]'
                }`}
              >
                飞书登录
              </button>
            </div>

            {error ? (
              <div className="mt-5 rounded-[1rem] border border-[rgba(192,84,57,0.22)] bg-[rgba(214,98,68,0.08)] px-4 py-3 text-sm text-[#a24a34]">
                {error}
              </div>
            ) : null}

            {loginMode === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="block text-sm font-medium text-[#3a3026]">
                    用户名
                  </label>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="请输入用户名"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="h-12 w-full rounded-[1rem] border border-[rgba(69,56,40,0.14)] bg-[rgba(255,252,247,0.95)] px-4 text-sm text-[#201912] outline-none transition-all placeholder:text-[#a09182] focus:border-[rgba(92,76,58,0.35)] focus:ring-2 focus:ring-[rgba(92,76,58,0.08)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-[#3a3026]">
                    密码
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="请输入密码"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 w-full rounded-[1rem] border border-[rgba(69,56,40,0.14)] bg-[rgba(255,252,247,0.95)] px-4 pr-11 text-sm text-[#201912] outline-none transition-all placeholder:text-[#a09182] focus:border-[rgba(92,76,58,0.35)] focus:ring-2 focus:ring-[rgba(92,76,58,0.08)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e7e6b] transition-colors hover:text-[#4e4337]"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[1rem] bg-[#2f251c] text-sm font-medium text-white transition-colors hover:bg-[#241b13] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      登录中...
                    </>
                  ) : (
                    <>
                      继续
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-[1.2rem] border border-[rgba(69,56,40,0.12)] bg-[rgba(255,252,247,0.72)] px-4 py-4">
                  <div className="text-sm font-medium text-[#2b241d]">飞书单点登录</div>
                  <p className="mt-2 text-sm leading-6 text-[#6d5f52]">
                    点击后跳转到飞书完成身份验证。成功后会自动回到当前工作台。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleFeishuLogin}
                  className="flex h-12 w-full items-center justify-center rounded-[1rem] bg-[#3370FF] text-sm font-medium text-white transition-colors hover:bg-[#295fd8]"
                >
                  使用飞书账号登录
                </button>
              </div>
            )}
          </section>

          <p className="mt-5 text-center text-xs leading-5 text-[#8e7e6b]">
            登录即表示你同意当前环境的访问策略和审计要求。
          </p>
        </main>
      </div>
    </div>
  )
}
