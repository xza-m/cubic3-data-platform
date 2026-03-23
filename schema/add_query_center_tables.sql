-- 查询中心数据库迁移脚本
-- 创建日期: 2026-01-21

-- 1. 创建查询文件夹表
CREATE TABLE IF NOT EXISTS query_folders (
    id BIGSERIAL PRIMARY KEY,
    folder_name VARCHAR(100) NOT NULL,
    parent_id BIGINT REFERENCES query_folders(id) ON DELETE CASCADE,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. 创建查询表
CREATE TABLE IF NOT EXISTS queries (
    id BIGSERIAL PRIMARY KEY,
    query_code VARCHAR(100) UNIQUE NOT NULL,
    query_name VARCHAR(200) NOT NULL,
    source_id BIGINT REFERENCES data_sources(id) ON DELETE SET NULL,
    sql_query TEXT NOT NULL,
    folder_id BIGINT REFERENCES query_folders(id) ON DELETE SET NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    description TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    execute_count INTEGER DEFAULT 0,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_executed_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE NOT NULL,
    deleted_at TIMESTAMP
);

-- 3. 创建查询历史表
CREATE TABLE IF NOT EXISTS query_histories (
    id BIGSERIAL PRIMARY KEY,
    query_id BIGINT REFERENCES queries(id) ON DELETE SET NULL,
    source_id BIGINT REFERENCES data_sources(id) ON DELETE SET NULL,
    sql_query TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    result_rows INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    error_message TEXT,
    executed_by VARCHAR(100) NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. 创建查询模板表
CREATE TABLE IF NOT EXISTS query_templates (
    id BIGSERIAL PRIMARY KEY,
    template_name VARCHAR(200) NOT NULL,
    template_description TEXT,
    sql_template TEXT NOT NULL,
    parameters JSONB DEFAULT '[]'::jsonb,
    category VARCHAR(50),
    tags JSONB DEFAULT '[]'::jsonb,
    use_count INTEGER DEFAULT 0,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_queries_query_code ON queries(query_code);
CREATE INDEX IF NOT EXISTS idx_queries_source_id ON queries(source_id);
CREATE INDEX IF NOT EXISTS idx_queries_folder_id ON queries(folder_id);
CREATE INDEX IF NOT EXISTS idx_queries_created_by ON queries(created_by);
CREATE INDEX IF NOT EXISTS idx_queries_is_favorite ON queries(is_favorite);
CREATE INDEX IF NOT EXISTS idx_queries_is_template ON queries(is_template);

CREATE INDEX IF NOT EXISTS idx_query_folders_parent_id ON query_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_query_folders_created_by ON query_folders(created_by);

CREATE INDEX IF NOT EXISTS idx_query_histories_query_id ON query_histories(query_id);
CREATE INDEX IF NOT EXISTS idx_query_histories_source_id ON query_histories(source_id);
CREATE INDEX IF NOT EXISTS idx_query_histories_status ON query_histories(status);
CREATE INDEX IF NOT EXISTS idx_query_histories_executed_by ON query_histories(executed_by);
CREATE INDEX IF NOT EXISTS idx_query_histories_executed_at ON query_histories(executed_at);

CREATE INDEX IF NOT EXISTS idx_query_templates_category ON query_templates(category);

-- 6. 添加注释
COMMENT ON TABLE queries IS '用户保存的查询';
COMMENT ON TABLE query_folders IS '查询文件夹';
COMMENT ON TABLE query_histories IS '查询执行历史';
COMMENT ON TABLE query_templates IS '查询模板';
