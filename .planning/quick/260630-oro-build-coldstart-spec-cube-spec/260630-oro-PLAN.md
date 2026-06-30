---
phase: quick-260630-oro
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/application/semantic/coldstart_spec_builder.py
  - tests/unit/application/semantic/test_coldstart_spec_builder.py
autonomous: true
requirements: [CONSUME-turnkey-P0]
must_haves:
  truths:
    - "调用 build_coldstart_spec(喂 columns) 返回 spec_version=v1 且含 cube/ontology/governance 的完整 dict，不触达 MaxCompute"
    - "cube.measures 中每个度量(除骨架已含 total_count)都在 ontology.metrics 里有对应 BusinessMetric"
    - "additivity 标对：sum 列→additive；无唯一分母的 avg→non_additive；可拆 ratio→additive"
    - "governance.sensitive_fields 含 student_id 这类 PII 列"
    - "lift 传子集时只升那几个度量"
  artifacts:
    - path: "app/application/semantic/coldstart_spec_builder.py"
      provides: "ColdstartSpecBuilder.build_coldstart_spec 纯编排，复用 CubeModelingService + SemanticModelDraftBuilder"
      min_lines: 50
    - path: "tests/unit/application/semantic/test_coldstart_spec_builder.py"
      provides: "纯函数单测，喂构造 columns 断言 spec 结构/additivity/ratio/sensitive/lift"
      min_lines: 60
  key_links:
    - from: "app/application/semantic/coldstart_spec_builder.py"
      to: "CubeModelingService.build_cube_draft_payload"
      via: "构造函数注入 cube_modeling_service，build 时调用"
      pattern: "build_cube_draft_payload"
    - from: "app/application/semantic/coldstart_spec_builder.py"
      to: "SemanticModelDraftBuilder._build_ontology_from_cube / _detect_sensitive_fields"
      via: "构造函数注入 draft_builder，build 时调用既有方法"
      pattern: "_build_ontology_from_cube|_detect_sensitive_fields"
---

<objective>
抽出应用层服务方法 `build_coldstart_spec`：喂列定义 → 建 cube（含已有 ratio 自动拆分）→ 升全部度量为业务指标 → 组装可发布 v1 spec dict。纯编排、零新建领域逻辑，把 `dws_p2_batch.py` `publish_one` 里验证过的 spec 构造固化进服务。

Purpose: turnkey 批量冷启动建模命令的 P0（智能落点）。当前缺口：CLI 有原子命令但无 turnkey，L2 spec 构造无服务方法 → agent 退回脚本。本 plan 只做服务方法 + 单测，不碰 CLI、不碰发布。
Output: 新模块 `coldstart_spec_builder.py`（`ColdstartSpecBuilder` 类）+ 纯函数单测。
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# 参考实现：publish_one 里 spec 构造段（行 38-68）就是要固化的编排
@/private/tmp/claude-501/-Users-xuan-Work-cursor-projects-cubic3-data-platform/a3c4eb5b-8939-4c2e-90d1-c9671266590c/scratchpad/dws_p2_batch.py

<interfaces>
<!-- 复用的既有契约，executor 直接用，无需再探查代码库 -->

CubeModelingService (app/application/semantic/cube_modeling_service.py):
```python
def build_cube_draft_payload(
    self, *, source_id: int, database: Optional[str], schema: Optional[str],
    table: str, columns: List[Dict[str, Any]],
    partitions: Optional[List[Any]] = None,
    name: Optional[str] = None, title: Optional[str] = None,
    ...
) -> Dict[str, Any]:
    # 返回 payload，含已有的 ratio 自动拆分（decompose_ratio_measures）。
    # payload["measures"] = {key: measure.model_dump(exclude_none=True)}
    #   每个 measure dict 携带 keys: title, type, sql, non_additive, certified ...
    #   ratio 度量：type=="ratio", non_additive is False（→ additive）
    #   纯 avg 无唯一分母：type=="avg", non_additive is True（→ non_additive）
    # payload["dimensions"] = {field: {type, title, ...}}  # type 可能为 "time"
```

SemanticModelDraftBuilder (app/application/semantic/modeling_draft_builder.py):
```python
def __init__(self, *, cube_modeling_source_service, cube_modeling_service,
             ontology_service, mapper_service=None, agent_plan_handler=None): ...

def _build_ontology_from_cube(self, cube: Dict, business: Dict) -> Dict:
    # business 需含 keys: subject, sensitivity_level, default_roles
    # 返回 {"object": {...}, "properties": [...], "metrics": [骨架默认 metric], ...}
    # object["name"] = 业务对象名（升度量时拼 metric.name 用）
    # metrics[0] 是骨架默认 metric（基于 default_measure，通常 total_count）

def _detect_sensitive_fields(self, cube: Dict) -> List[str]:
    # 委托 FieldIdentifier 等，检出 PII 维度（如 student_id）。返回字段名 list。
```

DI 装配（app/di/container.py，本 plan 不改，仅供 SUMMARY 后续接 CLI 参考）:
- `cube_modeling_service = providers.Singleton(CubeModelingService, ...)` (行 835)
- `semantic_model_draft_builder = providers.Singleton(SemanticModelDraftBuilder, cube_modeling_service=cube_modeling_service, ...)` (行 1036)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: 写 ColdstartSpecBuilder 服务 + RED 单测</name>
  <files>app/application/semantic/coldstart_spec_builder.py, tests/unit/application/semantic/test_coldstart_spec_builder.py</files>
  <behavior>
    单测（纯函数，绕 MaxCompute，喂构造 columns）：
    - fixture columns 至少含：① 一个 sum 列（如 answer_cnt，bigint）；② 一个无唯一分母的 avg 列（如某 rate 列，按 ratio decompose 红线会保留 non_additive，或单纯 avg 列）；③ 一组可拆 ratio 的列（如 answer_duration double + 其唯一计数列 answer_cnt → decompose 出 ratio）；④ 一个 student_id PII 列（dimension）。
    - Test A: build_coldstart_spec 返回 dict，spec["spec_version"] == "v1"，且 "cube"/"ontology"/"governance" 三键齐全。
    - Test B: cube.measures 里每个度量（除骨架已含的 total_count）在 ontology.metrics 中都有对应项（按 name=f"{obj}_{mk}" 或 measure_refs 包含 f"{cube}.{mk}" 断言覆盖）。
    - Test C: additivity 标对——可拆 ratio 度量的 metric additivity=="additive" 且 cube.measures 里存在 type=="ratio" 的度量；无唯一分母的 avg 对应 metric additivity=="non_additive"；sum 列对应 metric additivity=="additive"。
    - Test D: governance.sensitive_fields 含 "student_id"。
    - Test E: build_coldstart_spec(..., lift="<只升其中一两个 mk>") 时 ontology.metrics 里被升的 BusinessMetric 只对应那几个度量（骨架 metric 仍在，但额外升的只有子集）。
    构造 fixture 时，columns 用 list[{name,type,comment}] 形态（与参考脚本 cols 一致）。
    依赖：单测内用真实 CubeModelingService（FieldCandidateService 默认即可，cube_repo/runtime 可传 None 或轻量 stub——build_cube_draft_payload 不触达 runtime/repo）+ 真实 SemanticModelDraftBuilder（ontology_service 等可传 None / Mock，_build_ontology_from_cube 与 _detect_sensitive_fields 不依赖它们）。若实例化时某依赖被构造函数强校验，用 unittest.mock.Mock 顶上。先跑确认 RED（断言失败而非 import/实例化错）。
  </behavior>
  <action>
    新建 `app/application/semantic/coldstart_spec_builder.py`：

    类 `ColdstartSpecBuilder`，构造函数注入两个既有服务：
    ```python
    def __init__(self, *, cube_modeling_service, draft_builder): ...
    ```
    （draft_builder = SemanticModelDraftBuilder 实例；二者 DI 已装配，后续接 CLI 时注入。）

    方法签名（严格按 task_spec）：
    ```python
    def build_coldstart_spec(
        self, *, source_id, database, table, columns,
        schema=None, partitions=None, lift="all", sensitivity="internal",
    ) -> dict:
    ```

    内部编排（= 参考脚本 publish_one 行 38-68，零新建领域逻辑，只挪编排）：
    1. cube = self._cube_modeling_service.build_cube_draft_payload(source_id, database, schema, table, columns, partitions)
       —— 含已有 ratio 自动拆分，不改其行为。
    2. business = {"subject": cube.get("title") or table, "sensitivity_level": sensitivity, "default_roles": ["analyst"]}
    3. ontology = self._draft_builder._build_ontology_from_cube(cube, business)
       obj = ontology["object"]["name"]
    4. 升度量：measures = cube.get("measures", {}) ; dims = cube.get("dimensions", {})
       primary_dim = 第一个非 time 维（next(k for k,v in dims.items() if (v or {}).get("type") != "time", None)）
       解析 lift：lift=="all" → 升全部；否则逗号分隔子集（strip 空白），只升交集。
       对每个待升 mk（跳过骨架已含的 "total_count"）：
         ontology["metrics"].append({
           "name": f"{obj}_{mk}", "title": mv.get("title") or mk, "object_name": obj,
           "semantic_formula": f"按 {cube['name']}.{mk}",
           "measure_refs": [{"ref": f"{cube['name']}.{mk}", "role": "primary"}],
           "additivity": "non_additive" if mv.get("non_additive") else "additive",
           "grain": primary_dim, "status": "draft",
         })
    5. sensitive = self._draft_builder._detect_sensitive_fields(cube)
    6. 组装并返回 v1 spec dict（结构同参考脚本 spec，行 60-68）：
       spec_version="v1"；source(source_kind=physical_table,...)；business；cube={**cube,"status":"draft"}；
       ontology；governance={"sensitivity_level": sensitivity, "sensitive_fields": sensitive,
       "official_agent_consumes_spec": False, "approval_granted": False}。

    死守：复用既有服务方法、不改 build_cube_draft_payload / _build_ontology_from_cube / ratio decompose 行为；
    不把领域逻辑外泄到本编排层；遵守 CLAUDE.md 分层（application 层放编排）。
    若需要把 builder 私有方法提升为公开，仅当实例化无法干净拿到时才做，且不改其行为——优先直接调私有方法（同进程同包，参考脚本即直接调）。

    同步写 `tests/unit/application/semantic/test_coldstart_spec_builder.py`（见 behavior），先确认 RED。
  </action>
  <verify>
    <automated>docker cp tests/unit/application/semantic/test_coldstart_spec_builder.py cubic3-data-platform-backend:/app/tests/unit/application/semantic/test_coldstart_spec_builder.py && docker cp app/application/semantic/coldstart_spec_builder.py cubic3-data-platform-backend:/app/app/application/semantic/coldstart_spec_builder.py && docker exec -e PYTHONPATH=/app cubic3-data-platform-backend python -m pytest tests/unit/application/semantic/test_coldstart_spec_builder.py -x -q</automated>
  </verify>
  <done>RED 阶段：单测因断言失败而非 import/实例化错（确认 fixture 与依赖接线正确）；GREEN 阶段：test_coldstart_spec_builder.py 全部 passed（Test A-E 绿）。</done>
</task>

<task type="auto">
  <name>Task 2: 回归守护 + 零行为漂移核验</name>
  <files>app/application/semantic/coldstart_spec_builder.py</files>
  <action>
    核验未碰既有行为：
    1. `git diff app/application/semantic/cube_modeling_service.py app/application/semantic/modeling_draft_builder.py app/application/semantic/measure_ratio_decomposition.py` 必须全空（零生产代码改动；若为接线确需把私有方法提升为公开，仅允许新增 alias/公开包装、严禁改原方法体）。
    2. 跑既有相邻单测确认零回归：test_cube_modeling_service.py、test_measure_ratio_decomposition.py、test_modeling_draft_builder（若存在）。
    3. 确认 coldstart_spec_builder.py 无 import MaxCompute adapter、无触达 runtime/manifest（纯 columns→spec）。
  </action>
  <verify>
    <automated>docker cp app/application/semantic/coldstart_spec_builder.py cubic3-data-platform-backend:/app/app/application/semantic/coldstart_spec_builder.py && docker exec -e PYTHONPATH=/app cubic3-data-platform-backend python -m pytest tests/unit/application/semantic/test_coldstart_spec_builder.py tests/unit/application/semantic/test_cube_modeling_service.py tests/unit/application/semantic/test_measure_ratio_decomposition.py -q</automated>
  </verify>
  <done>三套单测全 passed；上述三个既有服务文件 git diff 为空（或仅新增公开包装、原方法体零改动）。</done>
</task>

</tasks>

<verification>
- 本地与容器内 `python -m pytest tests/unit/application/semantic/test_coldstart_spec_builder.py` 全绿。
- 既有 `test_cube_modeling_service.py` / `test_measure_ratio_decomposition.py` 零回归。
- `git diff` 仅含两个新文件（+ 可能的公开包装），不改 build_cube_draft_payload / _build_ontology_from_cube / ratio decompose 行为。
</verification>

<success_criteria>
- `ColdstartSpecBuilder.build_coldstart_spec(*, source_id, database, table, columns, schema=None, partitions=None, lift="all", sensitivity="internal") -> dict` 存在且签名精确匹配。
- 喂构造 columns 出 v1 spec：cube/ontology/governance 齐；每个 measure 有对应 metric；additivity 标对（sum→additive / 无唯一分母 avg→non_additive / ratio→additive）；ratio 度量存在；governance.sensitive_fields 含 student_id；lift 子集只升那几个。
- 纯函数、绕 MaxCompute、复用既有服务、零新建领域逻辑、遵守分层。
- 不碰 CLI、不碰发布（P0 边界）。
</success_criteria>

<output>
After completion, create `.planning/quick/260630-oro-build-coldstart-spec-cube-spec/260630-oro-SUMMARY.md`
</output>
