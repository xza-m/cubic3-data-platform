---
doc_type: architecture-design
status: proposed
source_of_truth: target
owner: engineering
last_reviewed: 2026-05-25
---

# 平台级 Agent Runtime 目标架构

本文定义 Cubic3 数据平台的统一 Agent Runtime 目标设计。它是跨业务模块复用的运行时能力层，不是语义中心或建模助手的私有实现。

当前实现仍以语义建模 Copilot 内部 runtime adapter 为主，本文描述的是已确认的目标架构和迁移方向。实现落地后，应再同步更新 [TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)、[backend.md](backend.md) 与相关 ADR。

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

因此目标架构应把 Agent Runtime 上提为平台级能力层。语义建模 Copilot 只是第一个业务消费者。

## 2. 设计目标

### 2.1 功能目标

- 提供统一的 `AgentRuntimeService`，支持不同业务模块按 action 调用 agent runtime。
- 同时支持 OpenAI Agents SDK runtime 与 Codex app-server runtime。
- 支持统一的 request / result contract、runtime router、context pack、tool registry、policy guardrail、trace、artifact、usage 与错误码。
- 让语义建模、数据资产、智能查询、治理中心、数据开发助手都能复用同一层 runtime。
- 保持业务状态和副作用由业务模块自己的应用服务控制，runtime 只返回结构化建议和 artifact。

### 2.2 非目标

- 不在第一阶段建设通用 agent marketplace。
- 不把 Codex app-server 当成普通 LLM provider。
- 不让 runtime adapter 直接发布 Cube、修改 Ontology、写资产画像或执行生产查询。
- 不把 `cubic3-agent-gateway` 作为当前数据平台主链依赖；gateway 可作为未来跨产品 control-plane 参考。
- 不为每个业务模块设计一套独立 agent 协议。

## 3. 总体架构

```mermaid
flowchart TD
  subgraph Modules["业务模块层"]
    Semantic["语义建模 Copilot"]
    Assets["数据资产底座"]
    Query["智能查询 / Agent Runtime"]
    Governance["语义治理"]
    Dev["数据开发助手"]
  end

  subgraph AgentApps["Agent 应用编排层"]
    SemanticApp["Semantic Modeling Agent App"]
    AssetApp["Asset Governance Agent App"]
    QueryApp["Query Agent App"]
    DevApp["Data Dev Agent App"]
  end

  subgraph Runtime["平台级 Agent Runtime 层"]
    RuntimeService["AgentRuntimeService"]
    Router["RuntimeRouter"]
    Context["Context Pack / Evidence Pack"]
    Tools["Tool Registry"]
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
- 平台级 Agent Runtime 层负责 runtime 选择、生命周期、通用治理和可观测性。
- Runtime Adapter 层只负责连接具体 runtime，不携带业务状态写入逻辑。

## 4. 分层职责

| 层级 | 职责 | 不负责 |
|---|---|---|
| 业务模块层 | 产品入口、用户操作、业务状态展示 | runtime 生命周期、provider 差异 |
| Agent 应用编排层 | 业务 action、上下文构建、结果解释、业务校验 | 通用 runtime 路由、底层进程管理 |
| Agent Runtime 层 | 统一 contract、router、policy、trace、artifact、usage、错误码 | Cube 发布、资产画像入库、查询执行 |
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

正式查询执行仍走已发布 Ontology、Cube、Policy、ExecutionTicket 和 QueryExecutionWorker。Agent Runtime 只做推理和解释，不绕开治理执行面。

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

## 7. 统一 Contract

### 7.1 AgentRuntimeRequest

```python
@dataclass(frozen=True)
class AgentRuntimeRequest:
    run_id: str
    app_id: str
    action: str
    user_message: str | None
    context_pack: Mapping[str, Any]
    tools: Sequence["ToolSpec"]
    output_schema: Mapping[str, Any] | None
    runtime_policy: "RuntimePolicy"
    principal_context: Mapping[str, Any]
    idempotency_key: str
```

字段说明：

- `run_id`：平台生成的 runtime run 标识，用于审计、trace 和幂等。
- `app_id`：调用方，例如 `semantic_modeling`、`asset_governance`。
- `action`：业务 action，决定 runtime 路由和输出契约。
- `context_pack`：业务模块构建的上下文包，只读输入。
- `tools`：本次允许 runtime 使用的工具清单。
- `output_schema`：结构化输出约束。
- `runtime_policy`：超时、重试、preferred runtime、fallback、数据脱敏策略。
- `principal_context`：平台归一后的身份上下文，只用于授权和审计，不由用户请求体直接覆盖。
- `idempotency_key`：避免重复提交同一 runtime 任务。

### 7.2 AgentRuntimeResult

```python
@dataclass(frozen=True)
class AgentRuntimeResult:
    run_id: str
    runtime: str
    status: Literal["succeeded", "failed", "timeout", "blocked"]
    message: str | None
    structured_output: Mapping[str, Any] | None
    tool_calls: Sequence[Mapping[str, Any]]
    artifacts: Sequence[Mapping[str, Any]]
    usage: Mapping[str, Any]
    trace: Mapping[str, Any]
    error: Mapping[str, Any] | None
```

约束：

- `structured_output` 必须通过 `output_schema` 校验后才能交给业务应用层。
- `artifacts` 只能引用平台可控存储或 app-server 返回的 artifact 元数据，不能包含密钥。
- `tool_calls` 只记录已授权工具调用意图和结果摘要，不暴露敏感原文。
- `error` 使用平台统一错误码。

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

- OpenAI Agents SDK 不可用时，可按 action 降级到 OpenAI-compatible LLM runtime。
- Codex app-server 不可用时，不自动降级为 OpenAI 主链复审，除非 action 明确允许 `fallback_runtime=openai`。
- 发布、保存、执行查询、同步元数据等确定性动作不允许 runtime fallback。
- runtime 输出结构化校验失败时，不自动应用结果，只返回 `RUNTIME_INVALID_OUTPUT`。

### 8.3 强制策略

`RuntimePolicy` 支持：

- `preferred_runtime`
- `allowed_runtimes`
- `timeout_seconds`
- `max_runtime_seconds`
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
- Agent Runtime 层只负责统一封装、脱敏、hash、trace 和大小控制。
- runtime 不直接回查生产数据库，除非通过 Tool Registry 中被授权的只读工具。
- Evidence Pack 应记录 `source_refs`、`snapshot_id`、`generated_at` 和 `input_hash`，便于复现。

## 10. Tool Registry

Tool Registry 是平台级工具目录，但工具实现仍归属业务模块。

```mermaid
flowchart LR
  Runtime["AgentRuntimeService"] --> Registry["Tool Registry"]
  Registry --> SemanticTools["Semantic Tools"]
  Registry --> AssetTools["Asset Tools"]
  Registry --> QueryTools["Query Tools"]
  Registry --> GovernanceTools["Governance Tools"]
```

工具约束：

- 工具默认只读。
- 写操作必须拆成 proposal / patch / command preview，由业务服务二次确认。
- 工具声明必须包含 `tool_id`、`capability`、`input_schema`、`output_schema`、`side_effect_level`、`required_scopes`。
- Runtime Adapter 不能自行发明工具。

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

所有副作用必须由业务应用服务基于校验后的 `AgentRuntimeResult` 发起。

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

每次 runtime 调用必须记录：

- `run_id`
- `app_id`
- `action`
- `runtime`
- `principal_id`
- `context_hash`
- `output_hash`
- `tool_call_count`
- `artifact_count`
- `latency_ms`
- `usage`
- `status`
- `error_code`

Trace 存储建议分两层：

- 热路径：PostgreSQL 表记录 run 摘要、状态、错误和 usage。
- 冷路径：artifact 存储保存大上下文、长输出、文件 patch 和复审报告。

## 14. 安全与权限

- Runtime Request 的身份事实只能来自平台归一后的 `PrincipalContext`。
- 用户请求体中的角色、scope、tenant 不参与授权事实。
- Context Pack 默认脱敏，密钥、AccessKey、连接串和 token 不进入 runtime。
- Codex app-server 使用项目级隔离工作区和独立 `CODEX_HOME`。
- Runtime Adapter 不持有业务数据库写权限。
- 所有工具调用必须经过 `ToolRegistry + RuntimePolicy` 校验。

## 15. 配置建议

平台级配置：

```text
AGENT_RUNTIME_ENABLED=true
AGENT_RUNTIME_DEFAULT=openai_agents
AGENT_RUNTIME_TRACE_ENABLED=true
AGENT_RUNTIME_ARTIFACT_STORE=local
```

OpenAI runtime：

```text
AGENT_OPENAI_ENABLED=true
AGENT_OPENAI_API_KEY=...
AGENT_OPENAI_BASE_URL=...
AGENT_OPENAI_MODEL=...
AGENT_OPENAI_TIMEOUT_SECONDS=30
```

Codex app-server runtime：

```text
AGENT_CODEX_ENABLED=false
AGENT_CODEX_COMMAND=...
AGENT_CODEX_WORKSPACE_ROOT=...
AGENT_CODEX_PROJECT_ID=cubic3-data-platform
AGENT_CODEX_TIMEOUT_SECONDS=120
AGENT_CODEX_MAX_RUNTIME_SECONDS=600
```

旧配置迁移：

- `LLM_API_KEY` / `OPENAI_API_KEY` 可作为兼容读取，但新文档和 env sample 应逐步引导到 `AGENT_OPENAI_*`。
- `SEMANTIC_MODELING_CODEX_*` 不应作为长期平台配置名，迁移到 `AGENT_CODEX_*`。

## 16. 建议目录结构

```text
app/domain/agent_runtime/
  models.py
  ports.py
  errors.py

app/application/agent_runtime/
  runtime_service.py
  runtime_router.py
  context_pack.py
  tool_registry.py
  runtime_policy.py
  trace_service.py

app/infrastructure/agent_runtime/
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

- `domain/agent_runtime` 只放通用模型、端口和错误。
- `application/agent_runtime` 只放平台 runtime 编排，不引用具体语义、资产、查询实现。
- `infrastructure/agent_runtime` 放第三方 SDK、HTTP client、进程管理和本地工作区实现。
- 业务模块通过自己的 `Agent App` 适配平台 runtime。

## 17. 语义建模 Copilot 迁移设计

当前语义建模 Copilot 应迁移为第一个 consumer。

目标结构：

```mermaid
flowchart TD
  UI["/semantic/modeling-copilot"] --> Service["SemanticModelingCopilotService"]
  Service --> App["SemanticModelingAgentApp"]
  App --> Evidence["SemanticEvidenceBuilder"]
  App --> Runtime["AgentRuntimeService"]
  App --> Proposal["ModelingProposalService"]
  Proposal --> Gate["Publish Gate / Validation"]
```

职责调整：

- `SemanticModelingCopilotService` 继续负责 session、chat、artifact 投影和用户动作。
- `SemanticModelingAgentApp` 负责把建模业务 action 转换成平台 runtime request。
- `SemanticEvidenceBuilder` 统一构建资产、Cube、Ontology、校验结果和发布门禁证据。
- 当前 `modeling_copilot_runtime.py` 中的 LLM 调用、工具编排、确定性 fast path 应逐步拆出。

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

### Phase 1：平台 contract 与 fake runtime

- 新增 `app/domain/agent_runtime`。
- 定义 `AgentRuntimeRequest`、`AgentRuntimeResult`、`RuntimePolicy`、`ToolSpec` 和错误码。
- 新增 `AgentRuntimeService`、`RuntimeRouter`、fake adapter 和 trace stub。
- 补 unit tests，验证 contract、路由和错误码。

### Phase 2：迁移现有 LLM adapter

- 将当前语义私有 LLM adapter 迁移为 `OpenAICompatibleLLMRuntimeAdapter`。
- 如果采用真实 OpenAI Agents SDK，新增 `OpenAIAgentsSdkRuntimeAdapter`，不要复用误导性命名。
- 保持现有 Copilot 主链行为不变。
- 补回归测试，验证现有建模助手 session API 不变。

### Phase 3：语义建模 Agent App 化

- 新增 `SemanticModelingAgentApp`。
- 抽出 `SemanticEvidenceBuilder`。
- 让 Copilot service 通过平台 `AgentRuntimeService` 调用 runtime。
- 移除语义服务对具体 OpenAI adapter 的直接依赖。

### Phase 4：Codex app-server 接入

- 新增 `CodexAppServerRuntimeAdapter`、client、process manager。
- 支持 per-project workspace、project-level `CODEX_HOME`、timeout、artifact 和 run trace。
- 先只接入 `review_proposal` 和 `repair_validation_failure`。
- Codex 不参与低延迟主对话默认链路。

### Phase 5：第二个业务消费者验证复用

- 选择数据资产底座作为第二个 consumer。
- 接入 `asset.field.infer_semantics` 或 `asset.quality.explain_issue`。
- 验证 runtime contract 没有被语义建模私有概念污染。

### Phase 6：生产收口

- 补齐配置文档、runbook、OpenAPI 管理接口和可观测性。
- 增加 runtime run 列表、详情和 artifact 下载权限控制。
- 补充 live smoke 与 E2E。

## 20. 测试策略

### 单元测试

- Contract 序列化和 schema 校验。
- RuntimeRouter action 路由。
- RuntimePolicy 降级和阻断。
- ToolRegistry 权限校验。
- Adapter 输出结构校验。

### 集成测试

- 语义建模 Copilot 创建 session、生成候选、保存 Proposal 的现有链路不回归。
- OpenAI-compatible adapter 在无 API Key 时返回明确错误。
- Codex adapter 在未启用时返回 `RUNTIME_NOT_CONFIGURED`。
- fake runtime 可支撑本地 CI。

### E2E / Live Smoke

- OpenAI runtime live smoke：配置 API Key 后验证一次结构化输出。
- Codex app-server live smoke：验证进程 / server 可用、能返回 artifact、timeout 生效。
- 语义建模复审 E2E：生成 Proposal 后触发 Codex 复审，返回只读 review artifact。
- 数据资产二号消费者 smoke：字段语义推断只生成候选，不写正式资产事实。

## 21. 风险与应对

| 风险 | 应对 |
|---|---|
| 平台 runtime 抽象过大 | 第一阶段只实现 contract、router、trace、两个 adapter，不做 marketplace |
| 语义主链回归 | 先保持 Copilot session API 不变，迁移 adapter 后再抽 Agent App |
| Codex app-server 生命周期复杂 | 先 per-project local runtime，限定 review / repair 两类 action |
| 结构化输出不稳定 | 强制 output schema 校验，失败只返回错误，不应用 patch |
| 权限越界 | runtime 无写权限，所有副作用回到业务服务 |
| 配置混乱 | 新配置统一 `AGENT_*`，旧配置只做兼容读取 |

## 22. 工程原则落实

- KISS：统一一个 `AgentRuntimeService` 和一套 contract，避免每个模块独立造 runtime。
- YAGNI：第一阶段不建设 marketplace、复杂多租户 runtime 编排和跨产品 gateway 主链依赖。
- SOLID：runtime adapter 只负责 runtime 调用，业务 Agent App 负责业务语义，服务层负责状态和副作用。
- DRY：context、tool、policy、trace、错误码和 artifact 统一复用。

## 23. 完成判定

目标架构阶段性完成需要满足：

1. 语义建模 Copilot 不再直接依赖具体 OpenAI adapter。
2. OpenAI runtime 与 Codex runtime 都实现平台 `AgentRuntimePort`。
3. 至少两个业务消费者复用平台 `AgentRuntimeService`。
4. Runtime run 有可查询 trace、usage、artifact 和错误码。
5. 所有 runtime 输出都经过 schema 校验和业务服务二次确认。
6. 文档、配置样例、runbook 和 smoke 测试同步更新。

