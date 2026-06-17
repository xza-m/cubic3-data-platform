import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ExtractionConfig from './ExtractionConfig'

vi.mock('@v2/hooks/extraction', () => ({
  useExtractionHealth: () => ({
    data: {
      status: 'up',
      components: {
        database: 'up',
        redis: 'up',
        task_queue: 'up',
        queue_info: {
          name: 'default',
          count: 0,
          finished_count: 1,
          failed_count: 86,
        },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
}))

vi.mock('@v2/layout/AppShell', () => ({
  useAppShell: () => ({
    setBreadcrumbs: vi.fn(),
    setTopBarActions: vi.fn(),
    setContextPanel: vi.fn(),
  }),
}))

describe('ExtractionConfig', () => {
  it('用中文同步配置文案，并把失败次数解释为历史指标', () => {
    render(
      <MemoryRouter initialEntries={['/data-center/sync/config']}>
        <ExtractionConfig />
      </MemoryRouter>,
    )

    expect(screen.getByText('同步设置')).toBeInTheDocument()
    expect(screen.queryByText('Sync Settings')).not.toBeInTheDocument()
    expect(screen.getByText('历史失败')).toBeInTheDocument()
    expect(screen.getByText('86')).toBeInTheDocument()
    expect(screen.getByText(/历史失败次数用于排障追踪/)).toBeInTheDocument()
  })
})
