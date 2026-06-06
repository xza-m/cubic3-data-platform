import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  FieldCandidateReview,
  type FieldCandidateReviewAction,
  type FieldCandidateReviewItem,
} from './FieldCandidateReview'

const candidates: FieldCandidateReviewItem[] = [
  {
    id: 'candidate_1',
    field: 'comment_id',
    label: '评论数',
    role: 'measure',
    aggregation: 'count',
    semanticType: 'number',
    confidence: 0.92,
    evidence: '来自 comment_id 的非空计数。',
    risk: 'medium',
  },
]

const acceptAction = {
  candidateId: 'candidate_1',
  action: 'accept',
} satisfies FieldCandidateReviewAction
const renameAction = {
  candidateId: 'candidate_1',
  action: 'rename',
  value: '评论总数',
} satisfies FieldCandidateReviewAction
const renameFallbackAction = {
  candidateId: 'candidate_1',
  action: 'rename',
  value: '评论数',
} satisfies FieldCandidateReviewAction
const ignoreAction = {
  candidateId: 'candidate_1',
  action: 'ignore',
} satisfies FieldCandidateReviewAction

describe('FieldCandidateReview', () => {
  it('以表格展示字段候选明细', () => {
    render(<FieldCandidateReview candidates={candidates} />)

    expect(screen.getByTestId('field-candidate-review')).toBeInTheDocument()
    expect(screen.getByText('字段候选审阅')).toBeInTheDocument()
    expect(
      screen.getByRole('table', { name: '字段候选审阅' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '语义名' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '物理字段' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '角色' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '聚合/类型' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '置信度' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '风险' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '证据' }),
    ).toBeInTheDocument()
    expect(screen.getByText('评论数')).toBeInTheDocument()
    expect(screen.getByText('comment_id')).toBeInTheDocument()
    expect(screen.getByText('measure')).toBeInTheDocument()
    expect(screen.getByText('count / number')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('中风险')).toBeInTheDocument()
    expect(screen.getByText('来自 comment_id 的非空计数。')).toBeInTheDocument()
  })

  it('未提供 onAction 时展示只读态且不渲染动作按钮', () => {
    render(<FieldCandidateReview candidates={candidates} />)

    expect(screen.queryByLabelText('改写 评论数')).not.toBeInTheDocument()
    expect(screen.getByText('只读')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '采纳 评论数' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '改写 评论数' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '忽略 评论数' }),
    ).not.toBeInTheDocument()
  })

  it('按统一规则展示包含风险关键词的风险文案', () => {
    render(
      <FieldCandidateReview
        candidates={[{ ...candidates[0], risk: 'high_risk' }]}
      />,
    )

    expect(screen.getByText('高风险')).toHaveClass('chip-danger')
  })

  it('点击采纳按钮触发 accept 动作', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<FieldCandidateReview candidates={candidates} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: '采纳 评论数' }))

    expect(onAction).toHaveBeenCalledWith(acceptAction)
  })

  it('点击改写按钮触发 rename 动作并传入修剪后的输入值', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<FieldCandidateReview candidates={candidates} onAction={onAction} />)

    const input = screen.getByLabelText('改写 评论数')
    await user.clear(input)
    await user.type(input, '  评论总数  ')
    await user.click(screen.getByRole('button', { name: '改写 评论数' }))

    expect(onAction).toHaveBeenCalledWith(renameAction)
  })

  it('改写输入为空时回退到原 label', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<FieldCandidateReview candidates={candidates} onAction={onAction} />)

    const input = screen.getByLabelText('改写 评论数')
    await user.clear(input)
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: '改写 评论数' }))

    expect(onAction).toHaveBeenCalledWith(renameFallbackAction)
  })

  it('点击忽略按钮触发 ignore 动作', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(<FieldCandidateReview candidates={candidates} onAction={onAction} />)

    await user.click(screen.getByRole('button', { name: '忽略 评论数' }))

    expect(onAction).toHaveBeenCalledWith(ignoreAction)
  })

  it('支持展示候选 action 状态', () => {
    render(
      <FieldCandidateReview
        candidates={[{ ...candidates[0], action: 'accepted' }]}
      />,
    )

    expect(screen.getByText('评论数')).toBeInTheDocument()
    expect(screen.getByText('已采纳')).toBeInTheDocument()
  })

  it('支持展示暂缓 action 状态', () => {
    render(
      <FieldCandidateReview
        candidates={[{ ...candidates[0], action: 'deferred' }]}
      />,
    )

    expect(screen.getByText('评论数')).toBeInTheDocument()
    expect(screen.getByText('已暂缓')).toBeInTheDocument()
  })

  it('展示空态', () => {
    render(<FieldCandidateReview candidates={[]} />)

    expect(screen.getByText('等待字段候选')).toBeInTheDocument()
    expect(
      screen.getByText('先确认来源证据，再生成字段候选表。'),
    ).toBeInTheDocument()
  })

  it('展示字符串置信度标签', () => {
    render(
      <FieldCandidateReview
        candidates={[
          {
            id: 'candidate_1',
            field: 'school_name',
            label: '学校',
            role: 'dimension',
            confidenceLabel: 'high',
          },
        ]}
      />,
    )

    expect(screen.getByText('学校')).toBeInTheDocument()
    expect(screen.getByText('dimension')).toBeInTheDocument()
    expect(screen.getByText('high')).toBeInTheDocument()
  })

  it('展示审阅进度并支持只看高风险字段', async () => {
    const user = userEvent.setup()
    render(
      <FieldCandidateReview
        candidates={[
          {
            ...candidates[0],
            id: 'low_1',
            field: 'student_id',
            label: '学生',
            role: 'dimension',
            risk: 'low',
            action: 'accepted',
          },
          {
            ...candidates[0],
            id: 'high_1',
            field: 'duration_sec',
            label: '学习时长',
            role: 'measure',
            risk: 'high',
            action: 'pending',
          },
        ]}
      />,
    )

    expect(screen.getByText('已处理 1 / 2')).toBeInTheDocument()
    expect(screen.getByText('高风险 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '只看高风险' }))

    expect(screen.queryByText('student_id')).not.toBeInTheDocument()
    expect(screen.getByText('duration_sec')).toBeInTheDocument()
  })

  it('高风险筛选无结果时展示筛选空态并支持返回全部', async () => {
    const user = userEvent.setup()
    render(
      <FieldCandidateReview
        candidates={[
          {
            ...candidates[0],
            id: 'low_1',
            field: 'student_id',
            label: '学生',
            role: 'dimension',
            risk: 'low',
          },
        ]}
      />,
    )

    await user.click(screen.getByRole('button', { name: '只看高风险' }))

    expect(screen.getByText('当前筛选无高风险字段')).toBeInTheDocument()
    expect(screen.queryByText('student_id')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '显示全部' }))

    expect(screen.getByText('student_id')).toBeInTheDocument()
  })

  it('低风险批量采纳只提交 pending low risk candidates', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <FieldCandidateReview
        candidates={[
          {
            ...candidates[0],
            id: 'low_1',
            field: 'student_id',
            label: '学生',
            risk: 'low',
            action: 'pending',
          },
          {
            ...candidates[0],
            id: 'high_1',
            field: 'duration_sec',
            label: '学习时长',
            risk: 'high',
            action: 'pending',
          },
          {
            ...candidates[0],
            id: 'low_done',
            field: 'school_id',
            label: '学校',
            risk: 'low',
            action: 'accepted',
          },
        ]}
        onAction={onAction}
      />,
    )

    await user.click(screen.getByRole('button', { name: '批量采纳低风险 1' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith({
      candidateId: 'low_1',
      action: 'accept',
    })
  })

  it('展示 Cube 与本体行内映射', () => {
    render(
      <FieldCandidateReview
        candidates={[
          {
            ...candidates[0],
            field: 'duration_sec',
            label: '学习时长',
            cubeBindingLabel: 'measure.learning_duration',
            ontologyBindingLabel: 'metric.learning_duration',
          },
        ]}
      />,
    )

    expect(
      screen.getByRole('columnheader', { name: 'Cube 映射' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: '本体锚定' }),
    ).toBeInTheDocument()
    expect(screen.getByText('measure.learning_duration')).toBeInTheDocument()
    expect(screen.getByText('metric.learning_duration')).toBeInTheDocument()
  })
})
