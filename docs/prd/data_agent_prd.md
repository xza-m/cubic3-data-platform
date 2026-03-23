# CUBIC3 智能问数 — 多信道智能数仓问答

## 一、背景与目标

### 1.1 背景

当前数仓查询依赖数据开发人员手写 SQL 或通过平台查询中心操作，业务方无法自助获取数据。团队已在 dw-skills 项目中验证了一套基于 Skill 的自然语言查询方案：通过 SKILL.md 定义五步工作流、knowledge/ 存放业务知识文档、MCP 工具执行 MaxCompute 查询，在 Cursor IDE 中效果良好。

同时，平台已有一套 **DataChat**（智能问数）功能，通过 Web UI 让用户基于已注册数据集进行自然语言查询。当前 DataChat 采用单次 LLM 调用（硬编码 prompt → 生成 SQL → 执行）的方式，缺乏多步推理能力，且 LLM 层与 Agent 体系独立，存在重复建设。

现需构建一个 **统一的 Agent 核心**，将 Skill 体系的多步推理能力同时服务于飞书和 DataChat 两个入口，飞书与 Web UI 仅作为不同的接入信道（Channel）。

### 1.2 目标

| 目标 | 描述 |
|------|------|
| 统一 Agent 核心 | 构建平台级 AgentService，飞书和 DataChat 共享同一套推理引擎 |
| 多信道接入 | 飞书应用单聊、DataChat Web UI 作为不同 Channel，未来可扩展 Slack/API 等 |
| 复用 Skill 体系 | 沿用 dw-skills 的五步工作流 + 知识文档 + 路由表，不引入 RAG |
| LLM 可切换 | 通过 Port/Adapter 抽象，支持 Claude、Qwen、DeepSeek 等多家 LLM |
| 安全可控 | 仅执行只读查询，SQL 必须通过安全校验，大查询异步执行 |
| DataChat 升级 | 现有 DataChat 从单次调用升级为完整 Agent Loop，获得多步推理能力 |

### 1.3 非目标

- 不支持写操作（INSERT/UPDATE/DELETE）
- 不替代查询中心（复杂分析仍走 SQL Lab）
- 不做通用对话（仅处理数仓查询意图，非查询消息不响应）
- 飞书信道不做多轮对话记忆（每条消息独立）；DataChat 信道保留 conversation 级别上下文（传最近 N 条历史消息给 LLM）
- 不新建 DataChat 前端（复用现有 DataChat 页面，仅重构后端调用链路）

---

## 二、用户场景

### 2.1 典型场景

**场景 1：飞书应用 — 业务方查询运营数据（渐进式反馈）**

```
用户在飞书中打开 CUBIC3 应用，直接发消息：
用户: 帮我查下近7天各学科KT推题正确率

Agent: 🔍 正在理解您的问题...           ← 临时卡片（即时推送）
Agent: 📖 正在检索数仓知识文档...        ← 卡片内容更新
Agent: ⚙️ 正在执行 SQL 查询...          ← 卡片内容更新
Agent: 📊 近7天KT推题正确率              ← 最终结果替换卡片

| 学科 | 总题数 | 正确数 | 正确率 |
|------|--------|--------|--------|
| 数学 | 12345  | 8901   | 72.1%  |
| ...  | ...    | ...    | ...    |

▶ 查看 SQL（折叠）
[👍 结果正确]  [❌ 结果有误]
```

**场景 2：飞书应用 — 查询结果导出**

```
用户: 导出昨日所有学生的能量发放明细
Agent: 数据量较大（约5万条），正在导出为文件...
Agent: [发送CSV文件]
```

**场景 3：DataChat Web — 基于数据集的问答**

```
用户在 DataChat 页面选择"学习行为数据集"，输入：
用户: 最近一周日活趋势怎么样
Agent: [注入数据集 schema 作为上下文，生成 SQL，执行查询]
Agent: 📊 近一周日活趋势
  [展示查询结果表格 + 生成的 SQL]
```

**场景 4：意图无法识别**

```
用户: 明天天气怎么样
Agent: 抱歉，我只能回答数仓数据相关的问题。支持的查询类型包括：
  - 学生学习行为分析
  - 答题效果分析
  - KT推题效果分析
  - 能量发放分析
  - ...
```

### 2.2 用户角色

| 角色 | 描述 | 权限 |
|------|------|------|
| 业务方 | 运营、产品、教研人员 | 在飞书应用中提问 / DataChat 页面交互 |
| 数据开发 | 维护知识文档和查询规范 | 更新 knowledge/，调整 SKILL.md |
| 管理员 | 平台管理 | 配置 LLM、管理信道授权 |

---

## 三、系统架构

### 3.1 整体架构

```
┌─────────────┐              ┌──────────────────────────────────────────────┐
│  飞书应用     │  webhook     │  cubic3-data-platform                       │
│  (P2P 单聊)  │ ──────→     │                                              │
│             │ ←──────      │  ┌─────────────────────────────────────┐     │
└─────────────┘  消息/文件     │  │  Channel Layer (信道适配层)           │     │
                              │  │                                     │     │
┌─────────────┐              │  │  FeishuChannel    DataChatChannel   │     │
│  DataChat    │  HTTP API    │  │  (飞书事件回调)    (Web API 接口)      │     │
│  Web UI      │ ──────→     │  │       ↓                ↓            │     │
│             │ ←──────      │  └───────┼────────────────┼────────────┘     │
└─────────────┘  JSON         │         ↓                ↓                   │
                              │  ┌──────────────────────────────────┐       │
                              │  │  AgentService (统一入口)           │       │
                              │  │  run(AgentRequest) → AgentResponse│       │
                              │  └──────────┬───────────────────────┘       │
                              │             ↓                                │
                              │  ┌──────────────────────────────────┐       │
                              │  │  Agent Loop (核心推理引擎)         │       │
                              │  │                                  │       │
                              │  │  System Prompt (SKILL.md / 数据集) │       │
                              │  │       ↓                          │       │
                              │  │  LLMPort (tool_use)              │       │
                              │  │       ↕                          │       │
                              │  │  Tools:                          │       │
                              │  │  ├─ read_knowledge()             │       │
                              │  │  ├─ describe_table()             │       │
                              │  │  ├─ list_tables()                │       │
                              │  │  └─ execute_sql()                │       │
                              │  │       ↕                          │       │
                              │  │  DataSourceAdapter (已有)          │       │
                              │  └──────────────────────────────────┘       │
                              └──────────────────────────────────────────────┘
```

### 3.2 模块划分（六边形架构）

```
app/
├── domain/
│   └── agent/
│       ├── entities.py              # AgentRequest, AgentResponse, AgentContext
│       └── ports/
│           └── llm_port.py          # LLMPort 接口定义
│
├── application/
│   └── agent/
│       ├── agent_service.py            # 统一入口 run(AgentRequest) → AgentResponse
│       ├── agent_router.py             # [P2] 多 Agent 路由（P0 不需要）
│       ├── agents/                     # [P2] 每个垂直 Agent 独立模块
│       │   └── base_agent.py           # [P2] Agent 基类（抽取自 agent_loop_service）
│       ├── services/
│       │   ├── agent_loop_service.py   # Agent 循环核心逻辑（P2 重构为 data_query_agent）
│       │   ├── knowledge_service.py    # 知识文档加载
│       │   ├── prompt_builder.py       # System Prompt 构建（按 Context 策略分支）
│       │   └── tool_registry.py        # 工具注册与执行
│       ├── knowledge/                  # 从 dw-skills 同步的知识文档
│       │   ├── SKILL.md
│       │   ├── dimensions/
│       │   ├── domains/
│       │   └── guides/
│       └── prompts/
│           └── templates.py            # Prompt 模板常量
│
├── infrastructure/
│   └── adapters/
│       └── llm/
│           ├── base_llm_adapter.py     # LLMPort 基类实现
│           ├── openai_compatible.py    # OpenAI 兼容适配器（Qwen/DeepSeek/GPT）
│           └── claude_adapter.py       # Claude 适配器
│
├── executors/
│   └── data_agent_executor.py          # DataAgent 配置校验 + ExecutorFactory 注册
│
└── interfaces/
    ├── channels/                       # 信道适配层（输入/输出适配，属于 interfaces 层）
    │   ├── base_channel.py             # ChannelAdapter 接口定义
    │   ├── feishu_channel.py           # 飞书信道：消息收发、文件上传、卡片格式化
    │   └── datachat_channel.py         # DataChat 信道：API 响应、对话持久化
    └── api/v1/
        ├── feishu.py                   # 扩展现有事件处理（新增 Agent P2P 分支 + card_action 路由）
        └── conversations.py            # 现有 DataChat API（重构为调用 AgentService）
```

---

## 四、核心设计

### 4.1 统一入口：AgentService

所有信道的查询请求最终汇聚到同一个 `AgentService`，通过 `AgentRequest` / `AgentResponse` 解耦信道差异：

```python
@dataclass
class AgentContext:
    channel: str                            # "feishu" | "datachat"
    user_id: str | None = None
    # 飞书信道（应用单聊 P2P）
    open_id: str | None = None              # 飞书用户 open_id（权限/频率限制维度）
    chat_id: str | None = None              # P2P 会话 ID（用于回复消息）
    message_id: str | None = None
    # DataChat 信道
    dataset_id: int | None = None           # 绑定的数据集 → 直接注入 schema
    conversation_id: int | None = None      # 对话 ID（用于持久化）

@dataclass
class AgentRequest:
    message: str                            # 用户原始文本
    context: AgentContext
    history: list[dict] | None = None       # 历史消息（DataChat 信道传入最近 N 条）

@dataclass
class AgentResponse:
    text: str                               # Agent 最终文本回复
    sql: str | None = None                  # 执行的 SQL（可选展示）
    data: list[list] | None = None          # 查询结果集（行列矩阵）
    columns: list[str] | None = None        # 列名
    error: str | None = None                # 结构化错误信息（异常时非空）
    usage: dict | None = None               # token 用量
```

`AgentService.run(request)` 内部流程：

```
AgentRequest
  ↓
PromptBuilder.build(context)   ← 根据 channel 分支构建 System Prompt
  ↓
AgentLoopService.run(messages, tools)   ← 统一 Agent Loop
  ↓
AgentResponse
```

### 4.2 Agent Loop

核心推理引擎，与 Cursor 中 Skill 的运行机制一致：

```
输入: messages (含 system prompt + user message)
  ↓
┌→ 调用 LLM (messages + tools) ──→ 返回文本 → 结束，包装为 AgentResponse
│       ↓ tool_use
│  执行工具，获取结果
│  追加 tool_result 到 messages
│  ── 触发 on_progress 回调（通知信道层当前步骤）
└──────────────────────────────┘
```

**进度回调**：Agent Loop 在每次工具调用完成后，通过 `on_progress(step: AgentStep)` 回调通知上层。信道层可选择性实现此回调（飞书用于更新卡片进度，DataChat 可用于 SSE 推送）：

```python
@dataclass
class AgentStep:
    tool_name: str                  # 本次调用的工具名
    status: str                     # "running" | "completed"
    summary: str                    # 人类可读的进度摘要，如"正在查询表结构..."
```

**关键约束**：
- 最大循环次数：10 轮（防止死循环）
- 单次查询超时：120 秒
- LLM 调用超时：60 秒（来自 LLMConfig.timeout）

### 4.3 Prompt 构建策略

`PromptBuilder` 根据 `AgentContext.channel` 和上下文信息构建差异化的 System Prompt：

| 信道 | Prompt 策略 | 可用工具 | 数据源 |
|------|-------------|---------|--------|
| **飞书** | 加载 SKILL.md（含路由表），LLM 通过 `read_knowledge` 按需加载知识文档 | `read_knowledge`, `describe_table`, `list_tables`, `execute_sql` | 固定 MaxCompute（数仓） |
| **DataChat** | 注入目标数据集的 schema（表名 + 字段 + 类型），无需知识路由 | `execute_sql`（scope 限定为该数据集的底层表） | 由 dataset.source 决定（多数据源） |

#### 飞书信道与 DataChat 信道的定位差异

两个信道虽然共享 Agent Loop 推理引擎，但面向的数据范围和知识体系不同：

| 维度 | 飞书信道 | DataChat 信道 |
|------|---------|--------------|
| **数据范围** | 数仓（MaxCompute），覆盖所有业务域 | 单个已注册数据集，可能是任意数据源 |
| **知识来源** | SKILL.md + knowledge/ 文档（数仓建设资产） | 数据集 schema（表名 + 字段 + 类型描述） |
| **查询复杂度** | 多步推理（知识路由 → 表探索 → SQL 生成） | 通常一步到位（schema 已知，直接生成 SQL） |
| **对话模式** | 无记忆，每条消息独立 | 保留 conversation 上下文（最近 N 条历史） |
| **典型用户** | 业务方（非技术） | 数据分析师 / 产品经理 |

两者不冲突：飞书信道是"面向数仓的全域问答"，DataChat 信道是"面向特定数据集的精准问答"。Agent Loop 是共享的推理基座，差异由 `PromptBuilder` 和 `ToolRegistry` 在构建时根据信道分支处理。

#### 飞书信道 — 渐进式知识加载

沿用 SKILL.md 的路由表方案，不引入 RAG：
1. System Prompt 包含 SKILL.md（含路由表，约 1K token）
2. LLM 根据路由表决定读取哪些知识文档（调用 `read_knowledge` 工具）
3. 工具返回文档内容，LLM 拿到后继续推理

```
路由表（在 SKILL.md 中）：
| 查询类型      | 文档路径                              |
|--------------|---------------------------------------|
| 答题分析      | domains/study/dwd-answer-records.md   |
| 推题效果      | domains/study/dwd-kt-recommend.md     |
| 查询规范      | guides/query-rules.md                 |
| ...          | ...                                   |
```

#### DataChat 信道 — Schema 直注入

DataChat 已有数据集概念（含底层表、字段、类型信息），直接将 schema 拼入 System Prompt，LLM 无需额外知识路由，一步到位生成 SQL。数据源类型由 `dataset.source.source_type` 决定，通过 `AdapterFactory` 动态创建对应适配器。

### 4.4 工具定义

Agent 可用的工具列表，信道可按需裁剪：

| 工具名 | 对应实现 | 说明 | 适用信道 |
|--------|---------|------|---------|
| `read_knowledge` | KnowledgeService.read() | 读取 knowledge/ 下的 Markdown 文档 | 飞书 |
| `describe_table` | DataSourceAdapter.get_table_schema() | 获取表结构（字段、类型、分区） | 飞书 |
| `list_tables` | DataSourceAdapter.list_tables() | 列出可用数据表 | 飞书 |
| `execute_sql` | DataSourceAdapter.execute_query() | 执行 SQL 查询（自动注入安全校验） | 全部 |

工具的 JSON Schema 在 `tool_registry.py` 中统一定义，格式兼容 OpenAI function calling 和 Anthropic tool_use。

`ToolRegistry` 提供 `for_context(channel, adapter)` 方法，同时返回工具定义列表和绑定了数据源适配器的执行器：

```python
class ToolRegistry:
    def for_context(self, channel: str, adapter: DataSourceAdapter) -> tuple[list[dict], ToolExecutor]:
        """根据信道过滤工具列表，并绑定数据源适配器到执行上下文"""
        tool_defs = [t.schema for t in self._tools if channel in t.channels]
        executor = ToolExecutor(tools=self._tools, adapter=adapter)
        return tool_defs, executor
```

- **飞书信道**：`adapter` 由 `AppInstance.config.knowledge.datasource_id` 创建的固定 `MaxComputeAdapter`
- **DataChat 信道**：`adapter` 由 `dataset.source` 通过 `AdapterFactory` 动态创建

这样每次请求携带自己的适配器实例，`execute_sql` / `describe_table` / `list_tables` 工具执行时直接使用该适配器，无全局状态。

#### 4.4.1 工具层实现策略：复用已有 Adapter 而非 MCP

dw-skills 项目中通过 MCP Server 提供 MaxCompute 操作工具（describe_table / list_tables / execute_sql），Agent 在 Cursor IDE 中通过 MCP 协议调用。在本项目中，**不引入 MCP，而是复用已有的 `DataSourceAdapter` 体系**：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 引入 MCP Server | 与 dw-skills 完全对齐 | 需额外部署 MCP Server 进程，增加运维复杂度；本项目已有 Adapter 抽象层 |
| **复用 DataSourceAdapter** | 零新增依赖，直接调用已有的 MaxCompute/PostgreSQL/MySQL 等适配器 | 需在 tool_registry 中封装一层 wrapper |

选择复用 `DataSourceAdapter` 的原因：
1. 本项目已有 `AdapterFactory` + 多数据源适配器（MaxCompute/PostgreSQL/MySQL/ClickHouse），接口统一（`list_tables / get_table_schema / execute_query`）
2. `execute_query` 已内置 `prepare_readonly_sql` 安全校验
3. 飞书信道固定使用数仓 MaxCompute 数据源，DataChat 信道通过 `dataset.source` 动态选择数据源适配器

工具层在 `tool_registry.py` 中通过 wrapper 将 `DataSourceAdapter` 方法包装为符合 LLM function calling schema 的工具函数。

#### 4.4.2 数据源路由策略

| 信道 | 数据源选择 | 说明 |
|------|-----------|------|
| **飞书** | 绑定已注册的 MaxCompute 数据源，由 `config.knowledge.datasource_id` 指定 | 初始化时通过 `knowledge.datasource_id` 加载 `DataSource` 记录，获取 `connection_config`，创建 `MaxComputeAdapter`。`list_tables / get_table_schema` 使用该数据源的 project 作为 database 参数 |
| **DataChat** | 动态，由 `dataset.source` 决定 | 复用 `AdapterFactory.create_adapter(source_type, config)`，支持多种数据源 |

### 4.5 信道适配层（interfaces 层）

Channel Adapter 位于 `interfaces/channels/`，属于六边形架构的**接口层**（Driving Adapter）。它负责将外部输入转换为领域对象，并将 Agent 输出适配为信道特定格式：

```python
# interfaces/channels/base_channel.py
class ChannelAdapter(ABC):
    @abstractmethod
    def to_agent_request(self, raw_input: Any) -> AgentRequest:
        """将信道原始输入转换为统一 AgentRequest"""
        ...

    @abstractmethod
    def deliver_response(self, response: AgentResponse) -> Any:
        """将 AgentResponse 适配为信道特定的输出格式"""
        ...
```

**FeishuChannel**（应用单聊）：
- `to_agent_request`: 从飞书 P2P 消息事件中提取 text / open_id / chat_id / message_id
- `deliver_response`: 小数据量 → 飞书卡片 Markdown 表格；大数据量 → CSV 文件上传

**DataChatChannel**：
- `to_agent_request`: 从 HTTP 请求中提取 message / dataset_id / conversation_id
- `deliver_response`: 返回 JSON（text + sql + data），由前端渲染

### 4.6 LLM 抽象层

通过 Port/Adapter 模式实现 LLM 可切换，**统一替代现有 `BaseLLMService`**：

```python
# domain/agent/ports/llm_port.py
class LLMPort(ABC):
    @abstractmethod
    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse: ...

@dataclass
class LLMResponse:
    content: str | None           # 文本回复（stop_reason=end_turn 时）
    tool_calls: list[ToolCall]    # 工具调用请求（stop_reason=tool_use 时）
    stop_reason: str              # "end_turn" | "tool_use"
    usage: dict                   # token 用量
```

各 Adapter 负责将各家 API 的响应格式统一映射为 `LLMResponse`。

> **迁移说明**：现有 `infrastructure/llm/openai_service.py` 中的 `generate_sql()` 方法将被废弃。SQL 生成由 Agent Loop 中的 tool_use 机制完成，不再需要硬编码 prompt。DataChat 的 `SendMessageHandler` 将重构为调用 `AgentService`，不再直接调用 `OpenAIService`。

**复用现有配置**：`LLMConfig` 已在 `config_schema.py` 中定义，支持 provider 切换：

```python
class LLMConfig(BaseModel):
    provider: str = "openai"       # openai | anthropic | qwen | deepseek
    api_key: str = ""
    api_base: str = ""
    model: str = "gpt-4o-mini"
    timeout: int = 60
```

Agent 的配置不再使用独立的 `AgentConfig` 类，而是**通过 `AppInstance.config`（JSONB）承载**，复用平台应用管理体系。详见 [4.10 应用注册](#410-应用注册融入平台应用体系)。

**LLM 参数合并**：凭证（api_key/api_base/provider）始终来自全局 `LLM_*` 环境变量；`AppInstance.config.llm` 中可覆盖 model / temperature：

```python
# 合并示例（AgentService 初始化）
global_llm = LLMConfig.from_env()              # provider、api_key、api_base、model
per_agent  = config.get('llm', {})             # 可选覆盖
effective_model = per_agent.get('model') or global_llm.model
effective_temp  = per_agent.get('temperature', 0.0)
```

配置项一览（存储在 `AppInstance.config` 中，分层结构）：

| 路径 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `llm.model` | string | 继承全局 | 覆盖全局 `LLM_MODEL` |
| `llm.temperature` | number | 0.0 | 生成温度 |
| `knowledge.datasource_id` | int | **必填** | 知识文档描述的数据源（引用 `DataSource` 表） |
| `knowledge.dir` | string | `app/application/agent/knowledge` | 知识文档目录 |
| `agent.max_loop_rounds` | int | 10 | Agent 最大推理轮次（1-20） |
| `agent.session_timeout` | int | 120 | 单次会话超时（秒） |
| `agent.max_history_messages` | int | 10 | DataChat 信道传给 LLM 的最近历史消息数 |
| `allowed_user_ids` | array | [] | 飞书授权用户 open_id 白名单（空=允许所有已安装用户） |

`AppInstance.enabled` 控制 Agent 是否启用（管理员在应用管理页面开关）。

### 4.7 飞书集成（应用单聊）

扩展现有 `feishu.py` 中 `im.message.receive_v1` 的处理逻辑。飞书应用单聊中所有消息都是用户发给 bot 的，无需判断 @：

```
收到 im.message.receive_v1 事件
  ↓
chat_type == "p2p"？ ── 否 → 走现有逻辑（群消息 upsert）
  ↓ 是
DataAgent AppInstance 存在且 enabled? ── 否 → 回复"功能未启用"
  ↓ 是
open_id 在 config.allowed_user_ids 中？（空列表=全部允许）── 否 → 忽略
  ↓ 是
立即返回 200（避免飞书 webhook 3s 超时）
  ↓
发送"思考中"临时卡片 → 获取 message_id
  ↓
FeishuChannel.to_agent_request(event) → AgentRequest
  ↓
入队 RQ 任务 → AgentService.run(request, on_progress) → AgentResponse
  ↓                                          ↑
  ↓               on_progress 回调时更新卡片内容（渐进式反馈）
  ↓
FeishuChannel.deliver_response(response) → 用最终结果替换临时卡片
```

> **与现有群聊推送功能的关系**：现有的飞书群聊推送（`DeliveryService` → `FeishuClient.send_text_message`）是由平台事件主动触发的出站链路，不经过 `/events` 回调，与 DataAgent 的入站链路完全隔离，互不影响。

#### 4.7.1 渐进式卡片更新

飞书 webhook 响应有严格的 3s 时间限制，而 Agent Loop + MaxCompute 查询耗时通常在 30s~2min。为避免用户"干等"，采用渐进式卡片更新策略：

1. **即时响应**：收到消息后立即返回 200，同时推送一条临时卡片
2. **过程更新**：Agent Loop 的 `on_progress` 回调触发时，通过 `FeishuClient.update_message(message_id, card)` 更新卡片内容
3. **最终替换**：Agent 运行完毕后，用最终结果卡片替换临时卡片

卡片内容随 Agent 进度变化：

| Agent 阶段 | 卡片内容示例 |
|-----------|-------------|
| 初始 | 🔍 正在理解您的问题... |
| `read_knowledge` | 📖 正在检索数仓知识文档... |
| `describe_table` | 🗂️ 正在查询表结构... |
| `execute_sql` (开始) | ⚙️ 正在执行 SQL 查询... |
| 完成 | 📊 查询结果 + 数据表格 + 折叠 SQL + 反馈按钮 |

> **技术依赖**：需要在 `FeishuClient` 中新增 `update_message(message_id, card)` 方法，调用飞书 `PATCH /open-apis/im/v1/messages/{message_id}` 接口。

#### 4.7.2 反馈闭环（Human-in-the-loop）

飞书信道中业务方对 SQL 不可见，如果 Agent 生成的查询逻辑有误（如统计口径偏差），用户难以发现。因此在最终结果卡片中内置反馈机制：

**结果卡片结构**：

```
┌──────────────────────────────────┐
│ 📊 近7天KT推题正确率               │
│                                  │
│ | 学科 | 总题数 | 正确率 |          │
│ |------|--------|--------|        │
│ | 数学 | 12345  | 72.1%  |        │
│ | ...  | ...    | ...    |        │
│                                  │
│ ▶ 查看 SQL（折叠区块）              │
│ ┌────────────────────────────┐   │
│ │ SELECT subject, COUNT(*)...│   │
│ └────────────────────────────┘   │
│                                  │
│ [👍 结果正确]  [❌ 结果有误]         │
└──────────────────────────────────┘
```

**反馈处理流程**：

```
用户点击"👍 结果正确" 或 "❌ 结果有误" → 飞书 card_action 回调
  ↓                    ↑ 飞书后台配置"卡片请求网址"指向此端点
  ↓                    POST /api/v1/feishu/card_action（独立路由，非复用 /events）
  ↓
记录到 agent_query_log（feedback = "positive" | "negative"）
  ↓
更新卡片按钮状态为"已收到反馈，感谢！"（禁用按钮，防止重复点击）
```

> **路由注册**：飞书卡片按钮的 action 回调是发送到**独立的 URL**（在飞书开放平台后台 → 应用功能 → 机器人 → 卡片请求网址中配置），不复用 `/api/v1/feishu/events` 端点。需要在 `feishu.py` 中新增 `POST /api/v1/feishu/card_action` 路由来处理反馈回调。

反馈数据自动写入 `agent_query_log` 表，作为后续优化知识文档的样本。数据开发可定期筛查 `feedback = 'negative'` 的记录，分析统计口径偏差并更新 knowledge/ 文档。

**消息格式**：
- 小数据量（≤20 行）：飞书卡片消息（Markdown 表格 + 折叠 SQL + 反馈按钮）
- 大数据量（>20 行）：导出 CSV，通过 `FeishuClient.upload_file()` + `send_file_message()` 发送（附文本提示卡片 + 反馈按钮）
- 错误/提示：飞书文本消息

### 4.8 DataChat 重构

现有 DataChat 的 `SendMessageHandler` 将从直接调用 `OpenAIService.generate_sql()` 重构为：

```
前端发送消息 → conversations.py API
  ↓
DataChatChannel.to_agent_request(message, dataset_id, conversation_id)
  ↓
AgentService.run(request) → AgentResponse
  ↓
DataChatChannel.deliver_response(response) → 持久化消息 + 返回 JSON
```

**历史消息注入**：`DataChatChannel.to_agent_request()` 内部负责查询最近 N 条历史消息（N = `AppInstance.config.max_history_messages`），将其格式化为 `[{"role": "user", "content": ...}, {"role": "assistant", "content": ...}]` 并填入 `AgentRequest.history`。同时返回 `DataSourceAdapter`（由 `dataset.source` 创建）。

前端 `DataChat.tsx` 无需改动，API 响应格式保持兼容。

### 4.9 知识同步

dw-skills 项目中新增 Makefile 命令，手动同步知识文档到 webhook_gateway：

```makefile
# dw-skills/Makefile
publish-knowledge:
    CUBIC3_REPO_DIR ?= ../cubic3-data-platform
    rsync -av --delete skills/dw-query/knowledge/ \
        $(CUBIC3_REPO_DIR)/app/application/agent/knowledge/
    cp skills/dw-query/SKILL.md \
        $(CUBIC3_REPO_DIR)/app/application/agent/knowledge/SKILL.md
```

**同步触发时机**：知识文档更新后，由数据开发手动执行 `make publish-knowledge`。

**部署环节**：knowledge/ 目录随代码一起打包进 Docker 镜像，无运行时外部依赖。

### 4.10 应用注册（融入平台应用体系）

DataAgent 注册为平台 `AppDefinition`，通过 `AppInstance` 管理配置，**不引入独立的 `AgentConfig` 配置类**。这样可以复用现有的应用管理 UI、配置校验、执行日志等基础设施。

#### AppCenter 在 Agent 体系中的角色

AppCenter（数据应用中心）作为 Agent 体系的**管理面**，不负责推理执行：

| 职责 | 说明 |
|------|------|
| **注册** | 每类 Agent 是一个 `AppDefinition`（P0 只有 `data_agent`，P2 扩展更多类型） |
| **配置** | 实例参数（知识库、数据源、模型）通过 `AppInstance.config`（分层 JSONB） |
| **生命周期** | 启用/禁用通过 `AppInstance.enabled`，管理员在应用管理页面操作 |
| **调用** | 收到用户消息时，查找已启用的 Agent 实例，交给 `AgentService` 执行 |
| **监控** | 执行日志（`agent_query_log`）、反馈记录 |

与推送类应用（`report_push`、`anomaly_monitor`）的区别：推送类应用由 `ExecutionService` 调度 Executor 执行；Agent 类应用由用户消息驱动，`DataAgentExecutor` 仅负责配置校验，不参与运行时执行。

#### 为什么是 AppInstance 而不是独立配置

| 方案 | 优点 | 缺点 |
|------|------|------|
| 独立 `AgentConfig` + 环境变量 | 简单直接 | `datasource_id` 是数据库业务 ID，不适合放 env；无法通过 UI 管理；无法支持多实例 |
| **复用 AppInstance** | `datasource_id` 通过 UI 选择已注册数据源；复用现有应用管理/执行日志体系；未来可创建多实例（不同业务域/知识库） | 需新增 AppDefinition seed + Executor |

#### AppDefinition seed 数据

在 `app/infrastructure/seed.py` 的 `BUILTIN_APP_DEFINITIONS` 列表中新增一条，遵循现有格式：

```python
# app/infrastructure/seed.py — BUILTIN_APP_DEFINITIONS 中新增
{
    "code": "data_agent",
    "name": "CUBIC3 智能问数",
    "category": "agent",
    "description": "基于数仓知识体系的自然语言查询 Agent，支持飞书应用和 DataChat 双信道接入",
    "icon": "RobotOutlined",
    "author": "System",
    "version": "1.0.0",
    "config_schema": {
        "type": "object",
        "required": ["knowledge"],
        "properties": {
            "llm": {
                "type": "object",
                "title": "LLM 配置（覆盖全局默认）",
                "description": "不填则使用全局 LLM_* 环境变量",
                "properties": {
                    "model": {
                        "type": "string",
                        "title": "模型",
                        "description": "覆盖全局 LLM_MODEL，如 qwen-plus、deepseek-chat",
                    },
                    "temperature": {
                        "type": "number",
                        "title": "Temperature",
                        "default": 0.0,
                        "minimum": 0,
                        "maximum": 1,
                    },
                },
            },
            "knowledge": {
                "type": "object",
                "title": "知识库配置",
                "required": ["datasource_id"],
                "properties": {
                    "datasource_id": {
                        "type": "integer",
                        "title": "数仓数据源",
                        "description": "知识文档描述的数据源（从已注册数据源中选择）",
                        "minimum": 1,
                    },
                    "dir": {
                        "type": "string",
                        "title": "知识文档目录",
                        "default": "app/application/agent/knowledge",
                    },
                },
            },
            "agent": {
                "type": "object",
                "title": "Agent 行为参数",
                "properties": {
                    "max_loop_rounds": {
                        "type": "integer",
                        "title": "最大推理轮次",
                        "default": 10,
                        "minimum": 1,
                        "maximum": 20,
                    },
                    "session_timeout": {
                        "type": "integer",
                        "title": "单次会话超时（秒）",
                        "default": 120,
                    },
                    "max_history_messages": {
                        "type": "integer",
                        "title": "DataChat 历史消息数",
                        "default": 10,
                        "minimum": 0,
                        "maximum": 50,
                    },
                },
            },
            "allowed_user_ids": {
                "type": "array",
                "title": "飞书授权用户",
                "description": "飞书用户 open_id 白名单，留空则允许所有已安装用户",
                "items": {"type": "string"},
                "default": [],
            },
        },
    },
},
```

应用启动时 `seed_app_definitions()` 自动检测并填充（幂等），无需手动执行 SQL。

**配置分层说明**：

| 层 | 字段路径 | 职责 | 说明 |
|----|---------|------|------|
| **LLM** | `config.llm` | 模型选择与调优 | 凭证（api_key/api_base）留全局 env，per-agent 可覆盖 model/temperature |
| **Knowledge** | `config.knowledge` | 知识库 + 数据源绑定 | `datasource_id` 跟着知识库走——知识文档描述的是哪个数据源的表 |
| **Agent** | `config.agent` | 推理行为参数 | 循环轮次、超时、历史消息数 |
| **信道** | `config.allowed_user_ids` | 飞书用户授权 | 与具体部署相关 |

**关键点**：
- `category = 'agent'`：区别于现有的 `data_notification` / `data_report` 等推送类应用
- 不包含 `feishu.chat_id` 等 sink 配置——Agent 的响应方式是"回复原通道"，不走订阅分发
- `knowledge.datasource_id` 前端渲染时，`ConfigDrawer` 需在 `uiSchema` 中将嵌套路径 `knowledge.datasource_id` 映射到 `DataSourceSelector` Widget
- 不包含 `trigger_on_event`——DataAgent 由用户消息驱动，非应用事件触发
- 创建实例时 `schedule_type = 'manual'`（非 cron、非 event）
- **P0 阶段只支持单个 data_agent 实例**。多实例（不同业务域/知识库）作为 P2 扩展

#### DataAgentExecutor

遵循现有 Executor 模式（继承 `AppExecutor`，使用 `@register_executor` 装饰器自动注册）：

```python
# app/executors/data_agent_executor.py
from typing import Dict, Any
from app.domain.app_center.executor import AppExecutor, register_executor
from app.domain.app_center.execution_context import (
    ExecutionContext, ExecutionResult, ExecutionStatus, ValidationResult
)
from app.domain.entities import DataSource
from app.extensions import db


@register_executor('data_agent')
class DataAgentExecutor(AppExecutor):
    """
    DataAgent 执行器

    与推送类应用不同，DataAgent 由用户消息驱动，不经过 ExecutionService 调度。
    此 Executor 仅负责配置校验和 ExecutorFactory 注册时的接口兼容。
    """

    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        result = ValidationResult(is_valid=True)

        knowledge = config.get('knowledge') or {}
        datasource_id = knowledge.get('datasource_id')
        if not datasource_id:
            result.add_error('knowledge.datasource_id', '必须绑定一个数仓数据源')
        else:
            ds = db.session.query(DataSource).filter_by(id=datasource_id).first()
            if not ds:
                result.add_error('knowledge.datasource_id', f'数据源 {datasource_id} 不存在')
            elif ds.source_type != 'maxcompute':
                result.add_warning('knowledge.datasource_id', f'飞书信道推荐绑定 MaxCompute 数据源，当前为 {ds.source_type}')

        agent = config.get('agent') or {}
        max_rounds = agent.get('max_loop_rounds', 10)
        if not isinstance(max_rounds, int) or max_rounds < 1 or max_rounds > 20:
            result.add_error('agent.max_loop_rounds', '推理轮次须为 1-20 的整数')

        return result

    def execute(self, context: ExecutionContext) -> ExecutionResult:
        return ExecutionResult(
            status=ExecutionStatus.SUCCESS,
            output={"status": "agent_ready", "message": "DataAgent 由消息驱动，不支持调度执行"}
        )

    def get_config_schema(self) -> Dict[str, Any]:
        # 与 AppDefinition.config_schema 保持一致
        from app.infrastructure.seed import BUILTIN_APP_DEFINITIONS
        defn = next(d for d in BUILTIN_APP_DEFINITIONS if d['code'] == 'data_agent')
        return defn['config_schema']
```

注册方式：在 `app/executors/__init__.py` 中新增导入即可（装饰器自动注册到 `ExecutorFactory`）：

```python
# app/executors/__init__.py 新增
from .data_agent_executor import DataAgentExecutor
```

> **与推送类应用的区别**：现有应用（`report_push`、`anomaly_monitor`）的执行模式是 Executor.execute → 产出结果 → 订阅中心推送到 sink。DataAgent 的执行由用户消息驱动，不经过 `ExecutionService`，直接走 `FeishuChannel / DataChatChannel → AgentService`。`DataAgentExecutor` 只负责配置校验和注册时的接口兼容。

#### 配置读取方式

使用现有 `AppInstanceRepository.find_all()` 方法，无需新增 Repository 方法：

```python
# AgentService 初始化时从 AppInstance 加载配置
instances, _ = app_instance_repository.find_all(app_code='data_agent', enabled=True, page_size=1)
if not instances:
    raise ConfigError("DataAgent 未配置或未启用")
instance = instances[0]

config = instance.config                    # JSONB → dict

# --- 分层读取 ---
llm_overrides  = config.get('llm', {})      # 可选，覆盖全局 LLM_*
knowledge      = config.get('knowledge', {})
agent_params   = config.get('agent', {})

datasource_id        = knowledge['datasource_id']   # → 加载 DataSource → 创建 Adapter
knowledge_dir        = knowledge.get('dir', 'app/application/agent/knowledge')
max_loop_rounds      = agent_params.get('max_loop_rounds', 10)
session_timeout      = agent_params.get('session_timeout', 120)
max_history_messages = agent_params.get('max_history_messages', 10)
allowed_user_ids     = config.get('allowed_user_ids', [])
```

#### DataChat 信道不依赖 AppInstance

DataChat 信道的数据源来自 `conversation.dataset.source`，不读取 `config.knowledge.datasource_id`。它只从 AppInstance 读取共享行为配置（`config.agent.*`）。

---

## 五、安全设计

### 5.1 查询安全

| 层级 | 措施 | 实现 |
|------|------|------|
| LLM 层 | SKILL.md / Schema Prompt 规范约束（禁止危险操作、必须分区条件） | System Prompt |
| 工具层 | `execute_sql` 工具调用前经过 `sql_validator.py` 校验 | 已有 |
| 适配器层 | MaxComputeAdapter 使用只读账号 | 已有 |
| 结果层 | 单次查询最大返回 50000 行 | LIMIT 注入（需将 `sql_validator.py` 的 `MAX_QUERY_LIMIT` 从 10000 调整为 50000） |

### 5.2 访问控制

| 信道 | 控制维度 | 说明 |
|------|---------|------|
| **飞书** | 应用可见范围 | 飞书后台配置应用可见范围，控制哪些用户能打开应用 |
| **飞书** | 用户白名单 | `AppInstance.config.allowed_user_ids`（open_id），空列表=允许所有已安装用户 |
| **飞书** | 频率限制 | 单个用户每分钟最多 10 次查询（Redis 计数器，按 open_id） |
| **DataChat** | JWT 认证 | 复用现有 `require_auth` 中间件 |
| **DataChat** | 数据集权限 | 用户仅能查询自己有权限的数据集 |

### 5.3 敏感信息

- LLM API Key 存储在环境变量中，不写入代码
- MaxCompute 凭证复用现有数据源配置，不额外暴露
- DataChat 信道直接展示 SQL（用户有查询中心权限）；飞书信道将 SQL 放入折叠区块（用户主动展开查看），兼顾透明度与简洁性

---

## 六、分期计划

### P0 — Agent 核心 + 双信道接入（2 周）

- [ ] 领域层：`AgentRequest` / `AgentResponse` / `AgentContext` 实体定义
- [ ] 领域层：`LLMPort` 接口 + `LLMResponse` / `ToolCall` 数据结构
- [ ] 基础设施层：OpenAI 兼容 Adapter（覆盖 Qwen/DeepSeek/GPT）
- [ ] 应用层：`AgentLoopService`（循环核心）
- [ ] 应用层：`KnowledgeService`（知识文档加载）
- [ ] 应用层：`ToolRegistry`（工具注册 + 执行）
- [ ] 应用层：`PromptBuilder`（按信道策略构建 System Prompt）
- [ ] 应用层：`AgentService`（统一入口 run）
- [ ] 接口层：`FeishuChannel`（飞书事件 → 发送"思考中"临时卡片 → AgentRequest → 最终结果替换卡片）
- [ ] 接口层：`DataChatChannel`（HTTP 请求 → AgentRequest → JSON 响应）
- [ ] 接口层：扩展 `feishu.py`（P2P 单聊消息 → FeishuChannel → AgentService）
- [ ] 接口层：重构 `conversations.py` 的 `SendMessageHandler`（→ DataChatChannel → AgentService）
- [ ] 废弃 `infrastructure/llm/openai_service.py` 的 `generate_sql()` 方法
- [ ] dw-skills 知识同步脚本
- [ ] DI 容器注册（AgentService、LLMPort、Channel Adapters 位于 interfaces/channels/）
- [ ] `sql_validator.py` 的 `MAX_QUERY_LIMIT` 统一为 50000
- [ ] `FeishuClient.update_message()` 基础实现（P0 用于"思考中"卡片 → 最终结果替换）
- [ ] `seed.py` 的 `BUILTIN_APP_DEFINITIONS` 新增 `data_agent` 条目（启动时自动填充）
- [ ] `DataAgentExecutor`（`@register_executor('data_agent')` + 配置校验）
- [ ] `executors/__init__.py` 新增 `DataAgentExecutor` 导入
- [ ] `AgentService` 从 `AppInstance.config` 加载分层配置（`knowledge.datasource_id` → MaxComputeAdapter，`llm.*` 覆盖全局）

### P1 — 体验优化（1 周）

- [ ] 飞书渐进式卡片更新（`on_progress` 回调集成，Agent Loop 中间步骤实时更新卡片内容）
- [ ] 飞书结果卡片：折叠 SQL 区块 + 反馈按钮（👍/❌）
- [ ] 飞书 `POST /api/v1/feishu/card_action` 路由注册 + card_action 回调处理（反馈写入 `agent_query_log`，更新卡片按钮状态）
- [ ] `agent_query_log` 表引入（含 `feedback` 字段）+ Alembic 迁移
- [ ] 大数据量自动导出 CSV 并发送文件
- [ ] 查询频率限制（Redis 计数器）
- [ ] 错误信息友好化（分信道差异化提示）
- [ ] Agent 配置 UI 适配（`knowledge.datasource_id` 嵌套路径需在 `uiSchema` 中映射到 `DataSourceSelector` Widget；补充 `allowed_user_ids` 多值输入的自定义 Widget）

### P2 — 扩展能力（后续）

- [ ] **多 Agent 架构**：抽取 `BaseAgent` 基类，`AgentLoopService` 重构为 `DataQueryAgent`，新增 `AgentRouter` 路由层（详见 6.1）
- [ ] Claude Adapter
- [ ] 飞书信道多轮对话支持（P0 已支持 DataChat 多轮）
- [ ] 反馈样本分析面板（筛查 negative 反馈，辅助优化知识文档）
- [ ] 多实例支持（多个 data_agent AppInstance，不同业务域/知识库绑定不同数据源）
- [ ] 多 Skill 支持（不同业务域的知识库）
- [ ] 查询结果可视化（AgentResponse 扩展 visualization 字段，LLM 输出图表配置 → 飞书卡片图表 / DataChat 前端图表）
- [ ] 新信道扩展（Slack / 开放 API）
- [ ] DataChat SSE 流式推送（复用 on_progress 回调）

### 6.1 多 Agent 演进路径

> **架构决策记录**：经评估 Nanobot、OpenClaw 等开源 Agent 编排框架，决定 P0-P1 自建核心、P2 按需引入。理由：当前平台已有 AppInstance 配置体系、FeishuChannel/DataChatChannel 信道适配、DataSourceAdapter 工具层，引入外部框架会导致双重配置同步、信道桥接、MCP 化改造、多进程部署等额外成本，ROI 在 Agent 数量 < 5 时不划算。

#### P0-P1：单 Agent 直通

```
ChannelAdapter → AgentService.run() → AgentLoopService → Tools
```

`AgentService` 直接调用 `AgentLoopService`，无路由开销。

#### P2：多 Agent + 轻量路由

当第 2-3 个垂直 Agent 需求出现时，进行以下重构：

```python
# app/application/agent/agent_router.py
class AgentRouter:
    """多 Agent 路由器，根据用户意图分发到对应 Agent"""

    def route(self, request: AgentRequest) -> BaseAgent:
        # 优先级：规则匹配 → LLM 意图分类（兜底）
        ...
```

目录结构演进：

```
app/application/agent/
├── agent_service.py              # 统一入口（注入 AgentRouter）
├── agent_router.py               # P2 新增：多 Agent 路由
├── agents/
│   ├── base_agent.py             # Agent 基类（抽取自 agent_loop_service）
│   ├── data_query_agent.py       # 当前 DataAgent
│   ├── anomaly_agent.py          # 未来：异常分析 Agent
│   └── report_agent.py           # 未来：报表解读 Agent
├── services/
│   ├── knowledge_service.py
│   ├── prompt_builder.py
│   └── tool_registry.py
├── knowledge/
└── prompts/
```

每个垂直 Agent 注册为独立的 `AppDefinition`（`data_agent`、`anomaly_agent`...），通过 `AppInstance` 管理各自配置。`AgentRouter` 根据已启用的 Agent 实例列表进行路由。

#### 引入外部框架的决策条件

以下条件**同时满足**时，再评估引入 LangGraph / Nanobot 等外部编排框架：

1. 垂直 Agent 数量 > 5 个，且需要 Agent 间**协作**（A 的输出作为 B 的输入）
2. 需要复杂编排模式（并行执行、Map-Reduce、人工审批节点）
3. 团队规模增长，能承担多服务运维成本

对于独立垂直 Agent + 简单路由的场景，自建 `AgentRouter` 已足够。

---

## 七、技术细节

### 7.1 新增依赖

```
# requirements.txt 新增
openai>=1.0.0          # OpenAI 兼容接口（Qwen、DeepSeek 均兼容 OpenAI API 格式）
anthropic>=0.30.0      # Claude API（P2 阶段按需引入）
```

> Qwen 和 DeepSeek 均提供 OpenAI 兼容接口，P0 阶段只需 `openai` 一个 SDK 即可覆盖。

### 7.2 环境变量

```bash
# .env 新增
# LLM 配置（复用已有 LLM_* 变量）
LLM_PROVIDER=openai                          # qwen/deepseek 均走 openai 兼容接口
LLM_API_KEY=sk-xxxxx
LLM_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1   # Qwen 示例
LLM_MODEL=qwen-plus
LLM_TIMEOUT=60
```

> **Agent 配置不再通过环境变量管理**。`knowledge.datasource_id`、`allowed_user_ids`、`agent.max_loop_rounds` 等配置项全部存储在 `AppInstance.config`（JSONB，分层结构）中，通过平台应用管理 UI 配置。Agent 是否启用由 `AppInstance.enabled` 控制。仅 LLM 连接凭证（api_key / api_base / provider）保留在环境变量中（全局共享），per-agent 可通过 `config.llm.model` 覆盖模型选择。

### 7.3 数据库变更

P0 阶段无数据库变更（DataChat 复用现有 `conversation` / `message` 表）。

P1 阶段新增 `agent_query_log` 表（反馈闭环依赖此表）：

```sql
CREATE TABLE agent_query_log (
    id SERIAL PRIMARY KEY,
    app_instance_id BIGINT,                  -- 关联 AppInstance（P0 单实例可为空，预留多实例扩展）
    channel VARCHAR(20) NOT NULL,            -- feishu/datachat
    channel_ref VARCHAR(128),                -- 信道标识（chat_id 或 conversation_id）
    user_id VARCHAR(64),
    user_message TEXT NOT NULL,
    agent_response TEXT,
    sql_executed TEXT,
    status VARCHAR(20) DEFAULT 'pending',    -- pending/running/success/error
    llm_provider VARCHAR(20),
    token_usage JSONB,
    duration_ms INTEGER,
    feedback VARCHAR(20),                    -- positive/negative（用户按钮反馈）
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 7.4 关键接口示例

**AgentService（统一入口）**：

```python
class AgentService:
    def __init__(self, loop: AgentLoopService, prompt_builder: PromptBuilder,
                 tool_registry: ToolRegistry, config: dict,
                 default_adapter: DataSourceAdapter):
        self._loop = loop
        self._prompt_builder = prompt_builder
        self._tool_registry = tool_registry
        self._config = config                      # AppInstance.config
        self._default_adapter = default_adapter    # 飞书信道的 MaxComputeAdapter

    def run(self, request: AgentRequest,
            on_progress: Callable[[AgentStep], None] | None = None,
            adapter: DataSourceAdapter | None = None) -> AgentResponse:
        ds_adapter = adapter or self._default_adapter
        system_prompt = self._prompt_builder.build(request.context)
        tool_defs, executor = self._tool_registry.for_context(
            request.context.channel, ds_adapter
        )
        messages = [{"role": "system", "content": system_prompt}]
        if request.history:
            messages.extend(request.history)
        messages.append({"role": "user", "content": request.message})
        agent_params = self._config.get('agent', {})
        return self._loop.run(
            messages, tool_defs, executor,
            max_rounds=agent_params.get('max_loop_rounds', 10),
            on_progress=on_progress,
        )
```

**AgentLoopService（核心循环）**：

```python
TOOL_PROGRESS_MAP = {
    "read_knowledge": "📖 正在检索数仓知识文档...",
    "describe_table": "🗂️ 正在查询表结构...",
    "list_tables": "🔍 正在搜索相关数据表...",
    "execute_sql": "⚙️ 正在执行 SQL 查询...",
}

class AgentLoopService:
    def __init__(self, llm: LLMPort):
        self._llm = llm

    def run(self, messages: list[dict], tools: list[dict],
            executor: ToolExecutor,
            max_rounds: int = 10,
            on_progress: Callable[[AgentStep], None] | None = None) -> AgentResponse:
        last_sql: str | None = None
        last_data: list[list] | None = None
        last_columns: list[str] | None = None
        total_usage: dict = {}

        for _ in range(max_rounds):
            response = self._llm.chat(messages, tools=tools)
            _merge_usage(total_usage, response.usage)

            if response.stop_reason == "end_turn":
                return AgentResponse(
                    text=response.content, usage=total_usage,
                    sql=last_sql, data=last_data, columns=last_columns,
                )

            for call in response.tool_calls:
                if on_progress:
                    on_progress(AgentStep(
                        tool_name=call.name, status="running",
                        summary=TOOL_PROGRESS_MAP.get(call.name, f"正在执行 {call.name}...")
                    ))
                result = executor.execute(call.name, call.arguments)

                if call.name == "execute_sql":
                    last_sql = call.arguments.get("sql")
                    last_data = result.get("data")
                    last_columns = result.get("columns")

                messages.append({"role": "assistant", "content": None, "tool_calls": [call]})
                messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})

        return AgentResponse(text="查询处理超过最大轮次，请简化问题后重试。", usage=total_usage)
```

**飞书信道接入**（应用单聊，含渐进式卡片）：

```python
# feishu.py 中 im.message.receive_v1 分支新增
chat_type = event.get("message", {}).get("chat_type")
if chat_type == "p2p":
    # 从平台应用体系加载 DataAgent 实例（复用现有 find_all 方法）
    instances, _ = app_instance_repository.find_all(app_code='data_agent', enabled=True, page_size=1)
    if not instances:
        feishu_client.reply_text(event, "DataAgent 功能未启用")
        return

    config = instances[0].config
    open_id = event["sender"]["sender_id"]["open_id"]
    allowed = config.get("allowed_user_ids", [])
    if allowed and open_id not in allowed:
        return  # 非授权用户，静默忽略

    request = feishu_channel.to_agent_request(event)
    card_msg_id = feishu_channel.send_thinking_card(event)
    queue.enqueue(handle_feishu_agent, request, card_msg_id)

def handle_feishu_agent(request: AgentRequest, card_msg_id: str):
    """RQ 异步任务：card_msg_id 作为任务参数传入，不侵入 AgentContext"""
    def on_progress(step: AgentStep):
        feishu_channel.update_progress_card(card_msg_id, step)

    response = agent_service.run(request, on_progress=on_progress)
    feishu_channel.deliver_response(response, card_msg_id)
```

**DataChat 信道接入（重构 SendMessageHandler）**：

```python
class SendMessageHandler:
    def __init__(self, agent_service: AgentService,
                 datachat_channel: DataChatChannel):
        self._agent = agent_service
        self._channel = datachat_channel

    def handle(self, conversation_id: int, message: str, dataset_id: int) -> dict:
        request, adapter = self._channel.to_agent_request(
            message, dataset_id, conversation_id
        )
        response = self._agent.run(request, adapter=adapter)
        return self._channel.deliver_response(response)
```

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 生成错误 SQL | 查询失败或返回错误数据 | sql_validator 校验 + SKILL.md/Schema Prompt 规范约束 + 分区强制检查 + 反馈闭环（用户标记"结果有误"→ 积累样本优化知识文档） |
| LLM 响应慢 | 飞书 webhook 超时 / DataChat 前端等待 | 飞书：立即返回 200 + 渐进式卡片更新；DataChat：前端 loading 态 + SSE 流式（P2） |
| Token 用量过高 | 成本不可控 | 渐进式加载减少 token，DataChat schema 直注入减少轮次，设置单次上限 |
| 知识文档过期 | 生成的 SQL 引用不存在的表/字段 | describe_table 动态校验 + 定期同步知识 |
| 信道滥用 | 频繁调用导致资源消耗 | 飞书：应用可见范围 + 用户白名单 + 频率限制；DataChat：JWT 认证 + 数据集权限 |
| DataChat 重构回归 | 现有 DataChat 功能受损 | API 响应格式保持兼容，前端无需改动；灰度上线，新旧 handler 可切换 |
| 多信道行为不一致 | 同一查询在不同信道返回不同结果 | Agent Loop 统一处理，差异仅在 Prompt 构建和结果格式化，核心逻辑共享 |
