---
phase: quick-260630-oro
plan: 01
subsystem: semantic
tags: [coldstart, spec-builder, cube-modeling, ontology, ratio, application-layer]

requires:
  - phase: quick-260630-lhu
    provides: "decompose_ratio_measures：冷启动建模时把 AVG 均值/总量自动拆成可加 SUM 分子/分母 + ratio"
provides:
  - "ColdstartSpecBuilder.build_coldstart_spec：喂 columns → cube(含 ratio 拆分) → 升全部度量为 BusinessMetric → 组装可发布 v1 spec dict"
  - "turnkey 批量冷启动建模的 P0 智能落点：L2 spec 构造有了服务方法，后续接 CLI 无需退回脚本"
affects: [cli, turnkey-coldstart, semantic-modeling-proposal]

tech-stack:
  added: []
  patterns:
    - "应用层纯编排服务：构造注入既有领域服务，build 时只装配不新建领域逻辑"

key-files:
  created:
    - app/application/semantic/coldstart_spec_builder.py
    - tests/unit/application/semantic/test_coldstart_spec_builder.py
  modified: []

key-decisions:
  - "复用 CubeModelingService.build_cube_draft_payload + SemanticModelDraftBuilder._build_ontology_from_cube/_detect_sensitive_fields，零新建领域逻辑"
  - "additivity 直接读 cube 度量 non_additive 标志(由既有 ratio 拆分链路标定)：sum/ratio→additive、无唯一分母 avg→non_additive"
  - "build_cube_draft_payload 是 keyword-only：编排层按关键字传参(计划 action 写的位置参会 TypeError)，纯调用方式修正、未改被调服务行为"
  - "Task 2 为纯核验任务，零新增产物，不单独 commit"

patterns-established:
  - "冷启动 spec 构造固化：把脚本里验证过的 publish_one 编排段(行 38-68)挪进应用层服务，脚本不再是唯一真相"

requirements-completed: [CONSUME-turnkey-P0]

duration: ~15min
completed: 2026-06-30
---

# Quick 260630-oro: ColdstartSpecBuilder 冷启动 spec 构造服务 Summary

**抽出应用层纯编排服务 `build_coldstart_spec`：喂列定义 → 建 cube（含已有 ratio 自动拆分）→ 升全部度量为业务指标 → 组装可发布 v1 spec dict，零新建领域逻辑、绕 MaxCompute，把 `dws_p2_batch.publish_one` 里验证过的 spec 构造固化进服务。**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 完成（Task 1 TDD 实现 + Task 2 回归守护核验）
- **Files created:** 2（服务 + 单测）
- **Files modified:** 0

## Accomplishments

### Task 1（TDD）：ColdstartSpecBuilder 服务 + 单测

新建 `app/application/semantic/coldstart_spec_builder.py`：

- `ColdstartSpecBuilder(*, cube_modeling_service, draft_builder)` 构造注入两个既有服务。
- `build_coldstart_spec(*, source_id, database, table, columns, schema=None, partitions=None, lift="all", sensitivity="internal") -> dict` 签名精确匹配 task_spec。
- 内部编排（等价参考脚本 publish_one 行 38-68）：
  1. `cube = cube_modeling_service.build_cube_draft_payload(...)` —— 含已有 ratio 自动拆分，不改其行为。
  2. `business = {subject, sensitivity_level, default_roles}`。
  3. `ontology = draft_builder._build_ontology_from_cube(cube, business)`，取 `obj = ontology["object"]["name"]`。
  4. 升度量：遍历 `cube.measures`（跳过骨架已含 `total_count`），按 lift 子集对每个度量 append BusinessMetric（`name=f"{obj}_{mk}"`、`measure_refs=[{ref:f"{cube}.{mk}",role:primary}]`、`additivity=non_additive?non_additive:additive`、`grain=首个非time维`、`status=draft`）。
  5. `sensitive = draft_builder._detect_sensitive_fields(cube)`。
  6. 组装 v1 spec：`spec_version=v1` + `source(physical_table)` + `business` + `cube({**cube,"status":"draft"})` + `ontology` + `governance(sensitivity_level/sensitive_fields/official_agent_consumes_spec=False/approval_granted=False)`。

单测 `tests/unit/application/semantic/test_coldstart_spec_builder.py`（纯函数，绕 MaxCompute，真实服务 + Mock 依赖）：

- 一份覆盖全部 case 的 fixture columns（answer_cnt→sum、answer_duration+answer_cnt→ratio、avg_score→non_additive avg、accuracy_rate→比率红线保 non_additive、student_id→PII）。
- **Test A** v1 spec + cube/ontology/governance 三键齐；**Test B** 每个非 total_count 度量在 ontology.metrics 有对应项；**Test C** additivity 标对（sum/ratio→additive、无唯一分母 avg→non_additive，且 ratio 度量存在）；**Test D** governance.sensitive_fields 含 student_id；**Test E** lift 子集只升那几个（骨架 metric 仍在）；外加默认参数可调用断言。
- RED：`ModuleNotFoundError`（模块未建，commit `d2d0a9e`）→ GREEN：实现后 6 passed（commit `80e94dd`）。

### Task 2：回归守护 + 零行为漂移核验

- `git diff cube_modeling_service.py modeling_draft_builder.py measure_ratio_decomposition.py` **全空**（零生产代码改动，仅复用未改）。
- 合跑 coldstart + cube_modeling + ratio + modeling_draft_builder 四套单测：**61 passed**，零回归。
- `coldstart_spec_builder.py` 无 import MaxCompute/adapter/runtime/manifest（`maxcompute`/`runtime` 仅出现在 docstring 文本，非调用）—— 纯 columns→spec。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] build_cube_draft_payload 按关键字传参（计划 action 写的位置参会 TypeError）**

- **Found during:** Task 1 探查既有契约时。
- **Issue:** 计划 action 步骤 1 示例 `build_cube_draft_payload(source_id, database, schema, table, columns, partitions)` 为位置参，但实际签名是 keyword-only（`def build_cube_draft_payload(self, *, ...)`），位置参会抛 TypeError。
- **Fix:** 编排层改为关键字传参（与参考脚本一致）。纯调用方式修正，**未改被调服务任何行为**。
- **Files modified:** app/application/semantic/coldstart_spec_builder.py（新文件，非改既有）。
- **Commit:** 80e94dd

## Verification

- 容器内 `python -m pytest test_coldstart_spec_builder.py` → **6 passed**。
- 合跑四套（coldstart + cube_modeling + ratio + draft_builder）→ **61 passed**，零回归。
- 三既有服务文件 git diff 为空；新增仅两文件（服务 + 单测）。

## Self-Check: PASSED
