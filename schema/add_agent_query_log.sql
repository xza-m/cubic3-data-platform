-- ============================================================================
-- CUBIC3 智能问数查询日志表
-- 记录每次 Agent 查询的上下文、结果和用户反馈
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_query_log (
    id BIGSERIAL PRIMARY KEY,
    app_instance_id BIGINT,                              -- 关联 AppInstance（预留多实例扩展）
    channel VARCHAR(20) NOT NULL,                        -- feishu / datachat
    channel_ref VARCHAR(128),                            -- 信道标识（chat_id 或 conversation_id）
    user_id VARCHAR(64),                                 -- open_id（飞书）或 user_id（DataChat）
    user_message TEXT NOT NULL,                          -- 用户原始问题
    agent_response TEXT,                                 -- Agent 最终回复
    sql_executed TEXT,                                   -- 执行的 SQL
    status VARCHAR(20) NOT NULL DEFAULT 'pending',       -- pending / running / success / error
    llm_provider VARCHAR(20),                            -- LLM 提供商标识
    token_usage JSONB,                                   -- token 用量 {prompt_tokens, completion_tokens, total_tokens}
    duration_ms INTEGER,                                 -- 总耗时（毫秒）
    feedback VARCHAR(20),                                -- positive / negative（用户反馈）
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_agent_query_log_channel ON agent_query_log(channel);
CREATE INDEX IF NOT EXISTS idx_agent_query_log_user_id ON agent_query_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_query_log_status ON agent_query_log(status);
CREATE INDEX IF NOT EXISTS idx_agent_query_log_feedback ON agent_query_log(feedback) WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_query_log_created_at ON agent_query_log(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_query_log_instance ON agent_query_log(app_instance_id) WHERE app_instance_id IS NOT NULL;

-- 注释
COMMENT ON TABLE agent_query_log IS 'CUBIC3 智能问数查询日志，记录每次查询上下文和用户反馈';
COMMENT ON COLUMN agent_query_log.app_instance_id IS '关联的 AppInstance ID（预留多实例扩展）';
COMMENT ON COLUMN agent_query_log.channel IS '信道标识：feishu / datachat';
COMMENT ON COLUMN agent_query_log.channel_ref IS '信道级引用（chat_id 或 conversation_id）';
COMMENT ON COLUMN agent_query_log.feedback IS '用户反馈：positive（正确）/ negative（有误）';
