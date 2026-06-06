// frontend/src/v2/lib/copilot.test.ts
//
// 单元测试 lib/copilot 提供的 adapter 与工具函数。

import { describe, expect, it } from 'vitest'
import {
  buildAssistantCards,
  countCanvasAssets,
  entryTypeLabel,
  inferEntryType,
  readinessLabel,
  readinessTone,
  sessionTitle,
  statusTone,
} from './copilot'
import type { SemanticModelingCopilotSession } from '@v2/api/semantic'

describe('inferEntryType', () => {
  it('包含未命中 / trace 关键词识别为 semantic_gap', () => {
    expect(inferEntryType('Data Agent 未命中"班级活跃度"，帮我补语义')).toBe('semantic_gap')
    expect(inferEntryType('miss_trace_id=t_29ax，帮我看下')).toBe('semantic_gap')
    expect(inferEntryType('未命中：order_refund_rate')).toBe('semantic_gap')
  })

  it('含表名前缀（dwd / ods / ads / fact / dim）识别为 table_known', () => {
    expect(inferEntryType('基于 dwd_order_fact 建一个订单退款率指标')).toBe('table_known')
    expect(inferEntryType('Use ads_user_metric to compute weekly DAU')).toBe('table_known')
    expect(inferEntryType('dim_school 怎么用')).toBe('table_known')
  })

  it('其他默认 business_question', () => {
    expect(inferEntryType('查询最近 7 天学生评论数，按学校汇总')).toBe('business_question')
    expect(inferEntryType('我想看本月续费率')).toBe('business_question')
    expect(inferEntryType('')).toBe('business_question')
  })
})

describe('entryTypeLabel', () => {
  it('返回三种入口类型的中文标签', () => {
    expect(entryTypeLabel('business_question')).toBe('业务问题')
    expect(entryTypeLabel('table_known')).toBe('已知事实表')
    expect(entryTypeLabel('semantic_gap')).toBe('未命中 Trace')
    expect(entryTypeLabel(undefined)).toBe('业务问题')
  })
})

describe('readinessLabel / readinessTone', () => {
  function mkSession(overrides: Partial<SemanticModelingCopilotSession>): SemanticModelingCopilotSession {
    return {
      id: 's',
      user_goal: 'g',
      entry_type: 'business_question',
      status: 'active',
      workbench_state: {},
      ...overrides,
    }
  }

  it('空会话 -> 等你描述需求 + neutral', () => {
    expect(readinessLabel(null)).toBe('等你描述需求')
    expect(readinessLabel(undefined)).toBe('等你描述需求')
    expect(readinessTone(null)).toBe('neutral')
  })

  it('已发布 -> 已发布 + success', () => {
    const s = mkSession({
      workbench_state: { publish_result: { status: 'published' } },
    })
    expect(readinessLabel(s)).toBe('已发布 · 消费者可验证')
    expect(readinessTone(s)).toBe('success')
  })

  it('current_proposal_id 存在 -> 语义已就绪 · 待发布 + accent', () => {
    const s = mkSession({ current_proposal_id: 'proposal_x', workbench_state: {} })
    expect(readinessLabel(s)).toBe('语义已就绪 · 待发布')
    expect(readinessTone(s)).toBe('accent')
  })

  it('阻断确认非空 -> 请确认 N 项口径 + warning', () => {
    const s = mkSession({
      workbench_state: {
        required_confirmations: [
          { id: 'c1', recommended_value: 'v' },
          { id: 'c2', recommended_value: 'v' },
        ],
      },
    })
    expect(readinessLabel(s)).toBe('请确认 2 项口径')
    expect(readinessTone(s)).toBe('warning')
  })

  it('Cube 草稿待接受（后端 raw_spec.cube 单数）-> warning', () => {
    const s = mkSession({
      workbench_state: {
        // SemanticModelingAgent 后端写的是 spec.cube（单数）
        raw_spec: { cube: { name: 'c1', source: 'dwd_x' } } as Record<string, unknown>,
      },
    })
    expect(readinessLabel(s)).toBe('Cube 草稿待接受')
    expect(readinessTone(s)).toBe('warning')
  })

  it('Cube 草稿待接受（兼容 raw_spec.cubes[] 复数 dialect）', () => {
    const s = mkSession({
      workbench_state: {
        raw_spec: { cubes: [{ name: 'c1', source: 'dwd_x' }] } as Record<string, unknown>,
      },
    })
    expect(readinessLabel(s)).toBe('Cube 草稿待接受')
  })

  it('canvas 已有资产且口径就绪 -> 可应用语义', () => {
    const s = mkSession({
      workbench_state: {
        semantic_canvas: { metrics: [{ name: 'm1' }] },
      },
    })
    expect(readinessLabel(s)).toBe('可应用语义')
    expect(readinessTone(s)).toBe('neutral')
  })
})

describe('buildAssistantCards', () => {
  function makeSession(state: Partial<SemanticModelingCopilotSession['workbench_state']>): SemanticModelingCopilotSession {
    return {
      id: 's',
      user_goal: 'g',
      entry_type: 'business_question',
      status: 'active',
      conversation: [],
      workbench_state: state,
    }
  }

  it('canvas 与 candidates 都为空时不输出 discovered 卡', () => {
    const cards = buildAssistantCards(makeSession({}))
    expect(cards).toHaveLength(0)
  })

  it('canvas 含 metrics 输出 discovered 卡', () => {
    const cards = buildAssistantCards(
      makeSession({ semantic_canvas: { metrics: [{ name: 'm1', title: 'M1' }] } }),
    )
    expect(cards.find((c) => c.type === 'discovered')).toBeDefined()
  })

  it('required_confirmations 非空输出 confirmation 卡', () => {
    const cards = buildAssistantCards(
      makeSession({
        required_confirmations: [
          { id: 'c1', title: 'q1', recommended_value: 'v1', blocking: true },
        ],
      }),
    )
    const conf = cards.find((c) => c.type === 'confirmation')
    expect(conf).toBeDefined()
    if (conf?.type === 'confirmation') {
      expect(conf.confirmations).toHaveLength(1)
    }
  })

  it('sandbox_preview 非空输出 sandbox_result 卡', () => {
    const cards = buildAssistantCards(
      makeSession({ sandbox_preview: { status: 'ready', pollutes_official_route: false } }),
    )
    expect(cards.find((c) => c.type === 'sandbox_result')).toBeDefined()
  })

  it('current_proposal_id 出现时输出 saved 卡', () => {
    const session: SemanticModelingCopilotSession = {
      id: 's',
      user_goal: 'g',
      entry_type: 'business_question',
      status: 'active',
      conversation: [],
      current_proposal_id: 'proposal_xyz',
      workbench_state: { proposal_summary: { id: 'proposal_xyz', status: 'validated' } },
    }
    const cards = buildAssistantCards(session)
    const saved = cards.find((c) => c.type === 'saved')
    expect(saved).toBeDefined()
    if (saved?.type === 'saved') {
      expect(saved.proposalId).toBe('proposal_xyz')
    }
  })

  it('空 proposal_summary 不输出 saved 卡，避免把未生成 spec 误报成待发布', () => {
    const cards = buildAssistantCards(
      makeSession({
        source_candidates: [{ id: 'source_1', name: 'dwd_learning_activity_df' }],
        readiness: {
          canonical_ready: false,
          exploratory_ready: false,
          reasons: ['source_candidate_confirmation_required', 'spec_not_generated'],
        },
        proposal_summary: {},
      }),
    )

    expect(cards.map((c) => c.type)).toEqual(['source_candidates'])
  })

  it('卡片顺序：discovered -> confirmation -> sandbox -> saved', () => {
    const session: SemanticModelingCopilotSession = {
      id: 's',
      user_goal: 'g',
      entry_type: 'business_question',
      status: 'active',
      current_proposal_id: 'p1',
      conversation: [],
      workbench_state: {
        semantic_canvas: { metrics: [{ name: 'm1' }] },
        required_confirmations: [{ id: 'c1', recommended_value: 'v' }],
        sandbox_preview: { status: 'ready' },
        proposal_summary: { id: 'p1' },
      },
    }
    const cards = buildAssistantCards(session)
    expect(cards.map((c) => c.type)).toEqual([
      'discovered',
      'confirmation',
      'sandbox_result',
      'saved',
    ])
  })
})

describe('countCanvasAssets', () => {
  it('合计 5 类资产 + candidate_cards 数量', () => {
    expect(
      countCanvasAssets({
        semantic_canvas: {
          objects: [{}, {}],
          metrics: [{}],
          dimensions: [{}],
          bindings: [],
          policies: [{}],
        },
        candidate_cards: [{}, {}],
      }),
    ).toBe(7)
  })

  it('空状态返回 0', () => {
    expect(countCanvasAssets(undefined)).toBe(0)
    expect(countCanvasAssets({})).toBe(0)
  })
})

describe('statusTone', () => {
  it('active / approved -> success', () => {
    expect(statusTone('active')).toBe('success')
    expect(statusTone('approved')).toBe('success')
    expect(statusTone('P0')).toBe('success')
  })

  it('proposed / draft -> warning', () => {
    expect(statusTone('proposed')).toBe('warning')
    expect(statusTone('draft')).toBe('warning')
    expect(statusTone('P2')).toBe('warning')
  })

  it('blocked / failed -> danger', () => {
    expect(statusTone('blocked')).toBe('danger')
    expect(statusTone('failed')).toBe('danger')
  })

  it('candidate / restricted -> accent', () => {
    expect(statusTone('candidate')).toBe('accent')
    expect(statusTone('restricted')).toBe('accent')
  })

  it('未知值 -> neutral', () => {
    expect(statusTone('foo')).toBe('neutral')
    expect(statusTone(undefined)).toBe('neutral')
  })
})

describe('sessionTitle', () => {
  it('优先用 title', () => {
    expect(
      sessionTitle({
        id: 's',
        user_goal: 'goal',
        entry_type: 'business_question',
        status: 'active',
        title: '我的会话',
        workbench_state: {},
      }),
    ).toBe('我的会话')
  })

  it('没有 title 时回退 user_goal（必要时截断）', () => {
    expect(
      sessionTitle({
        id: 's',
        user_goal: '查询最近7天学生评论数',
        entry_type: 'business_question',
        status: 'active',
        workbench_state: {},
      }),
    ).toBe('查询最近7天学生评论数')

    const long = '查询最近7天学生评论数，按学校汇总，并展示Top10学校的趋势图'
    expect(sessionTitle({
      id: 's',
      user_goal: long,
      entry_type: 'business_question',
      status: 'active',
      workbench_state: {},
    })).toMatch(/…$/)
  })

  it('无 session 返回准备开始', () => {
    expect(sessionTitle(null)).toBe('准备开始')
  })
})
