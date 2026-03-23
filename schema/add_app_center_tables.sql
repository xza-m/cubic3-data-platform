-- 应用中心数据库迁移脚本
-- 创建日期: 2026-01-21
-- 描述: 创建应用定义、应用实例、应用执行记录表

-- 1. 创建应用定义表
CREATE TABLE IF NOT EXISTS app_definitions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    config_schema JSONB,
    icon VARCHAR(50),
    author VARCHAR(100),
    version VARCHAR(20),
    enabled BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建应用实例表
CREATE TABLE IF NOT EXISTS app_instances (
    id BIGSERIAL PRIMARY KEY,
    app_code VARCHAR(50) NOT NULL REFERENCES app_definitions(code) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    config JSONB NOT NULL,
    schedule_type VARCHAR(20) NOT NULL,
    schedule_config JSONB,
    enabled BOOLEAN DEFAULT FALSE NOT NULL,
    owner VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_execution_at TIMESTAMP,
    last_execution_status VARCHAR(20)
);

-- 3. 创建应用执行记录表
CREATE TABLE IF NOT EXISTS app_executions (
    id BIGSERIAL PRIMARY KEY,
    instance_id BIGINT NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
    trigger_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_ms INTEGER,
    input_params JSONB,
    output JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_app_definitions_code ON app_definitions(code);
CREATE INDEX IF NOT EXISTS idx_app_definitions_category ON app_definitions(category);
CREATE INDEX IF NOT EXISTS idx_app_definitions_enabled ON app_definitions(enabled);

CREATE INDEX IF NOT EXISTS idx_app_instances_app_code ON app_instances(app_code);
CREATE INDEX IF NOT EXISTS idx_app_instances_owner ON app_instances(owner);
CREATE INDEX IF NOT EXISTS idx_app_instances_enabled ON app_instances(enabled);
CREATE INDEX IF NOT EXISTS idx_app_instances_last_execution_at ON app_instances(last_execution_at);

CREATE INDEX IF NOT EXISTS idx_app_executions_instance_id ON app_executions(instance_id);
CREATE INDEX IF NOT EXISTS idx_app_executions_status ON app_executions(status);
CREATE INDEX IF NOT EXISTS idx_app_executions_trigger_type ON app_executions(trigger_type);
CREATE INDEX IF NOT EXISTS idx_app_executions_started_at ON app_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_app_executions_created_at ON app_executions(created_at);

-- 5. 添加注释
COMMENT ON TABLE app_definitions IS '应用定义表 - 存储应用类型和配置模板';
COMMENT ON TABLE app_instances IS '应用实例表 - 存储用户配置的应用实例';
COMMENT ON TABLE app_executions IS '应用执行记录表 - 存储每次执行的详细信息';

COMMENT ON COLUMN app_definitions.code IS '应用唯一标识（如 bi_dashboard_push）';
COMMENT ON COLUMN app_definitions.config_schema IS 'JSON Schema（用于生成表单）';
COMMENT ON COLUMN app_instances.schedule_type IS '调度类型（cron/event/manual）';
COMMENT ON COLUMN app_instances.schedule_config IS '调度配置（如 cron 表达式）';
COMMENT ON COLUMN app_executions.trigger_type IS '触发方式（scheduled/event/manual）';
COMMENT ON COLUMN app_executions.status IS '执行状态（pending/running/success/failed）';
