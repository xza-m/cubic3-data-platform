-- ============================================================================
-- 数据提取平台 - 数据库Schema
-- 功能：数据源管理、数据集注册、数据提取配置
-- ============================================================================

-- 1. 数据源配置表
CREATE TABLE IF NOT EXISTS data_sources (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    source_type VARCHAR(20) NOT NULL,
    description TEXT,
    
    -- 连接配置 (JSON格式，不同类型有不同字段)
    connection_config JSONB NOT NULL,
    /* 示例配置：
       MaxCompute: {"access_id": "xxx", "access_key": "xxx", "endpoint": "xxx", "project": "xxx"}
       ClickHouse: {"host": "xxx", "port": 9000, "user": "xxx", "password": "xxx", "database": "xxx"}
       PostgreSQL: {"host": "xxx", "port": 5432, "user": "xxx", "password": "xxx", "database": "xxx"}
    */
    
    -- 高级配置
    extra_config JSONB DEFAULT '{}',
    
    -- 状态管理
    is_active BOOLEAN DEFAULT true,
    connection_status VARCHAR(20) DEFAULT 'unknown',
    last_test_at TIMESTAMP,
    last_test_error TEXT,
    
    -- 审计
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_source_type CHECK (source_type IN ('maxcompute', 'clickhouse', 'postgresql', 'mysql', 'hive'))
);

CREATE INDEX idx_data_sources_type ON data_sources(source_type);
CREATE INDEX idx_data_sources_active ON data_sources(is_active);

COMMENT ON TABLE data_sources IS '数据源配置表';
COMMENT ON COLUMN data_sources.source_type IS '数据源类型：maxcompute, clickhouse, postgresql, mysql, hive';
COMMENT ON COLUMN data_sources.connection_config IS '连接配置JSON，不同类型字段不同';
COMMENT ON COLUMN data_sources.connection_status IS '连接状态：connected, failed, testing, unknown';

-- 2. 数据集注册表 (逻辑数据集)
CREATE TABLE IF NOT EXISTS datasets (
    id BIGSERIAL PRIMARY KEY,
    dataset_code VARCHAR(100) NOT NULL UNIQUE,
    dataset_name VARCHAR(200) NOT NULL,
    
    -- 数据源关联
    source_id BIGINT REFERENCES data_sources(id) ON DELETE CASCADE,
    physical_table VARCHAR(200) NOT NULL,
    
    -- 元数据
    description TEXT,
    owner VARCHAR(50),
    
    -- 字段元数据 (冗余存储，提高查询效率)
    schema_snapshot JSONB,
    partition_fields JSONB DEFAULT '[]',
    dimension_fields JSONB DEFAULT '[]',
    metric_fields JSONB DEFAULT '[]',
    
    -- 同步状态
    sync_status VARCHAR(20) DEFAULT 'pending',
    last_sync_at TIMESTAMP,
    sync_error TEXT,
    
    -- 审计
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_datasets_source ON datasets(source_id);
CREATE INDEX idx_datasets_code ON datasets(dataset_code);
CREATE INDEX idx_datasets_deleted ON datasets(is_deleted);

COMMENT ON TABLE datasets IS '数据集注册表';
COMMENT ON COLUMN datasets.dataset_code IS '数据集唯一编码';
COMMENT ON COLUMN datasets.physical_table IS '物理表名（如 project.table 或 database.table）';
COMMENT ON COLUMN datasets.sync_status IS '同步状态：pending, syncing, synced, failed';

-- 3. 字段元数据表
CREATE TABLE IF NOT EXISTS dataset_fields (
    id BIGSERIAL PRIMARY KEY,
    dataset_id BIGINT REFERENCES datasets(id) ON DELETE CASCADE,
    
    -- 物理字段信息
    physical_name VARCHAR(100) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    is_nullable BOOLEAN DEFAULT true,
    default_value TEXT,
    comment TEXT,
    
    -- 业务字段信息
    display_name VARCHAR(100),
    business_type VARCHAR(20) DEFAULT 'dimension',
    
    -- 敏感度与脱敏
    sensitivity_level VARCHAR(20) DEFAULT 'public',
    mask_rule VARCHAR(50),
    
    -- 字段特征 (用于智能推荐)
    field_tags JSONB DEFAULT '{}',
    sample_values JSONB DEFAULT '[]',
    
    -- 排序
    field_order INT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT uk_dataset_field UNIQUE(dataset_id, physical_name),
    CONSTRAINT check_business_type CHECK (business_type IN ('dimension', 'metric', 'partition')),
    CONSTRAINT check_sensitivity CHECK (sensitivity_level IN ('public', 'internal', 'confidential', 'restricted'))
);

CREATE INDEX idx_dataset_fields_dataset ON dataset_fields(dataset_id);
CREATE INDEX idx_dataset_fields_type ON dataset_fields(business_type);

COMMENT ON TABLE dataset_fields IS '字段元数据表';
COMMENT ON COLUMN dataset_fields.business_type IS '业务类型：dimension(维度), metric(指标), partition(分区)';
COMMENT ON COLUMN dataset_fields.sensitivity_level IS '敏感级别：public, internal, confidential, restricted';
COMMENT ON COLUMN dataset_fields.mask_rule IS '脱敏规则：PHONE_MASK, EMAIL_MASK, ID_CARD_MASK等';

-- 4. 提取任务配置表
CREATE TABLE IF NOT EXISTS extraction_tasks (
    id BIGSERIAL PRIMARY KEY,
    task_name VARCHAR(200) NOT NULL,
    task_code VARCHAR(100) UNIQUE,
    
    -- 数据集关联
    dataset_id BIGINT REFERENCES datasets(id) ON DELETE CASCADE,
    
    -- 提取配置
    select_fields JSONB NOT NULL,
    filter_conditions JSONB NOT NULL,
    
    -- SQL模板
    sql_template TEXT,
    
    -- 限制
    row_limit INT DEFAULT 500000,
    
    -- 任务类型
    task_type VARCHAR(20) DEFAULT 'manual',
    
    -- 调度配置 (仅scheduled类型)
    schedule_config JSONB,
    
    -- 订阅配置
    subscription_config JSONB,
    
    -- 状态
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    last_run_status VARCHAR(20),
    
    -- 审计
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_task_type CHECK (task_type IN ('manual', 'scheduled'))
);

CREATE INDEX idx_extraction_tasks_dataset ON extraction_tasks(dataset_id);
CREATE INDEX idx_extraction_tasks_type ON extraction_tasks(task_type);
CREATE INDEX idx_extraction_tasks_active ON extraction_tasks(is_active);

COMMENT ON TABLE extraction_tasks IS '提取任务配置表';
COMMENT ON COLUMN extraction_tasks.task_type IS '任务类型：manual(手动), scheduled(定时)';
COMMENT ON COLUMN extraction_tasks.select_fields IS '选择的字段列表JSON';
COMMENT ON COLUMN extraction_tasks.filter_conditions IS '过滤条件JSON（必须包含分区）';

-- 5. 提取任务执行记录表
CREATE TABLE IF NOT EXISTS extraction_runs (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT REFERENCES extraction_tasks(id) ON DELETE CASCADE,
    
    -- 执行信息
    run_type VARCHAR(20),
    triggered_by VARCHAR(50),
    
    -- 执行参数
    execution_params JSONB,
    generated_sql TEXT,
    
    -- 执行状态
    status VARCHAR(20) DEFAULT 'pending',
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration_ms INT,
    
    -- 结果信息
    row_count BIGINT,
    file_size BIGINT,
    file_path TEXT,
    download_url TEXT,
    url_expires_at TIMESTAMP,
    
    -- 错误信息
    error_message TEXT,
    error_stack TEXT,
    
    -- 通知状态
    notification_status JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_run_status CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled'))
);

CREATE INDEX idx_extraction_runs_task ON extraction_runs(task_id);
CREATE INDEX idx_extraction_runs_status ON extraction_runs(status);
CREATE INDEX idx_extraction_runs_created ON extraction_runs(created_at DESC);

COMMENT ON TABLE extraction_runs IS '提取任务执行记录表';
COMMENT ON COLUMN extraction_runs.status IS '执行状态：pending, running, success, failed, cancelled';

-- 6. 提取模板表 (用于快速创建任务)
CREATE TABLE IF NOT EXISTS extraction_templates (
    id BIGSERIAL PRIMARY KEY,
    template_name VARCHAR(200) NOT NULL,
    dataset_id BIGINT REFERENCES datasets(id) ON DELETE CASCADE,
    
    -- 模板配置
    select_fields JSONB,
    filter_template JSONB,
    
    -- 使用统计
    use_count INT DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- 标签
    tags JSONB DEFAULT '[]',
    
    is_public BOOLEAN DEFAULT false,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_extraction_templates_dataset ON extraction_templates(dataset_id);
CREATE INDEX idx_extraction_templates_public ON extraction_templates(is_public);

COMMENT ON TABLE extraction_templates IS '提取模板表';
COMMENT ON COLUMN extraction_templates.filter_template IS '参数化的过滤条件模板';

-- 7. 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加触发器
CREATE TRIGGER update_data_sources_updated_at BEFORE UPDATE ON data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_datasets_updated_at BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dataset_fields_updated_at BEFORE UPDATE ON dataset_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_extraction_tasks_updated_at BEFORE UPDATE ON extraction_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_extraction_templates_updated_at BEFORE UPDATE ON extraction_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. 插入示例数据

-- 示例数据源
INSERT INTO data_sources (name, source_type, description, connection_config, created_by) VALUES
('生产环境MaxCompute', 'maxcompute', 'MaxCompute生产环境', 
 '{"access_id": "your_access_id", "access_key": "your_access_key", "endpoint": "http://service.cn-shanghai.maxcompute.aliyun.com/api", "project": "prod_dw"}',
 'admin'),
('测试环境ClickHouse', 'clickhouse', 'ClickHouse测试环境',
 '{"host": "127.0.0.1", "port": 9000, "user": "default", "password": "", "database": "test_db"}',
 'admin');

-- ============================================================================
-- 视图定义
-- ============================================================================

-- 数据集详情视图（包含数据源信息）
CREATE OR REPLACE VIEW v_datasets_detail AS
SELECT 
    d.id,
    d.dataset_code,
    d.dataset_name,
    d.physical_table,
    d.description,
    d.owner,
    d.sync_status,
    d.last_sync_at,
    ds.name as source_name,
    ds.source_type,
    ds.connection_status as source_status,
    (SELECT COUNT(*) FROM dataset_fields WHERE dataset_id = d.id) as field_count,
    (SELECT COUNT(*) FROM dataset_fields WHERE dataset_id = d.id AND business_type = 'partition') as partition_count,
    d.created_at,
    d.updated_at
FROM datasets d
LEFT JOIN data_sources ds ON d.source_id = ds.id
WHERE d.is_deleted = false;

COMMENT ON VIEW v_datasets_detail IS '数据集详情视图（包含数据源和字段统计）';

-- 任务执行统计视图
CREATE OR REPLACE VIEW v_extraction_stats AS
SELECT
    t.id as task_id,
    t.task_name,
    t.task_type,
    COUNT(r.id) as total_runs,
    COUNT(CASE WHEN r.status = 'success' THEN 1 END) as success_runs,
    COUNT(CASE WHEN r.status = 'failed' THEN 1 END) as failed_runs,
    AVG(CASE WHEN r.status = 'success' THEN r.duration_ms END) as avg_duration_ms,
    MAX(r.created_at) as last_run_at
FROM extraction_tasks t
LEFT JOIN extraction_runs r ON t.id = r.task_id
GROUP BY t.id, t.task_name, t.task_type;

COMMENT ON VIEW v_extraction_stats IS '任务执行统计视图';

-- ============================================================================
-- 完成
-- ============================================================================

