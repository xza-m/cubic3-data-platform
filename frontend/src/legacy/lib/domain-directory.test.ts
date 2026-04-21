import { describe, expect, it } from 'vitest'
import {
  buildDomainListContextBarItems,
  domainDirectoryKey,
  domainDirectoryStatusVariant,
  formatDomainDirectoryTime,
  getDomainCatalogHealth,
  getDomainDirectoryGovernanceLabel,
  getDomainDirectoryHealth,
} from './domain-directory'

describe('domain-directory helpers', () => {
  it('domainDirectoryKey 在缺失领域时返回空字符串', () => {
    expect(domainDirectoryKey()).toBe('')
    expect(domainDirectoryKey(null)).toBe('')
    expect(domainDirectoryKey({ id: 12, code: 'retail' } as never)).toBe('12')
    expect(domainDirectoryKey({ id: null, code: 'retail' } as never)).toBe('retail')
  })

  it('formatDomainDirectoryTime 处理空值、非法值和合法时间', () => {
    expect(formatDomainDirectoryTime()).toBe('未记录')
    expect(formatDomainDirectoryTime(null)).toBe('未记录')
    expect(formatDomainDirectoryTime('not-a-date')).toBe('not-a-date')
    expect(formatDomainDirectoryTime('2026-04-01T08:30:00Z')).toContain('2026')
  })

  it('domainDirectoryStatusVariant 根据状态返回不同展示样式', () => {
    expect(domainDirectoryStatusVariant('active')).toBe('default')
    expect(domainDirectoryStatusVariant('draft')).toBe('secondary')
    expect(domainDirectoryStatusVariant('archived')).toBe('outline')
  })

  it('getDomainDirectoryGovernanceLabel 覆盖空领域、Join 缺失、待发布和已发布', () => {
    expect(getDomainDirectoryGovernanceLabel({ cube_count: 0 } as never)).toEqual({
      label: '空领域',
      tone: 'warning',
    })
    expect(
      getDomainDirectoryGovernanceLabel({ cube_count: 3, join_count: 0, status: 'active' } as never),
    ).toEqual({
      label: 'Join 缺失',
      tone: 'warning',
    })
    expect(
      getDomainDirectoryGovernanceLabel({ cube_count: 1, join_count: 1, status: 'draft' } as never),
    ).toEqual({
      label: '待发布',
      tone: 'default',
    })
    expect(
      getDomainDirectoryGovernanceLabel({ cube_count: 1, join_count: 1, status: 'active' } as never),
    ).toEqual({
      label: '已发布',
      tone: 'accent',
    })
  })

  it('getDomainDirectoryHealth 覆盖未选择、空领域、Join 缺失、草稿和已发布', () => {
    expect(getDomainDirectoryHealth()).toEqual({
      tone: 'neutral',
      title: '当前未选择领域',
      description: '显示所选领域的状态、规模和治理信息。',
    })
    expect(getDomainDirectoryHealth({ cube_count: 0 } as never)).toEqual({
      tone: 'warn',
      title: '当前领域尚未纳入 Cube',
      description: '显示领域边界和纳入状态。',
    })
    expect(getDomainDirectoryHealth({ cube_count: 2, join_count: 0, status: 'active' } as never)).toEqual({
      tone: 'warn',
      title: '当前领域缺少 Join',
      description: '显示关联关系和发布状态。',
    })
    expect(getDomainDirectoryHealth({ cube_count: 1, join_count: 1, status: 'draft' } as never)).toEqual({
      tone: 'neutral',
      title: '当前领域为草稿',
      description: '显示领域规模、关系和发布状态。',
    })
    expect(getDomainDirectoryHealth({ cube_count: 1, join_count: 1, status: 'active' } as never)).toEqual({
      tone: 'ok',
      title: '当前领域已发布',
      description: '显示领域规模、关系和说明。',
    })
  })

  it('getDomainCatalogHealth 覆盖未选择、空目录、草稿积压、治理待收口和稳定目录', () => {
    expect(getDomainCatalogHealth()).toEqual({
      tone: 'neutral',
      title: '当前未选择目录',
      description: '显示目录内领域的治理状态。',
    })
    expect(getDomainCatalogHealth({ domain_count: 0, draft_count: 0, active_count: 0, name: '空目录' })).toEqual({
      tone: 'warn',
      title: '当前目录为空',
      description: '显示目录规模和领域归属。',
    })
    expect(
      getDomainCatalogHealth({ domain_count: 2, draft_count: 1, active_count: 1, name: '销售目录' }, []),
    ).toEqual({
      tone: 'warn',
      title: '目录内仍有草稿积压',
      description: '显示当前目录内 1 个草稿领域和已发布领域。',
    })
    expect(
      getDomainCatalogHealth(
        { domain_count: 2, draft_count: 0, active_count: 2, name: '治理中' },
        [
          { cube_count: 0, join_count: 0 } as never,
          { cube_count: 2, join_count: 0 } as never,
        ],
      ),
    ).toEqual({
      tone: 'neutral',
      title: '目录治理仍需收口',
      description: '显示空领域 1 个和 Join 缺失 1 个。',
    })
    expect(
      getDomainCatalogHealth(
        { domain_count: 1, draft_count: 0, active_count: 1, name: '稳定目录' },
        [{ cube_count: 1, join_count: 1 } as never],
      ),
    ).toEqual({
      tone: 'ok',
      title: '目录结构已经稳定',
      description: '显示目录规模、发布状态和治理摘要。',
    })
  })

  it('buildDomainListContextBarItems 生成包含页码兜底和治理透镜 tone 的上下文项', () => {
    expect(
      buildDomainListContextBarItems({
        activeCatalogName: null,
        totalDomains: 8,
        draftCount: 2,
        lensLabel: 'Join 缺失',
        lensIsAll: false,
        pageNumber: 0,
        pageCount: 0,
      }),
    ).toEqual([
      { label: '当前目录', value: '未选择', tone: 'default' },
      { label: '领域数', value: 8, tone: 'default' },
      { label: '草稿数', value: 2, tone: 'warning' },
      { label: '治理透镜', value: 'Join 缺失', tone: 'accent' },
      { label: '当前页', value: '1 / 1', tone: 'default' },
    ])
  })
})
