import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AssetLayout from './_layout'

function renderAssetLayout(path = '/semantic/assets') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/semantic/assets" element={<AssetLayout />}>
          <Route index element={<div>资产雷达内容</div>} />
          <Route path="tables" element={<div>物理表内容</div>} />
          <Route path="table-profile" element={<div>表画像内容</div>} />
          <Route path="field-profile" element={<div>字段画像内容</div>} />
          <Route path="lineage-usage" element={<div>血缘使用内容</div>} />
          <Route path="sync" element={<div>元数据同步内容</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AssetLayout', () => {
  it('用顶部 Tab 承载语义资产子视图', () => {
    renderAssetLayout('/semantic/assets/field-profile')

    expect(screen.getByRole('tablist', { name: '语义资产导航' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /资产雷达/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /字段画像/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /元数据同步/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('字段画像内容')).toBeInTheDocument()
  })

  it('元数据同步作为记录页保留在资产 Tab 内', () => {
    renderAssetLayout('/semantic/assets/sync')

    expect(screen.getByRole('tab', { name: /元数据同步/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('元数据同步内容')).toBeInTheDocument()
  })
})
