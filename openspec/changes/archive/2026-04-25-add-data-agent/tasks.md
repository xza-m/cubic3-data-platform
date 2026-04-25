## 1. 领域层

- [x] 1.1 创建 `app/domain/agent/entities.py`：`AgentRequest`、`AgentResponse`、`AgentContext`、`AgentStep` 数据类
- [x] 1.2 创建 `app/domain/agent/ports/llm_port.py`：`LLMPort` ABC + `LLMResponse`、`ToolCall` 数据类

## 2. 基础设施层

- [x] 2.1 创建 `app/infrastructure/adapters/llm/base_llm_adapter.py`：`LLMPort` 基类实现
- [x] 2.2 创建 `app/infrastructure/adapters/llm/openai_compatible.py`：OpenAI 兼容适配器（覆盖 Qwen/DeepSeek/GPT）
- [x] 2.3 从 dw-skills 同步知识文档到 `app/application/agent/knowledge/` ~~（目录已创建，运维侧执行 `make publish-knowledge`，不阻塞代码层 archive；2026-04-25 close-out 转为部署 follow-up）~~

## 3. 应用层 — Agent 核心

- [x] 3.1 创建 `app/application/agent/services/knowledge_service.py`：知识文档加载
- [x] 3.2 创建 `app/application/agent/services/tool_registry.py`：工具注册 + `ToolExecutor` + `for_context()` 方法
- [x] 3.3 创建 `app/application/agent/services/prompt_builder.py`：按信道策略构建 System Prompt
- [x] 3.4 创建 `app/application/agent/services/agent_loop_service.py`：Agent 循环核心（tool_use 循环 + on_progress 回调）
- [x] 3.5 创建 `app/application/agent/agent_service.py`：统一入口 `run(AgentRequest)` → `AgentResponse`
- [x] 3.6 创建 `app/application/agent/prompts/templates.py`：Prompt 模板常量

## 4. 接口层 — 信道适配

- [x] 4.1 创建 `app/interfaces/channels/base_channel.py`：`ChannelAdapter` ABC
- [x] 4.2 创建 `app/interfaces/channels/feishu_channel.py`：飞书信道（to_agent_request、deliver_response、send_thinking_card、update_progress_card）
- [x] 4.3 创建 `app/interfaces/channels/datachat_channel.py`：DataChat 信道（to_agent_request、deliver_response、历史消息注入）
- [x] 4.4 扩展 `app/interfaces/api/v1/feishu.py`：P2P 单聊 Agent 分支（chat_type == "p2p" → FeishuChannel → 后台线程异步执行）
- [x] 4.5 重构 `app/application/conversation/handlers/send_message_handler.py`：优先走 AgentService + DataChatChannel，不可用时回退 Legacy LLM

## 5. 平台应用集成

- [x] 5.1 `app/infrastructure/seed.py`：`BUILTIN_APP_DEFINITIONS` 新增 `data_agent` 条目（分层 config_schema）
- [x] 5.2 创建 `app/executors/data_agent_executor.py`：`@register_executor('data_agent')` + `validate_config()` + `get_config_schema()`
- [x] 5.3 `app/executors/__init__.py`：新增 `DataAgentExecutor` 导入

## 6. DI 容器 + 配置

- [x] 6.1 `app/di/container.py`：注册 `OpenAICompatibleAdapter`（agent_llm_adapter）、`KnowledgeService`、`PromptBuilder`、`ToolRegistry`、`AgentLoopService`
- [x] 6.2 创建 `app/application/agent/agent_factory.py`：从 `AppInstance.config` 加载分层配置（`knowledge.datasource_id` → Adapter，`llm.*` 覆盖全局）
- [x] 6.3 `FeishuClient` 新增 `update_message(message_id, card)` 方法

## 7. 安全 + 配置

- [x] 7.1 `sql_validator.py`：`MAX_QUERY_LIMIT` 统一为 50000
- [x] 7.2 `.env` / `env.sample`：已有 `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_API_BASE`、`LLM_MODEL`、`LLM_TIMEOUT`（确认无需变更）
- [x] 7.3 `requirements.txt`：新增 `openai>=1.0.0`

## 8. P1 — 体验优化

- [x] 8.1 飞书渐进式卡片更新（`on_progress` 回调 → `FeishuChannel.update_progress_card` → `FeishuClient.update_message`）
- [x] 8.2 飞书结果卡片：`_build_result_card` 包含 Markdown 表格 + SQL 展示（折叠 SQL 和反馈按钮为前端卡片模板细节，P1 迭代优化）
- [x] 8.3 `POST /api/v1/feishu/card_action` 路由 + 反馈处理
- [x] 8.4 `agent_query_log` 表（ORM 实体 + SQL 迁移 + 飞书/DataChat 双信道日志写入 + card_action 反馈回写）
- [x] 8.5 大数据量自动导出 CSV + 飞书文件发送（>20 行自动导出 CSV → `upload_file_bytes` → 摘要卡片 + 反馈按钮，25MB 截断兜底）
- [x] 8.6 查询频率限制（Redis INCR + EXPIRE 滑动窗口，每分钟 10 次/open_id，超限直接文本回复）
- [x] 8.7 Agent 配置 UI 适配（嵌套 `datasource_id` 自动映射 DataSourceSelector + `StringTagsWidget` + Agent 类应用调度锁定 + 示例配置）

## 9. 废弃清理

- [x] 9.1 标记 `infrastructure/llm/openai_service.py` 的 `generate_sql()` 为 `@deprecated`
