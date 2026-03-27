import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RegisterFlowShell } from './RegisterFlowShell'

describe('RegisterFlowShell', () => {
  it('在未提供 sidebar 时不保留双栏模板', () => {
    render(
      <RegisterFlowShell title="注册流程" description="逐步完成数据集注册">
        <div>主流程内容</div>
      </RegisterFlowShell>,
    )

    const shell = screen.getByTestId('register-flow-shell')
    const body = shell.querySelector(':scope > div.grid')

    expect(screen.getByRole('heading', { name: '注册流程' })).toBeInTheDocument()
    expect(screen.getByText('逐步完成数据集注册')).toBeInTheDocument()
    expect(screen.getByText('主流程内容')).toBeInTheDocument()
    expect(body).not.toHaveClass('lg:grid-cols-[minmax(0,1fr)_19rem]')
  })
})
