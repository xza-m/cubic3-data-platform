import {
  buildGatewayTrend,
  buildGatewayTrendFromTimeseries,
  getAssignedAccessPackageCodes,
  formatAccessReasonLabel,
  formatAccessRoleLabel,
  formatDataLevelLabel,
  formatExecutionModeLabel,
  formatExecutionProfileAccessLabel,
  formatExecutionProfileLabel,
  formatGatewayAlertSeverityLabel,
  formatGatewayStabilityBasis,
  formatPolicyEffectLabel,
  formatPolicyScopeChips,
  formatRowScopeEntryLabel,
  formatRowScopeSummary,
  gatewayAlertTone,
  getCredentialModeOptions,
  paginateGatewayRows,
  replaceDataAccessPackageCode,
  replacePlatformPackageCode,
  summarizePrincipalDataPackage,
  summarizePrincipalPermissionSource,
  summarizePrincipalPlatformPackages,
  summarizeGatewayDataQuality,
  splitAccessPackages,
  summarizeGatewayTrend,
} from './AccessIdentity'
import { describe, expect, it } from 'vitest'

describe('AccessIdentity 管理员文案', () => {
  it('把内部角色转换成岗位式命名，避免抽象权限术语', () => {
    expect(formatAccessRoleLabel('governance_admin')).toBe('管理员')
    expect(formatAccessRoleLabel('product_manager')).toBe('产品经理')
    expect(formatAccessRoleLabel('semantic_modeler')).toBe('数据开发')
    expect(formatAccessRoleLabel('viewer')).toBe('普通用户')
    expect(formatAccessRoleLabel('data_m0_reader')).toBe('基础数据读取')
    expect(formatAccessRoleLabel('data_m1_reader')).toBe('汇总数据读取')
    expect(formatAccessRoleLabel('data_m2_detail_reader')).toBe('明细数据读取')
  })

  it('把数据范围转换成管理员能理解的标签', () => {
    expect(formatDataLevelLabel('M2')).toBe('M2 明细数据')
    expect(formatPolicyScopeChips({
      data_levels: ['M2'],
      table_layers: ['dwd'],
      table_prefixes: ['dwd_'],
    })).toEqual(['M2 明细数据', 'DWD 明细层', '表名前缀 dwd_'])
  })

  it('把权限和网关拒绝原因转换成中文主文案', () => {
    expect(formatAccessReasonLabel('policy_allow')).toBe('平台策略放行')
    expect(formatAccessReasonLabel('missing_data_role')).toBe('缺少对应数据角色')
    expect(formatAccessReasonLabel('physical_denied_after_policy_allow')).toBe('MaxCompute 物理权限拒绝')
    expect(formatAccessReasonLabel('m3_governance_required', true)).toBe('需要先完成数据治理')
  })

  it('把行级范围压缩成表格摘要，完整条件留给 hover 明细', () => {
    const decision = {
      principal_id: 'u_teacher',
      effective_row_scope: {
        subject_principal_id: 'scoped_teacher',
        entries: [
          {
            table: 'dw.dwd_comment_reports',
            column: 'school_id',
            operator: 'in',
            values: ['s_001', 's_002'],
            policy_code: 'm2_detail_read',
            attribute: 'school_ids',
          },
          {
            table: 'dw.dwd_course_reports',
            column: 'school_id',
            operator: 'in',
            values: ['s_001'],
            policy_code: 'm2_detail_read',
          },
        ],
      },
    } as any

    expect(formatRowScopeSummary(decision)).toBe('等 2 条 · dw.dwd_comment_reports.school_id · 数据主体 scoped_teacher')
    expect(formatRowScopeEntryLabel(decision.effective_row_scope.entries[0])).toBe(
      'dw.dwd_comment_reports.school_id in [s_001, s_002] · 策略 m2_detail_read · 属性来源 school_ids',
    )
  })

  it('避免在权限配置 UI 中暴露执行侧凭据术语', () => {
    expect(formatExecutionModeLabel('gateway_binding')).toBe('网关执行方式')
    expect(formatExecutionModeLabel('internal_query_execution')).toBe('已下线执行模式')
    expect(formatExecutionProfileAccessLabel('mc_m0_reader')).toBe('基础数据读取')
    expect(formatExecutionProfileAccessLabel('mc_m1_reader')).toBe('汇总数据读取')
    expect(formatExecutionProfileAccessLabel('mc_m2_detail_reader')).toBe('明细数据读取')
    expect(formatExecutionProfileAccessLabel('mc_m2_detail')).toBe('明细数据读取')
    expect(formatExecutionProfileAccessLabel('inline_m0')).toBe('基础数据读取')
    expect(formatExecutionProfileAccessLabel('custom_runtime_profile')).toBe('自定义执行方式')
    expect(formatExecutionProfileLabel([{ profile_code: 'mc_m2_detail_reader', name: 'mc_m2_detail_reader' } as any])('mc_m2_detail_reader')).toBe('明细数据读取')
    expect(formatPolicyEffectLabel('allow')).toBe('允许访问')
    expect(formatPolicyEffectLabel('deny')).toBe('拒绝访问')
  })

  it('执行方式只保留网关绑定模式，不再把历史模式塞回下拉', () => {
    expect(getCredentialModeOptions()).toEqual(['gateway_binding'])
    expect(getCredentialModeOptions('inline_policy_decision')).toEqual(['gateway_binding'])
    expect(getCredentialModeOptions('internal_query_execution')).toEqual(['gateway_binding'])
  })

  it('把网关告警严重等级转换成控制台可读标签和卡片语气', () => {
    expect(formatGatewayAlertSeverityLabel('critical')).toBe('严重')
    expect(formatGatewayAlertSeverityLabel('warning')).toBe('预警')
    expect(formatGatewayAlertSeverityLabel('healthy')).toBe('正常')
    expect(gatewayAlertTone('critical')).toBe('danger')
    expect(gatewayAlertTone('warning')).toBe('warning')
    expect(gatewayAlertTone('healthy')).toBe('neutral')
  })

  it('按日聚合网关查询量、失败量和 DAU', () => {
    const rows = [
      { created_at: '2026-05-28T01:00:00Z', status: 'SUCCEEDED', principal_id: 'u1' },
      { created_at: '2026-05-28T02:00:00Z', status: 'FAILED', principal_id: 'u1' },
      { created_at: '2026-05-28T03:00:00Z', status: 'SUCCEEDED', principal_id: 'u2' },
      { created_at: '2026-05-29T01:00:00Z', status: 'SUCCEEDED', principal_id: 'u2' },
      { created_at: '2026-05-29T02:00:00Z', status: 'SUCCEEDED', actor_id: 'agent-a' },
    ] as any

    const trend = buildGatewayTrend(rows)
    const summary = summarizeGatewayTrend(trend)
    const may28 = trend.find((row) => row.key === '2026-05-28')
    const may29 = trend.find((row) => row.key === '2026-05-29')

    expect(may28).toMatchObject({ total: 3, allow: 2, blocked: 1, dau: 2 })
    expect(may29).toMatchObject({ total: 2, allow: 2, blocked: 0, dau: 2 })
    expect(summary).toMatchObject({
      totalQueries: 5,
      latestDayQueries: 2,
      latestDayDau: 2,
      windowDau: 3,
      peakQueries: 3,
      peakLabel: '05/28',
      usesGatewayTimeseries: false,
    })
  })

  it('优先使用 gateway timeseries 构造小时级趋势', () => {
    const trend = buildGatewayTrendFromTimeseries([
      {
        bucket_start: '2026-06-11T11:00:00Z',
        bucket_end: '2026-06-11T12:00:00Z',
        query_total: 10,
        success: 8,
        failed: 1,
        rejected: 0,
        timeout: 1,
        success_rate: 80,
        execute_p95_ms: 1200,
        queue_wait_p95_ms: 300,
      },
    ] as any)
    const summary = summarizeGatewayTrend(trend ?? [])

    expect(trend?.[0]).toMatchObject({
      key: '2026-06-11T11:00:00Z',
      label: '11:00',
      total: 10,
      allow: 8,
      blocked: 2,
      successRate: 80,
      executeP95Ms: 1200,
    })
    expect(summary).toMatchObject({
      usesGatewayTimeseries: true,
      latestSuccessRate: 80,
      peakExecuteP95Ms: 1200,
    })
  })

  it('说明稳定性使用 gateway 返回口径，并补充成功查询样本数', () => {
    expect(formatGatewayStabilityBasis({
      success_count: 900,
      query_count: 1000,
      stability: 97.3,
    } as any)).toBe('网关稳定性 97.3%；成功 900 / 查询 1000')
  })

  it('统计最近网关记录的身份、等级和执行方式缺失情况', () => {
    const rows = [
      { query_id: 'q1', principal_id: 'u1', data_level: 'M1', execution_profile_code: 'mc_m1_reader' },
      { query_id: 'q2', principal_id: null, actor_id: null, data_level: null, execution_profile_code: null },
      { query_id: 'q3', actor_id: 'agent-a', data_level: null, execution_profile_code: 'mc_m0_reader' },
    ] as any

    expect(summarizeGatewayDataQuality(rows)).toEqual({
      total: 3,
      identityMissingCount: 1,
      dataLevelMissingCount: 2,
      executionProfileMissingCount: 1,
      policyDecisionMissingCount: 3,
      credentialRefMissingCount: 3,
      platformGovernedCount: 0,
      gatewayOnlyCount: 3,
      legacyActorCount: 3,
      hasIdentityGap: true,
      hasDataGap: true,
      source: 'query_runs',
    })
  })

  it('使用 gateway contract-completeness 计算契约字段缺口', () => {
    expect(summarizeGatewayDataQuality([], {
      total: 100,
      platform_governed_count: 20,
      gateway_only_count: 80,
      legacy_actor_count: 70,
      principal_present_rate: 20,
      actor_present_rate: 40,
      policy_decision_present_rate: 25,
      data_level_present_rate: 30,
      execution_profile_present_rate: 35,
      credential_ref_present_rate: 45,
    })).toEqual({
      total: 100,
      identityMissingCount: 60,
      dataLevelMissingCount: 70,
      executionProfileMissingCount: 65,
      policyDecisionMissingCount: 75,
      credentialRefMissingCount: 55,
      platformGovernedCount: 20,
      gatewayOnlyCount: 80,
      legacyActorCount: 70,
      hasIdentityGap: true,
      hasDataGap: true,
      source: 'contract',
    })
  })

  it('默认把网关访问记录按每页 10 条分页', () => {
    const rows = Array.from({ length: 23 }, (_, index) => ({ query_id: `q${index + 1}` })) as any

    expect(paginateGatewayRows(rows, 1)).toMatchObject({
      page: 1,
      pageSize: 10,
      totalPages: 3,
      start: 1,
      end: 10,
    })
    expect(paginateGatewayRows(rows, 3).items.map((row: any) => row.query_id)).toEqual(['q21', 'q22', 'q23'])
  })

  it('把成员配置拆成平台角色和数据访问权限，并且同组只显示一个选择', () => {
    const packages = [
      {
        package_code: 'admin',
        name: '管理员',
        description: '',
        role_codes: ['governance_admin', 'auditor'],
        role_type: 'platform',
        data_level: null,
      },
      {
        package_code: 'data_developer',
        name: '数据开发',
        description: '',
        role_codes: ['semantic_modeler'],
        role_type: 'platform',
        data_level: null,
      },
      {
        package_code: 'data_m1_reader',
        name: '汇总数据读取',
        description: '',
        role_codes: ['data_m0_reader', 'data_m1_reader'],
        role_type: 'data',
        data_level: 'M1',
      },
      {
        package_code: 'data_m2_detail_reader',
        name: '明细数据读取',
        description: '',
        role_codes: ['data_m0_reader', 'data_m1_reader', 'data_m2_detail_reader'],
        role_type: 'data',
        data_level: 'M2',
      },
    ]

    expect(splitAccessPackages(packages).platformPackages.map((item) => item.name)).toEqual(['管理员', '数据开发'])
    expect(splitAccessPackages(packages).dataPackages.map((item) => item.name)).toEqual(['汇总数据读取', '明细数据读取'])
    expect(getAssignedAccessPackageCodes({
      platform_roles: ['semantic_modeler', 'viewer'],
      data_roles: ['data_m0_reader', 'data_m1_reader', 'data_m2_detail_reader'],
    }, packages)).toEqual(['data_developer', 'data_m2_detail_reader'])
    expect(replacePlatformPackageCode(['data_developer', 'data_m2_detail_reader'], packages, 'admin')).toEqual(['data_m2_detail_reader', 'admin'])
    expect(replaceDataAccessPackageCode(['admin', 'data_m1_reader'], packages, 'data_m2_detail_reader')).toEqual(['admin', 'data_m2_detail_reader'])
    expect(replaceDataAccessPackageCode(['admin', 'data_m2_detail_reader'], packages, null)).toEqual(['admin'])
  })

  it('成员表直接给出平台角色、数据权限和权限来源', () => {
    const packages = [
      {
        package_code: 'admin',
        name: '管理员',
        description: '',
        role_codes: ['governance_admin', 'auditor'],
        role_type: 'platform',
        data_level: null,
      },
      {
        package_code: 'data_m2_detail_reader',
        name: '明细数据读取',
        description: '',
        role_codes: ['data_m0_reader', 'data_m1_reader', 'data_m2_detail_reader'],
        role_type: 'data',
        data_level: 'M2',
      },
    ] as any
    const principal = {
      platform_roles: ['governance_admin'],
      data_roles: ['data_m0_reader', 'data_m1_reader', 'data_m2_detail_reader'],
      role_bindings: [
        { role_code: 'data_m2_detail_reader', role_type: 'data', source: 'feishu_m2_allowlist' },
      ],
    } as any

    expect(summarizePrincipalPlatformPackages(principal, packages)).toBe('管理员')
    expect(summarizePrincipalDataPackage(principal, packages)).toBe('明细数据读取')
    expect(summarizePrincipalPermissionSource(principal)).toEqual({
      label: 'M2 白名单',
      tone: 'success',
    })
  })
})
