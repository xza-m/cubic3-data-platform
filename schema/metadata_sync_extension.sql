-- ============================================================================
-- 元数据同步与数据集注册 - 数据库扩展
-- Purpose: 支持 MaxCompute 表元数据自动同步和智能识别
-- ============================================================================

-- 1. 同步任务配置表 (metadata_sync_config)
-- 存储定时同步任务的配置
CREATE TABLE IF NOT EXISTS metadata_sync_config (
    id SERIAL PRIMARY KEY,
    task_name VARCHAR(100) NOT NULL,                        -- 任务名称
    sync_type VARCHAR(20) DEFAULT 'MANUAL',                 -- MANUAL / SCHEDULED
    mc_project VARCHAR(100) NOT NULL,                       -- MaxCompute 项目名
    table_pattern VARCHAR(200),                             -- 表名匹配模式（支持通配符）
    cron_expression VARCHAR(64),                            -- 定时表达式
    enabled BOOLEAN DEFAULT TRUE,
    last_run_at TIMESTAMP,                                  -- 上次执行时间
    next_run_at TIMESTAMP,                                  -- 下次执行时间
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_sync_task_name UNIQUE (task_name)
);

CREATE INDEX idx_sync_config_enabled ON metadata_sync_config(enabled);
COMMENT ON TABLE metadata_sync_config IS '元数据同步任务配置表';


-- 2. 同步执行记录表 (metadata_sync_log)
-- 记录每次同步的执行情况
CREATE TABLE IF NOT EXISTS metadata_sync_log (
    id SERIAL PRIMARY KEY,
    sync_config_id INT REFERENCES metadata_sync_config(id),
    sync_batch_id VARCHAR(100) NOT NULL,                    -- 批次ID（UUID）
    mc_project VARCHAR(100) NOT NULL,
    mc_table VARCHAR(200) NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'RUNNING',              -- RUNNING / SUCCESS / FAILED
    discovered_columns INT DEFAULT 0,                       -- 发现的字段数
    identified_partitions INT DEFAULT 0,                    -- 识别的分区字段数
    identified_measures INT DEFAULT 0,                      -- 识别的度量字段数
    identified_sensitive INT DEFAULT 0,                     -- 识别的敏感字段数
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    duration_ms INT,
    trace_id VARCHAR(100)
);

CREATE INDEX idx_sync_log_batch ON metadata_sync_log(sync_batch_id);
CREATE INDEX idx_sync_log_status ON metadata_sync_log(sync_status);
CREATE INDEX idx_sync_log_table ON metadata_sync_log(mc_project, mc_table);
COMMENT ON TABLE metadata_sync_log IS '元数据同步执行记录表';


-- 3. 扩展 dataset_registry 表（添加同步相关字段）
-- 注意：这些字段应该添加到现有的 dataset_registry 表中
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP;
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS sync_batch_id VARCHAR(100);
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS auto_discovered BOOLEAN DEFAULT FALSE;
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS table_comment TEXT;
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS row_count BIGINT;
ALTER TABLE dataset_registry ADD COLUMN IF NOT EXISTS storage_size BIGINT;

COMMENT ON COLUMN dataset_registry.sync_status IS '同步状态：PENDING/SYNCING/SYNCED/FAILED';
COMMENT ON COLUMN dataset_registry.last_sync_at IS '最后同步时间';
COMMENT ON COLUMN dataset_registry.auto_discovered IS '是否由自动发现创建';


-- 4. 扩展 field_metadata 表（添加识别相关字段）
ALTER TABLE field_metadata ADD COLUMN IF NOT EXISTS field_comment TEXT;
ALTER TABLE field_metadata ADD COLUMN IF NOT EXISTS auto_identified BOOLEAN DEFAULT FALSE;
ALTER TABLE field_metadata ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2);
ALTER TABLE field_metadata ADD COLUMN IF NOT EXISTS identification_rules JSONB;

COMMENT ON COLUMN field_metadata.field_comment IS 'MaxCompute 表字段的原始注释';
COMMENT ON COLUMN field_metadata.auto_identified IS '是否由智能识别自动判定';
COMMENT ON COLUMN field_metadata.confidence_score IS '识别置信度（0.00-1.00）';
COMMENT ON COLUMN field_metadata.identification_rules IS '命中的识别规则列表';


-- 5. 字段识别规则配置表 (field_identification_rules)
-- 存储可复用的字段识别规则
CREATE TABLE IF NOT EXISTS field_identification_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(20) NOT NULL,                         -- PARTITION / SENSITIVE / MEASURE
    match_strategy VARCHAR(20) NOT NULL,                    -- NAME_REGEX / COMMENT_KEYWORD / TYPE_CHECK
    pattern TEXT NOT NULL,                                  -- 匹配模式（正则表达式或关键词）
    target_attribute VARCHAR(50),                           -- 要设置的属性（如：is_sensitive）
    target_value VARCHAR(100),                              -- 属性值（如：true）
    priority INT DEFAULT 100,                               -- 优先级（数字越小优先级越高）
    enabled BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 预置识别规则
INSERT INTO field_identification_rules (rule_name, rule_type, match_strategy, pattern, target_attribute, target_value, priority, description) VALUES
-- 分区字段识别规则
('分区字段-ds', 'PARTITION', 'NAME_REGEX', '^ds$|^dt$|^date$', 'field_category', 'PARTITION_KEY', 10, '常见的日期分区字段'),
('分区字段-hour', 'PARTITION', 'NAME_REGEX', '^hh$|^hour$', 'field_category', 'PARTITION_KEY', 11, '小时分区字段'),

-- 敏感字段识别规则（名称匹配）
('敏感-手机号-名称', 'SENSITIVE', 'NAME_REGEX', 'mobile|phone|tel|cellphone', 'is_sensitive', 'true', 20, '手机号字段名称特征'),
('敏感-身份证-名称', 'SENSITIVE', 'NAME_REGEX', 'id_card|id_no|identity_card|cert_no', 'is_sensitive', 'true', 21, '身份证字段名称特征'),
('敏感-邮箱-名称', 'SENSITIVE', 'NAME_REGEX', 'email|mail_addr', 'is_sensitive', 'true', 22, '邮箱字段名称特征'),
('敏感-姓名-名称', 'SENSITIVE', 'NAME_REGEX', 'real_name|user_name|customer_name|name(?!space)', 'is_sensitive', 'true', 23, '姓名字段名称特征'),
('敏感-地址-名称', 'SENSITIVE', 'NAME_REGEX', 'address|addr|location|province|city(?!_code)', 'is_sensitive', 'true', 24, '地址字段名称特征'),
('敏感-密码-名称', 'SENSITIVE', 'NAME_REGEX', 'password|passwd|pwd|secret', 'is_sensitive', 'true', 25, '密码字段名称特征'),

-- 敏感字段识别规则（注释匹配）
('敏感-手机号-注释', 'SENSITIVE', 'COMMENT_KEYWORD', '手机号|手机|电话|联系方式', 'is_sensitive', 'true', 30, '手机号注释特征'),
('敏感-身份证-注释', 'SENSITIVE', 'COMMENT_KEYWORD', '身份证|证件号|身份证号', 'is_sensitive', 'true', 31, '身份证注释特征'),
('敏感-邮箱-注释', 'SENSITIVE', 'COMMENT_KEYWORD', '邮箱|电子邮件|邮件地址', 'is_sensitive', 'true', 32, '邮箱注释特征'),
('敏感-姓名-注释', 'SENSITIVE', 'COMMENT_KEYWORD', '姓名|真实姓名|用户姓名', 'is_sensitive', 'true', 33, '姓名注释特征'),

-- 度量字段识别规则（名称匹配）
('度量-金额-名称', 'MEASURE', 'NAME_REGEX', '_amt$|_amount$|_fee$|_price$|_cost$', 'field_category', 'MEASURE', 40, '金额类度量字段'),
('度量-数量-名称', 'MEASURE', 'NAME_REGEX', '_cnt$|_count$|_num$|_quantity$', 'field_category', 'MEASURE', 41, '数量类度量字段'),
('度量-总计-名称', 'MEASURE', 'NAME_REGEX', '_sum$|_total$|_aggregate$', 'field_category', 'MEASURE', 42, '总计类度量字段'),
('度量-比例-名称', 'MEASURE', 'NAME_REGEX', '_rate$|_ratio$|_percent$|_pct$', 'field_category', 'MEASURE', 43, '比例类度量字段'),

-- 度量字段识别规则（注释匹配）
('度量-金额-注释', 'MEASURE', 'COMMENT_KEYWORD', '金额|价格|费用|成本|总价', 'field_category', 'MEASURE', 50, '金额类注释特征'),
('度量-数量-注释', 'MEASURE', 'COMMENT_KEYWORD', '数量|次数|个数|总数', 'field_category', 'MEASURE', 51, '数量类注释特征'),
('度量-比例-注释', 'MEASURE', 'COMMENT_KEYWORD', '比例|占比|百分比|率', 'field_category', 'MEASURE', 52, '比例类注释特征')

ON CONFLICT DO NOTHING;

CREATE INDEX idx_field_rules_type ON field_identification_rules(rule_type);
CREATE INDEX idx_field_rules_enabled ON field_identification_rules(enabled);
COMMENT ON TABLE field_identification_rules IS '字段识别规则配置表：存储智能识别的启发式规则';


-- 6. 数据集审批流程表 (dataset_approval)
-- 支持数据集注册需要审批的场景
CREATE TABLE IF NOT EXISTS dataset_approval (
    id SERIAL PRIMARY KEY,
    dataset_id INT REFERENCES dataset_registry(id),
    approval_status VARCHAR(20) DEFAULT 'PENDING',          -- PENDING / APPROVED / REJECTED
    requester VARCHAR(100) NOT NULL,                        -- 申请人
    approver VARCHAR(100),                                  -- 审批人
    approval_comment TEXT,                                  -- 审批意见
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    CONSTRAINT uk_dataset_approval UNIQUE (dataset_id)
);

CREATE INDEX idx_approval_status ON dataset_approval(approval_status);
COMMENT ON TABLE dataset_approval IS '数据集审批流程表';


-- ============================================================================
-- 视图：数据集同步概览
-- ============================================================================
CREATE OR REPLACE VIEW v_dataset_sync_overview AS
SELECT 
    dr.id AS dataset_id,
    dr.dataset_code,
    dr.dataset_name,
    dr.physical_project,
    dr.physical_table,
    dr.sync_status,
    dr.last_sync_at,
    dr.auto_discovered,
    COUNT(fm.id) AS total_fields,
    COUNT(CASE WHEN fm.field_category = 'PARTITION_KEY' THEN 1 END) AS partition_fields,
    COUNT(CASE WHEN fm.field_category = 'MEASURE' THEN 1 END) AS measure_fields,
    COUNT(CASE WHEN fm.is_sensitive = TRUE THEN 1 END) AS sensitive_fields,
    COUNT(CASE WHEN fm.auto_identified = TRUE THEN 1 END) AS auto_identified_fields
FROM dataset_registry dr
LEFT JOIN field_metadata fm ON dr.id = fm.dataset_id
GROUP BY dr.id, dr.dataset_code, dr.dataset_name, dr.physical_project, 
         dr.physical_table, dr.sync_status, dr.last_sync_at, dr.auto_discovered;

COMMENT ON VIEW v_dataset_sync_overview IS '数据集同步概览视图';


-- ============================================================================
-- 函数：获取数据集的同步统计
-- ============================================================================
CREATE OR REPLACE FUNCTION get_sync_statistics(p_dataset_id INT)
RETURNS TABLE (
    total_fields INT,
    partition_fields INT,
    measure_fields INT,
    sensitive_fields INT,
    auto_identified_fields INT,
    manual_override_fields INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INT AS total_fields,
        COUNT(CASE WHEN field_category = 'PARTITION_KEY' THEN 1 END)::INT AS partition_fields,
        COUNT(CASE WHEN field_category = 'MEASURE' THEN 1 END)::INT AS measure_fields,
        COUNT(CASE WHEN is_sensitive = TRUE THEN 1 END)::INT AS sensitive_fields,
        COUNT(CASE WHEN auto_identified = TRUE THEN 1 END)::INT AS auto_identified_fields,
        COUNT(CASE WHEN auto_identified = FALSE THEN 1 END)::INT AS manual_override_fields
    FROM field_metadata
    WHERE dataset_id = p_dataset_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sync_statistics IS '获取数据集的字段识别统计信息';


-- ============================================================================
-- 示例数据：同步任务配置
-- ============================================================================
INSERT INTO metadata_sync_config (
    task_name, sync_type, mc_project, table_pattern, 
    cron_expression, enabled, created_by
) VALUES (
    '交易域表定时同步',
    'SCHEDULED',
    'prod_dw',
    'dws_trade_*',
    '0 2 * * *',  -- 每天凌晨 2 点
    TRUE,
    'admin'
) ON CONFLICT (task_name) DO NOTHING;

-- ============================================================================
-- 权限配置（可选）
-- ============================================================================
-- GRANT SELECT, INSERT, UPDATE ON metadata_sync_config TO data_platform_user;
-- GRANT SELECT, INSERT ON metadata_sync_log TO data_platform_user;
-- GRANT SELECT ON v_dataset_sync_overview TO data_platform_user;

