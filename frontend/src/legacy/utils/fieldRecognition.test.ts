import { describe, expect, it } from 'vitest'
import { analyzeField, analyzeFields } from './fieldRecognition'

describe('fieldRecognition', () => {
  it('优先识别字段名中的敏感信息并返回脱敏规则', () => {
    const result = analyzeField({
      name: 'mobile_phone',
      type: 'VARCHAR',
      comment: '用户联系方式',
      sample_values: ['13900000000'],
    })

    expect(result).toMatchObject({
      business_type: 'dimension',
      sensitivity_level: 'pii',
      mask_rule: 'mobile',
    })
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
    expect(result.reasons).toContain('字段名匹配敏感模式: mobile')
  })

  it('可以根据字段描述识别敏感级别', () => {
    const result = analyzeField({
      name: 'contact_value',
      type: 'STRING',
      comment: '用户邮箱地址',
    })

    expect(result).toMatchObject({
      sensitivity_level: 'pii',
      mask_rule: 'email',
    })
    expect(result.reasons.some((reason) => reason.includes('字段描述匹配敏感关键词: email'))).toBe(true)
  })

  it('业务键优先识别为维度并保持较高置信度', () => {
    const result = analyzeField({
      name: 'order_id',
      type: 'BIGINT',
      comment: '订单主键',
    })

    expect(result.business_type).toBe('dimension')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    expect(result.reasons).toContain('字段名包含业务键关键词(id/key)，识别为维度')
  })

  it('OLAP 数据源中的分区字段会直接识别为分区', () => {
    const result = analyzeField({
      name: 'ds',
      type: 'STRING',
      sourceType: 'MaxCompute',
    })

    expect(result).toMatchObject({
      business_type: 'partition',
      confidence: 0.9,
    })
    expect(result.reasons).toContain('OLAP数据源且字段名符合分区字段特征')
  })

  it('字段名或描述中的度量关键词会结合数值类型识别为度量', () => {
    const byName = analyzeField({
      name: 'total_amount',
      type: 'DECIMAL(12,2)',
    })
    const byComment = analyzeField({
      name: 'settlement_value',
      type: 'DOUBLE',
      comment: '订单收入汇总',
    })

    expect(byName.business_type).toBe('metric')
    expect(byName.reasons).toContain('度量关键词+数值类型，识别为度量字段')
    expect(byComment.business_type).toBe('metric')
    expect(byComment.reasons).toContain('度量关键词(字段名/描述)+数值类型，识别为度量字段')
  })

  it('会回退到字段名特征和数据类型推断业务类型', () => {
    const dimensionByPattern = analyzeField({
      name: 'status_code',
      type: 'TEXT',
    })
    const metricByInteger = analyzeField({
      name: 'retry_times',
      type: 'INT',
    })
    const metricByDecimal = analyzeField({
      name: 'priority_level',
      type: 'NUMERIC(10,2)',
    })
    const metricByFloat = analyzeField({
      name: 'accuracy_score',
      type: 'FLOAT',
    })
    const dimensionByString = analyzeField({
      name: 'teacher_name',
      type: 'VARCHAR',
    })

    expect(dimensionByPattern.business_type).toBe('dimension')
    expect(dimensionByPattern.reasons).toContain('字段名符合维度字段特征')
    expect(metricByInteger.reasons).toContain('整数类型且非业务键，推断为度量字段')
    expect(metricByDecimal.reasons).toContain('精确数值类型，推断为度量字段')
    expect(metricByFloat.reasons).toContain('浮点数类型，推断为度量字段')
    expect(dimensionByString.reasons).toContain('字符串类型，推断为维度字段')
  })

  it('会根据样本数据识别手机号、邮箱和身份证', () => {
    const mobile = analyzeField({
      name: 'contact_value',
      type: 'STRING',
      sample_values: ['13800138000', '13900139000'],
    })
    const email = analyzeField({
      name: 'notify_target',
      type: 'STRING',
      sample_values: ['ops@example.com', 'data@example.com'],
    })
    const idCard = analyzeField({
      name: 'identity_value',
      type: 'STRING',
      sample_values: ['11010519491231002X'],
    })

    expect(mobile).toMatchObject({ sensitivity_level: 'pii', mask_rule: 'mobile' })
    expect(email).toMatchObject({ sensitivity_level: 'pii', mask_rule: 'email' })
    expect(idCard).toMatchObject({ sensitivity_level: 'pii', mask_rule: 'id_card' })
  })

  it('已有敏感级别时不会被样本分析覆盖，空样本会安全跳过', () => {
    const result = analyzeField({
      name: 'salary_amount',
      type: 'DECIMAL(10,2)',
      sample_values: [null, '', 8888],
    })

    expect(result.sensitivity_level).toBe('confidential')
    expect(result.mask_rule).toBe('amount')
    expect(result.reasons).toContain('字段名匹配机密模式: salary')
  })

  it('支持批量分析字段并附带 analysis 结果', () => {
    const fields = analyzeFields([
      { name: 'student_name', type: 'VARCHAR', sample_values: ['张三'] },
      { name: 'ds', type: 'STRING', sourceType: 'clickhouse' },
    ])

    expect(fields).toHaveLength(2)
    expect(fields[0].analysis.business_type).toBe('dimension')
    expect(fields[1].analysis.business_type).toBe('partition')
  })
})
