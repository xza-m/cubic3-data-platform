---
doc_type: architecture-track
status: proposed
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-22
relates_to:
  - architecture/agent-runtime-platform.md
  - architecture/decisions/ADR-015-modeling-assistant-agent-copilot.md
---

# 推理 Runtime 统一收口 Track（`agent_inference_runtime` 单前门）

> 统一目标态愿景已定义在 [agent-runtime-platform.md](agent-runtime-platform.md)（统一 `AgentInferenceRuntimeService`、action binding、openai/codex 双 runtime）。
> **本文不重述愿景**，只记录「目标态 vs 当前实现」的真实缺口，给出增量收口计划，供上线后架构 track 立项。

## 状态

**Proposed** —— 属上线后架构 track，**不阻塞当前内网单机上线**。符合 CLAUDE.md「当前阶段不做大规模架构翻新」：本 track 是把已有抽象**补全/收口**，不是重写。

---

## 1. 背景：愿景已实现一半，三处缺口让"模块自由选 codex/openai"目前不成立

`agent-runtime-platform.md` 的 Implementation Status（2026-05-29）声称统一 runtime + 两个 consumer 已接入。核对代码后，**统一模块确实存在且部分承载**，但有三处实现缺口，使得"任意模块按 action 自由选 openai/codex"这个核心目标**当前并未真正生效**：

| # | 缺口 | 证据 | 后果 |
|---|---|---|---|
| G1 | **router 只注册了 openai adapter** | [container.py:510](../../app/di/container.py) `adapters=providers.List(agent_openai_runtime_adapter)`；`CodexSdkRuntimeAdapter` 已实现同一端口却未注册 | `AgentInferenceRuntimeRouter.select()`（[router.py:24](../../app/application/agent_inference_runtime/router.py)）永远路由不到 codex |
| G2 | **codex 走旁路，不经 router** | `SemanticModelingAgentApp` 同时拿 `runtime=agent_inference_runtime_service` 和 `run_service=codex_run_service`（[container.py:1070-1071](../../app/di/container.py)） | per-action openai/codex 仲裁被旁路：消费方靠"握两个句柄"自己分流，而非 binding registry 统一裁决 |
| G3 | **平台核心问数/Agent loop 根本不走统一模块** | 会话 `OpenAIService`（[container.py:467](../../app/di/container.py)）+ DataAgent `OpenAICompatibleAdapter`（[container.py:479](../../app/di/container.py)）都直挂 `config.llm`(`LLM_PROVIDER`)，与 runtime 模块无关 | 真正高频的消费链（问数、agent loop）完全在统一开关之外 |

**净结论**：统一 runtime 目前只覆盖「建模 Copilot / 数据资产」两个 Agent App，且即便在这里 codex 也只是侧挂句柄；平台的核心问数/agent-loop 在另一套 `LLM_PROVIDER` 配置上。开关碎成两档（`config.llm` 与 `agent_openai`/`AGENT_CODEX_ENABLED`）。

## 2. 现状全景：三套推理路径 + 两套 openai provider 配置

| 栈 | 实现 | 端口/形状 | 配置开关 | 消费方 | 经统一 router? |
|---|---|---|---|---|---|
| **S1** | `OpenAIService` | `chat_completion`/`generate_sql` | `LLM_PROVIDER`(config.llm) | 会话/DataChat（[1469](../../app/di/container.py)） | ❌ |
| **S2** | `OpenAICompatibleAdapter` | `ILLMPort.chat→LLMResponse` | `LLM_PROVIDER`(config.llm，同 S1) | AgentLoopService（[930](../../app/di/container.py)） | ❌ |
| **S3** | `agent_inference_runtime`（router + openai adapter） | `AgentInferenceRuntimePort.invoke` | `agent_openai`/management_config | 建模 Copilot（[1070](../../app/di/container.py)）、数据资产（[693](../../app/di/container.py)） | ✅（仅 openai） |
| **Codex** | `CodexSdkRuntimeAdapter` / `codex_run_service` | 异步 run（submit/poll/artifact） | `AGENT_CODEX_ENABLED` | 同上 Agent App，**侧挂 `run_service`** | ❌（旁路） |

## 3. 关键设计决策（先定，再迁移）

端口 `AgentInferenceRuntimePort.invoke()` 是**同步单次推理**，而 codex 是**异步长跑 run**（submit/poll/artifact）。统一时必须先定边界，两个选项：

- **(A) 双平面收口（推荐）**：
  - **同步补全平面** = openai-compatible（会话、agent loop、候选生成、字段语义、全局问意图抽取）统一走 `router.select()→invoke()`。
  - **agentic-run 平面** = codex（review/repair/audit/workspace）保持 submit/poll 形态，但**也由 `ActionRuntimeBindingRegistry` 统一声明**（哪些 action 属 codex），消费方通过**单一 service 入口**拿到正确平面，而不是自己握两个句柄。
  - 现有 binding registry 的 `requires_connection`/`fixed_codex`/`fixed_openai`（[action_binding.py:48](../../app/application/agent_inference_runtime/action_binding.py)）已经编码了这个边界，几乎不用改策略，只需把"分流"从消费方上移到 service。
- **(B) 单端口吞两形态**：让 `invoke()` 同时表达同步/异步 run。更"纯"但改动大、风险高，不符合"不翻新"。

→ **采用 (A)**。

## 4. 增量迁移步骤（每步可独立交付 + 验证，随时可停）

| Step | 动作 | 文件 | 价值 | 风险 |
|---|---|---|---|---|
| **1** | `CodexSdkRuntimeAdapter` 注册进 router 的 adapters 列表 | container.py:508-512 | `select()` 真能路由 codex，**你原设计立刻通**（最小一刀） | 低 |
| **2** | 把 codex 分流从 `SemanticModelingAgentApp`(握两句柄)上移到 service：消费方只持 `runtime_service`，按 action 由 router 决定 openai/codex 平面 | semantic_modeling_agent_app.py、container.py:1069-1073 | 消除 G2，单前门 | 中 |
| **3** | 会话 S1 收编：`send_message_handler` 改经 `runtime_service`，action=`conversation.answer` | conversation handlers、container.py:1469 | 消除 G3（问数进统一开关） | 中 |
| **4** | Agent loop S2 收编：`AgentLoopService` 改经 service，action=`agent.loop_step` | agent_loop、container.py:930 | 消除 G3 | 中 |
| **5** | 配置收敛：`LLM_PROVIDER`/`AGENT_CODEX_ENABLED` 退化为「binding(选 runtime) + 各 runtime provider 配置」 | config_schema.py、container.py、env.sample | 两档开关合一 | 中 |
| **6** | 新 action `semantic_router.intent_extract`→openai(低延迟)，全局问意图抽取作为统一模块消费方 | action_binding.py、semantic_router | 新功能即新 binding，无 bespoke 开关 | 低 |

> Step 1 可单独先做（小、低风险、补全你原设计）；Step 2-5 是真正的收口主体，建议成块排期；Step 6 依赖前序，亦可在过渡期先挂 `config.llm`（见下）。

## 5. 与"全局问 LLM 意图抽取"的关系（过渡建议）

全局问 intent 抽取**不要绑在本 track 上**。过渡期先挂 `config.llm`（与 S2 同源、默认关 `SEMANTIC_ROUTER_LLM_INTENT_ENABLED=false`、零回归）；本 track 落到 Step 6 时再改为 action binding 接入统一 service。避免把小功能押在大重构上。

## 6. 验收标准

- 任一 action 的 runtime 由 `ActionRuntimeBindingRegistry` **唯一裁决**；消费方不再持有多个 runtime 句柄。
- openai 补全类调用 100% 经 `agent_inference_runtime_service`；`config.llm` 仅作为 openai runtime 的 provider 配置存在，不再被业务直挂。
- codex run 由 binding 声明、经统一 service 入口取得。
- `make test-platform-agent-runtime` 全绿 + 会话/agent-loop 回归无降级。

## 7. 风险与回滚

- 每步独立提交、独立可回滚；S1/S2 收编保留旧 provider 直挂作为 fail-open 兜底，灰度切换。
- 配置收敛（Step 5）需同步 `env.sample` 与部署文档，最后做。

## 8. 不做什么（scope guard）

- 不引入 agent marketplace、不把 codex 当普通 LLM provider（沿用 [agent-runtime-platform.md](agent-runtime-platform.md) §2.2 非目标）。
- 不在内网单机上线前启动本 track；不为收口顺带翻新语义/发布链路。
- 设计决策 (A) 一旦落地，应补一条 ADR-016 固化"推理 runtime 双平面单前门"，本文档届时降级为执行记录。
