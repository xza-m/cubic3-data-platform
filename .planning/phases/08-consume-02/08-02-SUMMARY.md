---
phase: 08-consume-02
plan: 02
subsystem: conversation / semantic-router / semantic-discovery
tags: [datachat, official-runtime, semantic-router, discovery, green]
requires:
  - "08-01：execute_plan(runtime_mode='official') 契约的 RED 失败断言（D1 TDD 锚点）"
  - "Phase 7：active manifest 累积 + 发布累积代码已落地（official 运行时机制成立）"
provides:
  - "DataChat 全局问数读 active manifest（runtime_mode='official'），已发布 cube 可被问到并出数（stub 坐实形状）"
  - "GET /semantic/cubes discovery 与 grounding 同源（active manifest 优先 + registry 兜底）"
  - "official 三条闭环边界集成测试（出数 / 无快照诚实兜底 / comment 不命中）"
affects:
  - "Phase 9：文档对齐 + 全平台 verify；grounding 召回准度（命门，独立专题）"
  - "D4 运维桥接 + 真实闭环验证（部署动作，转交执行者）"
tech-stack:
  added: []
  patterns:
    - "official 兜底两条路径固化在 _build_blocked_route_message 注释（不扩行为）"
    - "discovery 同源：cube 列表经 RuntimeSemanticCatalog.from_manifest 出，registry 派生字段安全缺省 + source 标记"
    - "集成测试 stub 隔离：真实经 preview_service official 分支，仅在 runtime_service.execute 边界截断返固定行数"
key-files:
  created:
    - tests/integration/semantic/test_datachat_official_consume.py
  modified:
    - app/application/conversation/handlers/send_message_handler.py
    - app/interfaces/api/v1/semantic/cubes.py
    - tests/integration/semantic/test_cube_list_derivatives.py
decisions:
  - "D1 核心一行：_handle_via_semantic_router 调 execute_plan 追加 runtime_mode='official'，08-01 RED 转 GREEN"
  - "兜底语义经确认正确：无快照→reason=semantic_runtime_not_ready→诚实未就绪；未命中→返 None→legacy 诚实兜底；仅加注释固化，不扩行为"
  - "D2 完整落地（未降级）：cube discovery manifest 优先 + registry 兜底；registry 派生字段无 manifest 来源→安全缺省置空+source=active_manifest 标记"
  - "集成测试坐实 D3 预期方向：YAML-only comment 切 official 后不再被 DataChat 命中，不做 YAML 并集"
metrics:
  duration: ~8m
  completed: 2026-06-26
  tasks: 3
  files: 4
---

# Phase 8 Plan 02: DataChat 切 official 消费 GREEN Summary

把 DataChat 全局问数从读 YAML（preview）切到读 active manifest（official），打通"自助建模发布的 cube → 问数能消费出数"，并让 discovery 与 grounding 同源。08-01 的 RED 断言转 GREEN，三条 official 闭环边界经集成测试坐实（全程 stub，不实连真实数据源）。

## What Was Built

### Task 1 — D1：handler 切 official（08-01 RED → GREEN）

`app/application/conversation/handlers/send_message_handler.py:101`（`_handle_via_semantic_router`）的 `execute_plan(...)` 调用追加 `runtime_mode="official"` 核心一行 + 注释说明语义来源（CONTEXT D1 / semantic-binding-and-rls.md §1.4）。**不改方法签名、不动 legacy/agent 路径、不碰 grounding/intent/编译器。**

兜底两条路径经确认正确，仅在 `_build_blocked_route_message` docstring 固化（不扩行为）：
- **无 active 快照**：preview_service `_blocked_runtime_route` 返 `route_type="blocked"`、`reason="semantic_runtime_not_ready"` → 命中 `("runtime","not_ready","manifest","运行清单","未就绪")` 关键词分支 → 诚实回「语义运行时尚未就绪」（不 500、不伪造）。
- **未命中已发布业务语义**：`reason` 以「未命中」开头 → `_build_blocked_route_message` 返 None → 全局问数（`dataset_id is None`）落 `_handle_via_legacy_llm` 诚实兜底「未能在已发布的语义资产中找到…口径」。

### Task 2 — official 消费集成测试（新建，stub 隔离）

`tests/integration/semantic/test_datachat_official_consume.py`（3 测试）。真实组装 `SemanticRouterPreviewService`（空 YAML repos + `_StubRuntimeService` + `_RuntimeSnapshotServiceStub`）注入 `SendMessageHandler`，**真实经过 preview_service 的 official 分支**（plan → manifest catalog → execution_targets），仅在 `runtime_service.execute` 边界截断返固定行数（39_890_000，不实连）：

- **Test A（official 出数）**：含答题 ontology（metric `student_total_count`，aliases `["学生答题统计","总数","答题总数"]` 对得上问法）的 active manifest → 问"学生答题统计 总数" → `ai_message.source=='semantic'`、`route_type∈{cube,hybrid}`（从 `conversation.context.semantic_plan.route` 读真实路由）、`query_result.row_count==1` 且出数、未落 legacy「未能找到口径」、`llm_service.generate_sql` 未被调用、stub runtime 收到 `runtime_mode=="official"`。
- **Test B（无快照诚实兜底）**：`get_active_manifest` 返 `{"ok": False, "error_code": "semantic_runtime_not_ready"}` → 回复含「语义运行时尚未就绪」、`source=='semantic'`、`error=="semantic_runtime_not_ready"`、不 500、不落「未能找到口径」、runtime.execute 未被调用。
- **Test C（comment 不命中 = D3 预期方向）**：用答题 manifest（不含 comment）问"统计学生评论数" → official 未命中 → legacy 诚实兜底「未能在已发布的语义资产中找到」、`source=='legacy_llm'`、不出数、runtime.execute 未被调用。**断言不为保 comment 做 YAML 并集。**

### Task 3 — D2：cube discovery 同源（manifest 优先 + registry 兜底）

`app/interfaces/api/v1/semantic/cubes.py` `list_cubes`：新增 `_cubes_from_active_manifest()`，经 `ctx.runtime_snapshot_service.get_active_manifest("default")` + `RuntimeSemanticCatalog.from_manifest(manifest).list_entities("cube")` 取已发布 cube，映射成与 `_build_list_payload` 兼容的 dict（name/title/description/table/计数/status + registry 派生字段安全缺省 + `source="active_manifest"` 标记）。`runtime_snapshot_service is None` 或 `manifest.ok is False` → 回落现有 `_get_cube_listing_service().list_cubes_with_derivatives()`（不 500，保持现有行为）。

补 D2 同源测试 2 条（`TestCubeListDiscoverySameSource`）：active manifest 驱动 discovery（registry 故意放不同 cube 证明来源）+ 无快照回落 registry。现有 7 条 cube 列表测试（均未传 `runtime_snapshot_service`）为回落护栏，全绿无回归。

## 测试证据（pytest 实际计数）

命令：`PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider <paths>`

| 文件 | 计数 |
| --- | --- |
| `tests/unit/application/conversation/test_send_message_handler.py` | **11 passed** |
| `tests/integration/semantic/test_datachat_official_consume.py` | **3 passed** |
| `tests/integration/semantic/test_cube_list_derivatives.py` | **9 passed**（7 现有回落护栏 + 2 新 D2） |
| `tests/unit/application/semantic_router/test_preview_service.py` | **15 passed**（无回归） |
| **四文件合并** | **38 passed in 0.28s** |

08-01 的 RED `test_semantic_router_called_with_official_runtime_mode` 已转 GREEN（含在 11 passed 内）。

## D2 落地 / 降级决策

**D2 完整落地，未降级为 follow-up。** 牵连面收窄方式：manifest 侧只含已发布 cube 的结构定义（dimensions/measures/joins/table/source），registry 派生字段（domain projection / state_summary / sync_status / last_modified_at / downstream_bi_count）无 manifest 来源 → 以安全缺省置空 + `source="active_manifest"` 标记，不破坏 `_build_list_payload` 结构。前端列表只读 name/title/description/domain_name/计数，缺省不影响列表渲染。无快照不 500，回落 registry 保留全部派生字段。

## Deviations from Plan

None - plan executed exactly as written. 三个 Task 按 PLAN 顺序执行，D1 核心一行、兜底确认、D2 manifest 优先 + registry 兜底、集成测试三条边界均按计划落地，未触发降级护栏。

## Known Stubs

None（生产代码）。

- `cubes.py` 中 manifest cube 的 registry 派生字段缺省（domain/state/sync/downstream/last_modified）**非死 UI stub**：是 D2 收窄护栏下的有意安全缺省（manifest 侧确无来源），带 `source="active_manifest"` 标记可追溯；无快照时回落 registry 取回全部派生字段。
- 集成测试中的 `_StubRuntimeService`（固定 39_890_000 行）、`_RuntimeSnapshotServiceStub` 是测试隔离件（不实连真实数据源/DB），非生产代码占位。

## D4 运维桥接待办（转交执行者，非本代码 plan）

部署/验证动作，由执行者（用户）在运维阶段亲自做：
1. 重启 docker 加载 Phase 7+8 代码。
2. 跑 `rebuild_active_baseline(namespace="default", asset_keys=[("cube","dws_study_student_answer_kb_stat_di"),("cube","dim_app_dify_app_info_df")], actor="internal:local:admin", idempotency_key=...)`（`semantic_release_service.py:341`）→ active manifest 变多 cube。
3. **真实闭环判定点**：经真实 DataChat（或 SendMessageHandler/official）问"学生答题统计 总数" → 断言走 semantic 主链、route_type=cube、有真实出数（真打数据源或经 runtime tool 已证 3989 万）。
4. 存量回填前提：旧表（如 dws_study_student_answer_kb_stat_di）需部署后重新同步才带 partitions（schema 快照分区透传修复只对新写入生效）。

**Deferred（Phase 9 / 另期）**：不改 grounding 匹配算法 / 不激活 LLM 意图抽取（召回准度命门）；不回写/重发 YAML-only cube（comment/answer_records）；不动编译器分区保护；文档对齐 + 全平台 verify。

## Commits

- `e5151cb` feat(08-consume-02-02): DataChat 全局问数切 official runtime（D1）
- `73862ce` test(08-consume-02-02): DataChat official 消费集成测试（stub runtime）
- `674dcd1` feat(08-consume-02-02): D2 cube discovery 从 active manifest 出（与 grounding 同源）

## Self-Check: PASSED

- FOUND: tests/integration/semantic/test_datachat_official_consume.py
- FOUND: app/application/conversation/handlers/send_message_handler.py（runtime_mode="official" + 兜底注释）
- FOUND: app/interfaces/api/v1/semantic/cubes.py（_cubes_from_active_manifest + manifest 优先）
- FOUND: tests/integration/semantic/test_cube_list_derivatives.py（+2 D2 同源测试）
- FOUND commits: e5151cb, 73862ce, 674dcd1
- VERIFIED: 四文件合并 38 passed；08-01 RED 转 GREEN；未碰 grounding/intent/编译器/YAML
