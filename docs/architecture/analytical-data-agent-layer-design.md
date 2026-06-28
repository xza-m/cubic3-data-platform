# 分析型 Data Agent 层技术设计方案

**status:** draft（待评审 / 可后续升格 ADR-018）
**created:** 2026-06-28
**owner:** DataAgent / 语义中心
**scope:** L1 意图理解段之上的「分析型编排层」；不改 L1→L2 单步管线，把它当 tool 复用
**配套:** `docs/architecture/intent-understanding-layer-design.md`（L1，单步 text-to-metric 地基）

---

## 1. 背景与问题

L1（Phase 8.2）把「单步问题 → 绑已发布 metric/cube → 编译执行」做稳了。但用户真实问法是**分析型**的：

- "郑州基石中学的学情最近怎么样"
- "高曲靖中学最近几个月学情怎么样，听说他们考试进步很大，你深度分析下"
- "按天统计 5 月 kt 的 dwd 日志表中 rb_cnt 和 re_cnt 对不上的请求数"

这类问题**单步 text-to-metric 答不了**——需要多查询分解 + 趋势/对比 + 叙事综合。本文设计 L1 之上的**分析型 Data Agent 层**。

**关键现实（决定优先级）**：active manifest 当前仅 **2 cube**，答题 cube `dws_study_student_answer_kb_stat_di` 粒度 = **学生 × 知识点 × 日期**（维度：`ds / student_id / student_name / question_id / knowledge_id / knowledge_name / question_type / difficulty`；度量：`total_count`、各 `*_answer_cnt_{1,3,7,15}d`、`*_correct_*`、`avg_correct_answer_rate_*d` 等），**无学校 / 年级 / 地理维度**。

> 因此上面 3 个问法**没有一个被 L1 智能卡住**：Q1/Q2 卡在**建模覆盖**（无学校维度），Q3 卡在**范围**（未发布原始表）。**再精进编排也不会让它们变可答。** 这把本层的第一优先级钉死为「可回答性 / 覆盖缺口门控」。

## 2. 业界依据（2026 调研，带量化）

把 NL 落成「对治理语义层的多查询编排 + 叙事」是 agentic BI 的跨厂商共识：Databricks Genie Agent mode（plan→多查询→迭代→带引用报告）、Snowflake Cortex Agents（plan→分解→工具→自适应重规划→可审计 trace）、Looker Conversational Analytics（Thinking Mode + LookML 语义层，数据错误降约 2/3）、ThoughtSpot Spotter/SpotIQ（拆问题+多步推理+确定性 change/root-cause）、Cube D3（agent 从治理 metric 集"选"而非"写"）、Tableau Pulse（LLM 只叙事化确定性 insight）、Amazon Q Scenarios（goal→有序步骤→canvas）。

收敛的工程做法（本设计采纳）：
1. **Plan-then-execute**（非 ReAct、非默认多 agent），失败触发有界 replan。
2. **每子查询必绑治理化语义资产**（不裸 SQL）——最强共识 = 本平台 L1→L2 纪律。
3. **计算-叙事分离**：数字/趋势/归因由**确定性统计**算，**LLM 只渲染叙事**（Tableau Pulse 第一原则）。
4. **归因用确定性统计 + 显著性过滤**，只说"贡献/相关"不说"导致"。
5. **可回答性门控前置 + 覆盖缺口诚实告知**（薄数据上不下强结论是红线级共识）。
6. **叙事带 provenance + 数字反查 + 数据充分性闸门**。
7. **受控分析模板 + effort 分级 + 子问题数上限**（防 spawn 失控/token 爆炸；多 agent ~15x token，仅高价值才上）。
8. **eval 用 Reliability Score**（奖励正确弃权、重罚自信瞎答）+ 两段式（先判绑定，再 judge 叙事忠实度）。

**反模式（不做）**：无界 ReAct / 默认多 agent / LangGraph 重编排 / 向量库集群 / LLM 编因果 / 裸 SQL 补缺口 / 只用 execution-accuracy 评分 / 覆盖缺口静默失败 / Reflexion 穷举自反思。

来源：Databricks Genie Agent mode、Snowflake Cortex Agents（+官方最佳实践）、Looker Gemini deep-dive、ThoughtSpot Spotter/SpotIQ、Cube D3、Tableau Pulse、Amazon Q Scenarios、Anthropic multi-agent research、TrustSQL/PING（可回答性与传播误差）、Spider 2.0。

## 3. 锁定决策（用户 2026-06-28）

1. **可回答性 / 覆盖缺口门控 = MVP 第一步**（最低风险、对真实问法立刻产生价值）。
2. **模板优先编排**：受控分析模板（trend / period-over-period / 对比 / 属性级归因）+ planner 选模板填参，而非自由分解。
3. **覆盖缺口作为一等产品输出**：显式告诉用户"缺什么维度"，并可驱动建模补全；不静默失败。

## 4. 目标管线（本层 7 步）

```
① 可回答性门控·四态   可答 ｜ 需澄清 ｜ 超覆盖→告知缺口 ｜ 库外→拒答     [新, MVP 先做]
② 规划(选模板+拆子问题, 有上限)   前门 invoke JSON-mode · effort 分级 · ≤6 子查询   [新]
③ 逐子查询执行(复用 L1→L2)   每子查询=一次单步问数 · 绑已发布资产 · 过治理        [复用]
④ 确定性统计(趋势/对比/归因)   pandas 算数 + 显著性过滤 · 只说"贡献/相关"          [新]
⑤ 叙事综合(LLM 只渲染+引用)   数字来自④ · 每条结论回挂子查询/已发布资产           [新]
⑥ 数字反查 + 数据充分性闸门   叙事每个数字必在事实集 · n/时间窗不足→降级措辞        [新]
⑦ 返回叙事报告+建议(或诚实缺口声明)   带引用 · 可追溯                              [新/复用兜底]
```

## 5. 详细技术设计

### 5.1 可回答性门控（MVP，① — 复用 L1 grounding，最低风险）

**输入**：用户分析问题。先经 L1（8.2）抽结构化意图，拿到 `IntentExtraction`（target_asset / metrics / dimensions / filters / time_range）+ grounding 结果（哪些命中已发布候选、哪些落空）。

**新增** `AnswerabilityVerdict`（`app/application/data_agent/answerability.py`，纯函数可测）：

```python
@dataclass(frozen=True)
class AnswerabilityVerdict:
    state: str            # answerable | need_clarify | out_of_coverage | out_of_scope
    missing_dimensions: list[str]   # 问题需要但未发布的维度（如 ["学校"]）
    available_alternatives: list[str]  # 可替代的已发布粒度（如 ["学生","知识点"]）
    downgrade_suggestion: str | None   # 降级到可答粒度的建议
    clarify: dict | None               # 需澄清时的候选/缺槽
    message: str          # 诚实告知文案
```

**判定逻辑（复用 grounding 白名单）**：
- L1 抽出的「分析所需维度/筛选」逐个 grounding 到 active manifest 候选（复用 `preview_service._candidate_vocabulary` + `ground_terms`）；
- 全部命中 + 有可绑 target/metric → `answerable`；
- 命中但多候选 / 缺时间窗 → `need_clarify`；
- **抽出了"分析所需维度"但 grounding 落空**（如"学校"/"郑州基石中学"绑不到任何已发布维度，但语义上是已知数据域内的概念）→ `out_of_coverage`，`missing_dimensions=["学校"]` + `available_alternatives` + 降级建议；
- 引用的对象**完全不在语义层**（如"dwd 日志表"/"rb_cnt"，无任何已发布资产沾边）→ `out_of_scope`。

> `out_of_coverage` vs `out_of_scope` 的区分：前者是「数据域内但没建到这粒度」（驱动建模补全），后者是「根本不在治理语义层」（拒答）。用 L1 抽取的 `intent_type` + 是否有**部分**资产命中来启发式区分；边界用例归 `out_of_scope` 保守处理。

**输出处置**：`answerable`→进②；`need_clarify`→澄清（复用 L1 candidates）；`out_of_coverage`/`out_of_scope`→复用 Phase 8.1 `_build_unanswerable_fallback` 范式，但**文案带 gap 清单**（"当前建模无『学校』维度，无法按校下钻；可按『学生 / 知识点』看，或补建学校维度"）。

**MVP 边界**：MVP 只做①门控 + 诚实缺口告知（不做②-⑥编排）。这一步就让 Q1/Q2/Q3 从"乱答/blocked"变成"诚实说清卡在哪"，是最高性价比、最防幻觉的一步。

### 5.2 规划（②，模板优先 — +1 期）

**受控分析模板**（`app/application/data_agent/templates/`，参数化配方，编排层零 token）：

| 模板 | 适用 | 子查询形态 |
|---|---|---|
| `trend` | "最近怎么样/趋势" | 同一 metric 按时间粒度的序列 |
| `period_over_period` | "环比/同比/进步" | 两个时间窗的同 metric 对比 |
| `comparison` | "A vs B / 各 X 对比" | 按某维度分组的 metric |
| `attribution` | "为什么变了"（**仅维度充足时**） | 按可分维度的贡献分解 + 显著性 |

**planner**（前门 `invoke()+output_schema`）输出 `AnalysisPlan`：
```python
{ "template": "period_over_period",
  "sub_queries": [ {"intent": "...", "metric": "<已发布>", "dimensions": [...], "filters": [...], "time_grain": "month"} ],  # ≤ effort 上限
  "synthesis_goal": "...对比两期、指出变化方向与幅度" }
```
**effort 分级硬规则**：简单事实=单步（直接走 L1，不进本层）；对比/趋势=2-4 子查询；深度=**≤6**。planner 不得产无上限子问题、不得产裸 SQL。

### 5.3 子查询执行（③ — 100% 复用 L1→L2）

每个 sub_query = **一次现有单步问数**：`preview_service.execute_plan(question=sub_query.intent, principal_context=..., runtime_mode="official")` → L1 意图理解 → grounding → QueryCompiler → post_compile 治理 → gateway。**纪律天然由现有 L1→L2 保证**：不裸 SQL、不扫物理表、过 RLS。本层不新增执行通道。多子查询用前门 `submit_run` 异步 / RQ 简单队列。

### 5.4 计算-叙事分离（④⑤⑥ — 防幻觉核心）

- **④ 确定性统计**（`app/application/data_agent/stats.py`，pandas）：对子查询返回的真实结果算趋势线 / 环比同比 / 对比 / **属性级贡献分解 + t-test 显著性过滤**。**LLM 不碰算术**。当前只有知识点维度可分 → 归因只做"按知识点贡献"，校级/年级归因因无维度判 `out_of_coverage`。
- **⑤ 叙事综合**（前门 `invoke()`）：输入 = ④的**结构化事实集**（带 provenance）+ 模板语义；输出 `{narrative, findings:[{claim, evidence_ref: sub_query_id}]}`。**数字全部来自事实集**，LLM 只组织语言 + 标注每条结论来源。只说"贡献/相关"，不说"导致"。
- **⑥ 数字反查 + 充分性闸门**（确定性规则）：叙事里**每个数字必须能在事实集中找到**（找不到 = 阻断/重渲染）；趋势/进步类强声称前强制附 `n / 时间窗 / 基数`，不足则**降级措辞**（"数据点较少，仅供参考"）。

### 5.5 复用清单（零新框架）

| 能力 | 复用 |
|---|---|
| planner / 叙事 / judge | 单前门 `AgentInferenceRuntimeService.invoke()+output_schema`（模板 `data_asset_agent_app.py:34-60`）；action 走默认 binding（openai_compatible/sync） |
| 子查询执行 | `preview_service.execute_plan`（现有 L1→L2→gateway） |
| 可回答性 grounding | `_candidate_vocabulary` + `ground_terms`（8.2） |
| 诚实兜底 | `_build_unanswerable_fallback`（8.1） |
| 统计 | pandas（已在栈） |
| 异步多子查询 | 前门 `submit_run` / RQ |
| 默认口径 | Phase 10 默认分区窗口（date.today 近 N 天）延伸为"默认近 N 月" |
| trace | 现有结构化 logger（request_id/trace_id） |

## 6. eval（Reliability Score + 两段式）

- **golden 分析问题集**：问题 → 期望子查询（应绑哪些已发布 metric/cube）+ 期望结论要点 + **期望诚实缺口声明**；**含故意"超覆盖"用例**（如校级问题）验证门控是否真触发。2-cube 现状反而让金标好穷举。
- **Reliability Score**（TrustSQL 式）：答对 + **正确弃权得分**，**自信瞎答重罚**。不只看 execution accuracy。
- **两段式**：① 绑定/门控是否选对（选错/该弃权没弃权直接 0）；② 通过后用前门 `invoke()` 当 judge 评**叙事忠实度**（是否忠于已查数、是否过度声称、引用是否真）——**judge 不评开放结论对错**（无金标时 LLM-judge 不可靠），rubric 维度打乱、低温度多次取均值，保留人工核验。
- 文件：`tests/unit/application/data_agent/test_*_eval.py`（离线、可 pytest）。

## 7. 分期

| 期 | 内容 | 价值 |
|---|---|---|
| **MVP（8.4）** | ① 可回答性四态门控 + 覆盖缺口诚实告知（复用 grounding/兜底，最低风险） | 真实问法"诚实说清卡在哪"，防幻觉；驱动建模补全 |
| **+1（8.5）** | ② plan-then-execute（模板优先）+ ④趋势/对比统计 + ⑤叙事(计算-叙事分离) + ⑥数字反查门 | 真正"深度分析"闭环 |
| **+2（8.6）** | 属性级归因（知识点贡献 + 显著性）+ Reliability eval 集 | 归因 + 可量化回归 |

## 8. 用 3 个真实问法验证

| 问法 | 本层处理 |
|---|---|
| Q1 郑州基石中学学情 | ①门控：需"学校"维度→`out_of_coverage`→"当前无学校维度，可按学生/知识点看，或补建" |
| Q2 高曲靖中学深度分析 | 同样`out_of_coverage`（学校）；若有→②趋势+对比→③执行→④统计→⑤叙事→⑥反查，降级到可答粒度 |
| Q3 kt dwd 日志表 | ①门控：不在语义层→`out_of_scope`→拒答（不裸扫物理表） |

## 9. 风险与边界

- **薄 manifest**：本层最大价值当前是"诚实门控"，不是华丽编排——故 MVP 先做门控。
- **LLM 编因果**：靠计算-叙事分离 + 数字反查 + 显著性过滤结构性消除，不靠 prompt 哄。
- **token / 延迟**：模板优先 + effort 分级 + 子问题上限 + 不默认多 agent。
- **不触碰**：L1→L2 编译/治理/gateway 一律不改；不引分布式/向量库集群/编排框架。

---

*与 `intent-understanding-layer-design.md`（L1 地基）配套，本文是其上的分析编排层。两篇共同补齐 `agent-ready-semantic-governance.md` 把 Router/Agent 当黑盒的内部设计。*
