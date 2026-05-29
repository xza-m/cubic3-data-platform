import {
  buildGatewayTrend,
  getAssignedAccessPackageCodes,
  formatAccessRoleLabel,
  formatDataLevelLabel,
  formatExecutionModeLabel,
  formatGatewayAlertSeverityLabel,
  formatPolicyEffectLabel,
  formatPolicyScopeChips,
  gatewayAlertTone,
  getCredentialModeOptions,
  replaceDataAccessPackageCode,
  replacePlatformPackageCode,
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

  it('避免在权限配置 UI 中暴露执行侧凭据术语', () => {
    expect(formatExecutionModeLabel('gateway_binding')).toBe('网关执行画像')
    expect(formatExecutionModeLabel('internal_query_execution')).toBe('已下线执行模式')
    expect(formatPolicyEffectLabel('allow')).toBe('允许访问')
    expect(formatPolicyEffectLabel('deny')).toBe('拒绝访问')
  })

  it('新建执行画像时不再提供平台内置执行模式', () => {
    expect(getCredentialModeOptions()).toEqual(['gateway_binding', 'inline_policy_decision'])
    expect(getCredentialModeOptions('internal_query_execution')).toEqual([
      'gateway_binding',
      'inline_policy_decision',
      'internal_query_execution',
    ])
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
    })
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
})
