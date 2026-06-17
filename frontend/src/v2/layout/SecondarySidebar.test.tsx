import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SecondarySidebar } from './SecondarySidebar'
import { NAV_MODULES } from './navigation'

describe('SecondarySidebar', () => {
  it('支持父菜单按前缀匹配资产 Tab 子路由', () => {
    const semantic = NAV_MODULES.find((module) => module.id === 'semantic')
    if (!semantic) throw new Error('semantic module not found')

    render(
      <MemoryRouter initialEntries={['/semantic/assets/field-profile']}>
        <SecondarySidebar module={semantic} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /语义资产/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /诊断治理/ })).not.toHaveAttribute('aria-current')
  })
})
