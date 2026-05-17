// CubeEditor 单测：增删改 + readonly + inline error
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { CubeEditor, type CubeSpecValue, type CubeFieldIssue } from './CubeEditor'

function baseValue(): CubeSpecValue {
  return {
    name: 'student_comment_cube',
    source: 'df.dwd_student_comment',
    dimensions: [
      { name: 'school_id', type: 'string', expr: 'school_id', primary: false },
      { name: 'dt', type: 'date', expr: 'dt', primary: true },
    ],
    measures: [
      { name: 'comment_count', type: 'count', sql: 'count(*)', time_dimension: 'dt' },
    ],
  }
}

describe('CubeEditor', () => {
  it('readonly 模式下：不渲染输入框，只显示文本与字段值', () => {
    render(<CubeEditor value={baseValue()} editable={false} />)

    // 不应有可写 input
    const inputs = document.querySelectorAll('input[type="text"]')
    expect(inputs.length).toBe(0)

    // name / source 仍展示
    expect(screen.getByText('student_comment_cube')).toBeInTheDocument()
    expect(screen.getByText('df.dwd_student_comment')).toBeInTheDocument()

    // 没有「新增 / 删除维度 / 删除度量」按钮
    expect(screen.queryByText('新增')).toBeNull()
    expect(screen.queryByLabelText('删除维度')).toBeNull()
    expect(screen.queryByLabelText('删除度量')).toBeNull()
  })

  it('editable 模式下：改名称触发 onChange 携带新 name', () => {
    const onChange = vi.fn()
    render(<CubeEditor value={baseValue()} onChange={onChange} />)
    const nameInputs = document.querySelectorAll('input[type="text"]')
    // 第一个 input 是 Cube 名称
    fireEvent.change(nameInputs[0], { target: { value: 'student_comment_cube_v2' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].name).toBe('student_comment_cube_v2')
  })

  it('点击「新增」维度后 onChange 收到追加的空 dimension', () => {
    const onChange = vi.fn()
    render(<CubeEditor value={baseValue()} onChange={onChange} />)
    const sections = screen.getAllByText('新增').map((el) => el.closest('button')!)
    // 第一个是维度区
    fireEvent.click(sections[0])
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as CubeSpecValue
    expect(next.dimensions).toHaveLength(3)
    expect(next.dimensions?.[2]).toEqual({ name: '', type: 'string', expr: '' })
  })

  it('点击删除度量按钮后 onChange 收到去掉对应行的 measures', () => {
    const onChange = vi.fn()
    render(<CubeEditor value={baseValue()} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('删除度量'))
    const next = onChange.mock.calls[0][0] as CubeSpecValue
    expect(next.measures).toHaveLength(0)
  })

  it('issues 命中字段时显示 inline AlertTriangle icon 与错误文案', () => {
    const issues: CubeFieldIssue[] = [
      { path: 'cube.measures[0].sql', severity: 'error', message: 'SQL 表达式不能为空' },
      { path: 'cube.name', severity: 'warning', message: '建议命名加业务前缀' },
    ]
    const { container } = render(<CubeEditor value={baseValue()} issues={issues} />)

    // name 行右侧应有 warning 文案
    expect(screen.getByText('建议命名加业务前缀')).toBeInTheDocument()
    // measures[0].sql 单元格内应渲染至少一个 AlertTriangle icon
    const triangles = container.querySelectorAll('svg.lucide-triangle-alert, svg.lucide-alert-triangle')
    expect(triangles.length).toBeGreaterThanOrEqual(2)
  })

  it('点击「换源表」按钮触发 onSwapSource', () => {
    const onSwapSource = vi.fn()
    render(<CubeEditor value={baseValue()} onSwapSource={onSwapSource} />)
    fireEvent.click(screen.getByText('换源表'))
    expect(onSwapSource).toHaveBeenCalledTimes(1)
  })

  it('空 dimensions / measures 时显示空状态文案，editable=true 显示「点击「新增」」', () => {
    render(<CubeEditor value={{ name: 'x', source: 'y', dimensions: [], measures: [] }} />)
    const empties = screen.getAllByText(/点击「新增」/)
    expect(empties).toHaveLength(2)
  })
})
