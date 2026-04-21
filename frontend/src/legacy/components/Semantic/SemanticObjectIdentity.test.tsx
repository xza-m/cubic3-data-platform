import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SemanticObjectIdentity } from './SemanticObjectIdentity'

describe('SemanticObjectIdentity', () => {
  it('在描述和元信息缺失时只展示主标识', () => {
    render(<SemanticObjectIdentity title="学生档案" code="student_profile" meta={[undefined, null]} />)

    expect(screen.getByText('学生档案')).toBeInTheDocument()
    expect(screen.getByText('student_profile')).toBeInTheDocument()
    expect(screen.queryByText(/班级/)).not.toBeInTheDocument()
  })
})
