# Ontology Workbench Object Aggregate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/semantic/ontology` 重构为“对象聚合根主工作台 + 专项索引辅助治理”的本体工作台，让对象成为主建模上下文，并用对象聚合视图承接属性、关系、动作、业务指标、规则与治理。

**Architecture:** 后端新增对象聚合读模型服务与绑定健康服务，把现有 `对象 / 属性 / 指标 / 关系 / 动作 / 权限 / 历史 / 预览` 能力重新编排为“对象详情 + 辅助索引”两类查询接口；前端将 `OntologyWorkbench` 从七类资产并列页重构为“对象列表 + 对象详情 + 关系/规则/指标索引”壳层，并通过绑定修复抽屉承接 `warning / stale` 的闭环处理。第一阶段不引入独立规则引擎：`状态` 通过 `BusinessProperty.property_role` 落地，`规则` 先用现有 `PolicyMetadata + 发布校验 / 绑定风险` 承接。

**Tech Stack:** React 18、TypeScript、TanStack Query、Vitest、Playwright、Flask Blueprint、Pydantic、dependency-injector、YAML 仓储、仓库根目录 `make verify-semantic`

---

## Principle Guardrails

- `KISS`：主入口只保留对象列表；关系、规则、指标索引只做辅助治理，不再新增一套主导航。
- `YAGNI`：第一阶段不引入独立 `BusinessRule` 实体；状态先通过属性角色分组，规则先基于现有 `PolicyMetadata` 和绑定风险落地。
- `SOLID`：对象详情页负责对象语义全貌，辅助索引页负责跨对象检索，Cube 工作台继续负责技术实现。
- `DRY`：不在 Ontology 层重复承载 Cube 公式；辅助视图不复制对象详情的完整编辑能力；绑定修复统一回对象详情内完成。

## Scope Check

本次计划围绕单一子系统 `/semantic/ontology` 展开，但需要明确第一阶段范围：

- `状态` 的最小实现：新增 `BusinessProperty.property_role`，将 `attribute / state` 作为对象内静态能力分组。
- `规则` 的最小实现：用 `PolicyMetadata` 作为对象规则的第一种具体形态，并把发布校验 / 绑定风险纳入治理区；不新增通用规则 DSL。
- `业务指标修复` 的最小实现：提供绑定状态、修复抽屉、重新绑定和状态回写；不做自动修复。

这样每个任务都能形成可交付的软件闭环，不会被开放式“规则引擎设计”拖垮。

## File Structure

### Backend read models and health services

- Create: `app/application/ontology/object_aggregate_service.py`
  - 组合对象、属性、关系、动作、业务指标、关联 Cube、规则与治理摘要，返回对象详情页所需读模型。
- Create: `app/application/ontology/object_index_service.py`
  - 输出关系索引、规则索引、业务指标索引的全局列表，统一处理筛选、状态和跳转标识。
- Create: `app/application/ontology/binding_health_service.py`
  - 汇总业务指标绑定状态、对象关联风险和修复所需上下文，承接 `fresh / warning / stale` 计算。
- Modify: `app/domain/ontology/entities.py`
  - 为 `BusinessProperty` 增加 `property_role`，并为指标绑定状态与对象聚合提供必要类型字段。
- Modify: `app/application/ontology/definition_service.py`
  - 保存属性时接受 `property_role`，保存指标时补版本校验和绑定状态回写，保持规则阶段最小兼容。
- Modify: `app/application/semantic_mapper/preview_service.py`
  - 暴露稳定的指标绑定状态判定与对象关联 Cube 解析能力，供绑定健康服务复用。
- Modify: `app/interfaces/api/v1/ontology.py`
  - 新增对象聚合与辅助索引接口。
- Modify: `app/di/container.py`
  - 注册对象聚合、索引与绑定健康服务。
- Modify: `app/__init__.py`
  - 用新依赖构建 `ontology` Blueprint。

### Backend tests

- Create: `tests/unit/application/ontology/test_object_aggregate_service.py`
  - 覆盖对象详情读模型的聚合结构。
- Create: `tests/unit/application/ontology/test_object_index_service.py`
  - 覆盖关系/规则/指标索引筛选和状态聚合。
- Create: `tests/unit/application/ontology/test_binding_health_service.py`
  - 覆盖 `fresh / warning / stale` 状态与修复上下文。
- Modify: `tests/unit/application/ontology/test_definition_service.py`
  - 覆盖 `property_role` 保存、业务指标版本冲突与绑定状态回写。
- Modify: `tests/unit/interfaces/api/v1/test_ontology_blueprints.py`
  - 覆盖新增对象聚合和索引接口。
- Modify: `tests/integration/test_ontology_api.py`
  - 覆盖“对象详情 -> 指标绑定风险 -> 修复后回绿”的集成路径。

### Frontend object aggregate workbench

- Modify: `frontend/src/api/ontology.ts`
  - 新增对象聚合、辅助索引、绑定健康与修复相关类型和请求函数。
- Create: `frontend/src/hooks/semantic-ia/useOntologyObjectWorkbench.ts`
  - 管理 `view / object / section / repairTarget` URL 状态和跳转。
- Modify: `frontend/src/hooks/semantic-ia/index.ts`
  - 暴露新的对象聚合工作台 hook 与 href 构造函数。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyWorkbenchShell.tsx`
  - 统一壳层：对象列表、辅助视图入口、主内容区。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectListRail.tsx`
  - 对象列表和辅助视图切换入口。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.tsx`
  - 顶部上下文与对象定义摘要。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectCapabilities.tsx`
  - 属性/状态/动作/规则的对象能力区。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectAssociations.tsx`
  - 关系、业务指标、关联 Cube 区。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectGovernance.tsx`
  - 校验、发布检查、历史、审计、绑定风险区。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.tsx`
  - 关系/规则/指标索引统一列表视图。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.tsx`
  - 指标绑定异常修复抽屉。
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.tsx`
  - 从资产并列页重构为对象聚合根工作台容器。

### Frontend tests and regression

- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`
  - 覆盖对象主入口、详情页分层、辅助视图和修复抽屉。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx`
  - 覆盖对象详情默认展开与摘要策略。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx`
  - 覆盖辅助索引只读跳转边界。
- Create: `frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx`
  - 覆盖 `warning / stale` 修复流程。
- Create: `frontend/tests/e2e-node/ontology-object-workbench.spec.ts`
  - 覆盖对象列表进入、索引页跳转和绑定修复。
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
  - 更新本体工作台视觉基线。
- Create: `frontend/tests/e2e/ontology_object_workbench_smoke.py`
  - 覆盖对象聚合主流程和绑定风险修复烟测。
- Modify: `frontend/package.json`
  - 把对象聚合工作台测试纳入 `verify:semantic-layout` 与 `verify:semantic`。

### Docs

- Modify: `docs/semantic_verification.md`
  - 更新对象聚合工作台的回归与 smoke 说明。
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - 更新本体层聚合根与 Cube 层边界说明。
- Modify: `frontend/README.md`
  - 更新 `/semantic/ontology` 的新职责与调试方式。

## Task 1: Add object aggregate backend read models

**Files:**
- Create: `app/application/ontology/object_aggregate_service.py`
- Create: `app/application/ontology/object_index_service.py`
- Modify: `app/domain/ontology/entities.py`
- Modify: `tests/unit/application/ontology/test_object_aggregate_service.py`
- Modify: `tests/unit/application/ontology/test_object_index_service.py`

- [ ] **Step 1: Write the failing unit tests for object aggregate and index payloads**

```python
def test_get_object_aggregate_returns_object_centered_payload(tmp_path):
    service = _build_object_aggregate_service(tmp_path)

    payload = service.get_object_aggregate("order")

    assert payload["object"]["name"] == "order"
    assert payload["capabilities"]["attributes"][0]["name"] == "order_amount"
    assert payload["capabilities"]["states"][0]["name"] == "order_status"
    assert payload["associations"]["metrics"][0]["name"] == "gmv"
    assert payload["associations"]["rules"][0]["name"] == "gmv_policy"
```

```python
def test_list_metric_index_filters_by_binding_status(tmp_path):
    service = _build_object_index_service(tmp_path)

    items = service.list_metric_index(binding_status="stale")["items"]

    assert len(items) == 1
    assert items[0]["metric_name"] == "gmv"
    assert items[0]["binding_status"] == "stale"
```

- [ ] **Step 2: Run the aggregate and index tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/unit/application/ontology/test_object_aggregate_service.py tests/unit/application/ontology/test_object_index_service.py -v`

Expected: FAIL because `object_aggregate_service.py` and `object_index_service.py` do not exist yet.

- [ ] **Step 3: Implement minimal object aggregate and index services**

```python
class BusinessProperty(BaseModel):
    name: str
    title: str
    object_name: str
    property_type: Literal["string", "number", "time", "boolean", "enum", "unknown"] = "unknown"
    property_role: Literal["attribute", "state"] = "attribute"
    description: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    status: Literal["draft", "active", "deprecated"] = "draft"
```

```python
class ObjectAggregateService:
    def __init__(
        self,
        object_repository,
        property_repository,
        relation_repository,
        action_repository,
        metric_repository,
        policy_repository,
        history_repository,
        binding_health_service,
    ):
        self._object_repository = object_repository
        self._property_repository = property_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository
        self._metric_repository = metric_repository
        self._policy_repository = policy_repository
        self._history_repository = history_repository
        self._binding_health_service = binding_health_service

    def get_object_aggregate(self, object_name: str) -> Dict[str, Any]:
        obj = self._object_repository.get(object_name)
        if obj is None:
            raise ValueError(f"未找到业务对象: {object_name}")
        properties = [item.model_dump(mode="json") for item in self._property_repository.list_all() if item.object_name == object_name]
        metrics = [item.model_dump(mode="json") for item in self._metric_repository.list_all() if item.object_name == object_name]
        actions = [item.model_dump(mode="json") for item in self._action_repository.list_all() if item.object_name == object_name]
        relations = [
            item.model_dump(mode="json")
            for item in self._relation_repository.list_all()
            if item.source_object_name == object_name or item.target_object_name == object_name
        ]
        rules = self._rules_for_object(object_name, properties, metrics, actions)
        binding = self._binding_health_service.get_object_binding_health(object_name)
        return {
            "object": obj.model_dump(mode="json"),
            "capabilities": {
                "attributes": [item for item in properties if item.get("property_role") != "state"],
                "states": [item for item in properties if item.get("property_role") == "state"],
                "actions": actions,
                "rules": rules,
            },
            "associations": {
                "relations": relations,
                "metrics": metrics,
                "rules": rules,
                "cubes": binding["linked_cubes"],
            },
            "governance": {
                "binding_risks": binding["items"],
                "history": [item.model_dump(mode="json") for item in self._history_repository.list_by_entity("object", object_name)],
            },
        }

    def _rules_for_object(self, object_name: str, properties: List[Dict[str, Any]], metrics: List[Dict[str, Any]], actions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        targets = {
            ("object", object_name),
            *{("property", item["name"]) for item in properties},
            *{("metric", item["name"]) for item in metrics},
            *{("action", item["name"]) for item in actions},
        }
        return [
            item.model_dump(mode="json")
            for item in self._policy_repository.list_all()
            if (item.target_type, item.target_name) in targets
        ]
```

```python
class ObjectIndexService:
    def __init__(self, relation_repository, metric_repository, policy_repository, binding_health_service):
        self._relation_repository = relation_repository
        self._metric_repository = metric_repository
        self._policy_repository = policy_repository
        self._binding_health_service = binding_health_service

    def list_metric_index(self, binding_status: str | None = None) -> Dict[str, Any]:
        items = []
        for metric in self._metric_repository.list_all():
            health = self._binding_health_service.get_metric_binding_health(metric.name)
            row = {
                "metric_name": metric.name,
                "object_name": metric.object_name,
                "binding_status": health["status"],
                "measure_refs": metric.measure_refs,
            }
            if binding_status and row["binding_status"] != binding_status:
                continue
            items.append(row)
        return {"items": items, "total": len(items)}
```

- [ ] **Step 4: Run the aggregate and index tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/unit/application/ontology/test_object_aggregate_service.py tests/unit/application/ontology/test_object_index_service.py -v`

Expected: PASS with object aggregate and auxiliary index read models available.

- [ ] **Step 5: Commit**

```bash
git add app/application/ontology/object_aggregate_service.py app/application/ontology/object_index_service.py app/domain/ontology/entities.py tests/unit/application/ontology/test_object_aggregate_service.py tests/unit/application/ontology/test_object_index_service.py
git commit -m "feat: add ontology object aggregate read models"
```

## Task 2: Add binding health service and object-centric ontology APIs

**Files:**
- Create: `app/application/ontology/binding_health_service.py`
- Modify: `app/application/semantic_mapper/preview_service.py`
- Modify: `app/application/ontology/definition_service.py`
- Modify: `app/interfaces/api/v1/ontology.py`
- Modify: `app/di/container.py`
- Modify: `app/__init__.py`
- Modify: `tests/unit/application/ontology/test_binding_health_service.py`
- Modify: `tests/unit/interfaces/api/v1/test_ontology_blueprints.py`
- Modify: `tests/integration/test_ontology_api.py`

- [ ] **Step 1: Write the failing tests for binding health and new blueprint endpoints**

```python
def test_metric_binding_health_returns_warning_and_repair_candidates(tmp_path):
    service = _build_binding_health_service(tmp_path)

    payload = service.get_metric_binding_health("gmv")

    assert payload["status"] == "warning"
    assert payload["repair_targets"][0]["measure_ref"] == "orders.gmv"
```

```python
def test_ontology_blueprint_exposes_object_aggregate_and_indexes(client):
    assert client.get("/api/v1/ontology/objects/order/aggregate").status_code == 200
    assert client.get("/api/v1/ontology/indexes/relations").status_code == 200
    assert client.get("/api/v1/ontology/indexes/rules").status_code == 200
    assert client.get("/api/v1/ontology/indexes/metrics").status_code == 200
```

- [ ] **Step 2: Run the health, blueprint, and integration tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/unit/application/ontology/test_binding_health_service.py tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py -v`

Expected: FAIL because binding health service and object aggregate endpoints do not exist yet.

- [ ] **Step 3: Implement binding health, save-time role handling, and API surfaces**

```python
class BindingHealthService:
    def __init__(self, metric_repository, mapper_preview_service, cube_repository):
        self._metric_repository = metric_repository
        self._mapper_preview_service = mapper_preview_service
        self._cube_repository = cube_repository

    def get_metric_binding_health(self, metric_name: str) -> Dict[str, Any]:
        preview = self._mapper_preview_service.preview(entity_type="metric", entity_name=metric_name)
        issues = list(preview.get("consistency", {}).get("issues", []))
        targets = list(preview.get("projection", {}).get("targets", []))
        if not targets:
            status = "stale"
        elif issues:
            status = "warning"
        else:
            status = "fresh"
        return {
            "metric_name": metric_name,
            "status": status,
            "issues": issues,
            "repair_targets": [
                {"measure_ref": f'{item.get("cube_name")}.{item.get("target_name")}'.strip(".")}
                for item in targets
                if item.get("cube_name") and item.get("target_name")
            ],
        }

    def get_object_binding_health(self, object_name: str) -> Dict[str, Any]:
        linked_cubes = []
        items = []
        for metric in self._metric_repository.list_all():
            if metric.object_name != object_name:
                continue
            health = self.get_metric_binding_health(metric.name)
            linked_cubes.extend(ref.split(".", 1)[0] for ref in metric.measure_refs if "." in ref)
            if health["status"] != "fresh":
                items.append(health)
        return {"object_name": object_name, "linked_cubes": sorted(set(linked_cubes)), "items": items}
```

```python
def save_property(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    object_name = str(payload.get("object_name", "")).strip()
    property_role = str(payload.get("property_role") or "attribute").strip() or "attribute"
    if property_role not in {"attribute", "state"}:
        raise ValueError(f"不支持的属性角色: {property_role}")
    entity = BusinessProperty(
        **{
            **payload,
            "object_name": object_name,
            "property_role": property_role,
            "aliases": self._dedupe(payload.get("aliases")),
        }
    )
    self._property_repository.save(entity)
    return entity.model_dump(mode="json")
```

```python
@bp.route("/objects/<name>/aggregate", methods=["GET"])
def get_object_aggregate(name: str):
    try:
        payload = object_aggregate_service.get_object_aggregate(name)
    except ValueError as exc:
        return not_found(str(exc))
    return success(data=payload)

@bp.route("/indexes/relations", methods=["GET"])
def list_relation_index():
    return success(data=object_index_service.list_relation_index())

@bp.route("/indexes/rules", methods=["GET"])
def list_rule_index():
    return success(data=object_index_service.list_rule_index())

@bp.route("/indexes/metrics", methods=["GET"])
def list_metric_index():
    binding_status = request.args.get("binding_status", "").strip() or None
    return success(data=object_index_service.list_metric_index(binding_status=binding_status))
```

- [ ] **Step 4: Run the health, blueprint, and integration tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/unit/application/ontology/test_binding_health_service.py tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py -v`

Expected: PASS with `property_role` persistence, binding health calculation, and object-centric APIs available.

- [ ] **Step 5: Commit**

```bash
git add app/application/ontology/binding_health_service.py app/application/semantic_mapper/preview_service.py app/application/ontology/definition_service.py app/interfaces/api/v1/ontology.py app/di/container.py app/__init__.py tests/unit/application/ontology/test_binding_health_service.py tests/unit/interfaces/api/v1/test_ontology_blueprints.py tests/integration/test_ontology_api.py
git commit -m "feat: expose ontology object aggregate apis"
```

## Task 3: Add frontend object-centric state model and shell

**Files:**
- Modify: `frontend/src/api/ontology.ts`
- Create: `frontend/src/hooks/semantic-ia/useOntologyObjectWorkbench.ts`
- Modify: `frontend/src/hooks/semantic-ia/index.ts`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyWorkbenchShell.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectListRail.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx`

- [ ] **Step 1: Write the failing UI tests for object-first navigation and default expand state**

```tsx
it('默认先显示对象列表而不是七类资产 tab', async () => {
  renderPage('/semantic/ontology')
  expect(await screen.findByText('对象列表')).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: '业务指标' })).not.toBeInTheDocument()
})
```

```tsx
it('进入对象详情后默认展开上下文、对象定义摘要和风险摘要', async () => {
  renderPage('/semantic/ontology?object=order')
  expect(await screen.findByText('订单对象')).toBeInTheDocument()
  expect(screen.getByText('对象定义')).toBeInTheDocument()
  expect(screen.getByText('绑定风险')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the ontology workbench and overview tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx`

Expected: FAIL because the current page still renders asset tabs and has no object-centric shell.

- [ ] **Step 3: Implement API types, workbench hook, and shell**

```ts
export interface OntologyObjectAggregateResponse {
  object: { name: string; title: string; description?: string | null; status: string }
  capabilities: {
    attributes: Array<Record<string, unknown>>
    states: Array<Record<string, unknown>>
    actions: Array<Record<string, unknown>>
    rules: Array<Record<string, unknown>>
  }
  associations: {
    relations: Array<Record<string, unknown>>
    metrics: Array<Record<string, unknown>>
    cubes: string[]
  }
  governance: {
    binding_risks: Array<Record<string, unknown>>
    history: Array<Record<string, unknown>>
  }
}

export const getOntologyObjectAggregate = (name: string) =>
  apiClient.get<OntologyObjectAggregateResponse>(`/ontology/objects/${name}/aggregate`)
```

```ts
export type OntologyWorkbenchView = 'objects' | 'relations' | 'rules' | 'metrics'

export function useOntologyObjectWorkbench() {
  const [searchParams, setSearchParams] = useSearchParams()
  const objectName = searchParams.get('object')
  const view = (searchParams.get('view') as OntologyWorkbenchView | null) || 'objects'
  const section = searchParams.get('section') || 'overview'
  const repairTarget = searchParams.get('repairTarget')

  return {
    objectName,
    view,
    section,
    repairTarget,
    openObject: (name: string) => setSearchParams({ view: 'objects', object: name, section: 'overview' }),
    openIndex: (next: Exclude<OntologyWorkbenchView, 'objects'>) => setSearchParams({ view: next }),
    openRepair: (metricName: string) =>
      setSearchParams((prev) => {
        prev.set('repairTarget', metricName)
        return prev
      }),
  }
}
```

```tsx
export default function OntologyWorkbench() {
  const workbench = useOntologyObjectWorkbench()

  return (
    <OntologyWorkbenchShell
      rail={<OntologyObjectListRail currentView={workbench.view} currentObject={workbench.objectName} />}
    >
      {workbench.view === 'objects' ? (
        <OntologyObjectOverview objectName={workbench.objectName} />
      ) : null}
    </OntologyWorkbenchShell>
  )
}
```

- [ ] **Step 4: Run the ontology workbench and overview tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx`

Expected: PASS with object-first entry, default expanded summary sections, and shell routing in place.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/ontology.ts frontend/src/hooks/semantic-ia/useOntologyObjectWorkbench.ts frontend/src/hooks/semantic-ia/index.ts frontend/src/components/Semantic/OntologyWorkbench/OntologyWorkbenchShell.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectListRail.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.tsx frontend/src/pages/Semantic/OntologyWorkbench.tsx frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx
git commit -m "feat: add ontology object-first workbench shell"
```

## Task 4: Implement object capabilities, associations, and governance sections

**Files:**
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectCapabilities.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectAssociations.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectGovernance.tsx`
- Modify: `frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`

- [ ] **Step 1: Write the failing UI tests for section grouping and collapsed summaries**

```tsx
it('对象能力区按属性/状态/动作/规则分组展示', async () => {
  renderPage('/semantic/ontology?object=order')
  expect(await screen.findByText('属性')).toBeInTheDocument()
  expect(screen.getByText('状态')).toBeInTheDocument()
  expect(screen.getByText('动作')).toBeInTheDocument()
  expect(screen.getByText('规则')).toBeInTheDocument()
})
```

```tsx
it('对象关联区默认摘要展示前 5 项并提供查看全部入口', async () => {
  renderPage('/semantic/ontology?object=order')
  expect(await screen.findByRole('button', { name: '查看全部关系' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看全部业务指标' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the object detail tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: FAIL because object detail sections and collapsed summaries are not implemented.

- [ ] **Step 3: Implement grouped detail sections**

```tsx
export function OntologyObjectCapabilities({ aggregate }: { aggregate: OntologyObjectAggregateResponse }) {
  return (
    <section className="space-y-4">
      <SectionCard title="属性" items={aggregate.capabilities.attributes.slice(0, 5)} />
      <SectionCard title="状态" items={aggregate.capabilities.states.slice(0, 5)} />
      <SectionCard title="动作" items={aggregate.capabilities.actions.slice(0, 5)} />
      <SectionCard title="规则" items={aggregate.capabilities.rules.slice(0, 5)} />
    </section>
  )
}
```

```tsx
export function OntologyObjectAssociations({ aggregate }: { aggregate: OntologyObjectAggregateResponse }) {
  return (
    <section className="space-y-4">
      <AssociationCard title="关系" items={aggregate.associations.relations.slice(0, 5)} actionLabel="查看全部关系" />
      <AssociationCard title="业务指标" items={aggregate.associations.metrics.slice(0, 5)} actionLabel="查看全部业务指标" />
      <AssociationCard title="关联 Cube" items={aggregate.associations.cubes.slice(0, 5).map((cube) => ({ title: cube }))} />
    </section>
  )
}
```

- [ ] **Step 4: Run the object detail tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: PASS with grouped capabilities, associations, and summary-first layout.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectCapabilities.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectAssociations.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectGovernance.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.tsx frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx
git commit -m "feat: add ontology object detail sections"
```

## Task 5: Implement auxiliary indexes and binding repair drawer

**Files:**
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx`
- Create: `frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.tsx`
- Modify: `frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx`

- [ ] **Step 1: Write the failing UI tests for read-only indexes and repair workflow**

```tsx
it('辅助视图只提供跳转，不提供完整编辑入口', async () => {
  renderPage('/semantic/ontology?view=metrics')
  expect(await screen.findByText('业务指标索引')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '前往对象详情' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '保存指标' })).not.toBeInTheDocument()
})
```

```tsx
it('点击 stale 指标会打开绑定修复抽屉并回写状态', async () => {
  renderPage('/semantic/ontology?object=order')
  expect(await screen.findByRole('button', { name: '修复 GMV 绑定' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the auxiliary index and repair tests to verify they fail**

Run: `cd frontend && npm run test:unit -- src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: FAIL because there is no auxiliary index component or repair drawer yet.

- [ ] **Step 3: Implement read-only indexes and repair drawer**

```tsx
export function OntologyAuxiliaryIndexView({ view, rows, onJump }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{view === 'metrics' ? '业务指标索引' : view === 'rules' ? '规则索引' : '关系索引'}</h2>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.title}</td>
              <td>{row.objectName}</td>
              <td>{row.status}</td>
              <td>
                <button type="button" onClick={() => onJump(row.objectName, row.targetSection)}>前往对象详情</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

```tsx
export function BindingRepairDrawer({ open, metricName, repairTargets, onRepair }: Props) {
  const [selectedTarget, setSelectedTarget] = useState(repairTargets[0]?.measure_ref || '')

  return (
    <PageDrawer open={open} title={`修复 ${metricName} 绑定`} onClose={() => onRepair(null)}>
      <div className="space-y-4">
        <Label htmlFor="repair-measure">重新绑定到</Label>
        <Select value={selectedTarget} onValueChange={setSelectedTarget}>
          <SelectTrigger id="repair-measure">
            <SelectValue placeholder="选择 Measure" />
          </SelectTrigger>
          <SelectContent>
            {repairTargets.map((item) => (
              <SelectItem key={item.measure_ref} value={item.measure_ref}>
                {item.measure_ref}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" onClick={() => onRepair(selectedTarget)}>确认修复</Button>
      </div>
    </PageDrawer>
  )
}
```

- [ ] **Step 4: Run the auxiliary index and repair tests to verify they pass**

Run: `cd frontend && npm run test:unit -- src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx`

Expected: PASS with read-only auxiliary views, jump-back behavior, and repair drawer flow.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.tsx frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.tsx frontend/src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx frontend/src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx frontend/src/pages/Semantic/OntologyWorkbench.tsx frontend/src/pages/Semantic/OntologyWorkbench.page.test.tsx
git commit -m "feat: add ontology auxiliary indexes and binding repair"
```

## Task 6: Update regression, smoke, and docs

**Files:**
- Create: `frontend/tests/e2e-node/ontology-object-workbench.spec.ts`
- Create: `frontend/tests/e2e/ontology_object_workbench_smoke.py`
- Modify: `frontend/tests/e2e-node/semantic.visual.spec.ts`
- Modify: `frontend/package.json`
- Modify: `docs/semantic_verification.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: Write the failing browser and smoke assertions for the new IA**

```ts
test('ontology workbench uses object list as primary entry', async ({ page }) => {
  await page.goto('/semantic/ontology')
  await expect(page.getByText('对象列表')).toBeVisible()
  await expect(page.getByText('关系索引')).toBeVisible()
})
```

```python
goto_semantic(page, "/semantic/ontology")
page.get_by_text("对象列表").wait_for()
page.get_by_role("link", name="订单").click()
page.get_by_text("对象定义").wait_for()
page.get_by_role("button", name="修复 GMV 绑定").click()
page.get_by_text("修复 GMV 绑定").wait_for()
```

- [ ] **Step 2: Run the targeted regression checks to verify they fail**

Run: `cd frontend && npm exec -- playwright test tests/e2e-node/ontology-object-workbench.spec.ts tests/e2e-node/semantic.visual.spec.ts`

Run: `cd frontend && node ./scripts/run-semantic-smoke.mjs tests/e2e/ontology_object_workbench_smoke.py`

Expected: FAIL because the object-first workbench flow and smoke path are not wired yet.

- [ ] **Step 3: Wire verification entry points and update docs**

```json
"verify:semantic-layout": "npm exec -- tsc --noEmit --pretty false && npm run test:unit -- src/pages/Semantic/DomainList.page.test.tsx src/pages/Semantic/RelationCanvas.page.test.tsx src/pages/Semantic/DomainCanvas.page.test.tsx src/pages/Semantic/DevTools.page.test.tsx src/pages/Semantic/OntologyWorkbench.page.test.tsx src/components/Semantic/OntologyWorkbench/OntologyObjectOverview.test.tsx src/components/Semantic/OntologyWorkbench/OntologyAuxiliaryIndexView.test.tsx src/components/Semantic/OntologyWorkbench/BindingRepairDrawer.test.tsx src/pages/Semantic/domainCanvasState.test.ts src/components/Semantic/workbench.test.tsx && npm run test:visual && playwright test tests/e2e-node/cube-browse.spec.ts tests/e2e-node/domain-creation.spec.ts tests/e2e-node/domain-catalog.spec.ts tests/e2e-node/domain-publish.spec.ts tests/e2e-node/devtools-browse.spec.ts tests/e2e-node/ontology-object-workbench.spec.ts"
```

```md
- `本体工作台` 现在以“对象列表”作为主入口，关系/规则/业务指标改为辅助索引视图。
- `业务指标绑定风险` 在对象详情页内通过修复抽屉闭环处理，辅助索引不承载完整编辑流。
- `make verify-semantic` 现在额外覆盖 `ontology-object-workbench.spec.ts` 与 `ontology_object_workbench_smoke.py`。
```

- [ ] **Step 4: Run full semantic verification to verify it passes**

Run: `make verify-semantic`

Expected: PASS with backend/frontend 基线、语义回归、视觉基线和对象聚合工作台 smoke 全部通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-node/ontology-object-workbench.spec.ts frontend/tests/e2e/ontology_object_workbench_smoke.py frontend/tests/e2e-node/semantic.visual.spec.ts frontend/package.json docs/semantic_verification.md docs/TECH_STACK_AND_ARCHITECTURE.md frontend/README.md
git commit -m "test: cover ontology object aggregate workflow"
```

## Self-Review

### Spec coverage

- 对象聚合根 IA：Task 3、Task 4 覆盖。
- 对象详情页折叠与摘要策略：Task 3、Task 4 覆盖。
- `状态` 最小实现：Task 1、Task 2 通过 `property_role` 覆盖。
- `规则` 最小实现：Task 1、Task 2 通过 `PolicyMetadata` 聚合与索引覆盖。
- 业务指标正式定义与绑定状态：Task 1、Task 2、Task 5 覆盖。
- 辅助视图边界铁律：Task 5 覆盖。
- 绑定异常处理路径：Task 2、Task 5 覆盖。
- 文档与验证更新：Task 6 覆盖。

### Placeholder scan

- 计划中没有 `TODO / TBD / implement later / 类似 Task N` 之类占位描述。
- 每个任务都包含明确文件、测试入口、最小代码片段和验收命令。
- `状态 / 规则` 的第一阶段实现方式已经显式说明，没有把关键决策留给实现时临场判断。

### Type consistency

- 对象入口统一使用 `view / object / section / repairTarget` URL 状态。
- 属性分组统一使用 `property_role`。
- 绑定状态统一使用 `fresh / warning / stale`。
- 辅助视图统一只做跳转，不在任何任务里新增二次编辑 API。

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-ontology-workbench-object-aggregate-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
