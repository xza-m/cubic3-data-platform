import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@v2/api/client', () => ({
  apiClient: { post: vi.fn() },
  getAccessToken: vi.fn(() => null),
  setTokenPair: vi.fn(),
}))

vi.mock('@v2/components/ThemeProvider', () => ({
  useTheme: () => ({
    effectiveTheme: 'light',
    toggle: vi.fn(),
  }),
}))

import { buildCliExchangeCommand } from './login-utils'
import Login from './Login'

describe('Login CLI authorization callback', () => {
  it('renders a dedicated CLI completion page instead of the password login form', () => {
    render(
      <MemoryRouter initialEntries={['/login?cli_code=code_abc123']}>
        <Login />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('cli-authorization-success')).toBeInTheDocument()
    expect(screen.getByText('CLI 授权已生成')).toBeInTheDocument()
    expect(screen.getByText(/cubic3-dp --base-url/)).toHaveTextContent(
      "auth feishu --exchange-code 'code_abc123'",
    )
    expect(screen.queryByPlaceholderText('管理员账号')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('请输入密码')).not.toBeInTheDocument()
  })

  it('builds a self-contained exchange command with the callback origin', () => {
    expect(buildCliExchangeCommand('code_abc123', 'http://localhost:81')).toBe(
      "cubic3-dp --base-url 'http://localhost:81' auth feishu --exchange-code 'code_abc123'",
    )
  })
})
