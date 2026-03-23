/**
 * 字段智能识别规则（增强版）
 * 模拟人工识别过程：字段名 + 字段描述 + 数据类型 + 业务上下文
 */

// 数据源类型分类
const OLAP_SOURCES = ['maxcompute', 'clickhouse', 'hive']

// 业务键模式（优先级高）
const BUSINESS_KEY_PATTERN = /_(id|key)$|^(id|key)_|(Id|Key)$/i

// 敏感字段识别规则（字段名）
const SENSITIVE_PATTERNS = {
  pii: {
    mobile: /^(mobile|phone|tel|cellphone|手机|电话)(_|$)/i,
    email: /^(email|mail|邮箱|电子邮件)(_|$)/i,
    id_card: /^(id_card|idcard|identity|身份证)(_|$)/i,
    name: /^(name|username|real_name|真实姓名|姓名|用户名)(_|$)/i,
  },
  confidential: {
    password: /^(password|pwd|passwd|密码)(_|$)/i,
    salary: /^(salary|wage|income|工资|薪资|收入)(_|$)/i,
    amount: /^(amount|money|balance|金额|余额)(_|$)/i,
  }
}

// 敏感信息关键词（字段描述中匹配）
const SENSITIVE_DESCRIPTION_PATTERNS = {
  mobile: /手机|电话|联系方式|mobile|phone|contact/i,
  email: /邮箱|电子邮件|email|mail/i,
  id_card: /身份证|证件号|identity|idcard/i,
  name: /姓名|真实姓名|用户名|name|username|realname/i,
  password: /密码|口令|password|passwd/i,
  amount: /金额|余额|薪资|工资|收入|amount|balance|salary|income/i
}

// 业务类型识别规则（使用后端统一命名：partition/metric/dimension）
const BUSINESS_TYPE_PATTERNS = {
  partition: /^(ds|dt|date|year|month|day|partition|分区)(_|$)/i,
  metric: /^(count|sum|avg|max|min|total|数量|总计)(_|$)/i,
  dimension: /^(code|type|status|category|类别|编码|类型|状态)(_|$)/i,
}

// 度量关键词（字段名或描述中匹配）- 扩展版
const MEASURE_KEYWORD_PATTERN = /价格|单价|金额|余额|费用|成本|销售额|收入|支出|数量|总计|累计|汇总|price|cost|amount|balance|fee|revenue|total|count|sum|avg|rate|ratio|percent/i

// 脱敏规则映射
const MASK_RULE_MAP: Record<string, string> = {
  mobile: 'mobile',
  email: 'email',
  id_card: 'id_card',
  name: 'name',
  amount: 'amount',
  password: 'full_mask',
  salary: 'amount',
}

interface FieldAnalysisResult {
  business_type: 'partition' | 'dimension' | 'metric'  // 使用后端统一命名
  sensitivity_level: 'public' | 'internal' | 'pii' | 'confidential' | 'secret'
  mask_rule?: string
  confidence: number  // 0-1，识别置信度
  reasons: string[]   // 识别依据
}

/**
 * 检查字段名或描述中的关键词
 */
function checkKeywordInNameOrComment(
  fieldName: string, 
  comment: string | undefined, 
  pattern: RegExp
): boolean {
  return pattern.test(fieldName) || (comment ? pattern.test(comment) : false)
}

/**
 * 分析字段属性（核心入口）
 */
export function analyzeField(field: {
  name: string
  type: string
  comment?: string     // 字段描述
  sample_values?: (string | number | boolean | null)[]
  sourceType?: string  // 数据源类型
}): FieldAnalysisResult {
  const result: FieldAnalysisResult = {
    business_type: 'dimension',
    sensitivity_level: 'public',
    confidence: 0.5,
    reasons: []
  }

  // 步骤1：敏感信息识别（最高优先级，字段名 + 描述）
  const sensitiveCheck = checkSensitiveField(field.name, field.comment)
  if (sensitiveCheck) {
    result.sensitivity_level = sensitiveCheck.level
    result.mask_rule = sensitiveCheck.mask_rule
    result.confidence = sensitiveCheck.confidence
    result.reasons.push(sensitiveCheck.reason)
  }

  // 步骤2：业务键识别（优先于其他业务类型规则）
  if (BUSINESS_KEY_PATTERN.test(field.name)) {
    result.business_type = 'dimension'
    result.confidence = Math.max(result.confidence, 0.85)
    result.reasons.push('字段名包含业务键关键词(id/key)，识别为维度')
    // 不return，继续后续步骤（仅标记业务类型）
  } else {
    // 非业务键，继续判断其他业务类型

    // 步骤3：分区字段识别（仅OLAP数据库）
    if (field.sourceType && OLAP_SOURCES.includes(field.sourceType.toLowerCase())) {
      if (BUSINESS_TYPE_PATTERNS.partition.test(field.name)) {
        result.business_type = 'partition'
        result.confidence = Math.max(result.confidence, 0.9)
        result.reasons.push('OLAP数据源且字段名符合分区字段特征')
        return result  // 分区字段置信度高，直接返回
      }
    }

    // 步骤4：度量关键词 + 数值类型（字段名或描述）
    const businessType = inferBusinessType(field.name, field.type, field.sourceType, field.comment)
    if (businessType) {
      result.business_type = businessType.type
      result.confidence = Math.max(result.confidence, businessType.confidence)
      result.reasons.push(businessType.reason)
    }

    // 步骤5：数据类型辅助判断（置信度较低时才使用）
    if (result.confidence < 0.8) {
      const typeInference = inferFromDataType(field.type, field.name)
      if (typeInference) {
        result.business_type = typeInference.type
        result.confidence = Math.max(result.confidence, typeInference.confidence)
        result.reasons.push(typeInference.reason)
      }
    }
  }

  // 步骤6：样本数据分析（可选，提高准确度）
  if (field.sample_values && field.sample_values.length > 0) {
    const sampleAnalysis = analyzeSampleData(field.name, field.sample_values)
    if (sampleAnalysis && result.sensitivity_level === 'public') {
      // 只在当前是public时才覆盖
      result.sensitivity_level = sampleAnalysis.sensitivity_level
      result.mask_rule = sampleAnalysis.mask_rule
      result.confidence = Math.max(result.confidence, sampleAnalysis.confidence)
      result.reasons.push(sampleAnalysis.reason)
    }
  }

  return result
}

/**
 * 检查敏感字段（字段名 + 描述）
 */
function checkSensitiveField(fieldName: string, comment?: string) {
  // 检查PII（字段名）
  for (const [key, pattern] of Object.entries(SENSITIVE_PATTERNS.pii)) {
    if (pattern.test(fieldName)) {
      return {
        level: 'pii' as const,
        mask_rule: MASK_RULE_MAP[key],
        confidence: 0.9,
        reason: `字段名匹配敏感模式: ${key}`
      }
    }
  }
  
  // 新增：检查描述中的敏感关键词
  if (comment) {
    for (const [key, descPattern] of Object.entries(SENSITIVE_DESCRIPTION_PATTERNS)) {
      if (descPattern.test(comment)) {
        const isPii = ['mobile', 'email', 'id_card', 'name'].includes(key)
        const level: 'pii' | 'confidential' = isPii ? 'pii' : 'confidential'
        return {
          level,
          mask_rule: MASK_RULE_MAP[key],
          confidence: 0.85,
          reason: `字段描述匹配敏感关键词: ${key} (${comment.substring(0, 20)})`
        }
      }
    }
  }
  
  // 检查机密（字段名）
  for (const [key, pattern] of Object.entries(SENSITIVE_PATTERNS.confidential)) {
    if (pattern.test(fieldName)) {
      return {
        level: 'confidential' as const,
        mask_rule: MASK_RULE_MAP[key],
        confidence: 0.9,
        reason: `字段名匹配机密模式: ${key}`
      }
    }
  }
  
  return null
}

/**
 * 推断业务类型（字段名 + 数据类型 + 描述）
 */
function inferBusinessType(
  fieldName: string, 
  dataType: string, 
  _sourceType?: string,
  comment?: string
) {
  // 度量关键词（字段名或描述）+ 数值类型
  if (checkKeywordInNameOrComment(fieldName, comment, MEASURE_KEYWORD_PATTERN)) {
    const numericType = ['NUMERIC', 'DECIMAL', 'DOUBLE', 'FLOAT', 'MONEY', 'INT', 'BIGINT', 'SMALLINT', 'TINYINT'].some(
      t => dataType.toUpperCase().includes(t)
    )
    if (numericType) {
      // 但排除业务键
      if (BUSINESS_KEY_PATTERN.test(fieldName)) {
        return null  // 业务键优先，已在步骤2处理
      }
      
      const source = comment ? '度量关键词(字段名/描述)+数值类型' : '度量关键词+数值类型'
      return {
        type: 'metric' as const,
        confidence: 0.85,
        reason: `${source}，识别为度量字段`
      }
    }
  }

  // 原有的度量字段名匹配（降低优先级）
  if (BUSINESS_TYPE_PATTERNS.metric.test(fieldName)) {
    return {
      type: 'metric' as const,
      confidence: 0.8,
      reason: '字段名符合度量字段特征'
    }
  }

  // 维度字段（默认）
  if (BUSINESS_TYPE_PATTERNS.dimension.test(fieldName)) {
    return {
      type: 'dimension' as const,
      confidence: 0.75,
      reason: '字段名符合维度字段特征'
    }
  }

  return null
}

/**
 * 从数据类型推断（考虑业务键排除）
 */
function inferFromDataType(dataType: string, fieldName: string) {
  const type = dataType.toUpperCase()

  // INT类型，但不是业务键 → 才识别为度量
  if (['INT', 'BIGINT', 'INTEGER', 'SMALLINT', 'TINYINT'].some(t => type.includes(t))) {
    // 如果字段名不包含id/key，才考虑为度量
    if (!BUSINESS_KEY_PATTERN.test(fieldName)) {
      return {
        type: 'metric' as const,
        confidence: 0.6,
        reason: '整数类型且非业务键，推断为度量字段'
      }
    }
    return null  // 是业务键，不覆盖
  }

  // NUMERIC/DECIMAL → 度量（置信度提高）
  if (['NUMERIC', 'DECIMAL', 'MONEY'].some(t => type.includes(t))) {
    return {
      type: 'metric' as const,
      confidence: 0.7,  // 提高基础置信度
      reason: '精确数值类型，推断为度量字段'
    }
  }

  // DOUBLE/FLOAT → 度量
  if (['DOUBLE', 'FLOAT', 'REAL'].some(t => type.includes(t))) {
    return {
      type: 'metric' as const,
      confidence: 0.65,
      reason: '浮点数类型，推断为度量字段'
    }
  }

  // 字符串类型 → 维度
  if (['STRING', 'VARCHAR', 'CHAR', 'TEXT'].some(t => type.includes(t))) {
    return {
      type: 'dimension' as const,
      confidence: 0.5,
      reason: '字符串类型，推断为维度字段'
    }
  }

  return null
}

/**
 * 分析样本数据
 */
function analyzeSampleData(_fieldName: string, sampleValues: (string | number | boolean | null)[]) {
  const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '')
  
  if (nonNullValues.length === 0) {
    return null
  }

  // 检查手机号格式
  if (nonNullValues.every(v => /^1[3-9]\d{9}$/.test(String(v)))) {
    return {
      sensitivity_level: 'pii' as const,
      mask_rule: 'mobile',
      confidence: 0.95,
      reason: '样本数据符合手机号格式'
    }
  }

  // 检查邮箱格式
  if (nonNullValues.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)))) {
    return {
      sensitivity_level: 'pii' as const,
      mask_rule: 'email',
      confidence: 0.95,
      reason: '样本数据符合邮箱格式'
    }
  }

  // 检查身份证格式
  if (nonNullValues.every(v => /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(String(v)))) {
    return {
      sensitivity_level: 'pii' as const,
      mask_rule: 'id_card',
      confidence: 0.95,
      reason: '样本数据符合身份证格式'
    }
  }

  return null
}

/**
 * 批量分析字段
 */
export function analyzeFields(fields: Array<{
  name: string
  type: string
  comment?: string
  sample_values?: (string | number | boolean | null)[]
  sourceType?: string
}>) {
  return fields.map(field => ({
    ...field,
    analysis: analyzeField(field)
  }))
}
