---
doc_type: architecture-design
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-25
---

# 平台级 Agent 推理 Runtime 目标架构

本文定义 Cubic3 数据平台的统一 Agent 推理 Runtime 目标设计。它是跨业务模块复用的生成式推理与工作区任务能力层，不是语义中心或建模助手的私有实现。

当前实现已经形成平台内 `AgentInferenceRuntimeService`、OpenAI-compatible adapter、语义建模首个 consumer、最小 SQL run / artifact 仓储和只读查询 API。Codex app-server 仍处于 workspace / client / adapter skeleton 阶段，已由 fake tests 覆盖基础契约；真实 Codex app-server live smoke 只在显式设置 `AGENT_CODEX_LIVE=1` 且配置 endpoint 或 Unix socket 后运行，默认开发和 CI 不连接真实 Codex。

## Implementation Status

- Phase 1 contract / router / fake runtime：已实现。
- Phase 2 OpenAI-compatible adapter：已通过 `AGENT_OPENAI_*` 接入，作为当前低延迟主链。
- Phase 3 Semantic Modeling Agent App：已实现，语义建模 Copilot 通过平台 runtime consumer 调用生成式能力。
- Phase 4 Codex app-server adapter：当前是 workspace / client / adapter skeleton 和 fake tests；真实 app-server 未并入默认主链。
- 查询 API：`/api/v1/agent-runtime/runs/<run_id>` 与 `/api/v1/agent-runtime/runs/<run_id>/artifacts` 只提供 observability/read-only 查询，不触发 runtime 执行或业务副作用。
- 验证入口：`make test-platform-agent-runtime` 覆盖平台 runtime 单测、仓储/adapter 测试、语义建模 consumer、查询 API 和默认跳过的 Codex live smoke guard。

## 1. 背景与问题

平台当前同时需要两类 Agent 形态：

1. 基于 OpenAI Agents SDK 或 OpenAI-compatible LLM API Key 的在线推理 runtime。
2. 基于 Codex app-server 的工作区型 agent runtime。

这两类能力不是同一个层次的模型供应商切换，而是不同 runtime：

- OpenAI Agents SDK / LLM API 负责低延迟推理、工具调用编排、对话和候选生成。
- Codex app-server 负责长上下文、工作区、文件 / 命令 / artifact、复杂修复和复审。

如果把它们直接塞进语义建模 Copilot，会带来三个问题：

- 语义模块承担了平台 runtime 生命周期、路由、trace、artifact、错误码和权限策略，职责过重。
- 数据资产、查询、治理、数据开发等模块后续会重复实现 runtime adapter，违背 DRY。
- 当前 `OpenAIAgentsSdkAdapter` 与 LLM adapter 命名容易混淆，业务服务也会被迫理解 runtime 细节，违背接口隔离。

因此目标架构应把生成式 Agent 推理能力上提为平台级能力层。语义建模 Copilot 只是第一个业务消费者。

## 2. 设计目标

### 2.1 功能目标

- 提供统一的 `AgentInferenceRuntimeService`，支持不同业务模块按 action 调用生成式 agent runtime。
- 同时支持 OpenAI Agents SDK runtime 与 Codex app-server runtime。
- 支持统一的 request / result contract、runtime router、context pack、tool spec adapter、policy guardrail、trace、artifact、usage 与错误码。
- 让语义建模、数据资产、智能查询、治理中心、数据开发助手都能复用同一层 runtime。
- 保持业务状态和副作用由业务模块自己的应用服务控制，runtime 只返回结构化建议和 artifact。

### 2.2 非目标

- 不在第一阶段建设通用 agent marketplace。
- 不把 Codex app-server 当成普通 LLM provider。
- 不让 runtime adapter 直接发布 Cube、修改 Ontology、写资产画像或执行生产查询。
- 不把 `cubic3-agent-gateway` 作为当前数据平台主链依赖；gateway 可作为未来跨产品 control-plane 参考。
- 不为每个业务模块设计一套独立 agent 协议。
- 不替代现有 `/api/v1/agent/semantic/plan` official Semantic Runtime、`QueryDSL v1`、`ExecutionTicketSnapshot` 与 QueryExecutionWorker 治理执行链。

### 2.3 与 official Semantic Runtime 的边界

项目里已经存在 Agent-first official Semantic Runtime，负责从已发布 `Ontology / Cube / Policy` 生成治理后的计划、编译 `QueryDSL v1`、签发执行票据并进入查询执行面。本文新增的是生成式推理 runtime，职责是解释、候选生成、复审、修复建议和工作区 artifact。

两者边界固定如下：

| 层 | 代表入口 / 服务 | 负责 | 不负责 |
|---|---|---|---|
| Official Semantic Runtime | `/api/v1/agent/semantic/plan`、`AgentPlanHandler`、`Execution Compiler`、`QueryExecutionWorker` | 正式查询规划、治理、票据、执行 | 调 LLM、Codex 工作区修复、长上下文复审 |
| Agent Inference Runtime | `AgentInferenceRuntimeService`、OpenAI / Codex adapter | 生成式推理、结构化建议、review / repair artifact | 发布语义资产、签发执行票据、绕过 QueryDSL 治理 |

查询类 action 可以调用 Agent Inference Runtime 做意图解释、结果解释或失败修复建议，但正式执行仍必须回到 official Semantic Runtime。

## 3. 总体架构

```mermaid
flowchart TD
  subgraph Modules["业务模块层"]
    Semantic["语义建模 Copilot"]
    Assets["数据资产底座"]
    Query["智能查询 / 查询解释"]
    Governance["语义治理"]
    Dev["数据开发助手"]
  end

  subgraph AgentApps["Agent 应用编排层"]
    SemanticApp["Semantic Modeling Agent App"]
    AssetApp["Asset Governance Agent App"]
    QueryApp["Query Agent App"]
    DevApp["Data Dev Agent App"]
  end

  subgraph Runtime["平台级 Agent Inference Runtime 层"]
    RuntimeService["AgentInferenceRuntimeService"]
    Router["AgentInferenceRuntimeRouter"]
    Context["Context Pack / Evidence Pack"]
    Tools["ToolSpec Adapter"]
    Policy["Runtime Policy / Guardrail"]
    Trace["Run Trace / Artifact / Usage"]
  end

  subgraph Adapters["Runtime Adapter 层"]
    OpenAI["OpenAI Agents SDK Adapter<br/>LLM API Key"]
    Codex["Codex App Server Adapter<br/>Workspace Runtime"]
  end

  Modules --> AgentApps
  AgentApps --> RuntimeService
  RuntimeService --> Router
  RuntimeService --> Context
  RuntimeService --> Tools
  RuntimeService --> Policy
  RuntimeService --> Trace
  Router --> OpenAI
  Router --> Codex
```

分层原则：

- 业务模块层面向用户和业务对象。
- Agent 应用编排层负责把业务意图转成 agent action、context pack、tool scope 和 output schema。
- 平台级 Agent Inference Runtime 层负责生成式 runtime 选择、生命周期、通用治理和可观测性。
- Runtime Adapter 层只负责连接具体 runtime，不携带业务状态写入逻辑。

## 4. 分层职责

| 层级 | 职责 | 不负责 |
|---|---|---|
| 业务模块层 | 产品入口、用户操作、业务状态展示 | runtime 生命周期、provider 差异 |
| Agent 应用编排层 | 业务 action、上下文构建、结果解释、业务校验 | 通用 runtime 路由、底层进程管理 |
| Agent Inference Runtime 层 | 统一 contract、router、policy、trace、artifact、usage、错误码 | Cube 发布、资产画像入库、查询执行、执行票据签发 |
| Runtime Adapter 层 | 调用 OpenAI Agents SDK、LLM API 或 Codex app-server | 业务决策、平台状态修改 |

## 5. 业务消费者

### 5.1 语义建模 Copilot

首个落地消费者。主要 action：

- `semantic.modeling.chat`
- `semantic.modeling.generate_candidate`
- `semantic.modeling.review_proposal`
- `semantic.modeling.repair_validation_failure`
- `semantic.modeling.explain_publish_blocker`

OpenAI runtime 承担低延迟主链，Codex runtime 承担复审、复杂修复和长上下文分析。

### 5.2 数据资产底座

主要 action：

- `asset.profile.explain`
- `asset.field.infer_semantics`
- `asset.quality.explain_issue`
- `asset.lineage.summarize_usage`

资产模块提供表画像、字段画像、血缘、SQL 使用记录和质量问题作为 context pack，runtime 返回解释、候选标签和治理建议。资产事实仍由资产服务写入。

### 5.3 智能查询

主要 action：

- `query.intent.classify`
- `query.plan.explain`
- `query.result.explain`
- `query.failure.repair_suggestion`

正式查询执行仍走已发布 Ontology、Cube、Policy、ExecutionTicket 和 QueryExecutionWorker。Agent Inference Runtime 只做推理和解释，不绕开治理执行面。

### 5.4 语义治理

主要 action：

- `governance.policy.explain`
- `governance.impact.summarize`
- `governance.audit.find_risk`
- `governance.release.review`

Codex runtime 适合处理大批量 release diff、复杂依赖和长上下文审计。治理结论必须进入平台审核和发布门禁。

### 5.5 数据开发助手

主要 action：

- `data_dev.sql.review`
- `data_dev.lineage.explain`
- `data_dev.task.failure_diagnose`
- `data_dev.schema_drift.suggest_fix`

它可以复用 Codex app-server 的工作区能力，但不能直接改 DataWorks 生产任务。修复产物应作为建议或 patch artifact 进入人工确认链路。

## 6. Runtime 类型定位

| Runtime | 本质 | 适合 | 不适合 |
|---|---|---|---|
| OpenAI Agents SDK Runtime | 在线 LLM agent runtime | 低延迟对话、候选生成、结构化输出、轻量工具调用 | 长时间任务、工作区文件操作、复杂批量修复 |
| OpenAI-compatible LLM Runtime | Chat Completions 协议兼容 fallback | 保留兼容、降低接入门槛 | 作为真实 Agents SDK 能力替代品 |
| Codex App Server Runtime | 工作区型 agent runtime | 长上下文、文件 / 命令 / artifact、复杂复审、修复建议 | 高频低延迟主对话、直接写生产状态 |

命名约束：

- `OpenAIAgentsSdkRuntimeAdapter` 必须表示真实 Agents SDK 接入。
- 仅使用 Chat Completions 协议的适配器应命名为 `OpenAICompatibleLLMRuntimeAdapter`。
- `CodexAppServerRuntimeAdapter` 表示接入 Codex app-server 的工作区 runtime。

真实 OpenAI Agents SDK 接入的验收条件：

- 依赖清单明确 SDK 包、版本范围和 import surface，不能仅依赖通用 `openai` 包后继续沿用 Chat Completions 协议。
- 若项目阶段性不引入真实 SDK，则 adapter 名称只能使用 `OpenAICompatibleLLMRuntimeAdapter`。
- fallback contract 必须显式声明：Agents SDK 不可用时是否允许降级到 compatible LLM，以及降级后哪些 tool / tracing 能力不可用。

## 7. 统一 Contract

### 7.1 当前实现契约（MVP）

当前 source of truth 是 `app/domain/agent_inference_runtime/types.py`。截至 2026-05-25，平台 runtime contract 只包含下列字段：

```python
RuntimeName = Literal["openai_agents_sdk", "openai_compatible", "codex_app_server", "fake"]
ExecutionMode = Literal["sync", "async"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "timeout"]


@dataclass(frozen=True)
class RuntimeContextRef:
    project_id: str
    session_id: str
    thread_id: str
    turn_id: str


@dataclass(frozen=True)
class SemanticRuntimePin:
    snapshot_id: str
    release_id: str
    namespace: str = "default"


@dataclass(frozen=True)
class AssetRevisionRef:
    asset_id: str
    revision_id: str
    asset_type: str
    asset_key: str


@dataclass(frozen=True)
class RuntimePolicy:
    max_runtime_seconds: int = 60
    max_output_bytes: int = 262144
    allow_network: bool = False
    allowed_tools: list[str] = field(default_factory=list)
    command_policy: dict[str, Any] = field(default_factory=dict)
    fallback_runtime: RuntimeName | None = None


@dataclass(frozen=True)
class AgentInferenceRuntimeRequest:
    app_id: str
    action: str
    runtime_context_ref: RuntimeContextRef
    principal_id: str | None
    input: Mapping[str, Any]
    context_pack: Mapping[str, Any]
    output_schema: str
    runtime_policy: RuntimePolicy
    preferred_runtime: RuntimeName | None
    execution_mode: ExecutionMode
    semantic_runtime_pin: SemanticRuntimePin | None
    asset_revision_refs: list[AssetRevisionRef]


@dataclass(frozen=True)
class AgentInferenceRuntimeArtifact:
    artifact_id: str
    run_id: str
    artifact_type: str
    title: str
    summary: str
    mime_type: str
    size_bytes: int
    sha256: str


@dataclass(frozen=True)
class AgentInferenceRuntimeResult:
    run_id: str
    status: RunStatus
    runtime_name: str
    action: str
    structured_output: dict[str, Any]
    artifacts: list[AgentInferenceRuntimeArtifact]
    usage: dict[str, Any]
    trace: list[dict[str, Any]]
    error: dict[str, Any] | None


@dataclass(frozen=True)
class AgentInferenceRuntimeRun:
    run_id: str
    app_id: str
    action: str
    runtime_name: str
    status: RunStatus
    runtime_context_ref: RuntimeContextRef
    principal_id: str | None
    provider_ref: Mapping[str, str] | None
    usage: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] | None = None
```

当前约束：

- `AgentInferenceRuntimeService.invoke()` 只负责通过 `AgentInferenceRuntimeRouter` 选择 adapter 并同步调用 `adapter.invoke(request)`；service 本身尚不创建 run、不持久化 trace、不管理异步生命周期。
- `run_id` 当前由 adapter / provider result 返回，不在 request 中传入。
- `principal_id` 是当前实现里的身份字段；尚未升级为完整 `PrincipalContext`。
- `output_schema` 当前是 schema 名称字符串，由业务 consumer 解释；尚未在平台层统一执行 JSON Schema 校验。
- `trace` 当前是 adapter 返回的事件列表；SQL 仓储只持久化 run 摘要、usage、error、provider_ref 和 artifact 元数据。
- `/api/v1/agent-runtime/runs/<run_id>` 和 `/api/v1/agent-runtime/runs/<run_id>/artifacts` 是只读查询 API，按当前 principal 做 owner 过滤；它们不触发 `invoke`、不提交 runtime run。

### 7.2 目标演进契约

以下能力是后续演进目标，不能在当前实现说明里视作已落地：

- Request 增加平台生成或幂等传入的 `run_id`、`idempotency_key`。
- Request 增加完整 `principal_context`，替代当前 `principal_id` 字符串。
- Request / Result 增加统一 `tools`、`tool_calls` 和 tool result 摘要。
- `output_schema` 从字符串升级为可校验 schema 或 schema registry 引用，并由平台层执行结构化输出校验。
- `AgentInferenceRuntimeService` 内部负责创建 run、写 trace、记录 context / output hash、保存 artifact 引用。
- 生命周期管理补齐 `submit / poll / cancel / expire / read_result`；Codex app-server 和批量审计默认异步执行。
- 异步 run 外键关联 `turn`，同一 turn 下支持 retry / fallback run，并标记最终结果。

这些演进项进入实现前，需要先补 contract test、SQL schema / migration、API 权限模型和 runbook，再从本章节移动到“当前实现契约”。

## 8. Runtime 路由策略

### 8.1 默认路由

| Action 类型 | 默认 Runtime | 说明 |
|---|---|---|
| chat / explain / classify | OpenAI Agents SDK | 低延迟主链 |
| generate_candidate | OpenAI Agents SDK | 快速候选生成 |
| review / repair / audit | Codex app-server | 长上下文与复杂推理 |
| batch / workspace / file_artifact | Codex app-server | 需要工作区和 artifact |
| deterministic_state_action | 不走 runtime | 平台服务直接处理 |

### 8.2 降级策略

当前实现不执行自动 runtime fallback：`RuntimePolicy.fallback_runtime` 只是契约字段和 provider payload 透传字段，不驱动 router 降级。

目标演进：

- OpenAI Agents SDK 不可用时，可按 action 降级到 OpenAI-compatible LLM runtime。
- Codex app-server 不可用时，不自动降级为 OpenAI 主链复审，除非 action 明确允许 `fallback_runtime=openai`。
- 发布、保存、执行查询、同步元数据等确定性动作不允许 runtime fallback。
- runtime 输出结构化校验失败时，不自动应用结果，只返回 `RUNTIME_INVALID_OUTPUT`。

### 8.3 强制策略

当前 `RuntimePolicy` 支持：

- `max_runtime_seconds`
- `max_output_bytes`
- `allow_network`
- `allowed_tools`
- `command_policy`
- `fallback_runtime`：预留 / 透传字段，当前不触发自动降级。

目标演进再补：

- `allowed_runtimes`
- `timeout_seconds`
- `allow_fallback`
- `requires_workspace`
- `requires_human_confirmation`
- `redaction_profile`

## 9. Context Pack 与 Evidence Pack

Context Pack 是平台级上下文抽象，Evidence Pack 是业务证据包的一种。

| 概念 | 范围 | 示例 |
|---|---|---|
| Context Pack | runtime 的统一只读输入 | 用户意图、当前对象、历史消息、约束 |
| Evidence Pack | 业务事实证据 | 数据资产表画像、Cube、Ontology、SQL 使用记录、校验结果 |

原则：

- 业务模块负责构建业务 Evidence Pack。
- Agent Inference Runtime 层只负责统一封装、脱敏、hash、trace 和大小控制。
- runtime 不直接回查生产数据库，除非通过 ToolSpec 适配层中被授权的只读工具。
- Evidence Pack 应记录 `source_refs`、`snapshot_id`、`generated_at` 和 `input_hash`，便于复现。
- 查询解释、发布复审、语义修复等与正式执行结果相关的 action 必须携带 `semantic_runtime_pin`；资产画像和字段推断类 action 必须携带 `asset_revision_refs`。
- 当 context 来自 draft 或 Proposal 时，`semantic_runtime_pin` 可以为空，但 action schema 必须显式声明它不是正式执行依据，不能生成可执行票据。

## 10. ToolSpec 适配层

第一阶段不新增一套全局 Tool Registry。平台只定义 `ToolSpec` 端口和适配层，把现有工具注册体系投影成统一 runtime 可读的工具声明。

```mermaid
flowchart LR
  Runtime["AgentInferenceRuntimeService"] --> Adapter["ToolSpec Adapter"]
  Adapter --> ModelingRegistry["ModelingToolRegistry"]
  Adapter --> DataAgentRegistry["Data Agent ToolRegistry"]
  Adapter --> OpenAPIScanner["OpenAPI Scanner<br/>x-side-effect / x-requires-confirmation"]
  Adapter --> ModuleTools["业务模块只读工具"]
```

工具约束：

- 工具默认只读。
- 写操作必须拆成 proposal / patch / command preview，由业务服务二次确认。
- 工具声明必须包含 `tool_id`、`capability`、`input_schema`、`output_schema`、`side_effect_level`、`required_scopes`。
- Runtime Adapter 不能自行发明工具。
- 若现有工具已经通过 OpenAPI 扩展标注了 `x-side-effect`、`x-requires-confirmation` 或模块内 registry 权限，ToolSpec 适配层必须继承这些风险标注，不能降级为普通只读工具。
- Platform GA 前再评估是否需要真正的全局 Tool Registry；MVP 阶段以适配现有 registry 为准。

## 11. 状态与副作用边界

Runtime 可以产生：

- 文本解释。
- 结构化建议。
- proposal patch。
- review finding。
- repair suggestion。
- artifact。
- tool call trace。

Runtime 不能直接执行：

- 发布 Cube。
- 修改 Ontology。
- 写入资产画像正式表。
- 执行生产查询。
- 修改 DataWorks 任务。
- 绕过发布门禁。

所有副作用必须由业务应用服务基于校验后的 `AgentInferenceRuntimeResult` 发起。

## 12. 错误码

统一错误码建议：

| 错误码 | 含义 |
|---|---|
| `RUNTIME_NOT_CONFIGURED` | runtime 未配置 |
| `RUNTIME_UNAVAILABLE` | runtime 服务不可用 |
| `RUNTIME_TIMEOUT` | runtime 超时 |
| `RUNTIME_POLICY_BLOCKED` | 被 runtime policy 阻断 |
| `RUNTIME_INVALID_OUTPUT` | 结构化输出不符合 schema |
| `RUNTIME_TOOL_FORBIDDEN` | 工具未授权 |
| `RUNTIME_TOOL_FAILED` | 工具执行失败 |
| `RUNTIME_CONTEXT_TOO_LARGE` | context 超过限制 |
| `RUNTIME_SIDE_EFFECT_REJECTED` | runtime 尝试越权产生副作用 |
| `RUNTIME_ARTIFACT_UNAVAILABLE` | artifact 不可读取或过期 |

业务模块可以包装这些错误，但不能改变底层含义。

## 13. 可观测性与审计

当前 MVP 已落地 SQL run / artifact 元数据查询面，但持久化写入仍由 repository 调用方负责，`AgentInferenceRuntimeService.invoke()` 尚未内建 trace 持久化。

当前 `agent_inference_runtime_runs` 记录：

- `run_id`
- `app_id`
- `action`
- `runtime_name`
- `status`
- `project_id`
- `session_id`
- `thread_id`
- `turn_id`
- `principal_id`
- `provider_ref_json`
- `usage_json`
- `error_json`
- `created_at`
- `updated_at`

当前 `agent_inference_runtime_artifacts` 记录：

- `artifact_id`
- `run_id`
- `app_id`
- `principal_id`
- `project_id`
- `session_id`
- `thread_id`
- `turn_id`
- `artifact_type`
- `title`
- `summary`
- `mime_type`
- `size_bytes`
- `sha256`
- `created_at`

目标演进再补完整可复现 trace：

- `context_hash`
- `output_hash`
- `tool_call_count`
- `artifact_count`
- `latency_ms`
- `error_code`
- 结构化 event stream
- result / artifact storage URI

Trace 存储目标分两层：

- 热路径：PostgreSQL 表记录 run 摘要、状态、错误和 usage。
- 冷路径：artifact 存储保存大上下文、长输出、文件 patch 和复审报告。

目标持久化模型：

| 表 / 存储 | 关键字段 | 用途 |
|---|---|---|
| `agent_inference_runtime_runs` | `run_id`、`project_id`、`session_id`、`thread_id`、`turn_id`、`app_id`、`action`、`runtime`、`status`、`principal_id`、`semantic_snapshot_id`、`context_hash`、`output_hash`、`latency_ms`、`usage_json`、`error_code`、`provider_ref_json`、`created_at`、`finished_at` | run 摘要、审计、排障 |
| `agent_inference_runtime_artifacts` | `artifact_id`、`run_id`、`project_id`、`session_id`、`thread_id`、`turn_id`、`app_id`、`principal_id`、`artifact_type`、`storage_uri`、`content_hash`、`expires_at`、`created_at` | 大上下文、复审报告、patch、工作区产物引用 |

保留策略：

- run 摘要默认随平台审计保留；artifact 默认短期保留，可按环境配置，例如本地 7 天、生产 30 天。
- artifact 不直接内嵌密钥、连接串或 AccessKey；读取 artifact 时必须重新校验 principal、app_id 和 run ownership。
- output hash 和 context hash 必须可用于复现输入输出一致性，但不要求在热表中保存完整 prompt。

## 14. 安全与权限

- Runtime Request 的身份事实只能来自平台归一后的 `PrincipalContext`。
- 用户请求体中的角色、scope、tenant 不参与授权事实。
- Context Pack 默认脱敏，密钥、AccessKey、连接串和 token 不进入 runtime。
- Codex app-server 使用项目级隔离工作区和独立 `AGENT_CODEX_RUNTIME_ROOT`。
- Runtime Adapter 不持有业务数据库写权限。
- 所有工具调用必须经过 `ToolSpec Adapter + RuntimePolicy` 校验。

## 15. 配置建议

当前实现配置：

OpenAI-compatible runtime 当前只读取以下 `AGENT_OPENAI_*` 字段；没有实现 `AGENT_OPENAI_ENABLED` 开关。

```text
AGENT_OPENAI_API_KEY=...
AGENT_OPENAI_BASE_URL=...
AGENT_OPENAI_MODEL=...
AGENT_OPENAI_TIMEOUT_SECONDS=30
```

Codex app-server skeleton 当前只读取以下 `AGENT_CODEX_*` 字段；真实 app-server 默认不启用。

```text
AGENT_CODEX_ENABLED=false
AGENT_CODEX_PROJECT_ID=cubic3-data-platform
AGENT_CODEX_PROJECT_ROOT=/path/to/cubic3-data-platform
AGENT_CODEX_RUNTIME_ROOT=/path/to/cubic3-data-platform/.cubic3/agent-codex
AGENT_CODEX_TRANSPORT=unix_socket
AGENT_CODEX_ENDPOINT=http://127.0.0.1:8799
AGENT_CODEX_UNIX_SOCKET=/path/to/cubic3-data-platform/.cubic3/agent-codex/codex.sock
AGENT_CODEX_MAX_CONCURRENCY=2
```

Codex live smoke 的测试开关是 opt-in 验证字段，不属于默认运行时配置：

```text
AGENT_CODEX_LIVE=1
```

目标演进配置，尚未作为当前实现能力声明：

```text
AGENT_INFERENCE_RUNTIME_ENABLED=true
AGENT_INFERENCE_RUNTIME_DEFAULT=openai_agents
AGENT_INFERENCE_RUNTIME_TRACE_ENABLED=true
AGENT_INFERENCE_RUNTIME_ARTIFACT_STORE=local
AGENT_OPENAI_ENABLED=true
AGENT_CODEX_HEALTH_PATH=/health
AGENT_CODEX_CAPABILITIES_PATH=/capabilities
AGENT_CODEX_SERVER_MANAGED=true
AGENT_CODEX_SERVER_COMMAND=codex-app-server
AGENT_CODEX_CLI_FALLBACK=false
AGENT_CODEX_TIMEOUT_SECONDS=120
AGENT_CODEX_MAX_RUNTIME_SECONDS=600
```

Codex app-server 验证通过后的运行态以本地目录为主。配置只暴露项目根和 runtime 根目录，session / thread / turn / artifact 目录由平台按 `project_id / session_id / thread_id / turn_id / run_id` 派生，避免用户手动配置多层路径。

### 15.1 Command Provider 与 Codex Runtime 的区别

普通 command provider 的抽象是“一次命令执行”，典型配置是 `command / args / cwd / timeout`，典型结果是 `exit_code / stdout / stderr`。它适合 `sqlfluff`、`pytest`、`odpscmd` 或一次性脚本，不适合承载 Codex app-server。

Codex app-server 的抽象是“agent 工作区会话”，核心对象是 `project / session / thread / turn / run / artifact`。平台需要管理长任务状态、事件流、artifact、权限和可恢复 trace，而不是只等待一个子进程输出。

| 维度 | 普通 command provider | Codex app-server runtime |
|---|---|---|
| 核心对象 | command、args、cwd、timeout | project、session、thread、turn、run、artifact |
| 调用形态 | 启动一次进程并等待结果 | 通过 app-server client 创建 / 续接 thread 和 run |
| 状态模型 | exit code、stdout、stderr | queued / running / succeeded / failed / timeout / cancelled / expired |
| 上下文 | stdin 或临时文件 | context pack、runtime policy、tool spec、events |
| 产物 | 命令输出文件 | artifact manifest、payload、事件流、trace |
| 适用场景 | 短任务、一次性工具 | 长上下文复审、修复建议、工作区任务 |

因此 `AGENT_CODEX_*` 不设计 `COMMAND / ARGS` 作为主配置。目标上 CLI 只能作为开发期 fallback，正式集成优先使用本地 app-server HTTP / WebSocket client；当前实现尚未提供 CLI fallback。

### 15.2 Codex Transport Contract

Codex app-server transport 必须显式配置，不允许 adapter 猜测连接方式。当前实现只读取 `AGENT_CODEX_TRANSPORT`、`AGENT_CODEX_ENDPOINT` 和 `AGENT_CODEX_UNIX_SOCKET` 字段；health / capabilities / server-managed / CLI fallback 仍是目标演进。

| 配置 | 说明 |
|---|---|
| `AGENT_CODEX_TRANSPORT` | `unix_socket`、`http` 或 `websocket_events`；MVP 推荐 `unix_socket` 或本机 HTTP，WebSocket 仅作为事件通道 |
| `AGENT_CODEX_ENDPOINT` | 本机 HTTP endpoint；当使用 Unix socket 时仅作为逻辑 base URL |
| `AGENT_CODEX_UNIX_SOCKET` | Unix socket 路径；本机集成优先使用它降低端口冲突和暴露面 |
| `AGENT_CODEX_HEALTH_PATH` | 健康检查路径，返回 app-server 状态、版本和当前 project readiness |
| `AGENT_CODEX_CAPABILITIES_PATH` | 能力发现路径，返回 protocol version、支持的 action、artifact、events 和 command policy 能力 |
| `AGENT_CODEX_SERVER_MANAGED` | 是否由平台 process manager 启动 per-project app-server |
| `AGENT_CODEX_SERVER_COMMAND` | 仅在 `SERVER_MANAGED=true` 时使用；用于启动本地 app-server，不等同于 command provider |
| `AGENT_CODEX_CLI_FALLBACK` | 仅允许开发环境开启；生产必须 fail-closed |
| `AGENT_CODEX_MAX_CONCURRENCY` | 每 project 并发 run 上限 |

最小 client 接口：

```python
class CodexAppServerClient(Protocol):
    def healthcheck(self) -> CodexHealth: ...
    def capabilities(self) -> CodexCapabilities: ...
    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef: ...
    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef: ...
    def poll_run(self, provider_run_id: str) -> ProviderRunStatus: ...
    def stream_events(self, provider_run_id: str, cursor: str | None) -> EventPage: ...
    def cancel_run(self, provider_run_id: str) -> None: ...
    def collect_artifacts(self, provider_run_id: str) -> Sequence[ProviderArtifactRef]: ...
```

协议约束：

- `healthcheck` 与 `capabilities` 必须在启动和每次正式 run 前校验 protocol version。
- `websocket_events` 只用于事件增量推送；`submit / poll / cancel / collect_artifacts` 的最小 contract 仍需可由 HTTP / Unix socket 完成。
- 目标演进：CLI fallback 必须由 `AGENT_CODEX_CLI_FALLBACK=true` 显式开启，并且只在开发环境允许；生产环境开启时启动失败。
- app-server 原生 provider id 只保存在 adapter manifest，不进入平台领域 id。

Codex adapter 的映射关系：

| 平台对象 | Codex runtime 映射 |
|---|---|
| `AgentInferenceRuntimeRequest` | 一次 turn 的 `request.json`、`context_pack.json`、`runtime_policy.json` |
| `AgentInferenceRuntimeRun` | `runs/{run_id}/run.json` 与 app-server run 状态 |
| `session_id` | 业务产品会话，例如一次建模 Copilot session |
| `thread_id` | 平台侧推理线程 id；Codex 原生 thread id 写入 provider manifest |
| `turn_id` | 一次用户输入或系统触发 action |
| `AgentInferenceRuntimeResult` | `turns/{turn_id}/result.json` 与 artifact refs |
| `events.ndjson` | app-server 事件流的可审计镜像 |

推荐目录结构：

```text
${AGENT_CODEX_RUNTIME_ROOT}/
  projects/
    ${AGENT_CODEX_PROJECT_ID}/
      project.json
      sessions/
        ${session_id}/
          session.json
          threads/
            ${thread_id}/
              thread.json
              turns/
                ${turn_id}/
                  turn.json
                  request.json
                  context_pack.json
                  runtime_policy.json
                  result.json
                  events.ndjson
                  run_index.json
                  artifacts/
                    ${artifact_id}/
                      manifest.json
                      payload.*
      runs/
        ${run_id}/
          run.json
          provider_ref.json
          turn_ref.json
          stdout.log
          stderr.log
```

粒度约束：

- `project`：绑定一个平台项目和本地 workspace，记录 `project_id`、`project_root`、runtime 版本和 app-server 能力摘要。
- `session`：对应业务产品会话，例如一次建模 Copilot session；保存调用方、principal、业务对象和默认 context pin。
- `thread`：对应同一 session 下的 agent 对话 / 推理线程；承接多轮上下文和 Codex app-server thread 标识。
- `turn`：对应一次用户输入或一次系统触发的 runtime action；保存 request、context pack、policy、结构化 result 和事件流。
- `run`：对应平台调度的一次执行，可被同步或异步消费；`run_id` 是 trace、artifact 和状态查询的主键。
- `artifact`：只保存引用、manifest 和可审计 payload；读取时必须重新校验 principal、app_id、session_id 和 run ownership。

### 15.3 Workspace Store 一致性协议

状态事实源固定如下：

| 数据 | 事实源 | 本地目录角色 |
|---|---|---|
| run 摘要、状态、权限校验字段 | PostgreSQL `agent_inference_runtime_runs` | 镜像与排障材料 |
| artifact 元数据、下载授权字段 | PostgreSQL `agent_inference_runtime_artifacts` | payload / manifest 存储引用 |
| 事件流、stdout、stderr、provider manifest | 本地 runtime 目录 | 可恢复 trace 与排障材料 |
| app-server 原生 thread/run 状态 | Codex app-server | 仅由 adapter 同步为 provider manifest |

写入协议：

- 所有 JSON 文件采用 `write tmp -> fsync -> atomic rename`，禁止原地覆盖。
- 同一 `run_id` 写入必须持有 run lock，例如 `runs/{run_id}/.lock`；同一 `turn_id` 更新 `run_index.json` 必须持有 turn lock。
- `events.ndjson` 每行必须包含 `seq`、`event_id`、`run_id`、`turn_id`、`event_type`、`created_at` 和 `payload_hash`；写入按 `seq` 单调递增。
- `run_index.json` 记录同一 turn 下所有 retry / fallback run，包含 `current_run_id`、`final_run_id` 和 `run_ids`。
- `turn_ref.json` 记录 `project_id / session_id / thread_id / turn_id`，用于从 `runs/{run_id}` 反查 turn。
- crash recovery 优先读取 PostgreSQL run 状态，再用本地 `run.json / events.ndjson / provider_ref.json` 补齐缺失 trace；本地目录不能反向覆盖已完成的数据库状态。
- 目标演进 stale run 恢复规则：`running` 超过 `AGENT_CODEX_MAX_RUNTIME_SECONDS` 且 app-server 查询不到活跃 provider run 时，标记为 `timeout` 或 `expired`，并记录 recovery event。

### 15.4 Artifact 安全模型

artifact 必须通过平台 artifact service 读取，不能把本地文件路径直接返回给前端或业务模块。

artifact manifest 最小字段：

```json
{
  "artifact_id": "art_...",
  "run_id": "run_...",
  "project_id": "cubic3-data-platform",
  "session_id": "session_...",
  "thread_id": "thread_...",
  "turn_id": "turn_...",
  "artifact_type": "review_report",
  "storage_uri": "local://projects/.../artifacts/art_...",
  "content_hash": "sha256:...",
  "content_type": "application/json",
  "size_bytes": 1234,
  "created_at": "2026-05-25T00:00:00Z",
  "expires_at": "2026-06-24T00:00:00Z"
}
```

安全约束：

- 下载 API 输入只能是 `artifact_id`，不能接受任意 path。
- 读取前必须校验 principal、app_id、project_id、session_id、thread_id、turn_id 和 run ownership。
- 本地路径必须 canonicalize，并确认位于 `AGENT_CODEX_RUNTIME_ROOT` 之下；拒绝 `..`、symlink escape、hardlink escape 和绝对路径注入。
- payload 必须校验 `content_hash`，hash 不一致返回 `RUNTIME_ARTIFACT_UNAVAILABLE`。
- artifact 默认 TTL 清理；清理只删除 payload，不删除 run 摘要。
- app-server 生成的文件进入平台 artifact store 时必须复制或登记为平台 manifest，不能直接暴露 provider 临时路径。

### 15.5 事件流消费 Contract

长任务不能只有 `poll`。平台需要提供增量事件读取，前端和排障工具都通过统一 contract 消费。

事件页结构：

```json
{
  "run_id": "run_...",
  "cursor": "seq:42",
  "next_cursor": "seq:57",
  "has_more": true,
  "events": [
    {
      "seq": 43,
      "event_id": "evt_...",
      "event_type": "run.started",
      "created_at": "2026-05-25T00:00:00Z",
      "payload": {}
    }
  ]
}
```

事件约束：

- `seq` 在同一 run 内单调递增；`event_id` 全局唯一。
- 支持按 cursor 增量读取，cursor 过期时返回可恢复错误并提示从最新 snapshot 继续。
- 事件类型至少包含 `run.queued`、`run.started`、`tool.requested`、`approval.required`、`artifact.created`、`run.succeeded`、`run.failed`、`run.cancelled`、`run.timeout`。
- WebSocket 只作为事件推送优化；HTTP cursor 读取必须可独立完成全部状态恢复。
- 大 payload 进入 artifact，事件中只放摘要和 artifact ref。

### 15.6 Command Allowlist 与 Approval

Codex runtime 默认不允许写入型命令。需要命令执行时，必须通过 `ToolSpec + RuntimePolicy` 显式授权。

命令策略最小 schema：

```json
{
  "policy_id": "readonly_review_v1",
  "project_root": "/path/to/cubic3-data-platform",
  "runtime_root": "/path/to/cubic3-data-platform/.cubic3/agent-codex",
  "allowed_cwd_roots": [
    "/path/to/cubic3-data-platform",
    "/path/to/cubic3-data-platform/.cubic3/agent-codex"
  ],
  "allowed_commands": [
    {
      "command": "python",
      "args_pattern": ["-m", "pytest", "tests/unit/**"],
      "cwd_policy": "project_root_only",
      "env_policy": "redacted",
      "network": "disabled",
      "read_paths": ["."],
      "write_paths": [".cubic3/agent-codex/**"],
      "requires_approval": true
    }
  ]
}
```

执行约束：

- 默认 `network=disabled`，默认不允许写项目源码、配置、密钥或数据库。
- `cwd` 必须位于 `project_root`、`runtime_root` 或 `allowed_cwd_roots` 声明的可信根下。
- `pytest` 这类项目内验证命令必须显式配置可信根；测试路径按 `cwd` 解析真实路径后仍必须位于可信根的 `tests/` 目录下，拒绝 symlink escape。
- env 只允许白名单变量，密钥默认脱敏且不写入事件流。
- 需要 approval 的命令必须记录 approver、approved_at、command_hash、policy_id 和 reason。
- 未命中 allowlist 返回 `RUNTIME_TOOL_FORBIDDEN`，不得降级为 CLI fallback。

配置收敛：

- 项目尚未上线，不引入长期双读或弃用窗口。
- LLM API 相关配置统一迁移为 `AGENT_OPENAI_*`，实现落地后不再读取 `LLM_API_KEY`、`OPENAI_API_KEY`、`LLM_API_BASE`、`LLM_MODEL`。
- Codex app-server 相关配置统一迁移为 `AGENT_CODEX_*`，实现落地后不再读取 `SEMANTIC_MODELING_CODEX_*`。
- `env.sample`、`QUICK_START.md`、`STARTUP_GUIDE.md` 和 `config_schema.py` 必须在同一任务中同步更新。
- 缺少必需 `AGENT_*` 配置时 fail fast，返回明确配置错误，而不是隐式回退到旧变量。

## 16. 建议目录结构

```text
app/domain/agent_inference_runtime/
  models.py
  ports.py
  errors.py

app/application/agent_inference_runtime/
  runtime_service.py
  runtime_router.py
  context_pack.py
  tool_spec_adapter.py
  runtime_policy.py
  trace_service.py

app/infrastructure/agent_inference_runtime/
  openai_agents_sdk_adapter.py
  openai_compatible_llm_adapter.py
  codex_app_server_adapter.py
  codex_app_server_client.py
  codex_process_manager.py

app/application/semantic/
  modeling_agent_app.py
  semantic_evidence_builder.py
  modeling_copilot_service.py
```

边界说明：

- `domain/agent_inference_runtime` 只放通用模型、端口和错误。
- `application/agent_inference_runtime` 只放平台 runtime 编排，不引用具体语义、资产、查询实现。
- `infrastructure/agent_inference_runtime` 放第三方 SDK、HTTP client、进程管理和本地工作区实现。
- 业务模块通过自己的 `Agent App` 适配平台 runtime。

## 17. 语义建模 Copilot 迁移设计

当前语义建模 Copilot 应迁移为第一个 consumer。

目标结构：

```mermaid
flowchart TD
  UI["/semantic/modeling-copilot"] --> Service["SemanticModelingCopilotService"]
  Service --> App["SemanticModelingAgentApp"]
  App --> Evidence["SemanticEvidenceBuilder"]
  App --> Runtime["AgentInferenceRuntimeService"]
  App --> Proposal["ModelingProposalService"]
  Proposal --> Gate["Publish Gate / Validation"]
```

职责调整：

- `SemanticModelingCopilotService` 继续负责 session、chat、artifact 投影和用户动作。
- `SemanticModelingAgentApp` 负责把建模业务 action 转换成平台 runtime request。
- `SemanticEvidenceBuilder` 统一构建资产、Cube、Ontology、校验结果和发布门禁证据。
- `SemanticModelingAgentApp` 直接消费 `AgentInferenceRuntimeResult.structured_output`，并按 action schema 转成建模领域命令、review artifact 或 repair suggestion。
- 当前 `AgentRunResult` 兼容结构不再作为长期目标；实现时直接迁到 `AgentInferenceRuntimeResult` 和 action output schema，避免保留第二套运行时契约。
- 当前 `modeling_copilot_runtime.py` 中的 LLM 调用、工具编排、确定性 fast path 应拆入平台 runtime adapter、ToolSpec 适配层和确定性应用服务。

语义建模 action 级 schema：

| Action | Output schema | 领域输出 |
|---|---|---|
| `semantic.modeling.chat` | `semantic.modeling.chat.output.v1` | `message`、`state_updates`、`tool_traces` |
| `semantic.modeling.generate_candidate` | `semantic.modeling.candidate.output.v1` | `proposal_delta`、`evidence_refs`、`required_confirmations` |
| `semantic.modeling.review_proposal` | `semantic.modeling.review.output.v1` | `findings`、`blocking_issues`、`artifacts`、`required_confirmations` |
| `semantic.modeling.repair_validation_failure` | `semantic.modeling.repair.output.v1` | `proposal_delta`、`repair_steps`、`required_confirmations` |
| `semantic.modeling.explain_publish_blocker` | `semantic.modeling.blocker_explanation.output.v1` | `message`、`blocking_issues`、`next_actions` |

实现约束：

- 不新增 `SemanticModelingRuntimeShim`。当前项目未上线，直接以新 contract 重写建模 Copilot runtime 接入。
- `proposal_delta` 与 `state_updates` 必须经过 `SemanticModelingAgentApp` 的领域校验；runtime 输出不能绕过 `SemanticModelingCopilotService` 的状态保护。
- schema 校验失败时返回 `RUNTIME_INVALID_OUTPUT`，不写入 session 草稿态。

保留约束：

- Chat 内“使用推荐 / 接受 Cube 草稿 / 解释阻塞项”等确定性动作不调用 LLM。
- 保存 Proposal、发布 Cube、修改 Ontology 仍由平台业务服务执行。
- runtime 输出只能成为建议、解释或 patch，不自动发布。

## 18. 产品形态

用户不直接选择 runtime。产品上展示能力，不展示供应商。

建议展示：

- 主链生成：低延迟 AI 建议。
- Codex 复审：复杂方案复核、修复建议、长上下文分析。
- Runtime 状态：仅在不可用时展示清晰状态，例如“复审能力未启用”。
- Trace 面板：面向管理员和调试用户，展示 runtime、action、耗时、artifact 和错误。

不建议展示：

- “OpenAI / Codex 二选一”作为普通用户控件。
- 模型参数、API Key、workspace path。
- 未校验的 patch 直接应用按钮。

## 19. 迁移路线

### Phase 0：implementation-ready 架构修订

- 将服务命名固定为 `AgentInferenceRuntimeService`，避免与 official Semantic Runtime 混淆。
- 补齐 `AgentInferenceRuntimeRun` 异步生命周期、Codex app-server process contract 和 artifact 权限模型。
- 补齐 `AGENT_OPENAI_*`、`AGENT_CODEX_*` 配置收敛规则和文档同步清单，不引入旧变量双读。
- 补齐 Codex app-server 本地目录运行态，明确 project / session / thread / turn / run / artifact 粒度。
- 补齐 `RuntimeContextRef`、平台 ID / provider ID 隔离、transport contract、workspace store 一致性、事件流消费、command allowlist 和 artifact 安全模型。
- 补齐 `semantic.modeling.*` action 级 output schema，直接替代旧 `AgentRunResult` 契约。
- 补齐最小 trace / artifact 持久化模型。

Phase 0 是进入 implementation plan 的前置基线；后续计划必须逐项映射这些验收口径，不能直接跳到 Codex app-server 或跨模块平台化实现。

### Phase 1：平台 contract 与 fake runtime

- 新增 `app/domain/agent_inference_runtime`。
- 定义 `AgentInferenceRuntimeRequest`、`AgentInferenceRuntimeResult`、`AgentInferenceRuntimeRun`、`RuntimePolicy`、`ToolSpec` 和错误码。
- 新增 `AgentInferenceRuntimeService`、`AgentInferenceRuntimeRouter`、fake adapter 和 trace stub。
- 补 unit tests，验证 contract、路由和错误码。

### Phase 2：迁移现有 LLM adapter

- 将当前语义私有 LLM adapter 迁移为 `OpenAICompatibleLLMRuntimeAdapter`。
- 如果采用真实 OpenAI Agents SDK，新增 `OpenAIAgentsSdkRuntimeAdapter`，不要复用误导性命名。
- 保持现有 Copilot 主链行为不变。
- 补回归测试，验证现有建模助手 session API 不变。

### Phase 3：语义建模 Agent App 化

- 新增 `SemanticModelingAgentApp`。
- 抽出 `SemanticEvidenceBuilder`。
- 让 Copilot service 通过平台 `AgentInferenceRuntimeService` 调用 runtime。
- 直接以 `AgentInferenceRuntimeResult` 和 action output schema 改造 Copilot session API、artifact 投影和 patch 校验逻辑，不保留 shim。
- 移除语义服务对具体 OpenAI adapter 的直接依赖。

### Phase 4：Codex app-server 接入

- 新增 `CodexAppServerRuntimeAdapter`、client、process manager。
- 支持 `AGENT_CODEX_PROJECT_ROOT`、`AGENT_CODEX_RUNTIME_ROOT`、`AGENT_CODEX_TRANSPORT`、endpoint / socket、timeout、artifact 和 run trace。
- 按 runtime 根目录派生 project / session / thread / turn / run / artifact 目录，不再把 Codex 配置设计成普通 command provider 配置。
- 先只接入 `review_proposal` 和 `repair_validation_failure`。
- Codex 不参与低延迟主对话默认链路。
- 明确 transport：MVP 优先使用本地 HTTP + Unix socket / local bridge；WebSocket 仅作为事件通道；CLI 进程只作为开发期 fallback，不能成为正式 runtime contract。
- 明确对象映射：`AgentInferenceRuntimeRequest -> turn`，`AgentInferenceRuntimeRun -> run`，`AgentInferenceRuntimeResult -> result / artifact refs`。
- 明确进程生命周期：`ensure_started`、`healthcheck`、`submit_run`、`cancel_run`、`collect_artifacts`、`cleanup_workspace`。
- 明确最小管理面：Phase 4 必须提供 `submit / poll / cancel / read_result / read_events / read_artifact`，不能只测 adapter 内部。
- 并发隔离：同一 project 内按 `run_id` 创建隔离工作区；并发上限由配置控制，超限返回 `RUNTIME_POLICY_BLOCKED` 或排队。
- Approval / command allowlist：默认不允许执行写入型命令；需要命令执行时必须由 ToolSpec / RuntimePolicy 显式授权，并记录 approval 审计。
- artifact 权限：artifact 只返回引用和摘要，读取时再次校验 principal、app_id、session_id、thread_id、turn_id 与 run ownership。
- 失败恢复：app-server 不可用返回 `RUNTIME_UNAVAILABLE`；进程超时返回 `RUNTIME_TIMEOUT`；workspace 清理失败记录 warning，不影响业务状态回滚。

### Phase 5：第二个业务消费者验证复用（Platform GA）

- 选择数据资产底座作为第二个 consumer。
- 接入 `asset.field.infer_semantics` 或 `asset.quality.explain_issue`。
- 验证 runtime contract 没有被语义建模私有概念污染。
- Phase 5 不属于 MVP 完成标准，避免为了证明平台化而提前给数据资产底座增加不必要 AI action。

### Phase 6：生产收口

- 补齐配置文档、runbook、OpenAPI 管理接口和可观测性。
- 增加 runtime run 列表、详情和 artifact 下载权限控制。
- 补充 live smoke 与 E2E。

## 20. 测试策略

### 单元测试

- Contract 序列化和 schema 校验。
- AgentInferenceRuntimeRouter action 路由。
- RuntimePolicy 降级和阻断。
- ToolSpec 适配层权限校验。
- Adapter 输出结构校验。
- `AGENT_OPENAI_*`、`AGENT_CODEX_*` 配置收敛和缺失 fail-fast。
- `semantic.modeling.*` action output schema 到 Copilot session 状态的直接映射。
- Codex workspace store 原子写、锁、事件序号、run-turn 索引、stale recovery。
- Artifact path traversal / symlink escape / hash 校验 / TTL 清理。
- Command allowlist、approval 审计和未授权命令拒绝。

### 集成测试

- 语义建模 Copilot 创建 session、生成候选、保存 Proposal 的现有链路不回归。
- OpenAI-compatible adapter 在无 API Key 时返回明确错误。
- Codex adapter 在未启用时返回 `RUNTIME_NOT_CONFIGURED`。
- fake runtime 可支撑本地 CI。
- 新增独立验证入口 `make test-platform-agent-runtime`，只覆盖本文定义的 Agent Inference Runtime；现有 `make test-agent-runtime` 继续表示 official Semantic Runtime / QueryDSL / Agent plan API，不复用名称。
- fake Codex adapter 覆盖 `submit / poll / cancel / read_result / read_events / read_artifact`。

### E2E / Live Smoke

- OpenAI runtime live smoke：配置 API Key 后验证一次结构化输出。
- 当前 Codex app-server live smoke：`tests/integration/agent_inference_runtime/test_codex_live_smoke.py` 默认 skip；只有 `AGENT_CODEX_LIVE=1` 时才要求 `AGENT_CODEX_ENDPOINT` 或 `AGENT_CODEX_UNIX_SOCKET`，用于阻止普通验证误连真实 Codex。
- 目标 Codex app-server live smoke：验证进程 / server 可用、能返回 artifact、timeout 生效、cancel 生效、并发上限生效、stale recovery 生效、artifact 越权被拒、命令拒绝生效、CLI fallback disabled。
- 语义建模复审 E2E：生成 Proposal 后触发 Codex 复审，返回只读 review artifact。
- 数据资产二号消费者 smoke：字段语义推断只生成候选，不写正式资产事实。
- Codex live smoke 默认 opt-in，不进入本地默认 `make verify`；CI 只跑 fake process manager 和 contract 测试。

## 21. 风险与应对

| 风险 | 应对 |
|---|---|
| 平台 runtime 抽象过大 | 第一阶段只实现 contract、router、trace、两个 adapter，不做 marketplace |
| 语义主链回归 | 先保持 Copilot session API 不变，迁移 adapter 后再抽 Agent App |
| Codex app-server 生命周期复杂 | 先 per-project local runtime，限定 review / repair 两类 action |
| Codex 长任务阻塞 Web 请求 | Codex action 默认走异步 run，经 RQ worker 或受监管 sidecar 执行 |
| 结构化输出不稳定 | 强制 output schema 校验，失败只返回错误，不应用 patch |
| 权限越界 | runtime 无写权限，所有副作用回到业务服务 |
| 配置混乱 | 统一使用 `AGENT_*`，同一任务同步配置 schema、env sample 和启动文档 |
| 与 official Semantic Runtime 混淆 | 服务命名固定为 `AgentInferenceRuntimeService`，正式查询执行继续走 QueryDSL / ExecutionTicket 链 |

## 22. 工程原则落实

- KISS：统一一个 `AgentInferenceRuntimeService` 和一套 contract，避免每个模块独立造生成式 runtime。
- YAGNI：第一阶段不建设 marketplace、复杂多租户 runtime 编排和跨产品 gateway 主链依赖。
- SOLID：runtime adapter 只负责 runtime 调用，业务 Agent App 负责业务语义，服务层负责状态和副作用。
- DRY：context、tool、policy、trace、错误码和 artifact 统一复用。
- 当前查询 API 的原则落点：GET 端点只读 repository，不复用 invoke/service 执行路径，避免把观测面和执行面耦合；Codex live smoke 保持 opt-in，避免为了未接入的真实 app-server 预留默认副作用。

## 23. 完成判定

### 23.1 MVP 完成判定

1. 文档完成 Phase 0 修订，并明确 official Semantic Runtime 与 Agent Inference Runtime 边界。
2. 语义建模 Copilot 不再直接依赖具体 OpenAI adapter，而是通过 `AgentInferenceRuntimeService` 和 action output schema 调用。
3. OpenAI-compatible runtime 和 fake runtime 实现平台 `AgentInferenceRuntimePort`。
4. Runtime run 有可查询 trace、usage、错误码和最小 artifact 引用。
5. 所有 runtime 输出都经过 action schema 校验和业务服务二次确认。
6. `AGENT_OPENAI_*` 与 `AGENT_CODEX_*` 配置收敛完成，旧 LLM / Codex 变量不再作为运行时输入。
7. `make test-platform-agent-runtime` 与建模 Copilot 现有回归测试通过。

### 23.2 Platform GA 完成判定

1. Codex app-server runtime 实现平台 `AgentInferenceRuntimePort`，并支持异步 run 生命周期、artifact 权限和 opt-in live smoke。
2. 至少两个业务消费者复用平台 `AgentInferenceRuntimeService`，第二消费者建议从数据资产底座低风险解释类 action 开始。
3. Runtime run 列表、详情、artifact 下载权限控制和生产 runbook 完成。
4. 文档、配置样例、OpenAPI 管理接口、runbook 和 smoke 测试同步更新。
