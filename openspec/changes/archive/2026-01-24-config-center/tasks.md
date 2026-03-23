# Implementation Tasks

本文档列出实现"配置中心模块"的所有待办任务。

## 状态说明

- `[ ]` 待完成
- `[/]` 进行中  
- `[x]` 已完成

---

## 1. 数据模型设计 (P0 - 核心)

### 1.1 渠道实体
- [x] 1.1.1 创建 `app/domain/entities/config/channel.py`
- [x] 1.1.2 定义渠道类型枚举 (feishu/email/webhook/oss)
- [x] 1.1.3 设计配置 JSONB 结构
- [x] 1.1.4 添加单元测试

### 1.2 订阅实体（独立配置）
- [x] 1.2.1 创建 `app/domain/entities/config/subscription.py`
- [x] 1.2.2 定义订阅规则结构（引用 AppInstance 和 Channel）
- [x] 1.2.3 添加单元测试

### 1.3 数据库迁移
- [x] 1.3.1 创建 `channels` 表
- [x] 1.3.2 创建 `subscriptions` 表
- [x] 1.3.3 编写迁移脚本

---

## 2. 服务层实现 (P0 - 核心)

### 2.1 渠道服务
- [x] 2.1.1 创建 `ChannelService`
- [x] 2.1.2 实现渠道 CRUD
- [x] 2.1.3 实现渠道配置验证
- [x] 2.1.4 添加单元测试

### 2.2 订阅服务
- [x] 2.2.1 创建 `SubscriptionService`
- [x] 2.2.2 实现订阅 CRUD（独立管理，引用 AppInstance）
- [x] 2.2.3 实现订阅规则匹配
- [x] 2.2.4 添加单元测试

### 2.3 分发服务
- [x] 2.3.1 创建 `DeliveryService`
- [x] 2.3.2 实现渠道适配器接口
- [x] 2.3.3 实现飞书渠道适配器
- [x] 2.3.4 实现事件监听和分发
- [x] 2.3.5 添加单元测试

---

## 3. API 接口 (P1 - 重要)

### 3.1 渠道 API
- [x] 3.1.1 创建 `app/interfaces/api/v1/channels.py`
- [x] 3.1.2 实现 GET /api/v1/channels
- [x] 3.1.3 实现 POST /api/v1/channels
- [x] 3.1.4 实现 PUT /api/v1/channels/{id}
- [x] 3.1.5 实现 DELETE /api/v1/channels/{id}

### 3.2 订阅 API
- [x] 3.2.1 创建 `app/interfaces/api/v1/subscriptions.py`
- [x] 3.2.2 实现 GET /api/v1/subscriptions
- [x] 3.2.3 实现 POST /api/v1/subscriptions
- [x] 3.2.4 实现 PUT /api/v1/subscriptions/{id}
- [x] 3.2.5 实现 DELETE /api/v1/subscriptions/{id}
- [x] 3.2.6 实现 GET /api/v1/app-instances/{id}/subscriptions（快捷查询）

---

## 4. 数据迁移 (P1 - 重要)

- [x] 4.1 编写 FeishuChatRef → Channel 数据迁移脚本
- [x] 4.2 验证迁移数据完整性
- [ ] 4.3 标记 FeishuChatRef 为废弃

---

## 5. Executor 重构 (P2 - 可选)

- [x] 5.1 重构现有 Executor，移除硬编码的飞书推送逻辑
- [x] 5.2 Executor 输出结果供订阅中心处理
- [ ] 5.3 重构其他 Executor (可选)

---

## 6. 集成与验证 (P0 - 必须)

- [x] 6.1 DI 容器配置
- [x] 6.2 Blueprint 注册
- [x] 6.3 代码语法验证
- [x] 6.4 部署验证（数据库迁移完成）

---

## 任务统计

| 分类 | 任务数 | 预估工时 |
|------|--------|----------|
| 数据模型 | 10 | 2h |
| 服务层 | 14 | 4h |
| API 接口 | 11 | 2h |
| 数据迁移 | 3 | 1h |
| Executor 重构 | 2 | 2h |
| 集成验证 | 4 | 2h |
| **总计** | **44** | **13h** |
