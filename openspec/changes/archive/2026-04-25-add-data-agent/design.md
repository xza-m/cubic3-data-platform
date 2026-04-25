## Context

平台需要将 dw-skills 项目中验证的自然语言查询能力产品化，同时服务飞书应用单聊（面向业务方）和 DataChat Web UI（面向数据分析师）。两个信道共享 Agent 推理引擎，差异在 Prompt 策略和数据源路由。

详细设计文档：[docs/prd/data_agent_prd.md](../../../docs/prd/data_agent_prd.md)

## Goals / Non-Goals

- Goals:
  - 统一 Agent 核心（AgentService），飞书和 DataChat 共享推理引擎
  - 复用 dw-skills 的五步工作流 + 知识文档，不引入 RAG
  - LLM 可切换（Port/Adapter 模式，P0 覆盖 Qwen/DeepSeek/GPT）
  - 融入平台应用体系（AppDefinition/AppInstance），复用配置管理 UI
  - P2 可扩展为多 Agent + 轻量路由

- Non-Goals:
  - 不支持写操作（INSERT/UPDATE/DELETE）
  - 不引入外部 Agent 编排框架（Nanobot/LangGraph 等），P2 按需评估
  - 不引入 MCP 协议，复用已有 DataSourceAdapter
  - 不新建 DataChat 前端

## Decisions

### Decision 1: 复用 DataSourceAdapter 而非引入 MCP

dw-skills 通过 MCP Server 提供工具，但本项目已有 `AdapterFactory` + 多数据源适配器。引入 MCP 需额外部署 Server 进程，增加运维复杂度。选择在 `tool_registry.py` 中用 wrapper 封装 DataSourceAdapter 方法为 function calling schema。

### Decision 2: AppInstance.config 分层结构

Agent 配置存储在 `AppInstance.config`（JSONB）中，分为 `llm`（模型覆盖）、`knowledge`（数据源+知识库）、`agent`（行为参数）三层，加顶层 `allowed_user_ids`。LLM 凭证保留在全局环境变量中。

### Decision 3: P0 自建核心，P2 按需引入框架

经评估 Nanobot、OpenClaw 等框架，当前引入会导致双重配置同步、信道桥接、MCP 化改造、多进程部署等额外成本。Agent 数量 < 5 时 ROI 不划算。P2 当第 3 个垂直 Agent 出现时再评估。

### Decision 4: 信道适配层位于 interfaces 层

`FeishuChannel` / `DataChatChannel` 作为 Driving Adapter 位于 `interfaces/channels/`，负责输入转换和输出格式化。Agent 核心不感知信道差异。

## Risks / Trade-offs

- **LLM 生成错误 SQL** → sql_validator 校验 + SKILL.md 规范约束 + 反馈闭环
- **飞书 webhook 3s 超时** → 立即返回 200 + RQ 异步 + 渐进式卡片更新
- **DataChat 重构回归** → API 响应格式保持兼容，前端无需改动
- **知识文档过期** → describe_table 动态校验 + 手动同步流程

## Migration Plan

1. P0：新增 Agent 核心模块，不删除旧 `OpenAIService`（保留为 fallback）
2. DataChat 重构完成并验证后，废弃 `generate_sql()` 方法
3. P1：新增 `agent_query_log` 表（Alembic 迁移），无破坏性变更

## Open Questions

- ConfigDrawer 对嵌套 `knowledge.datasource_id` 的 `DataSourceSelector` Widget 映射是否需要额外前端适配（已在 `buildUiSchema` 中递归处理 `datasource_id` 字段名匹配）
