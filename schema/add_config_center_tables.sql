-- ============================================================================
-- 配置中心数据库迁移脚本
-- 创建 channels 和 subscriptions 表
-- ============================================================================

-- 渠道表
CREATE TABLE IF NOT EXISTS channels (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    channel_type VARCHAR(20) NOT NULL,  -- feishu/email/webhook/oss
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 渠道表索引
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(channel_type);
CREATE INDEX IF NOT EXISTS idx_channels_enabled ON channels(enabled);

-- 渠道表注释
COMMENT ON TABLE channels IS '推送渠道配置表';
COMMENT ON COLUMN channels.channel_type IS '渠道类型: feishu/email/webhook/oss';
COMMENT ON COLUMN channels.config IS '渠道配置，结构根据类型不同';

-- ============================================================================

-- 订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    app_instance_id BIGINT NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    event_types VARCHAR[] NOT NULL DEFAULT '{}',  -- 订阅的事件类型
    filter_conditions JSONB DEFAULT '{}',          -- 过滤条件
    delivery_config JSONB DEFAULT '{}',            -- 分发配置
    enabled BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 订阅表索引
CREATE INDEX IF NOT EXISTS idx_subscriptions_app_instance ON subscriptions(app_instance_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_channel ON subscriptions(channel_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_enabled ON subscriptions(enabled);
CREATE INDEX IF NOT EXISTS idx_subscriptions_event_types ON subscriptions USING GIN(event_types);

-- 订阅表注释
COMMENT ON TABLE subscriptions IS '应用订阅配置表';
COMMENT ON COLUMN subscriptions.app_instance_id IS '关联的应用实例ID';
COMMENT ON COLUMN subscriptions.channel_id IS '关联的渠道ID';
COMMENT ON COLUMN subscriptions.event_types IS '订阅的事件类型列表';
COMMENT ON COLUMN subscriptions.filter_conditions IS '事件过滤条件';
COMMENT ON COLUMN subscriptions.delivery_config IS '分发配置，可覆盖渠道默认配置';

-- ============================================================================
-- 数据迁移：从 feishu_chat_refs 迁移到 channels
-- ============================================================================

-- 检查 feishu_chat_refs 表是否存在并迁移数据
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feishu_chat_refs') THEN
        INSERT INTO channels (name, channel_type, config, enabled, created_at)
        SELECT 
            COALESCE(name, chat_id) as name,
            'feishu' as channel_type,
            jsonb_build_object(
                'chat_id', chat_id,
                'migrated_from', 'feishu_chat_refs',
                'original_id', id
            ) as config,
            TRUE as enabled,
            COALESCE(created_at, NOW()) as created_at
        FROM feishu_chat_refs
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE '已从 feishu_chat_refs 迁移 % 条记录到 channels', (SELECT COUNT(*) FROM feishu_chat_refs);
    END IF;
END $$;
