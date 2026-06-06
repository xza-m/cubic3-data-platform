import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BATCH_PROJECT_ID,
  createWorkbenchCandidateTarget,
  normalizeWorkbenchProjectId,
  readWorkbenchCandidateState,
} from './workbenchContext'

describe('workbenchContext', () => {
  it('normalizes project ids for stable URLs', () => {
    expect(normalizeWorkbenchProjectId(' 学情 分析 ')).toBe('xue-qing-fen-xi')
    expect(normalizeWorkbenchProjectId('')).toBe(DEFAULT_BATCH_PROJECT_ID)
    expect(normalizeWorkbenchProjectId('batch_2026')).toBe('batch-2026')
    expect(normalizeWorkbenchProjectId('业务域')).toBe('u4e1a-u52a1-u57df')
  })

  it('builds a candidate route target with full context in location state', () => {
    const target = createWorkbenchCandidateTarget(
      {
        id: 'fact-learning-activity',
        title: '学情分析事实主题候选',
        target: 'semantic_center',
        source: 'dwd_learning_activity_df',
        grain: '一条学习行为事件',
        confidence: 0.88,
        risk: 'low',
        status: 'ready_for_review',
        primaryAction: 'open_builder',
        evidence: ['表画像显示行为时间字段完整。'],
        modelingSource: {
          source_kind: 'physical_table',
          source_id: 1,
          database: 'dw',
          table: 'dwd_learning_activity_df',
        },
      },
      { projectId: 'build-learning', mode: 'batch' },
    )

    expect(target.pathname).toBe('/semantic/modeling-workbench/build-learning/candidate/fact-learning-activity')
    expect(target.state).toEqual({
      workbenchMode: 'batch',
      projectId: 'build-learning',
      candidateId: 'fact-learning-activity',
      candidateTitle: '学情分析事实主题候选',
      target: 'semantic_center',
      source: 'dwd_learning_activity_df',
      grain: '一条学习行为事件',
      risk: 'low',
      evidence: ['表画像显示行为时间字段完整。'],
      modelingSource: {
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        table: 'dwd_learning_activity_df',
      },
    })

    const encodedTarget = createWorkbenchCandidateTarget(
      {
        id: ' fact/activity?draft ',
        title: '学情分析事实主题候选',
        target: 'semantic_center',
        source: 'dwd_learning_activity_df',
        grain: '一条学习行为事件',
        confidence: 0.88,
        risk: 'low',
        status: 'ready_for_review',
        primaryAction: 'open_builder',
        evidence: ['表画像显示行为时间字段完整。'],
      },
      { projectId: 'build-learning', mode: 'batch' },
    )

    expect(encodedTarget.pathname).toBe('/semantic/modeling-workbench/build-learning/candidate/fact%2Factivity%3Fdraft')
  })

  it('preserves API project ids instead of slug-normalizing them', () => {
    const target = createWorkbenchCandidateTarget(
      {
        id: 'pkg:fact/activity',
        title: '学情分析事实主题候选',
        target: 'semantic_center',
        source: 'dwd_learning_activity_df',
        grain: '一条学习行为事件',
        confidence: 0.88,
        risk: 'low',
        status: 'ready_for_review',
        primaryAction: 'open_builder',
        evidence: ['表画像显示行为时间字段完整。'],
      },
      { projectId: 'project:raw/id', mode: 'batch' },
    )

    expect(target.pathname).toBe('/semantic/modeling-workbench/project%3Araw%2Fid/candidate/pkg%3Afact%2Factivity')
    expect(target.state.projectId).toBe('project:raw/id')
  })

  it('reads only valid candidate state', () => {
    const state = readWorkbenchCandidateState({
      workbenchMode: 'batch',
      projectId: 'batch-project',
      candidateId: 'dim-school',
      candidateTitle: '学校维度候选',
      target: 'semantic_center',
      source: 'dim_school_df',
      grain: '一所学校',
      risk: 'low',
      evidence: ['主键稳定。'],
      modelingSource: {
        source_kind: 'physical_table',
        source_id: 1,
        database: 'dw',
        table: 'dim_school_df',
      },
    })

    expect(state?.candidateId).toBe('dim-school')
    expect(state?.modelingSource).toEqual({
      source_kind: 'physical_table',
      source_id: 1,
      database: 'dw',
      table: 'dim_school_df',
    })
    const stringifiedEvidenceState = readWorkbenchCandidateState({
      workbenchMode: 'batch',
      projectId: 'batch-project',
      candidateId: 'dim-school',
      candidateTitle: '学校维度候选',
      target: 'semantic_center',
      source: 'dim_school_df',
      grain: '一所学校',
      risk: 'medium',
      evidence: ['主键稳定。', 42, null],
    })

    expect(stringifiedEvidenceState?.evidence).toEqual(['主键稳定。', '42', 'null'])
    expect(
      readWorkbenchCandidateState({
        workbenchMode: 'batch',
        projectId: 42,
        candidateId: 'dim-school',
        candidateTitle: '学校维度候选',
        target: 'semantic_center',
        source: 'dim_school_df',
        grain: '一所学校',
        risk: 'low',
        evidence: ['主键稳定。'],
      }),
    ).toBeNull()
    expect(
      readWorkbenchCandidateState({
        workbenchMode: 'batch',
        projectId: 'batch-project',
        candidateId: 'dim-school',
        candidateTitle: '学校维度候选',
        target: 'semantic_center',
        source: 'dim_school_df',
        grain: '一所学校',
        risk: 'critical',
        evidence: ['主键稳定。'],
      }),
    ).toBeNull()
    expect(
      readWorkbenchCandidateState({
        workbenchMode: 'invalid',
        projectId: 'batch-project',
        candidateId: 'dim-school',
        candidateTitle: '学校维度候选',
        target: 'semantic_center',
        source: 'dim_school_df',
        grain: '一所学校',
        risk: 'low',
        evidence: ['主键稳定。'],
      }),
    ).toBeNull()
    expect(
      readWorkbenchCandidateState({
        workbenchMode: 'batch',
        projectId: 'batch-project',
        candidateId: 'dim-school',
        candidateTitle: '学校维度候选',
        target: 'data_agent',
        source: 'dim_school_df',
        grain: '一所学校',
        risk: 'low',
        evidence: ['主键稳定。'],
      }),
    ).toBeNull()
    expect(
      readWorkbenchCandidateState({
        workbenchMode: 'batch',
        projectId: 'batch-project',
        candidateId: 'dim-school',
        candidateTitle: '学校维度候选',
        target: 'semantic_center',
        source: 'dim_school_df',
        grain: '一所学校',
        risk: 'low',
        evidence: '主键稳定。',
      }),
    ).toBeNull()
    expect(readWorkbenchCandidateState({ candidateId: 'missing-project' })).toBeNull()
    expect(readWorkbenchCandidateState(null)).toBeNull()
  })
})
