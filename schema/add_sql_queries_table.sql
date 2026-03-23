-- SQL 查询任务表（支持异步查询）
-- 用于存储异步 SQL 查询请求和结果

CREATE TABLE IF NOT EXISTS sql_queries (
    id BIGSERIAL PRIMARY KEY,
    
    -- 查询信息
    source_id BIGINT REFERENCES data_sources(id) ON DELETE SET NULL,
    sql TEXT NOT NULL,
    limit_rows INTEGER DEFAULT 100,
    
    -- 执行状态: pending, running, completed, failed
    status VARCHAR(20) DEFAULT 'pending',
    
    -- 执行时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    execution_time_ms INTEGER,
    
    -- 查询结果（JSON 格式存储）
    result JSONB,
    row_count INTEGER,
    
    -- 错误信息
    error_message TEXT,
    error_stack TEXT,
    
    -- 用户信息
    created_by VARCHAR(50),
    
    -- RQ Job ID（用于任务追踪）
    job_id VARCHAR(100)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sql_queries_status ON sql_queries(status);
CREATE INDEX IF NOT EXISTS idx_sql_queries_source_id ON sql_queries(source_id);
CREATE INDEX IF NOT EXISTS idx_sql_queries_created_at ON sql_queries(created_at);
CREATE INDEX IF NOT EXISTS idx_sql_queries_created_by ON sql_queries(created_by);

-- 注释
COMMENT ON TABLE sql_queries IS 'SQL 查询任务表，用于支持异步查询';
COMMENT ON COLUMN sql_queries.status IS '执行状态: pending-等待执行, running-执行中, completed-执行完成, failed-执行失败';
COMMENT ON COLUMN sql_queries.result IS '查询结果，包含 columns, data, fields, statistics 等';
COMMENT ON COLUMN sql_queries.job_id IS 'RQ 任务 ID，用于追踪异步任务状态';
