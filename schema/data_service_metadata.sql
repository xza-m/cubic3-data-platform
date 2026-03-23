-- ============================================================================
-- CUBIC3 - 元数据层设计
-- Database: PostgreSQL 12+
-- Author: Senior Data Architect
-- Purpose: 支持逻辑与物理映射的自助数据导出平台
-- ============================================================================

-- 1. 数据集注册表 (Dataset Registry)
-- 存储逻辑数据集信息，对应物理 MaxCompute 表
CREATE TABLE IF NOT EXISTS dataset_registry (
    id SERIAL PRIMARY KEY,
    dataset_code VARCHAR(100) UNIQUE NOT NULL,              -- 数据集唯一标识，如 user_order_fact
    dataset_name VARCHAR(200) NOT NULL,                     -- 业务名称，如 用户订单明细表
    physical_project VARCHAR(100) NOT NULL,                 -- MaxCompute 项目名
    physical_table VARCHAR(200) NOT NULL,                   -- MaxCompute 物理表名
    table_type VARCHAR(20) DEFAULT 'PARTITIONED',           -- PARTITIONED / NON_PARTITIONED
    partition_keys JSONB,                                   -- 分区键配置 ["ds", "hh"]
    description TEXT,                                       -- 数据集描述
    business_owner VARCHAR(100),                            -- 业务负责人
    data_domain VARCHAR(50),                                -- 数据域，如 trade / user / marketing
    sensitivity_level VARCHAR(20) DEFAULT 'PUBLIC',         -- PUBLIC / INTERNAL / CONFIDENTIAL / SECRET
    status VARCHAR(20) DEFAULT 'ACTIVE',                    -- ACTIVE / INACTIVE / DEPRECATED
    default_row_limit INT DEFAULT 500000,                   -- 默认最大行数限制
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    CONSTRAINT uk_physical_table UNIQUE (physical_project, physical_table)
);

CREATE INDEX idx_dataset_status ON dataset_registry(status);
CREATE INDEX idx_dataset_domain ON dataset_registry(data_domain);
COMMENT ON TABLE dataset_registry IS '数据集注册表：存储逻辑数据集与物理表的映射关系';


-- 2. 字段元数据表 (Field Metadata)
-- 记录每个字段的物理名、业务名、类型、脱敏规则
CREATE TABLE IF NOT EXISTS field_metadata (
    id SERIAL PRIMARY KEY,
    dataset_id INT NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    physical_name VARCHAR(100) NOT NULL,                    -- 物理字段名，如 user_mobile
    business_name VARCHAR(200) NOT NULL,                    -- 业务字段名，如 用户手机号
    field_type VARCHAR(50) NOT NULL,                        -- STRING / BIGINT / DECIMAL / DATE / DATETIME
    field_category VARCHAR(20) DEFAULT 'DIMENSION',         -- DIMENSION / MEASURE / PARTITION_KEY
    is_sensitive BOOLEAN DEFAULT FALSE,                     -- 是否敏感字段（PII）
    masking_rule VARCHAR(50),                               -- 脱敏规则：MOBILE / EMAIL / ID_CARD / CUSTOM
    masking_function TEXT,                                  -- 自定义脱敏函数表达式
    is_required BOOLEAN DEFAULT FALSE,                      -- 是否必选字段
    default_value VARCHAR(200),                             -- 默认值
    description TEXT,                                       -- 字段说明
    sample_values TEXT,                                     -- 示例值（逗号分隔）
    valid_values JSONB,                                     -- 枚举值列表（若适用）
    display_order INT DEFAULT 999,                          -- 前端展示顺序
    is_searchable BOOLEAN DEFAULT TRUE,                     -- 是否可作为筛选条件
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_dataset_field UNIQUE (dataset_id, physical_name)
);

CREATE INDEX idx_field_dataset ON field_metadata(dataset_id);
CREATE INDEX idx_field_sensitive ON field_metadata(is_sensitive);
COMMENT ON TABLE field_metadata IS '字段元数据表：存储每个数据集的字段定义、类型、脱敏规则';


-- 3. 查询模板表 (Query Template)
-- 存储预定义的查询模板，支持快速导出
CREATE TABLE IF NOT EXISTS query_template (
    id SERIAL PRIMARY KEY,
    template_code VARCHAR(100) UNIQUE NOT NULL,             -- 模板唯一标识
    template_name VARCHAR(200) NOT NULL,                    -- 模板名称
    dataset_id INT NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    description TEXT,                                       -- 模板说明
    query_dsl JSONB NOT NULL,                               -- 查询 DSL 结构（存储字段、筛选器）
    default_filters JSONB,                                  -- 默认筛选条件
    is_public BOOLEAN DEFAULT TRUE,                         -- 是否公开（所有用户可见）
    created_by VARCHAR(100),                                -- 创建人
    usage_count INT DEFAULT 0,                              -- 使用次数
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_template_dataset ON query_template(dataset_id);
CREATE INDEX idx_template_public ON query_template(is_public);
COMMENT ON TABLE query_template IS '查询模板表：存储预定义的查询配置';


-- 4. 用户权限表 (User Permission)
-- 存储用户与数据集的行列级权限关系
CREATE TABLE IF NOT EXISTS user_permission (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,                          -- 用户唯一标识（飞书 open_id / 工号）
    user_name VARCHAR(100),                                 -- 用户姓名
    dataset_id INT NOT NULL REFERENCES dataset_registry(id) ON DELETE CASCADE,
    permission_type VARCHAR(20) DEFAULT 'READ',             -- READ / EXPORT / ADMIN
    -- 列级权限：允许访问的字段列表
    allowed_columns JSONB,                                  -- ["col1", "col2"] 为空表示全部
    -- 行级权限：自动注入的 WHERE 条件
    row_filter_rules JSONB,                                 -- [{"field": "region", "op": "IN", "value": ["华东"]}]
    max_row_limit INT DEFAULT 100000,                       -- 该用户最大导出行数
    granted_by VARCHAR(100),                                -- 授权人
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expired_at TIMESTAMP,                                   -- 权限过期时间（可选）
    status VARCHAR(20) DEFAULT 'ACTIVE',                    -- ACTIVE / REVOKED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_user_dataset UNIQUE (user_id, dataset_id)
);

CREATE INDEX idx_permission_user ON user_permission(user_id);
CREATE INDEX idx_permission_dataset ON user_permission(dataset_id);
CREATE INDEX idx_permission_status ON user_permission(status);
COMMENT ON TABLE user_permission IS '用户权限表：管理用户对数据集的行列级访问权限';


-- 5. 数据导出任务表 (Export Task)
-- 存储用户的导出任务记录
CREATE TABLE IF NOT EXISTS export_task (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(100) UNIQUE NOT NULL,                   -- 任务唯一标识（UUID）
    user_id VARCHAR(100) NOT NULL,                          -- 请求用户
    user_name VARCHAR(100),
    dataset_id INT NOT NULL REFERENCES dataset_registry(id),
    query_dsl JSONB NOT NULL,                               -- 完整的查询 DSL
    generated_sql TEXT,                                     -- 最终生成的 SQL（记录用于审计）
    -- MaxCompute 执行信息
    mc_instance_id VARCHAR(200),                            -- MaxCompute Instance ID
    mc_logview_url TEXT,                                    -- MaxCompute LogView URL
    -- 任务状态流转
    status VARCHAR(20) DEFAULT 'PENDING',                   -- PENDING / RUNNING / SUCCESS / FAILED / TIMEOUT
    error_message TEXT,                                     -- 错误信息
    -- 产出物信息
    output_format VARCHAR(20) DEFAULT 'CSV',                -- CSV / EXCEL / PARQUET
    output_file_size BIGINT,                                -- 文件大小（字节）
    output_row_count BIGINT,                                -- 导出行数
    delivery_method VARCHAR(20),                            -- FEISHU / OSS / EMAIL
    delivery_url TEXT,                                      -- 交付 URL（OSS 预签名链接 / 飞书文件 key）
    delivery_expired_at TIMESTAMP,                          -- 交付链接过期时间
    -- 时间记录
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    duration_ms INT,                                        -- 执行耗时（毫秒）
    -- 审计字段
    source_ip VARCHAR(50),                                  -- 请求 IP
    trace_id VARCHAR(100)                                   -- 全链路追踪 ID
);

CREATE INDEX idx_task_user ON export_task(user_id);
CREATE INDEX idx_task_status ON export_task(status);
CREATE INDEX idx_task_submitted ON export_task(submitted_at);
COMMENT ON TABLE export_task IS '数据导出任务表：记录用户提交的导出任务及执行状态';


-- 6. 脱敏规则配置表 (Masking Rule Config)
-- 存储可复用的脱敏规则定义
CREATE TABLE IF NOT EXISTS masking_rule_config (
    id SERIAL PRIMARY KEY,
    rule_code VARCHAR(50) UNIQUE NOT NULL,                  -- 规则标识：MOBILE / EMAIL / ID_CARD
    rule_name VARCHAR(100) NOT NULL,                        -- 规则名称
    rule_type VARCHAR(20) NOT NULL,                         -- REGEX / FUNCTION / UDF
    rule_expression TEXT NOT NULL,                          -- 脱敏表达式
    description TEXT,                                       -- 说明及示例
    example_input VARCHAR(200),                             -- 示例输入
    example_output VARCHAR(200),                            -- 示例输出
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 预置常用脱敏规则
INSERT INTO masking_rule_config (rule_code, rule_name, rule_type, rule_expression, description, example_input, example_output) VALUES
('MOBILE', '手机号脱敏', 'REGEX', 'REGEXP_REPLACE({field}, ''(\\d{3})\\d{4}(\\d{4})'', ''$1****$2'')', '保留前3后4位', '13812345678', '138****5678'),
('EMAIL', '邮箱脱敏', 'REGEX', 'REGEXP_REPLACE({field}, ''(\\w{1,3})\\w+(@.*)'', ''$1***$2'')', '保留用户名前1-3位', 'john.doe@example.com', 'joh***@example.com'),
('ID_CARD', '身份证脱敏', 'REGEX', 'REGEXP_REPLACE({field}, ''(\\d{6})\\d{8}(\\d{4})'', ''$1********$2'')', '保留前6后4位', '110101199001011234', '110101********1234'),
('NAME', '姓名脱敏', 'FUNCTION', 'CONCAT(SUBSTR({field}, 1, 1), ''**'')', '保留姓氏', '张三', '张**'),
('AMOUNT', '金额脱敏', 'FUNCTION', 'CASE WHEN {field} > 0 THEN ''***'' ELSE NULL END', '金额用星号替代', '12345.67', '***'),
('FULL_MASK', '完全脱敏', 'FUNCTION', '''***''', '完全隐藏', 'sensitive_data', '***')
ON CONFLICT (rule_code) DO NOTHING;

COMMENT ON TABLE masking_rule_config IS '脱敏规则配置表：存储可复用的字段脱敏规则';


-- 7. 审计日志表 (Audit Log)
-- 记录所有敏感操作（可选，用于合规）
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    log_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(100) NOT NULL,
    user_name VARCHAR(100),
    action VARCHAR(50) NOT NULL,                            -- QUERY / EXPORT / GRANT_PERMISSION / REVOKE_PERMISSION
    resource_type VARCHAR(50),                              -- DATASET / FIELD / PERMISSION
    resource_id VARCHAR(100),
    details JSONB,                                          -- 详细信息
    source_ip VARCHAR(50),
    user_agent TEXT
);

CREATE INDEX idx_audit_time ON audit_log(log_time);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
COMMENT ON TABLE audit_log IS '审计日志表：记录所有敏感操作用于合规审计';


-- ============================================================================
-- 初始化示例数据
-- ============================================================================

-- 示例：注册一个用户订单数据集
INSERT INTO dataset_registry (
    dataset_code, dataset_name, physical_project, physical_table, 
    table_type, partition_keys, description, data_domain, sensitivity_level
) VALUES (
    'user_order_fact',
    '用户订单明细表',
    'prod_dw',
    'dwd_trade_order_detail',
    'PARTITIONED',
    '["ds"]'::jsonb,
    '记录用户在平台的所有订单明细，包含订单金额、商品信息等',
    'trade',
    'INTERNAL'
) ON CONFLICT (dataset_code) DO NOTHING;

-- 获取刚插入的 dataset_id（实际使用时可能需要查询）
DO $$
DECLARE
    v_dataset_id INT;
BEGIN
    SELECT id INTO v_dataset_id FROM dataset_registry WHERE dataset_code = 'user_order_fact';
    
    -- 添加字段元数据
    INSERT INTO field_metadata (dataset_id, physical_name, business_name, field_type, field_category, is_sensitive, masking_rule, display_order) VALUES
    (v_dataset_id, 'ds', '数据日期', 'STRING', 'PARTITION_KEY', FALSE, NULL, 1),
    (v_dataset_id, 'order_id', '订单ID', 'STRING', 'DIMENSION', FALSE, NULL, 2),
    (v_dataset_id, 'user_id', '用户ID', 'BIGINT', 'DIMENSION', FALSE, NULL, 3),
    (v_dataset_id, 'user_name', '用户姓名', 'STRING', 'DIMENSION', TRUE, 'NAME', 4),
    (v_dataset_id, 'mobile', '手机号', 'STRING', 'DIMENSION', TRUE, 'MOBILE', 5),
    (v_dataset_id, 'city', '城市', 'STRING', 'DIMENSION', FALSE, NULL, 6),
    (v_dataset_id, 'order_amount', '订单金额', 'DECIMAL', 'MEASURE', FALSE, NULL, 7),
    (v_dataset_id, 'order_status', '订单状态', 'STRING', 'DIMENSION', FALSE, NULL, 8),
    (v_dataset_id, 'created_time', '创建时间', 'DATETIME', 'DIMENSION', FALSE, NULL, 9)
    ON CONFLICT (dataset_id, physical_name) DO NOTHING;
END $$;


-- ============================================================================
-- 视图：用户可访问的数据集列表
-- ============================================================================
CREATE OR REPLACE VIEW v_user_accessible_datasets AS
SELECT 
    dr.id AS dataset_id,
    dr.dataset_code,
    dr.dataset_name,
    dr.data_domain,
    dr.sensitivity_level,
    dr.description,
    up.user_id,
    up.permission_type,
    up.max_row_limit,
    up.status AS permission_status
FROM dataset_registry dr
INNER JOIN user_permission up ON dr.id = up.dataset_id
WHERE dr.status = 'ACTIVE' 
  AND up.status = 'ACTIVE'
  AND (up.expired_at IS NULL OR up.expired_at > CURRENT_TIMESTAMP);

COMMENT ON VIEW v_user_accessible_datasets IS '用户可访问的数据集列表视图';


-- ============================================================================
-- 函数：获取用户对数据集的有效权限
-- ============================================================================
CREATE OR REPLACE FUNCTION get_user_permission(
    p_user_id VARCHAR(100),
    p_dataset_id INT
)
RETURNS TABLE (
    allowed_columns JSONB,
    row_filter_rules JSONB,
    max_row_limit INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.allowed_columns,
        up.row_filter_rules,
        up.max_row_limit
    FROM user_permission up
    WHERE up.user_id = p_user_id
      AND up.dataset_id = p_dataset_id
      AND up.status = 'ACTIVE'
      AND (up.expired_at IS NULL OR up.expired_at > CURRENT_TIMESTAMP)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_permission IS '获取用户对指定数据集的有效权限';
