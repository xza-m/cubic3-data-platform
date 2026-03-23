# Change: 新增 DataAgent 多信道智能数仓问答

## Why

当前数仓查询依赖数据开发手写 SQL，业务方无法自助获取数据。团队已在 dw-skills 项目中验证了基于 Skill 的自然语言查询方案，现需将其能力引入平台，构建统一的 Agent 核心，同时服务飞书应用单聊和 DataChat Web UI 两个信道。现有 DataChat 的单次 LLM 调用模式也将升级为完整的 Agent Loop 多步推理。

## What Changes

- **新增 Agent 核心**：`AgentService` + `AgentLoopService` + `ToolRegistry` + `PromptBuilder` + `KnowledgeService`，位于 `app/application/agent/`
- **新增 LLM 抽象层**：`LLMPort`（domain 层）+ `OpenAICompatibleAdapter`（infrastructure 层），替代现有 `BaseLLMService`
- **新增信道适配层**：`FeishuChannel` + `DataChatChannel`，位于 `app/interfaces/channels/`
- **扩展飞书集成**：`feishu.py` 新增 P2P 单聊 Agent 分支 + `card_action` 反馈回调路由
- **重构 DataChat**：`SendMessageHandler` 从直接调用 `OpenAIService.generate_sql()` 改为调用 `AgentService`
- **新增平台应用注册**：`AppDefinition(code='data_agent', category='agent')` + `DataAgentExecutor`
- **废弃** `infrastructure/llm/openai_service.py` 中的 `generate_sql()` 方法
- P1 新增 `agent_query_log` 表（反馈闭环）

## Impact

- Affected specs: 新增 `data-agent` capability
- Affected code:
  - 新增：`app/domain/agent/`、`app/application/agent/`、`app/infrastructure/adapters/llm/`、`app/interfaces/channels/`、`app/executors/data_agent_executor.py`
  - 修改：`app/interfaces/api/v1/feishu.py`、`app/interfaces/api/v1/conversations.py`、`app/infrastructure/seed.py`、`app/executors/__init__.py`、`app/di/container.py`
  - 废弃：`app/infrastructure/llm/openai_service.py` 的 `generate_sql()`
  - P1 新增：`agent_query_log` 表 + Alembic 迁移
