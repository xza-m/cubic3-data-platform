---
doc_type: implementation-plan
status: proposed
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-22
relates_to:
  - architecture/decisions/ADR-016-ai-capability-switching-spec.md
  - architecture/agent-runtime-platform.md
---

# 底层 AI 能力切换 · 完整实施方案

> 规范(契约与纪律）见 [ADR-016](decisions/ADR-016-ai-capability-switching-spec.md)；目标态愿景见 [agent-runtime-platform.md](agent-runtime-platform.md)。
> **本文是可执行的完整方案**：目标形态 → 现状盘点 → 数据模型 → 后端/前端改造 → 分阶段交付（每阶段可独立上线/回滚）→ 验收。
> 定位：**上线后架构 track，不阻塞内网单机上线**；其中 P1 可先行。

## 0. 一句话

把"底层 AI 能力切换"收口成**一张配置页 + 一条调用主链**：页上半配「提供方（调用形态）」、下半配「模块调用关系」；所有业务模块只经**单一前门**按 `action` 路由到 provider，配置只有 C 层一份事实源。

## 1. 目标形态（已认可）

统一配置页（落在 `配置中心`），两段：

- **上半「提供方」**：每个 AI 后端一张卡 = 凭据/模型/超时 + 它能服务的**调用形态**（capability：同步补全 / 工具调用对话 / 异步 agentic run）。改模型/密钥只改这一处。
- **下半「模块调用关系」**：每个业务动作（action）一行 = 调用形态 + 默认提供方 + 能否切换。加动作 = 加一行，零代码。

三轴心智模型（ADR-016）：**capability**（做什么形态）· **provider**（谁来算）· **binding**（哪个 action 派给谁）。

## 2. 现状盘点（已核代码，✓=已具备 / △=部分 / ✗=缺）

| 面 | 项 | 状态 | 证据 / 缺口 |
|---|---|---|---|
| 后端契约 | 同步端口 `AgentInferenceRuntimePort.invoke` | ✓ | openai/codex/fake adapter 均实现 |
| 后端契约 | 异步 `CodexRunService.submit/poll` | ✓ | [codex_run_service.py:46](../../app/application/agent_inference_runtime/codex_run_service.py) |
| 后端契约 | `RuntimeActionBinding` 带 `kind`(sync/async) | ✗ | [types.py:113](../../app/domain/agent_inference_runtime/types.py) 无 kind；平面靠调用点硬编码 |
| 后端路由 | codex 注册进 router | ✗ **G1** | [container.py:510](../../app/di/container.py) 只 openai |
| 后端前门 | service 含异步平面 | ✗ | [service.py:11](../../app/application/agent_inference_runtime/service.py) 只 sync invoke |
| 后端消费 | 建模 Copilot 单句柄 | ✗ **G2** | [semantic_modeling_agent_app.py:54](../../app/application/semantic/semantic_modeling_agent_app.py) 持 runtime+run_service |
| 后端消费 | 会话/agent-loop 经前门 | ✗ **G3** | 直挂 [container.py:467/479](../../app/di/container.py) config.llm |
| 后端配置 | openai 单一事实源 | ✗ **G4** | config.llm 与 agent_openai 两份 |
| 管理 API | `GET /providers/status` | ✓ | [agent_runtime.py:305](../../app/interfaces/api/v1/agent_runtime.py) |
| 管理 API | `GET/PUT /providers/<r>/config` | ✓ | provider 配置可读写 |
| 管理 API | `GET /actions/<a>/binding` | △ | 只读；**无写**（模块关系不可在 UI 改） |
| 管理 API | test/logs/capabilities | ✓ | 已具备 |
| 数据 | binding 持久化可编辑 | ✗ | 代码写死在 `ActionRuntimeBindingRegistry`，非 DB |
| 前端 | 提供方页 | △ | [AgentRuntimeSettings.tsx](../../frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx) 已显示状态+连接测试；缺能力展示与 config 编辑 |
| 前端 | 模块关系表 | ✗ | 未建 |
| 前端 | API client/hooks | △ | [agent-runtime.ts](../../frontend/src/v2/api/agent-runtime.ts) 有 status/test/logs/capabilities；缺 config/binding 读写 |

**结论**：契约与管理 API 大半已在，缺口集中在「kind 字段 + 单前门异步平面 + 消费方収編 + 配置单源 + binding 可写 + 前端两段页」。是**收口接线**，非从零造。

## 3. 数据模型（C 层 management_config，唯一事实源）

复用既有 `RuntimeProviderConfigSnapshot`（已含 `secret_ref` 间接 + `to_public_dict` 脱敏）。新增 binding 持久化与 `kind`。

```yaml
ai_providers:                      # 上半页数据源（已有 GET/PUT config）
  openai_compatible:
    enabled: true
    base_url: ...
    secret_ref: "env:LLM_API_KEY"  # 复用既有间接引用，不入库明文
    model: gpt-4o
    capabilities: [completion, chat_tools]   # 调用形态(能力)声明
    timeout_s: 30
  codex:
    enabled: true
    workspace_required: true
    capabilities: [agentic_run]
    timeout_s: 600

ai_bindings:                       # 下半页数据源（需新增写接口 + 持久化）
  - {action: datachat.completion,          kind: sync,  default: openai_compatible, allowed: [openai_compatible], selectable: none}
  - {action: global_ask.intent_extract,    kind: sync,  default: openai_compatible, allowed: [openai_compatible], selectable: none}
  - {action: agent.loop,                   kind: sync,  default: openai_compatible, allowed: [openai_compatible], selectable: none}
  - {action: modeling.generate_candidates, kind: sync,  default: openai_compatible, allowed: [openai_compatible, codex], selectable: expert}
  - {action: modeling.review_proposal,     kind: async, default: codex,             allowed: [codex],            selectable: none}
  - {action: modeling.repair/audit,        kind: async, default: codex,             allowed: [codex],            selectable: none}
```

`RuntimeName` 维持封闭 Literal；新 provider（claude/local）走**扩 Literal**，不自由字符串化。

## 4. 后端改造（concrete）

详见 ADR-016 落地映射；要点：

1. **binding 加 `kind`**（[types.py](../../app/domain/agent_inference_runtime/types.py) `RuntimeActionBinding` + `action_binding.py` 各策略补 kind）。`ExecutionMode` 第 9 行已存在。
2. **前门长出异步平面**（[service.py](../../app/application/agent_inference_runtime/service.py)）：`invoke`(sync) + `submit_run/poll`(async)，用 `binding.kind` 做平面权威校验，注入 `run_service`。
3. **codex 注册进 router**（[container.py:510](../../app/di/container.py) adapters 列表加 `CodexSdkRuntimeAdapter`）→ 闭合 G1。
4. **消费方去双句柄**（[semantic_modeling_agent_app.py](../../app/application/semantic/semantic_modeling_agent_app.py) 去掉 `run_service` 参数，改调 `self._runtime.submit_run(...)`）→ 闭合 G2。
5. **会话/loop 改调前门**（conversation handler / `AgentLoopService` 带 `action` 调前门，不再直挂 config.llm）→ 闭合 G3。
6. **配置合一**（`config.llm` 与 `agent_openai` 指向同一条 `management_config.openai_compatible`）→ 闭合 G4。
7. **binding 写接口 + 持久化**（新增 `PUT /actions/<a>/binding`；binding 从代码写死迁到 management_config，`ActionRuntimeBindingRegistry` 改为从 C 层加载 + 代码兜底种子）。
8. **启动期自检**：遍历 binding，校验 default/allowed provider 已注册、enabled、supports(kind)；不满足启动失败（防 G1 复发）。

## 5. 前端改造

- **扩展** [AgentRuntimeSettings.tsx](../../frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx)（而非新建）为两段页：
  - 上半「提供方」：在现有状态/连接测试基础上，加**能力标签展示** + **config 编辑表单**（接已有 `GET/PUT /providers/<r>/config`）。
  - 下半「模块调用关系」：新表（接 `GET /actions/<a>/binding` 列表 + 新增 `PUT` 写），`selectable=expert` 行显示下拉。
- **API client** [agent-runtime.ts](../../frontend/src/v2/api/agent-runtime.ts)：补 `getProviderConfig/updateProviderConfig`、`listBindings/updateBinding`。
- i18n：新增文案走 `t()`（遵循门禁）。

## 6. 分阶段交付（每阶段独立可上线 + 可回滚）

| 阶段 | 内容 | 闭合 | 改动面 | 验收 | 回滚 |
|---|---|---|---|---|---|
| **P1** | codex 注册进 router | G1 | container.py ~8 行 | codex action 经 `select()` 命中 codex adapter；`make test-platform-agent-runtime` 绿 | 单 commit 回退 |
| **P2** | binding 加 kind + 前门异步平面 + Copilot 去双句柄 | G2 | types/action_binding/service/agent_app + container ~60 行 | Copilot review 经前门 `submit_run`；建模回归无降级 | 保留旧 run_service 注入灰度 |
| **P3** | 会话/agent-loop 収編前门 | G3 | conversation/agent_loop + container 中 | 问数/loop 经前门；DataChat 回归绿 | 旧 config.llm 直挂保留为 fail-open，灰度切 |
| **P4** | 配置合一 | G4 | container + runtime_config_service 中 | openai 只剩一条 management_config 记录；两入口读同源 | 回退 container 装配 |
| **P5** | binding 可写 + 持久化 | — | 新 PUT 端点 + registry 从 C 加载 ~中 | UI 改 binding 落库生效；启动自检通过 | registry 退回代码种子 |
| **P6** | 前端两段页 | — | AgentRuntimeSettings + api/hooks 中 | 配置页可看/改 provider + binding；i18n 门禁绿 | 前端 feature 隐藏 |
| **P7** | 全局问 intent 抽取接前门 | — | semantic_router + binding 一行 | `global_ask.intent_extract` 经前门；失败诚实兜底 | 退回过渡期 config.llm 挂法 |
| **P8** | 配置收尾：env 前缀 `LLM_*/AGENT_*`→`AI_*` | — | config_schema/env.sample/部署文档 | 文档同步、`make verify-docs` 绿 | 独立末步，单独回退 |

> **过渡期**：全局问 intent 抽取若在 P7 前需要，按 ADR-016 先挂 `config.llm`（默认关 `SEMANTIC_ROUTER_LLM_INTENT_ENABLED`，零回归），P7 再迁到前门。

## 7. 整体验收

- 任一 action 的 runtime 由 binding 唯一裁决；消费方只持前门一个句柄。
- openai 凭据/开关只在 C 层一条记录；`config.llm` 仅作 bootstrap 种子。
- 配置页可读/改 provider 与 binding，改动落库即生效。
- `make test-platform-agent-runtime` + 会话/loop/建模回归全绿；前端 i18n/tokens/lint/test:unit 绿。

## 8. 风险与回滚

- 每阶段独立提交、独立回滚；P2/P3 保留旧直挂为 fail-open 灰度，降低收編风险。
- P8 env 改名为大爆破，置于最后、单独、带 env.sample/部署文档同步。
- 守"简单队列+状态回写"：前门不接管 codex run 生命周期，仍委托 `CodexRunService`，不升级为工作流引擎。

## 9. 不做什么（scope guard，来自 ADR-016）

- 不新建 `AICapability` 枚举 / `SyncInferencePort`·`AgenticRunPort` 端口族 / `AIGateway` 上帝类。
- embedding / structured_output / failover 逻辑 / claude provider —— 留扩展点，待真实需求再做。
- 不引入 provider 注册中心/网关中间件等重型设施；前门是进程内 application 服务。
- 不在内网单机上线前启动本 track（P1 除外，可先行）。
