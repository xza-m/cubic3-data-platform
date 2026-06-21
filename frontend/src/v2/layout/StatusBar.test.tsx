import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar'

describe('StatusBar', () => {
  it('只展示用户可理解的服务状态，不泄漏内部路径和分支信息', () => {
    render(<StatusBar />)

    expect(screen.getByText('服务正常')).toBeInTheDocument()
    expect(screen.getByText('命令')).toBeInTheDocument()
    expect(screen.getByText('快捷键')).toBeInTheDocument()
    expect(screen.queryByText(/\/api|:81|redesign\/v0|preview/)).not.toBeInTheDocument()
  })
})
