# 意图理解段（L1 Intent Understanding Layer）技术设计方案

**status:** draft（待评审 / 可后续升格 ADR-017）
**created:** 2026-06-28
**owner:** 语义中心 / DataAgent
**scope:** `app/application/semantic_router/`（L1 意图理解段）；不改 L2 编译/治理/执行脊柱

---

## 1. 背景与问题

平台「Agent → 语义中心 → SQL」整条管线已确定性落地，且整体架构（NL → 结构化语义请求 → 确定性编译器出 SQL，**不裸写 SQL**）正是业界最强共识。缺口**只在 L1「意图理解 / 路由」这一段**：当前实现是

- **意图分类**：硬编码关键词表 `keyword in question`（`preview_service.py:27-29, 121-123`，`_KNOWLEDGE/_ANALYSIS/_TOOL_KEYWORDS`）；
- **资产命中**：实体名 `_normalize(candidate) in normalized_question` 子串包含，**首命中即返回、无打分、无置信度、无消歧**（`_match_metric/_match_object/_match_relation/_match_action`，`preview_service.py:1007-1173`）；
- **LLM 抽取**：`llm_intent_extraction.py:28-65` 仅产「规范术语词袋」拼到匹配文本（`_expand_question`，`preview_service.py:58-69`），**默认关**（`SEMANTIC_ROUTER_LLM_INTENT_ENABLED=false`），开了也无 grounding。

对程序化 **Agent** 调用，这套精度不足，失败模式：口语不在词表→整类意图丢失；必须字面命中资产名；短名子串误命中；首命中不消歧、无置信度；失败统一坍缩成一句 blocked 文本，Agent 不可消费。

> 这段在架构文档上是**空白**（`agent-ready-semantic-governance.md` 把 Router 当「复用、不重做」的黑盒）。本文补上它的正式设计。

## 2. 业界依据（2026 调研，带量化）

把 NL 落成「对受治理语义层的结构化查询」而非裸 SQL 是跨厂商共识，且有硬数据：dbt 内测 NL 准确率 **83%（语义层）vs ~40%（裸 SQL）**、2026 基准 **98-100%**；AtScale **92.5% vs 20%**；Looker 数据错误**降约 2/3**；Snowflake Cortex Analyst **90%+**；BIRD 单模型 SOTA ~80% vs 人类 92.96%，企业级 schema（Spider 2.0）GPT-4 仅 **~6%**。

收敛的工程做法（本设计采纳的部分）：

1. **LLM 只「选」不「写」**：从已发布白名单做有界选择/填槽，SQL 交确定性编译器。（Cube structured request / AtScale Inbound Query / Looker Looker-Query）
2. **语义层即 grounding/guardrail**：候选钉死在已定义成员集合，治理在**编译期**注入。（Cube：agent never writes raw SQL）
3. **意图分类是独立前置段 + 置信打分**，非首命中关键词表。（LinkedIn SQL Bot intent classification）
4. **置信门控三态 + 结构化澄清/诚实兜底**：低置信回建议问题/追问而非硬猜；**主闸用检索相似度，LLM verbalized confidence 过自信不可裸用**。（Cortex Analyst「建议替代问题」、LinkedIn quick-replies）
5. **validation sandwich**：JSON-mode 只保结构不保语义，抽取后必须二次校验成员合法。（Instructor 模式）
6. **单步结构化优先，非 ReAct**：良定义任务用单次带检索的结构化调用，证明有收益再加复杂度。（Uber QueryGPT、Anthropic）
7. **有界 self-correction（≤2）**：首遍收益最大、之后强烈递减；优先用编译期错误驱动修复。（LinkedIn EXPLAIN self-correction）
8. **开 LLM 前必须有离线 eval**：golden 集 + DSL 级确定性断言为主，LLM-as-judge 仅辅助。（Genie Benchmarks、LinkedIn 130 题集）

**明确反模式（本设计不做）**：裸 text-to-SQL / 从 Ontology 直产 SQL；全量 schema 塞 prompt；外部向量库集群；多 agent 自洽投票（CHASE-SQL 证「最一致≠最正确」）；CHASE-SQL/ReFoRCE 式训练选择器；ReAct 开放循环 / 无界自纠；LLM-judge 当主指标；prompt 口头护栏；裸用 verbalized confidence；必填槽强制模型填。

来源：Cube `semantic-layer-for-ai-agents-2026`、dbt MetricFlow、Looker(Google Cloud blog)、Snowflake Cortex Analyst、Databricks Genie trusted assets、LinkedIn SQL Bot engineering blog、Uber QueryGPT、CHASE-SQL(arXiv)、BIRD/Spider 2.0、aurelio semantic-router、Instructor。

## 3. 设计原则（落到本平台约束）

- **L1 只选已发布资产**：候选 `target_asset` = official active manifest 已发布 candidate，编进 LLM 输出的取值域，从协议层守 L1→L2 纪律（不从 Ontology 直产 SQL、不扫物理表）。
- **复用单前门，零新框架**：所有 LLM 调用经 `AgentInferenceRuntimeService`（ADR-016），不新增 provider/端口/枚举。
- **内网单机、反过度工程**：召回起步纯关键词/BM25；不引向量库集群/分布式/ReAct/多 agent。
- **诚实兜底是下界（已落地），澄清是其上一层**：失败表现为「答不了/请澄清」而非「自信给错数」。
- **先 eval 后开关**：无 golden 集不置 `SEMANTIC_ROUTER_LLM_INTENT_ENABLED=true`。
- **关闭态零回归**：env 关时行为与今天逐字节等价。

## 4. 目标管线（L1 段重设计）

```
① 候选召回(新,8.3)      关键词/BM25 → top-N 已发布候选
② 结构化意图抽取(新)    单前门 invoke()+output_schema JSON-mode → IntentExtraction 槽位+置信
③ grounding 校验(新)    validation sandwich：成员必须命中 active manifest 已发布 candidate + 最小长度护栏
④ 置信门控·三态(新)     高→编译执行 ｜ 中(缺必填槽/top-2 接近)→澄清 ｜ 低/绑不到→诚实兜底
⑤ 生成 QueryDSL(复用)   ExecutionCompilerPreviewService._build_query_dsl
⑥ 有界编译自纠(新,8.3)  QueryCompiler 编译期校验 → 喂错误改 DSL（≤2 次，不调远程）
⑦ 治理+执行(复用)       post_compile RLS → dw-query-gateway
```

⑤⑦ 已稳（L2 脊柱），本设计只新增 ①②③④⑥；其中 **8.2 MVP = ②③④ + eval**，**8.3 增强 = ① + ⑥ + 可信问法库 + 澄清出口**。

## 5. 详细技术设计

### 5.1 `IntentExtraction` 结构（②的输出契约）

新增领域结构（纯 dataclass，放 `app/domain/semantic_router/intent.py` 或就近 `semantic_router/`）：

```python
@dataclass(frozen=True)
class IntentExtraction:
    intent_type: str            # "analysis" | "knowledge" | "tool"
    target_asset: str | None    # 已发布 candidate 的 asset_key/name；找不到 None
    metrics: list[str]          # 取自候选；找不到留空
    dimensions: list[str]
    time_range: dict | None     # {"kind":"last_n_days","n":7} 等
    filters: list[dict]
    order_by: str | None
    missing_slots: list[str]    # 模型自报缺槽 → 触发澄清
    confidence: float           # 模型自评（辅助信号，非主闸）
```

**槽位一律 Optional / 可空 / 默认空**——让模型「找不到留空」，不强制填（防幻觉垃圾）。

### 5.2 LLM 调用：经单前门 `invoke()`（Option A，已验证路径）

模板照 `app/application/semantic/data_asset_agent_app.py:34-60`。新增 `IntentExtractionService`（升级现 `llm_intent_extraction.py`），注入**前门 service**（非现在的 `complete_fn`）：

```python
request = AgentInferenceRuntimeRequest(
    app_id="semantic_router",
    action="global_ask.intent_extract",      # 默认 binding=openai_compatible/sync（action_binding.py:77-83）
    runtime_context_ref=RuntimeContextRef(project_id="cubic3-data-platform",
        session_id=plan_id, thread_id=plan_id, turn_id="intent_extract"),
    principal_id=principal_id,
    input={"question": question},
    context_pack={                            # ← schema 字段 + 候选 enum 放这里（adapter 只透传 output_schema 名）
        "output_schema_fields": INTENT_SCHEMA_DESC,   # IntentExtraction 字段说明
        "candidate_assets": candidate_keys,           # active manifest 已发布候选（含 name/title/aliases）
        "instructions": "只能从 candidate_assets 选 target_asset/metrics/dimensions；找不到留空，不要编造",
    },
    output_schema="global_ask.intent_extract.output.v1",
    runtime_policy=RuntimePolicy(max_runtime_seconds=20),
    preferred_runtime="openai_compatible", execution_mode="sync",
    semantic_runtime_pin=None, asset_revision_refs=[],
)
raw = self._runtime.invoke(request).structured_output   # adapter 已 response_format=json_object + json.loads
```

**关键事实（已核实）**：adapter（`agent_inference_runtime/openai_compatible_adapter.py:78-90`）把 `{action,input,context_pack,output_schema}` JSON 序列化喂 LLM，`response_format={"type":"json_object"}`，`json.loads`→`structured_output` dict。`output_schema` 仅作字符串名透传，**字段定义必须由我们放进 `context_pack`**。

**fallback-safe**：`invoke()` 抛 `AgentInferenceRuntimeError`（超时/未配置/非 JSON）→ 捕获 → 返回 `None`/空意图 → 退回 ③ 之后的确定性兜底，关闭态零回归。

### 5.3 grounding 校验（③，validation sandwich）

LLM 产物**不可信任结构即语义**。校验：

1. `target_asset`/`metrics`/`dimensions` 的每个值，`_normalize`（`preview_service.py:18-19`）后必须命中 **active manifest 已发布 candidate**（真值源 `RuntimeSemanticCatalog.from_manifest`，现 `preview_service.py:698 _runtime_catalog`；candidate = metric/object/relation/action 的 name·title·aliases + glossary term·canonical·aliases）；
2. **最小长度护栏**：`len(_normalize(term)) < MIN_GROUND_LEN`（建议 2）的短词不参与模糊命中，只允许精确相等（防「量」「数」污染）；
3. 命不中的成员**剔除**并记入 `missing_slots`/降置信；全部命不中 → ④ 走兜底。

输出：`GroundedIntent{ grounded_target, grounded_metrics[], grounded_dimensions[], ground_hit_ratio }`。`ground_hit_ratio` 是门控主信号之一。

### 5.4 置信门控三态（④）

**主闸 = grounding 命中度（确定性、可靠）**，LLM `confidence` 仅作次级修正（过自信，不裸用）：

- **高**（`ground_hit_ratio≥τ_high` 且有 `target_asset`+至少 1 metric）→ 构建 QueryDSL 走 ⑤；
- **中**（缺必填槽 / 多候选 grounding 分接近 `δ` / `τ_low≤ratio<τ_high`）→ **澄清**：返回结构化 `{clarification: {missing_slots, candidates[]}}`，每轮最多问 1 项（8.2 可先只返回候选列表，澄清问句生成留 8.3）；
- **低**（`ratio<τ_low` 或无可绑 target）→ 复用 Phase 8.1 `_build_unanswerable_fallback`（`source='fallback'`）。

阈值 `τ_high/τ_low/δ` **由 §6 eval 的 coverage-accuracy 曲线标定**，不拍脑袋；代码留常量 + 可配。

### 5.5 与现有 `route()` 的集成点

- `route()`（`preview_service.py:71-373`）保持**确定性主体作为 fallback**：env 关 或 LLM 失败 时，行为=今天。
- env 开时：在 `_expand_question` 之处改为「调 ②③④」——若 ④ 判高置信，用 `GroundedIntent` 直接产出 `business_intent`/`execution_targets`（覆盖子串匹配结果）；中/低置信走澄清/兜底；**LLM 完全不产 SQL**，只产「选了哪些已发布资产」，下游 ⑤⑥⑦不变。
- 返回结构：在现有 `business_intent` 上**新增** `confidence`、`grounding`（命中详情）、`clarification`（中态时）字段，旧消费方不破。

### 5.6 DI 变更

- `_intent_extraction_from_gateway`（`container.py:154-162`）：从注入 `complete_fn` 改为注入**前门 service**（`agent_inference_runtime_service`），构造 `IntentExtractionService(runtime_service=..., enabled=env)`。env 关 → `enabled=False` → 不调 LLM（零回归）。
- 注入点 `container.py:596/942` 维持（仍注入到 `semantic_router_preview_service`）。
- **不新增** provider/binding/端口/枚举（`global_ask.intent_extract` 复用默认 binding）。

### 5.7 候选召回（5.5 的 ①，8.3）

active manifest 规模有限时可全量注入候选；规模大时先召回 top-N：**起步纯关键词/BM25（Python，零依赖）**，可选本地 embedding 重排（内网无外部 API）。**不引向量库集群**。8.2 MVP 可先全量候选（manifest 小），①作为 8.3 的规模化增强。

## 6. eval 护栏（开 LLM 的硬前置门）

- **golden 集**：30–130 条中文真实问法 → 期望 `{intent_type, target_asset, metrics/dims, is_oos(越界), should_clarify, should_fallback}`。问法绑**已发布** cube（如答题 cube）。
- **断言以 DSL/绑定级为主**（判「绑没绑对已发布 metric/QueryDSL」比判 SQL 等价稳），LLM-as-judge 仅辅助。
- **分轨指标**：Intent-Acc、Slot-F1、**F1-OOS（越界识别）**、澄清触发率、兜底召回。
- **coverage-accuracy 曲线**标定 `τ_high/τ_low/δ`。
- 文件：`tests/unit/application/semantic_router/test_intent_grounding_eval.py`（离线、可 pytest 跑）。**无此 eval 全绿，不得置 env=true。**

## 7. 分期

| 期 | 内容 | 交付物 |
|---|---|---|
| **8.2 MVP** | ② 结构化抽取（invoke）+ ③ grounding 校验 + ④ 三态门控（中态先回候选列表）+ eval 护栏 + DI 改 + 新增 env.sample 条目 | L1 精度从关键字升到 grounding，env 默认关 |
| **8.3 增强** | ① 候选召回(BM25→embedding) + ⑥ 有界自纠 + 可信问法库 + 澄清问句生成 + dynamic few-shot | Agent 向完整体验 |

## 8. 验收方案（真实 case 完整 e2e）

**前置**：① 内网有真实可用 LLM（`.env` 的 `LLM_API_KEY` 为真 key）；② active manifest 有已发布 cube（答题 cube 已发布）；③ DataChat 主体持 `data_m1_reader`（绑定，运维动作）。

**步骤**：置 `SEMANTIC_ROUTER_LLM_INTENT_ENABLED=true` → 经真实 DataChat/Agent API 问一个**口语化、不含关键词表词、不字面命中资产名**的真实问题（如「上学期各年级**做题做得最多**的是哪个科目」），断言：
- ② 抽出结构化意图（intent_type=analysis，target/metrics 命中已发布答题 cube）；
- ③ grounding 全部命中已发布 candidate，无越界；
- ④ 高置信 → ⑤⑥⑦ 真实出数（`route_type=cube` 且返回数据），**对比关键字路由对同问会 blocked**；
- 另跑一条「问一个未发布资产/纯口语无法 grounding」的问题，断言**走澄清/诚实兜底而非乱绑**。

**若前置②/③缺失或 LLM 不可用**：属环境卡点，**停下来报告**，不伪造 e2e。

## 9. 风险与边界

- **LLM 不稳**：三态门控 + 诚实兜底把「乱答」收敛为「诚实说不确定」，符合「效果允许暂不稳但闭环完整」的质量约束。
- **候选 enum 过大**：manifest 大时先召回缩候选（①，8.3）。
- **中文同义**：靠 glossary aliases + grounding，不靠模型自由造词（严格白名单口径）。
- **`verbalized confidence` 过自信**：仅作次级信号，主闸是 grounding 命中度。
- **不触碰**：L2 编译/JoinGraph/方言/post_compile 治理/dw-query-gateway 一律不改。

---

*与 `agent-ready-semantic-governance.md`（端到端主设计，把 Router 当黑盒）配套，本文补齐其黑盒的 L1 内部设计。*
