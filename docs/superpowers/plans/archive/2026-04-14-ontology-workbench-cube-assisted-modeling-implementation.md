# Ontology Workbench Cube-Assisted Modeling Implementation Plan

> **状态：** 已被 [`2026-04-14-ontology-workbench-object-aggregate-implementation.md`](./2026-04-14-ontology-workbench-object-aggregate-implementation.md) 替代。
> **说明：** 本稿基于“Cube 前置为主聚合根”的旧方案撰写，与当前确认的“对象聚合根主工作台 + 专项索引辅助治理”方向不一致，保留仅供历史追溯。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/semantic/ontology` 重构为“先选 Cube，再完成对象/属性/指标/关系/动作绑定”的本体建模工作台，让建模阶段显式建立分析真相源绑定，同时保留现有验证、治理和发布链路。

**Architecture:** 后端新增 `OntologyModelingBootstrapService` 负责基于 `Cube` 生成本体草稿候选，新增 `OntologyDependencyGuardService` 负责发现底层 `Cube` 变化对本体绑定的影响，并把绑定校验收口到 `OntologyDefinitionService`。前端将 `OntologyWorkbench` 重组为 `建模 / 验证 / 治理发布` 三阶段壳层，建模阶段通过结构化选择器替代 `measure_refs / event_cube_refs / join_path` 的自由文本录入，验证与治理阶段继续复用现有 `preview / links / publish / history` 能力。

**Tech Stack:** React 18、TypeScript、TanStack Query、Vitest、Playwright、Flask Blueprint、Pydantic、dependency-injector、YAML 仓储、仓库根目录 `make verify-semantic`

---

## Principle Guardrails

- `KISS`：优先复用现有 `/api/v1/semantic/cubes` 与现有 `Ontology` 保存链路，只新增建模辅助接口和绑定校验，不重做 `Cube` 工作台。
- `YAGNI`：第一阶段只引入 `primary_cube_ref / dimension_ref / join_path_ref / version` 等当前必需绑定，不提前做完整多 `Cube` 对象编排。
- `SOLID`：把“草稿生成”“保存校验”“依赖失效检测”“页面三阶段渲染”拆成独立服务和组件，避免继续把所有职责堆进 `OntologyWorkbench.tsx`。
- `DRY`：不在 `Ontology` 层双写 `Cube` 执行公式和默认元数据，默认值来自 `Cube`，业务 override 才写入本体 YAML。

## Scope Check

本次改造虽然跨前端、后端、文档和验证，但都围绕单一子系统 `/semantic/ontology` 展开，不需要再拆成多个独立计划。执行时应按任务顺序推进，保证每个任务都能在当前仓库内形成可验证增量。

## File Structure

### Backend domain and modeling orchestration

- Create: `app/application/ontology/modeling_bootstrap_service.py`
  - 基于 `CubeDefinition` 生成对象、属性、指标、关系、动作的结构化候选，不直接持久化 YAML。
- Create: `app/application/ontology/dependency_guard_service.py`
  - 扫描底层 `Cube` 变更对本体绑定的影响，输出 `待确认绑定 / 绑定失效 / 需重新发布` 摘要。
- Modify: `app/domain/ontology/entities.py`
  - 为对象、属性、关系等补充显式绑定字段和草稿版本字段。
- Modify: `app/application/ontology/definition_service.py`
  - 保存时对 `primary_cube_ref / dimension_ref / measure_refs / join_path_ref / event_cube_refs / version` 做强校验。
- Modify: `app/application/semantic_mapper/preview_service.py`
  - 优先使用显式绑定生成预览，名称匹配仅作为存量资产兼容兜底。
- Modify: `app/application/semantic/cube_modeling_service.py`
  - `Cube` 保存、激活、修订后触发依赖检查，避免问题拖到执行期。
- Modify: `app/interfaces/api/v1/ontology.py`
  - 新增建模辅助接口与依赖检查接口。
- Modify: `app/di/container.py`
  - 注册新服务并把 `cube_repository` 注入 `OntologyDefinitionService`。
- Modify: `app/__init__.py`
  - 用新依赖创建 `ontology` Blueprint。

### Backend tests

- Create: `tests/unit/application/ontology/test_modeling_bootstrap_service.py`
  - 覆盖基于 `Cube` 生成本体候选的主路径。
- Create: `tests/unit/application/ontology/test_dependency_guard_service.py`
  - 覆盖维度删除、Measure 缺失、Join 失效、事件事实下线等场景。
- Modify: `tests/unit/application/ontology/test_definition_service.py`
  - 覆盖结构化绑定校验、版本冲突校验和兼容旧资产保存。
- Modify: `tests/unit/application/semantic/test_cube_modeling_service.py`
  - 覆盖 `Cube` 更新后触发依赖检查。
- Modify: `tests/unit/interfaces/api/v1/test_ontology_blueprints.py`
  - 覆盖新建模接口成功/失败路径。
- Modify: `tests/integration/test_ontology_api.py`
  - 覆盖 “选 Cube -> bootstrap -> 保存对象/指标/关系/动作 -> 验证 -> 发布” 的集成链路。

### Frontend workbench decomposition

- Modify: `frontend/src/api/ontology.ts`
  - 新增建模辅助接口类型、结构化绑定类型和依赖检查响应。
- Create: `frontend/src/hooks/semantic-ia/useOntologyWorkbench.ts`
  - 管理 `stage / cube / tab / entity` URL 状态、bootstrap 请求和阶段间跳转。
- Modify: `frontend/src/hooks/semantic-ia/index.ts`
  - 暴露新的本体工作台 hook 和新的 href 构造函数。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyWorkbenchShell.tsx`
  - 壳层布局：顶栏、阶段切换、左栏、主区、右栏检查器。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.tsx`
  - 基于 Cube 的多步建模主区。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyValidationStage.tsx`
  - 投影、联邦、路由、执行摘要和主验证面板。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyGovernanceStage.tsx`
  - 发布检查、影响范围、历史/审计和依赖风险。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyBindingInspector.tsx`
  - 右侧检查器，展示主 `Cube`、绑定摘要、生命周期和最近记录。
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.tsx`
  - 从大一统页面改为壳层容器，负责接线 API、状态和组件装配。

### Frontend tests and regression

- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`
  - 覆盖三阶段壳层、Cube 首步建模和结构化选择器。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx`
  - 覆盖指标、关系、动作选择器行为。
- Create: `frontend/tests/e2e-node/ontology-workbench.spec.ts`
  - 覆盖桌面浏览器关键交互。
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
  - 更新本体工作台视觉基线。
- Create: `frontend/tests/e2e/ontology_modeling_smoke.py`
  - 覆盖从选择 `Cube` 到保存指标/关系/动作的核心烟测。
- Modify: `frontend/package.json`
  - 把本体工作台测试纳入语义专项回归。

### Docs

- Modify: `docs/semantic_verification.md`
  - 补充本体工作台新的专项回归和 smoke 说明。
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - 更新本体建模与 `Cube` 的边界说明。
- Modify: `frontend/README.md`
  - 更新 `/semantic/ontology` 的职责和调试方式。

## Task 1: Add ontology binding fields and bootstrap service

**Files:**
- Create: `app/application/ontology/modeling_bootstrap_service.py`
- Modify: `app/domain/ontology/entities.py`
- Modify: `app/application/ontology/definition_service.py`
- Create: `tests/unit/application/ontology/test_modeling_bootstrap_service.py`
- Modify: `tests/unit/application/ontology/test_definition_service.py`

- [ ] **Step 1: Write the failing unit tests for bootstrap candidates and binding validation**

```python
def test_bootstrap_from_cube_returns_structured_candidates(tmp_path):
    bootstrap_service = _build_bootstrap_service(tmp_path)

    payload = bootstrap_service.bootstrap("orders")

    assert payload["cube_summary"]["name"] == "orders"
    assert payload["object_draft"]["primary_cube_ref"] == "orders"
    assert payload["property_candidates"][0]["dimension_ref"] == "orders.status"
    assert payload["metric_candidates"][0]["measure_ref"] == "orders.gmv"
    assert payload["relation_candidates"][0]["join_path_ref"] == "orders.customers"
```

```python
def test_save_metric_requires_resolvable_measure_ref(tmp_path):
    service = _build_service(tmp_path)
    service.save_object({"name": "order", "title": "订单", "primary_cube_ref": "orders"})

    with pytest.raises(ValueError, match="未解析 Measure 引用"):
        service.save_metric(
            {
                "name": "gmv",
                "title": "GMV",
                "object_name": "order",
                "semantic_formula": "已支付订单金额之和",
                "measure_refs": ["ghost.gmv"],
            }
        )
```

- [ ] **Step 2: Run the ontology unit tests to verify they fail**

Run: `pytest tests/unit/application/ontology/test_modeling_bootstrap_service.py tests/unit/application/ontology/test_definition_service.py -v`

Expected: FAIL because `OntologyModelingBootstrapService` does not exist yet and `OntologyDefinitionService` does not validate structured bindings.

- [ ] **Step 3: Implement minimal binding fields and bootstrap service**

```python
class BusinessObject(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    primary_cube_ref: Optional[str] = None
    version: int = 1
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessMetric(BaseModel):
    name: str
    title: str
    object_name: str
    semantic_formula: str
    measure_refs: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    semantic_labels: List[str] = Field(default_factory=list)
    version: int = 1
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessProperty(BaseModel):
    name: str
    title: str
    object_name: str
    property_type: Literal["string", "number", "time", "boolean", "enum", "unknown"] = "unknown"
    dimension_ref: Optional[str] = None
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    version: int = 1
    status: Literal["draft", "active", "deprecated"] = "draft"


class BusinessRelation(BaseModel):
    name: str
    title: str
    source_object_name: str
    target_object_name: str
    relation_type: Literal["owns", "submits", "belongs_to", "linked_to", "custom"] = "linked_to"
    join_path_ref: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    version: int = 1
    status: Literal["draft", "active", "deprecated"] = "draft"
```

```python
class OntologyModelingBootstrapService:
    def __init__(self, cube_repository):
        self._cube_repository = cube_repository

    def bootstrap(self, cube_name: str) -> Dict[str, Any]:
        cube = self._cube_repository.get(cube_name)
        if cube is None:
            raise ValueError(f"未找到 Cube: {cube_name}")
        return {
            "cube_summary": {"name": cube.name, "title": cube.title, "table": cube.table},
            "object_draft": {
                "name": cube.name.rstrip("s"),
                "title": cube.title,
                "primary_cube_ref": cube.name,
            },
            "property_candidates": [
                {
                    "name": dim_name,
                    "title": dim.title,
                    "property_type": dim.type,
                    "dimension_ref": f"{cube.name}.{dim_name}",
                }
                for dim_name, dim in cube.dimensions.items()
            ],
            "metric_candidates": [
                {
                    "name": measure_name,
                    "title": measure.title,
                    "measure_ref": f"{cube.name}.{measure_name}",
                }
                for measure_name, measure in cube.measures.items()
            ],
            "relation_candidates": [
                {
                    "target_cube": join.cube,
                    "join_path_ref": f"{cube.name}.{join_name}",
                    "relationship": join.relationship or join.type,
                }
                for join_name, join in cube.joins.items()
            ],
        }
```

```python
def _assert_next_version(self, payload: Dict[str, Any], current: Any | None) -> int:
    incoming = int(payload.get("version") or (getattr(current, "version", 0) + 1))
    expected = (getattr(current, "version", 0) + 1) if current is not None else 1
    if incoming != expected:
        raise ValueError(f"本体草稿版本冲突，期望版本 {expected}，收到 {incoming}")
    return incoming

def save_relation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    join_path_ref = str(payload.get("join_path_ref") or "").strip() or None
    if join_path_ref and self._resolve_join_path(join_path_ref) is None:
        raise ValueError(f"未解析 Join Path 引用: {join_path_ref}")
    current = self._relation_repository.get(str(payload.get("name") or "").strip())
    entity = BusinessRelation(**{**payload, "join_path_ref": join_path_ref, "version": self._assert_next_version(payload, current)})
    self._relation_repository.save(entity)
    return entity.model_dump(mode="json")
```

- [ ] **Step 4: Run the ontology unit tests to verify they pass**

Run: `pytest tests/unit/application/ontology/test_modeling_bootstrap_service.py tests/unit/application/ontology/test_definition_service.py -v`

Expected: PASS with generated candidates and save-time binding validation available.

- [ ] **Step 5: Commit**

```bash
git add app/application/ontology/modeling_bootstrap_service.py app/domain/ontology/entities.py app/application/ontology/definition_service.py tests/unit/application/ontology/test_modeling_bootstrap_service.py tests/unit/application/ontology/test_definition_service.py
git commit -m "feat: add ontology cube bootstrap contracts"
```

## Task 2: Add dependency guard and cube-change cascading

**Files:**
- Create: `app/application/ontology/dependency_guard_service.py`
- Modify: `app/application/semantic/cube_modeling_service.py`
- Create: `tests/unit/application/ontology/test_dependency_guard_service.py`
- Modify: `tests/unit/application/semantic/test_cube_modeling_service.py`

- [ ] **Step 1: Write the failing tests for dependency invalidation**

```python
def test_dependency_guard_marks_missing_measure_reference_as_stale(tmp_path):
    guard_service = _build_guard_service(tmp_path)

    report = guard_service.check_cube("orders")

    assert report["summary"]["stale_count"] == 1
    assert report["items"][0]["entity_type"] == "metric"
    assert "未解析 Measure 引用" in report["items"][0]["issues"][0]
```

```python
def test_cube_update_triggers_dependency_scan(tmp_path):
    service, guard_service = _build_cube_modeling_service_with_guard(tmp_path)

    service.update_cube("orders", {"title": "订单事实", "measures": {}})

    guard_service.check_cube.assert_called_once_with("orders")
```

- [ ] **Step 2: Run the guard and cube modeling tests to verify they fail**

Run: `pytest tests/unit/application/ontology/test_dependency_guard_service.py tests/unit/application/semantic/test_cube_modeling_service.py -v`

Expected: FAIL because no dependency guard exists and `CubeModelingService` does not trigger any ontology scan.

- [ ] **Step 3: Implement the dependency guard service and cube callback**

```python
class OntologyDependencyGuardService:
    def __init__(self, mapper_preview_service, object_repository, metric_repository, relation_repository, action_repository):
        self._mapper_preview_service = mapper_preview_service
        self._object_repository = object_repository
        self._metric_repository = metric_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository

    def check_cube(self, cube_name: str) -> Dict[str, Any]:
        items: list[dict[str, Any]] = []
        for entity_type, repository in (
            ("object", self._object_repository),
            ("metric", self._metric_repository),
            ("relation", self._relation_repository),
            ("action", self._action_repository),
        ):
            for entity in repository.list_all():
                preview = self._mapper_preview_service.preview(entity_type=entity_type, entity_name=entity.name)
                if self._references_cube(entity, cube_name, preview) and preview.get("consistency", {}).get("issues"):
                    items.append(
                        {
                            "entity_type": entity_type,
                            "entity_name": entity.name,
                            "status": "binding_stale",
                            "issues": preview["consistency"]["issues"],
                        }
                    )
        return {"cube_name": cube_name, "summary": {"stale_count": len(items)}, "items": items}

    def _references_cube(self, entity: Any, cube_name: str, preview: Dict[str, Any]) -> bool:
        direct_refs = [
            getattr(entity, "primary_cube_ref", None),
            *list(getattr(entity, "measure_refs", []) or []),
            *list(getattr(entity, "event_cube_refs", []) or []),
            getattr(entity, "dimension_ref", None),
            getattr(entity, "join_path_ref", None),
        ]
        if any(str(ref or "").startswith(f"{cube_name}.") or str(ref or "") == cube_name for ref in direct_refs):
            return True
        for target in preview.get("projection", {}).get("targets", []):
            if str(target.get("cube_name") or "") == cube_name:
                return True
        return False
```

```python
class CubeModelingService:
    def __init__(
        self,
        cube_repo,
        runtime_binding_service,
        definition_service,
        registry_repo=None,
        metric_repository=None,
        ontology_dependency_guard_service=None,
    ):
        self._cube_repo = cube_repo
        self._runtime_binding_service = runtime_binding_service
        self._definition_service = definition_service
        self._registry_repo = registry_repo
        self._metric_repository = metric_repository
        self._ontology_dependency_guard_service = ontology_dependency_guard_service

    def _after_save(self, cube: CubeDefinition) -> None:
        self._definition_service.validate_cube(cube)
        if self._ontology_dependency_guard_service is not None:
            self._ontology_dependency_guard_service.check_cube(cube.name)
```

- [ ] **Step 4: Run the guard and cube modeling tests to verify they pass**

Run: `pytest tests/unit/application/ontology/test_dependency_guard_service.py tests/unit/application/semantic/test_cube_modeling_service.py -v`

Expected: PASS with stale detection and cube-save callback in place.

- [ ] **Step 5: Commit**

```bash
git add app/application/ontology/dependency_guard_service.py app/application/semantic/cube_modeling_service.py tests/unit/application/ontology/test_dependency_guard_service.py tests/unit/application/semantic/test_cube_modeling_service.py
git commit -m "feat: add ontology dependency guard for cube changes"
```

## Task 3: Expose ontology modeling APIs and wire dependency injection

**Files:**
- Modify: `app/interfaces/api/v1/ontology.py`
- Modify: `app/di/container.py`
- Modify: `app/__init__.py`
- Modify: `tests/unit/interfaces/api/v1/test_ontology_blueprints.py`
- Modify: `tests/integration/test_ontology_api.py`

- [ ] **Step 1: Write the failing blueprint and integration tests for modeling APIs**

```python
def test_ontology_blueprint_exposes_modeling_endpoints():
    response = client.get("/api/v1/ontology/modeling/cubes")
    assert response.status_code == 200

    response = client.get("/api/v1/ontology/modeling/cubes/orders/schema")
    assert response.status_code == 200

    response = client.post("/api/v1/ontology/modeling/bootstrap", json={"cube_name": "orders"})
    assert response.status_code == 200
```

```python
def test_ontology_bootstrap_and_save_flow(tmp_path):
    client = _make_client(tmp_path)

    bootstrap_resp = client.post("/api/v1/ontology/modeling/bootstrap", json={"cube_name": "orders"})
    assert bootstrap_resp.status_code == 200
    assert bootstrap_resp.get_json()["data"]["object_draft"]["primary_cube_ref"] == "orders"
```

- [ ] **Step 2: Run the ontology API tests to verify they fail**

Run: `pytest tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py -v`

Expected: FAIL because the modeling endpoints are not registered and the new services are not injected.

- [ ] **Step 3: Implement the modeling endpoints and DI wiring**

```python
def create_ontology_blueprint(
    ontology_service,
    mapper_service=None,
    audit_repository=None,
    semantic_service=None,
    modeling_bootstrap_service=None,
    dependency_guard_service=None,
):
    bp = Blueprint("ontology", __name__, url_prefix="/api/v1/ontology")

    @bp.route("/modeling/cubes", methods=["GET"])
    def list_modeling_cubes():
        cubes = semantic_service.list_cubes()
        return success(data={"items": cubes, "total": len(cubes)})

    @bp.route("/modeling/cubes/<cube_name>/schema", methods=["GET"])
    def get_modeling_cube_schema(cube_name: str):
        payload = semantic_service.describe_cube(cube_name)
        if "error" in payload:
            return not_found(payload["error"])
        return success(data=payload)

    @bp.route("/modeling/bootstrap", methods=["POST"])
    def bootstrap_from_cube():
        body = request.get_json(silent=True) or {}
        payload = modeling_bootstrap_service.bootstrap(str(body.get("cube_name") or "").strip())
        return success(data=payload)

    @bp.route("/modeling/dependency-check", methods=["GET"])
    def dependency_check():
        cube_name = request.args.get("cube_name", "").strip()
        if not cube_name:
            return error("请求参数缺少必填字段: cube_name")
        return success(data=dependency_guard_service.check_cube(cube_name))
```

```python
ontology_modeling_bootstrap_service = providers.Singleton(
    OntologyModelingBootstrapService,
    cube_repository=cube_repository,
)

ontology_dependency_guard_service = providers.Singleton(
    OntologyDependencyGuardService,
    mapper_preview_service=semantic_mapper_preview_service,
    object_repository=ontology_object_repository,
    metric_repository=ontology_metric_repository,
    relation_repository=ontology_relation_repository,
    action_repository=ontology_action_repository,
)
```

- [ ] **Step 4: Run the ontology API tests to verify they pass**

Run: `pytest tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py -v`

Expected: PASS with `/modeling/cubes`、`/modeling/cubes/<cube>/schema`、`/modeling/bootstrap`、`/modeling/dependency-check` all available.

- [ ] **Step 5: Commit**

```bash
git add app/interfaces/api/v1/ontology.py app/di/container.py app/__init__.py tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py
git commit -m "feat: expose ontology cube-assisted modeling apis"
```

## Task 4: Extend frontend ontology API and URL state model

**Files:**
- Modify: `frontend/src/api/ontology.ts`
- Create: `frontend/src/hooks/semantic-ia/useOntologyWorkbench.ts`
- Modify: `frontend/src/hooks/semantic-ia/index.ts`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`

- [ ] **Step 1: Write the failing frontend tests for stage state and bootstrap loading**

```tsx
it('默认进入建模阶段并在未选择 Cube 时显示选择器', async () => {
  renderPage('/semantic/ontology')
  expect(await screen.findByText('选择 Cube')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '建模' })).toHaveAttribute('data-state', 'active')
})
```

```tsx
it('带 cube 参数时会自动加载 bootstrap 并进入对象步骤', async () => {
  renderPage('/semantic/ontology?stage=modeling&cube=orders')
  expect(await screen.findByText('业务对象')).toBeInTheDocument()
  expect(screen.getByDisplayValue('orders')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the ontology workbench unit test to verify it fails**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: FAIL because `stage` URL state, bootstrap queries and new workbench hook are not implemented.

- [ ] **Step 3: Implement API types and URL state hook**

```ts
export interface OntologyModelingBootstrapResponse {
  cube_summary: { name: string; title: string; table?: string }
  object_draft: { name: string; title: string; primary_cube_ref: string }
  property_candidates: Array<{ name: string; title: string; property_type: string; dimension_ref: string }>
  metric_candidates: Array<{ name: string; title: string; measure_ref: string }>
  relation_candidates: Array<{ target_cube: string; join_path_ref: string; relationship: string }>
  action_candidates: Array<{ cube_name: string; event_cube_ref: string; trigger_time_property?: string | null }>
}

export const bootstrapOntologyModeling = (cubeName: string) =>
  apiClient.post<OntologyModelingBootstrapResponse>('/ontology/modeling/bootstrap', { cube_name: cubeName })

export const getOntologyDependencyCheck = (cubeName: string) =>
  apiClient.get<{ cube_name: string; summary: Record<string, unknown>; items: Array<Record<string, unknown>> }>(
    '/ontology/modeling/dependency-check',
    { params: { cube_name: cubeName } },
  )
```

```ts
export type OntologyWorkbenchStage = 'modeling' | 'validation' | 'governance'

function normalizeStage(value: string | null): OntologyWorkbenchStage {
  if (value === 'validation') return 'validation'
  if (value === 'governance') return 'governance'
  return 'modeling'
}

function buildWorkbenchSearch(params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  return search.toString()
}

export function buildOntologyWorkbenchHref(params: {
  stage?: OntologyWorkbenchStage | null
  cube?: string | null
  tab?: string | null
  entity?: string | null
}) {
  const query = buildWorkbenchSearch(params)
  return query ? `/semantic/ontology?${query}` : '/semantic/ontology'
}

export function useOntologyWorkbench() {
  const [searchParams, setSearchParams] = useSearchParams()
  const stage = normalizeStage(searchParams.get('stage'))
  const cubeName = searchParams.get('cube')
  const tab = searchParams.get('tab')
  const entity = searchParams.get('entity')

  return {
    stage,
    cubeName,
    tab,
    entity,
    setStage: (nextStage: OntologyWorkbenchStage) =>
      setSearchParams(buildWorkbenchSearch({ stage: nextStage, cube: cubeName, tab, entity })),
    hrefFor: (next: Partial<{ stage: OntologyWorkbenchStage; cube: string | null; entity: string | null }>) =>
      buildOntologyWorkbenchHref({ stage, cube: cubeName, tab, entity, ...next }),
  }
}
```

- [ ] **Step 4: Run the ontology workbench unit test to verify it passes**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: PASS with `stage / cube / entity` URL state and bootstrap API surface available.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/ontology.ts frontend/src/hooks/semantic-ia/useOntologyWorkbench.ts frontend/src/hooks/semantic-ia/index.ts frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx
git commit -m "feat: add ontology workbench state model"
```

## Task 5: Rebuild Ontology Workbench shell into modeling, validation, and governance stages

**Files:**
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyWorkbenchShell.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyValidationStage.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyGovernanceStage.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyBindingInspector.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`

- [ ] **Step 1: Write the failing UI tests for the new shell layout**

```tsx
it('页面显示阶段切换和三栏壳层', async () => {
  renderPage('/semantic/ontology?stage=modeling')
  expect(await screen.findByRole('tab', { name: '建模' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '验证' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '治理发布' })).toBeInTheDocument()
  expect(screen.getByText('资产浏览器')).toBeInTheDocument()
  expect(screen.getByText('检查器')).toBeInTheDocument()
})
```

```tsx
it('验证阶段只展示验证摘要，不再展示大表单', async () => {
  renderPage('/semantic/ontology?stage=validation&tab=metrics&entity=gmv')
  expect(await screen.findByText('投影命中')).toBeInTheDocument()
  expect(screen.queryByLabelText('业务指标标题')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the ontology workbench unit test to verify it fails**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: FAIL because `OntologyWorkbench.tsx` still renders the old mixed page and does not have stage-specific content.

- [ ] **Step 3: Implement the new shell and stage composition**

```tsx
export default function OntologyWorkbench() {
  const workbench = useOntologyWorkbench()
  const leftRail = (
    <div className="border-r border-slate-200 bg-white">
      <div className="px-4 py-3 text-sm font-semibold text-slate-950">资产浏览器</div>
    </div>
  )
  const inspector = <OntologyBindingInspector />

  return (
    <OntologyWorkbenchShell
      stage={workbench.stage}
      leftRail={leftRail}
      inspector={inspector}
      onStageChange={workbench.setStage}
    >
      {workbench.stage === 'modeling' ? (
        <OntologyModelingStage cubeName={workbench.cubeName} activeTab={workbench.tab} entityName={workbench.entity} />
      ) : workbench.stage === 'validation' ? (
        <OntologyValidationStage cubeName={workbench.cubeName} activeTab={workbench.tab} entityName={workbench.entity} />
      ) : (
        <OntologyGovernanceStage cubeName={workbench.cubeName} activeTab={workbench.tab} entityName={workbench.entity} />
      )}
    </OntologyWorkbenchShell>
  )
}
```

```tsx
<div className="grid min-h-[calc(100vh-6.25rem)] grid-cols-[272px_minmax(0,1fr)_320px] bg-slate-50">
  <aside>{leftRail}</aside>
  <main>{children}</main>
  <aside>{inspector}</aside>
</div>
```

- [ ] **Step 4: Run the ontology workbench unit test to verify it passes**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: PASS with three-stage shell, left-rail asset browser and right-side inspector.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Semantic/OntologyWorkbench frontend/src/pages/Semantic/OntologyWorkbench.tsx frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx
git commit -m "feat: rebuild ontology workbench shell"
```

## Task 6: Replace free-text bindings with structured selectors and wire stage-specific data flows

**Files:**
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx`
- Modify: `frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.tsx`
- Modify: `frontend/src/components/Semantic/OntologyWorkbench/OntologyValidationStage.tsx`
- Modify: `frontend/src/components/Semantic/OntologyWorkbench/OntologyGovernanceStage.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`

- [ ] **Step 1: Write the failing tests for metric, relation, and action selectors**

```tsx
it('业务指标使用 Measure 选择器而不是自由文本 measure_refs', async () => {
  renderModelingStage()
  expect(await screen.findByLabelText('分析 Measure')).toBeInTheDocument()
  expect(screen.queryByPlaceholderText('orders.gmv, orders.net_gmv')).not.toBeInTheDocument()
})
```

```tsx
it('业务关系展示 Join Path 选择器，业务动作展示事件 Cube 选择器', async () => {
  renderModelingStage()
  expect(await screen.findByLabelText('Join Path')).toBeInTheDocument()
  expect(screen.getByLabelText('事件 Cube')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the modeling stage tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: FAIL because the page still uses comma-split text input for `measure_refs` and `event_cube_refs`, and relations have no explicit join binding selector.

- [ ] **Step 3: Implement structured selectors and stage-specific data fetching**

```tsx
<Label htmlFor="metric-measure">分析 Measure</Label>
<Select
  value={form.measure_refs?.[0] || ''}
  onValueChange={(value) => onChange({ ...form, measure_refs: value ? [value] : [] })}
>
  <SelectTrigger id="metric-measure">
    <SelectValue placeholder="选择 Measure" />
  </SelectTrigger>
  <SelectContent>
    {bootstrap.metric_candidates.map((candidate) => (
      <SelectItem key={candidate.measure_ref} value={candidate.measure_ref}>
        {candidate.title} · {candidate.measure_ref}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

```tsx
const validationQueries = useMemo(
  () => ({
    mapping: stage === 'validation' ? previewSemanticMapping({ entityType, entityName }) : null,
    metricLinks: stage === 'validation' && activeTab === 'metrics' ? getBusinessMetricLinks(entityName) : null,
    dependencyGuard: stage === 'governance' && cubeName ? getOntologyDependencyCheck(cubeName) : null,
  }),
  [activeTab, cubeName, entityName, stage],
)
```

- [ ] **Step 4: Run the modeling and page tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: PASS with `Measure / Join Path / 事件 Cube` selectors visible and stage-specific data loading reduced to the current task context.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyModelingStage.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyValidationStage.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyGovernanceStage.tsx frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx
git commit -m "feat: add structured ontology binding selectors"
```

## Task 7: Add ontology regression coverage, docs, and final verification

**Files:**
- Create: `frontend/tests/e2e-node/ontology-workbench.spec.ts`
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
- Create: `frontend/tests/e2e/ontology_modeling_smoke.py`
- Modify: `frontend/package.json`
- Modify: `docs/semantic_verification.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: Write the failing regression and smoke assertions**

```ts
test('ontology workbench starts from cube selection and stage tabs', async ({ page }) => {
  await page.goto('/semantic/ontology')
  await expect(page.getByRole('tab', { name: '建模' })).toBeVisible()
  await expect(page.getByText('选择 Cube')).toBeVisible()
})
```

```python
goto_semantic(page, "/semantic/ontology")
page.get_by_text("选择 Cube").wait_for()
page.get_by_role("button", name="选择 orders").click()
page.get_by_label("分析 Measure").click()
page.get_by_role("option", name=re.compile("GMV")).click()
page.get_by_role("button", name="保存").click()
```

- [ ] **Step 2: Run the targeted regression checks to verify they fail**

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/ontology-workbench.spec.ts tests/e2e-node/semantic.visual.spec.ts`

Run: `cd frontend && node ./scripts/run-semantic-smoke.mjs tests/e2e/ontology_modeling_smoke.py`

Expected: FAIL because no ontology-specific browser spec or smoke path is wired yet.

- [ ] **Step 3: Wire the new regression entry and update docs**

```json
"verify:semantic-layout": "npm exec -- tsc --noEmit --pretty false && npm run test:unit -- src/pages/Semantic/DomainList.page.test.tsx src/pages/Semantic/RelationCanvas.page.test.tsx src/pages/Semantic/DomainCanvas.page.test.tsx src/pages/Semantic/DevTools.page.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx src/pages/Semantic/domainCanvasState.test.ts src/components/Semantic/workbench.test.tsx src/components/Semantic/OntologyWorkbench/OntologyModelingStage.test.tsx && npm run test:visual && playwright test tests/e2e-node/cube-browse.spec.ts tests/e2e-node/domain-creation.spec.ts tests/e2e-node/domain-catalog.spec.ts tests/e2e-node/domain-publish.spec.ts tests/e2e-node/devtools-browse.spec.ts tests/e2e-node/ontology-workbench.spec.ts"
```

```md
- `本体工作台`：先选 `Cube`，再完成对象/属性/指标/关系/动作的业务语义绑定。
- `make test-regression-semantic` 现在额外覆盖 `OntologyWorkbench.page.test.tsx`、`OntologyModelingStage.test.tsx` 和 `ontology-workbench.spec.ts`。
- `make smoke-semantic` 现在额外覆盖 `tests/e2e/ontology_modeling_smoke.py`。
```

- [ ] **Step 4: Run the full semantic verification to verify it passes**

Run: `make verify-semantic`

Expected: PASS with backend/frontend基线、语义回归、视觉基线和新的 ontology smoke 全部通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-node/ontology-workbench.spec.ts frontend/tests/e2e-node/semantic.visual.spec.ts frontend/tests/e2e/ontology_modeling_smoke.py frontend/package.json docs/semantic_verification.md docs/TECH_STACK_AND_ARCHITECTURE.md frontend/README.md
git commit -m "test: cover ontology cube-assisted modeling workflow"
```

## Self-Review

### Spec coverage

- `Cube` 成为建模第一入口：Task 3、Task 4、Task 5 覆盖。
- 对象/属性/指标/关系/动作的结构化绑定：Task 1、Task 6 覆盖。
- 保存接口强校验：Task 1 覆盖。
- 底层 `Cube` 变更级联检测：Task 2、Task 3 覆盖。
- 三阶段 IA：Task 4、Task 5 覆盖。
- 验证与治理保留并收口：Task 5、Task 6 覆盖。
- 文档与验证链同步：Task 7 覆盖。

### Placeholder scan

- 计划中没有 `TODO / TBD / implement later / 类似 Task N` 这类占位描述。
- 每个任务都包含明确文件路径、测试命令、期望结果和最小代码片段。
- 最终验证命令固定为 `make verify-semantic`，没有模糊成“运行相关测试”。

### Type consistency

- URL 状态统一使用 `stage / cube / tab / entity`。
- 对象绑定字段统一使用 `primary_cube_ref`。
- 属性绑定字段统一使用 `dimension_ref`。
- 关系绑定字段统一使用 `join_path_ref`。
- 指标仍沿用 `measure_refs`，动作仍沿用 `event_cube_refs`，避免引入第二套绑定字段命名。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-ontology-workbench-cube-assisted-modeling-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
