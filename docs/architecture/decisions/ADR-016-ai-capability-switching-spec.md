---
doc_type: adr
status: proposed
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-22
---

# ADR-016 底层 AI 能力切换规范（capability / provider / binding 三轴 · 单前门 · 双平面）

## 状态

**Proposed**，2026-06-22 起草。本 ADR 固化「AI 能力切换」的**契约与纪律**；其**增量落地步骤**见配套 [agent-runtime-unification-track.md](../agent-runtime-unification-track.md)（6 步迁移表）。两者关系：ADR = 规范（改什么不可违反），track = 执行（按什么顺序改）。目标态愿景见 [agent-runtime-platform.md](../agent-runtime-platform.md)。

> 本规范经「多视角设计 + 对抗式审查」产出，并对审查的承重断言逐条核代码验证（见下文 file:line）。审查驳回了初版的过度工程（新造 capability 枚举、两族新端口、AIGateway 上帝类、为投机能力建地基），本 ADR 采纳其**降配结论**：概念三轴用于推理，实现一律复用既有构件。

## 背景

平台当前有**三套并行 AI 调用路径 + 两套 openai provider 配置**，"模块自由选 codex/openai" 的原设计只接了一半。已核实缺口（file:line 属实）：

- **G1** router 只注册 openai，`CodexSdkRuntimeAdapter` 未进 adapters 列表（[container.py:510](../../../app/di/container.py)）。
- **G2** 消费方 `SemanticModelingAgentApp` 同时持 `runtime`(openai router) + `run_service`(codex) 两句柄、自行分流（[container.py:1070-1071](../../../app/di/container.py)），per-action 仲裁被旁路。
- **G3** 会话 / Agent loop 不经统一层，直挂 `config.llm`（[container.py:467/479](../../../app/di/container.py)）。
- **G4** 同一 openai provider 被配置两次（`config.llm` 与 `agent_openai`/`openai_compatible`），开关碎成两档。

既有可复用构件（核实存在，初版设计曾遗漏）：

- `RuntimeName = Literal["openai_agents_sdk","openai_compatible","codex_sdk","fake"]`（[types.py:8](../../../app/domain/agent_inference_runtime/types.py)）—— 封闭枚举，**新 provider 走扩 Literal，不可自由字符串化**。
- `RuntimeProviderConfigSnapshot.secret_ref` + `to_public_dict()` 脱敏 + `_mask_sensitive_values`（[types.py:185-234](../../../app/domain/agent_inference_runtime/types.py)）—— secret 间接引用与脱敏**已具备**，不另造 `secret://`。
- **codex 有两个实现**：`CodexSdkRuntimeAdapter.invoke`（同步，[codex_adapter.py:42](../../../app/infrastructure/agent_inference_runtime/codex_adapter.py)）与 `CodexRunService.submit/poll`（异步，[codex_run_service.py:46](../../../app/application/agent_inference_runtime/codex_run_service.py)）。即 codex 同时能服务同步与异步两个平面。
- `ActionRuntimeBindingRegistry`（[action_binding.py:48](../../../app/application/agent_inference_runtime/action_binding.py)）的 `fixed_openai` / `fixed_codex` / `expert_debug` 三策略已在跑。

## 决策

### §1 概念三轴（推理用心智模型，命名写死，禁止互相内联）

任何 AI 调用都用且只用三个正交概念定位：

| 轴 | 回答 | 落到代码 |
|---|---|---|
| **capability（能力·形态）** | 做什么形态的活，决定同步/异步契约 | 不新建枚举；用 binding 上一个 `kind ∈ {sync, async_run}` 字段表达 |
| **provider（提供方·实现）** | 谁来算、用什么凭证 | 既有 `RuntimeName` Literal + 既有 adapter；新 provider 扩 Literal |
| **binding（绑定·策略）** | 某 action 派给哪个 provider、能否切换 | 既有 `ActionRuntimeBindingRegistry` |

**边界铁律**：provider 不写死 action；binding 不写死契约；capability/kind 不绑厂商。
**关键裁决**：同步/异步是 **action 的 kind 属性**（写在 binding 上），不是 provider 属性 —— 故"codex = 异步"的现状混淆作废（codex 同步异步两个适配器都在）。

> 对比初版：**不**引入 `AICapability` StrEnum（含 embedding / structured_output 等未落地值）。`kind` 是 binding 上的一个字段，不是新维度。

### §2 契约：复用既有两个平面，不新建端口族

- **同步平面** = 既有 `AgentInferenceRuntimePort.invoke(req) -> Result`（openai / codex_sdk / fake adapter 都已实现）。
- **异步平面** = 既有 `CodexRunService.submit/poll/artifact`（长跑 agentic run）。

**不新建** `SyncInferencePort` / `AgenticRunPort` / `domain/ports/ai/`。两平面已分立在跑，规范只是**正式命名**它们为两平面，并要求 binding 的 `kind` 决定走哪个。

### §3 切换模型：单前门 + action 为键 + 单一裁决者

- **单前门** = 扩展既有 `AgentInferenceRuntimeService`，对外暴露两个入口：`run_sync(action, req, ctx)`（同步平面）与 `submit_run(action, req, ctx)` / `poll` / `artifact`（异步平面）。**消费方只注入这一个服务句柄**。
- **切换键 = action**（承载 per-action 策略）；**裁决者 = `ActionRuntimeBindingRegistry`（唯一）**。
- 裁决链（无旁路）：`binding = registry.get(action)` → `kind` 定平面、`provider = pick(binding, ctx, override)` → 校验 `provider 已注册且支持该 kind` → 路由。`pick` 把 `expert_debug` 的"专家可选"语义收进 registry（`selectable=expert_only` 且 `ctx.mode=expert` 才允许 override），不散落到消费方。UI 是否显示切换器 = 读 `binding.selectable`。

**闭合**：G1（codex 同步 adapter 注册进 router；异步经同一前门暴露）/ G2（建模 Copilot 只持前门，sync/async 分流上移到 service）/ G3（会话/loop 改调前门）。

### §4 配置：单一事实源，复用既有机制消除 G4

- **C 层 `management_config`（UI/DB）= 唯一事实源**。`config.llm` 与 `agent_openai`/`openai_compatible` **指向同一条 `openai_compatible` provider 记录**（先消 G4 的"两份"，这是 track Step5 第一动作）。
- **secret 复用既有 `secret_ref`**（`env:AGENT_OPENAI_API_KEY` 间接 + `to_public_dict` 脱敏），**不引入 `secret://`、不新建 secret 设施**。
- **A 层 env 降为 bootstrap 种子**（仅当 C 层为空时播种一条默认 openai_compatible），不再被运行时直接读作 provider 配置。
- **env 前缀大改名（LLM_*/AGENT_* → AI_*）推迟**为最后、独立、带 `env.sample` 同步的一步（避免大爆破，保回滚粒度）。

### §5 失败与降级（语义在前门一处，消费方只做语义兜底）

- 统一异常族（domain）：`AIProviderUnavailable` / `AITimeout` / `AIBadOutput` / `NoCapableProvider` / `ProviderNotAllowed`。消费方**只接这一族**，不接厂商 SDK 原生异常。
- 技术降级集中在前门：超时/5xx 经既有 `tenacity` 重试；4xx/坏输出不重试（保低延迟）。**failover 暂不实现**——当前多数 binding 的 allowed 仅单 provider，无 failover 目标；先在 binding 留 `fallback` 字段占位，待第二个同 kind provider（如 claude）落地再实现逻辑。
- 语义兜底归消费方：全局问意图抽取失败 → 退回纯问题/grounding 诚实兜底（沿用既有决策 [[qa-scope-mismatch-global-ask]]）；DataChat 返回"AI 暂不可用"不崩；agent.loop 把失败作为一步结果回写状态（守"简单队列+状态回写"）。

### §6 可观测与护栏（前门是唯一调用点，天然埋点中心）

- trace_id 沿用既有 request 上下文（[app/__init__.py](../../../app/__init__.py)），贯穿 sync 与 async（异步绑到 run handle）。
- 结构化日志（[logger.py](../../../app/shared/utils/logger.py)）字段：`{trace_id, action, kind, provider_selected, provider_override?, mode, latency_ms, retries, outcome, token_usage?}`。audit 复用 `management_config` 同库，不新建设施。
- **启动期自检（防 G1 复发）**：container 装配后遍历 bindings，校验每条 `default`/`allowed` 引用的 provider 均已注册、enabled、支持该 `kind`；不满足则启动失败/告警。把"实现了端口却没注册"从隐性运行期错误提前到启动期。

### §7 反模式清单（ADR + review 检查项）

1. 禁止消费方持多个推理句柄并自行分流（G2）—— 只注入前门一个入口；sync/async 分流只能在前门/registry。
2. 禁止任何路径绕过前门直挂 `config.llm` 或自建 SDK client（G3）。
3. 禁止同一 provider 配置出现两个事实源（G4）—— openai 凭据/开关只在 C 层一条记录。
4. 禁止实现了端口却不注册进候选（G1）—— 由启动期自检兜住。
5. 禁止用同步 `invoke` 硬塞异步 run 形态（正是 G2 旁路的成因）。
6. 禁止把同步/异步当 provider 属性 —— `kind` 写在 binding。
7. 禁止 provider adapter 里硬编码 `if action == ...` —— 路由只属于 binding/前门。
8. 禁止为新 action 改前门/registry 代码 —— 新 action 应是 C 层数据新增。
9. 禁止消费方吞 AI 异常或直接接 SDK 原生异常 —— 只接统一异常族。
10. 禁止在 blueprint/handler 私自组装 provider/binding —— 一律经 `app/di/container.py`。
11. 禁止为内网单机引入 provider 注册中心/网关中间件等重型设施 —— 前门是进程内 application 服务，不是独立服务。

## 落地映射（执行见 track 6 步）

| 现状 | 规范态 | 动作 |
|---|---|---|
| S1 `OpenAIService` | openai_compatible provider · 同步平面 `invoke(kind=sync)` | 折叠为 provider 内部实现；会话改调前门 |
| S2 `OpenAICompatibleAdapter` | 同上 provider · 同步平面 | 与 S1 合一；AgentLoop 改调前门 |
| S3 `agent_inference_runtime` | 升级为单前门 + 裁决链 | router+registry 合并入 service；binding 加 `kind` 字段 |
| `CodexSdkRuntimeAdapter`(invoke) | 同步平面 codex adapter | **注册进 router**（闭合 G1） |
| `CodexRunService`(submit/poll) | 异步平面 | 经前门 `submit_run` 暴露；不接管 run 生命周期（守"简单队列+状态回写"） |
| `config.llm` + `agent_openai` | C 层单条 openai_compatible | 指向同一记录（闭合 G4） |
| 全局问 intent 抽取 | 新 binding `global_ask.intent_extract`（completion/sync, fixed openai, fallback=false） | 过渡期先挂 config.llm 默认关，落到 track Step6 接前门 |

## 未决（建议默认已给，需你拍板）

1. **同步端口形态**：单一 `invoke(req{kind})`（默认，对齐现状、零重写、加同步能力不改签名）vs 按能力拆多方法（IDE 强类型，但加能力要改端口）。**建议默认：单 invoke**。
2. **新 provider 类型扩展**：扩 `RuntimeName` Literal（默认，保静态约束）vs 改 registry 自由 slug（破坏现有类型）。**建议默认：扩 Literal**。
3. **failover/secret 时机**：failover 逻辑推迟到第二个同 kind provider 落地；secret 复用 `secret_ref`。**建议默认：如上，无需现在动**。

## 推迟（明确不做，避免过度工程）

- `AICapability` 5 值枚举、`SyncInferencePort`/`AgenticRunPort` 新端口族、`AIGateway` 上帝类 —— 不建。
- embedding / structured_output 能力 —— 待真实需求出现再加（同步平面只需在请求体加字段 + provider `supports` 声明）。
- failover 逻辑、env 前缀大改名 —— 见 §4/§5，留占位、最后做。

## 后果

- **正面**：开关合一、消费方单句柄、codex 真正可路由、配置单源、新 action 零代码、可观测集中、纪律可 review/lint。
- **代价**：binding 增 `kind` 字段与单前门改造需碰会话/loop/Copilot 三处消费方（track 已拆成可独立回滚的步骤）。
- **守约**：复用既有 port/registry/secret/RuntimeName，不新建框架、不引入新基础设施，符合 CLAUDE.md「不做架构翻新 / 内网单机 / 先稳后扩」。
