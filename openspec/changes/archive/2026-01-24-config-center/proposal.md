# Change: 配置中心模块设计

## Why

### 当前问题

应用中心的 Executor 实现存在**职责边界模糊**的问题：

1. **应用与推送耦合**：如 `BiDashboardPushExecutor` 既负责截图又负责推送到飞书，职责不单一。

2. **渠道配置分散**：
   - 飞书群配置在 `FeishuChatRef` 表中
   - 推送逻辑硬编码在各个 Executor 中
   - 无法灵活配置多渠道推送

3. **扩展性差**：
   - 新增推送渠道需要修改 Executor 代码
   - 同一应用结果推送到多个渠道需要写多个 Executor
   - 用户无法自主配置推送目的地

### 期望架构

```
[应用] → 专注业务逻辑，产出结果
   ↓ (事件发布)
[配置中心] → 管理渠道 + 订阅规则，分发结果
   ↓
[飞书/邮件/Webhook/OSS...]
```

## What Changes

### 核心变更

1. **新增配置中心模块** (`app/domain/entities/config/`)
   - `Channel` - 推送渠道实体（飞书群、邮件、Webhook）
   - `Subscription` - 订阅规则实体（独立实体，引用 AppInstance）

2. **迁移现有配置**
   - `FeishuChatRef` → 新的 Channel 实体

3. **重构应用 Executor**
   - 应用只负责**产出结果**
   - 推送逻辑**可选**调用配置中心分发

4. **新增配置中心服务**
   - `ChannelService` - 渠道 CRUD
   - `SubscriptionService` - 订阅管理（独立配置，非应用实例内嵌）
   - `DeliveryService` - 结果分发

## Impact

### 新增文件
```
app/domain/entities/config/
├── channel.py          # 渠道实体
└── subscription.py     # 订阅实体（独立，引用 AppInstance）

app/application/services/config/
├── channel_service.py
├── subscription_service.py
└── delivery_service.py

app/interfaces/api/v1/
├── channels.py         # 渠道 API
└── subscriptions.py    # 订阅 API
```

### 修改文件
- 6 个 Executor 文件 - 剥离推送逻辑
- `FeishuChatRef` - 标记废弃或迁移数据
- 数据库 schema - 添加新表

### 数据库变更
```sql
-- 渠道表
CREATE TABLE channels (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL,  -- feishu/email/webhook/oss
    name VARCHAR(100) NOT NULL,
    config JSONB NOT NULL,       -- 渠道特定配置
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 订阅表（独立实体，引用 AppInstance）
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    app_instance_id INTEGER REFERENCES app_instances(id),
    channel_id INTEGER REFERENCES channels(id),
    event_types VARCHAR[] NOT NULL,  -- 订阅的事件类型
    filter_conditions JSONB,          -- 过滤条件
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

## Design Decisions

### 1. 应用边界定义

**决策**：应用只负责业务逻辑封装，不负责订阅渠道

**应用的职责**：
- ✅ 执行业务逻辑（截图、查询、计算）
- ✅ 产出结果数据（图片、CSV、JSON）
- ✅ 发布执行完成事件
- ✅ **可选**调用配置中心分发（保持兼容性）

**应用不负责**：
- ❌ 管理推送渠道配置
- ❌ 直接推送到具体渠道

### 2. 模块设计：配置中心

**决策**：创建配置中心模块，包含渠道管理和订阅管理

**职责**：
- 管理推送渠道（飞书群、邮件列表、Webhook 等）
- 管理订阅规则（独立配置，引用 AppInstance）
- 监听应用执行事件
- 根据订阅规则分发结果

### 3. 订阅配置：独立实体

**决策**：订阅配置作为独立实体，不内嵌在 AppInstance 中

**设计**：
```
Subscription 表
├── app_instance_id → 引用 AppInstance
├── channel_id → 引用 Channel
└── event_types, conditions...
```

**用户操作**：
- **主入口**：配置中心统一管理所有订阅
- **快捷入口**：应用实例详情页显示"已订阅渠道"（只读/跳转）

**优点**：
- 解耦：订阅独立于应用生命周期
- 灵活：一个渠道可订阅多个应用
- 统一管理：在配置中心集中查看所有订阅关系

### 4. 渠道类型设计

**决策**：支持多种渠道类型，配置驱动

| 渠道类型 | 配置项 |
|---------|--------|
| feishu | chat_id, message_template |
| email | recipients, subject_template |
| webhook | url, headers, method |
| oss | bucket, path_template |

### 5. 兼容性策略

**决策**：渐进式迁移，保持向后兼容

- 现有 Executor 保持可用
- 新增"配置中心分发"作为可选功能
- 逐步将硬编码推送逻辑迁移到配置中心

### 6. 数据迁移策略

**决策**：将 `FeishuChatRef` 数据迁移到 Channel

```sql
-- 迁移脚本
INSERT INTO channels (type, name, config)
SELECT 'feishu', 
       chat_id, 
       jsonb_build_object('chat_id', chat_id)
FROM feishu_chat_refs;
```

## Non-Goals

本次变更**不包括**：

- ❌ 修改数据中心（数据源/数据集）的设计
- ❌ 修改应用中心的整体架构
- ❌ 实现复杂的工作流编排
- ❌ 前端 UI 开发（仅 API）

## Risks

### 风险 1：迁移复杂性

**描述**：现有 6 个 Executor 都包含推送逻辑，迁移工作量大。

**缓解措施**：
- 采用渐进式迁移
- 保持旧逻辑可用
- 逐个 Executor 重构

### 风险 2：事件丢失

**描述**：配置中心依赖事件，事件丢失可能导致推送失败。

**缓解措施**：
- 支持手动触发分发
- 记录分发日志
- 失败重试机制

## Success Criteria

1. ✅ 配置中心模块完成并可用
2. ✅ 渠道 CRUD API 正常工作
3. ✅ 订阅规则独立配置并生效
4. ✅ 至少 1 个 Executor 完成迁移验证
5. ✅ `FeishuChatRef` 数据成功迁移

## Related Work

- **前置依赖**：应用中心事件统一（已完成）
- **后续工作**：
  - 前端配置中心 UI
  - 更多渠道类型支持
  - 分发日志和监控
