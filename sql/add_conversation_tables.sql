-- 创建对话和消息表
-- 智能问数功能

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    dataset_id BIGINT REFERENCES datasets(id) ON DELETE CASCADE,
    user_id VARCHAR(50) NOT NULL,
    description TEXT,
    context JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    generated_sql TEXT,
    query_result JSONB,
    visualization_config JSONB,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_dataset_id ON conversations(dataset_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);

-- 注释
COMMENT ON TABLE conversations IS '智能对话表';
COMMENT ON TABLE messages IS '对话消息表';
COMMENT ON COLUMN conversations.context IS '对话上下文（存储对话状态、历史摘要等）';
COMMENT ON COLUMN messages.query_result IS '查询结果数据';
COMMENT ON COLUMN messages.visualization_config IS '可视化配置（图表类型、配置等）';
