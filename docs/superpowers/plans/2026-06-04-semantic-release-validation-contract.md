# Semantic Release Validation Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为语义建设工作台提供发布前只读校验契约，返回 semantic spec、语义中心编译状态、compiled SQL、release diff、impact summary 和 gateway SQL dry-run 状态，确保发布目标是语义中心且平台控制面不直接执行生产查询。

**Architecture:** 应用层 `ReleaseValidationPreviewService` 从建模会话的 Spec 生成发布预演结果，先通过可注入的 `semantic_compile_preview` callable 调用语义中心编译预演，再把语义中心返回的物理 SQL 交给可注入的 `gateway_sql_dry_run` callable 调用执行面。Copilot API 增加 `/sessions/<session_id>/release-preview` 只读端点；前端发布预演入口和结果面板只消费该契约，不拼接 SQL 或用 AI 文案模拟发布校验。

**Tech Stack:** Flask Blueprint、Python dataclasses、pytest、现有 SemanticModelingCopilotService、React/Vitest 客户端契约测试。

---

## Scope Check

本计划覆盖发布校验后端契约和最小前端消费模型。统一入口、字段候选主画布和导航收敛在 `docs/superpowers/plans/2026-06-04-semantic-modeling-workbench-convergence.md` 中独立实现。

## Boundary Rules

- data-platform 是控制面、治理面和 UI 面。
- `dw-query-gateway` 是执行面，只接收物理 SQL，负责生产查询、dry-run、结果对象和 SQL guard。
- 本计划新增的 release preview 可以展示语义中心编译出的物理 SQL，但不能在平台控制面直接查询物理数据。
- 语义中心未生成物理 SQL 时，接口返回 `gateway_validation.status = "not_configured"` 且不调用 gateway；gateway 未配置时也返回 `not_configured`，而不是假装验证通过。

## File Structure

- Create `app/application/semantic/release_validation_preview.py`：发布预演数据结构与服务。
- Create `tests/unit/application/semantic/test_release_validation_preview.py`：服务层单测。
- Modify `app/application/semantic/modeling_copilot_service.py`：新增 `preview_release()` 方法，将会话 Spec 交给 preview service。
- Modify `app/interfaces/api/v1/semantic_modeling_copilot.py`：新增 `/sessions/<session_id>/release-preview` API。
- Modify `tests/integration/test_semantic_modeling_copilot_api.py`：覆盖 API 调用、权限透传和错误映射。
- Modify `app/di/container.py`：注册 release preview service provider，并注入 Copilot service。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts`：前端契约类型和提取函数。
- Create `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts`：前端契约单测。
- Modify `docs/prd/semantic_cold_start_builder_prd.md`：补充实际 API 契约路径。

## Execution Notes

- 当前用户偏好是后续统一拆 commit。若在当前脏工作区执行，不运行任务内的 `git add` / `git commit` 步骤，只把它们当作专用 worktree checkpoint。
- 不修改 `cache/`。
- 不把 release preview 接成真实发布动作。
- 不添加平台直连 MaxCompute 或其他物理数据源的执行逻辑。

---

### Task 1: Release Preview Service

**Files:**
- Create: `app/application/semantic/release_validation_preview.py`
- Create: `tests/unit/application/semantic/test_release_validation_preview.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/application/semantic/test_release_validation_preview.py`:

```python
from app.application.semantic.release_validation_preview import ReleaseValidationPreviewService


def _spec():
    return {
        "cube": {
            "name": "student_activity",
            "table": "dws_learning_student_activity_di",
            "measures": [
                {"name": "active_student_count", "sql": "student_id", "type": "count_distinct"}
            ],
            "dimensions": [
                {"name": "activity_date", "sql": "activity_date", "type": "time"}
            ],
        },
        "ontology": {
            "policies": [{"name": "internal_only"}],
        },
    }


def test_preview_returns_spec_sql_diff_and_not_configured_gateway_state():
    service = ReleaseValidationPreviewService()

    preview = service.preview(
        session_id="session_1",
        namespace="default",
        spec=_spec(),
        previous_spec=None,
        sample_questions=["昨天活跃学生数是多少？"],
    )

    assert preview["session_id"] == "session_1"
    assert preview["target"] == "semantic_center"
    assert preview["semantic_spec"]["cube"]["name"] == "student_activity"
    assert preview["compiled_sql"] == ""
    assert preview["release_diff"]["added"] == ["cube.student_activity"]
    assert preview["release_diff"]["changed"] == []
    assert preview["release_diff"]["removed"] == []
    assert preview["semantic_compile"] == {
        "status": "not_configured",
        "message": "语义中心编译预演未配置，未生成物理 SQL。",
    }
    assert preview["gateway_validation"] == {
        "status": "not_configured",
        "message": "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
    }
    assert preview["consumer_validation"]["samples"][0]["question"] == "昨天活跃学生数是多少？"


def test_preview_calls_gateway_sql_dry_run_only_after_semantic_compile():
    compile_calls = []
    gateway_calls = []

    def semantic_compile_preview(payload):
        compile_calls.append(payload)
        return {
            "status": "passed",
            "compiled_sql": "SELECT COUNT(DISTINCT student_id) AS active_student_count FROM dws_learning_student_activity_di",
        }

    def gateway_sql_dry_run(payload):
        gateway_calls.append(payload)
        return {
            "status": "passed",
            "telemetry": {"target": "dw-query-gateway"},
        }

    service = ReleaseValidationPreviewService(
        semantic_compile_preview=semantic_compile_preview,
        gateway_sql_dry_run=gateway_sql_dry_run,
    )

    preview = service.preview(
        session_id="session_1",
        namespace="default",
        spec=_spec(),
        previous_spec={"cube": {"name": "student_activity", "measures": []}},
        sample_questions=[],
    )

    assert compile_calls == [
        {
            "namespace": "default",
            "session_id": "session_1",
            "semantic_spec": _spec(),
        }
    ]
    assert gateway_calls == [
        {
            "sql": "SELECT COUNT(DISTINCT student_id) AS active_student_count FROM dws_learning_student_activity_di",
            "access_context": {
                "semantic_asset_refs": ["cube.student_activity"],
                "release_preview": {"session_id": "session_1", "namespace": "default"},
            },
            "idempotency_key": "semantic-release-preview:default:session_1",
            "runtime_options": {"mode": "semantic_release_preview", "dry_run": True},
            "namespace": "default",
            "session_id": "session_1",
        }
    ]
    assert "semantic_spec" not in gateway_calls[0]
    assert preview["gateway_validation"]["status"] == "passed"
    assert preview["gateway_validation"]["telemetry"]["target"] == "dw-query-gateway"
    assert preview["release_diff"]["changed"] == ["cube.student_activity"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pytest tests/unit/application/semantic/test_release_validation_preview.py -q
```

Expected: FAIL with import error for `release_validation_preview`.

- [ ] **Step 3: Implement the service**

Create `app/application/semantic/release_validation_preview.py`:

```python
"""语义建设发布前只读校验预演。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable


SemanticCompilePreview = Callable[[dict[str, Any]], dict[str, Any]]
GatewaySqlDryRun = Callable[[dict[str, Any]], dict[str, Any]]


class ReleaseValidationPreviewService:
    """生成发布前校验契约。

    该服务只组织 Spec、Diff、语义中心编译结果和 gateway SQL dry-run 返回值。
    它不直接连接物理数据源，也不执行生产查询。
    """

    def __init__(
        self,
        semantic_compile_preview: SemanticCompilePreview | None = None,
        gateway_sql_dry_run: GatewaySqlDryRun | None = None,
    ):
        self._semantic_compile_preview = semantic_compile_preview
        self._gateway_sql_dry_run = gateway_sql_dry_run

    def preview(
        self,
        *,
        session_id: str,
        namespace: str,
        spec: dict[str, Any],
        previous_spec: dict[str, Any] | None = None,
        sample_questions: list[str] | None = None,
    ) -> dict[str, Any]:
        semantic_spec = deepcopy(spec or {})
        semantic_compile = self._run_semantic_compile(
            namespace=namespace,
            session_id=session_id,
            semantic_spec=semantic_spec,
        )
        compiled_sql = str(semantic_compile.get("compiled_sql") or "")
        gateway_validation = self._run_gateway_preview(
            namespace=namespace,
            session_id=session_id,
            compiled_sql=compiled_sql,
        )
        return {
            "session_id": session_id,
            "namespace": namespace,
            "target": "semantic_center",
            "semantic_spec": semantic_spec,
            "semantic_compile": semantic_compile,
            "compiled_sql": compiled_sql,
            "release_diff": self._diff(semantic_spec, previous_spec),
            "impact_summary": self._impact_summary(semantic_spec),
            "gateway_validation": gateway_validation,
            "consumer_validation": self._consumer_validation(sample_questions or []),
        }

    def _run_semantic_compile(
        self,
        *,
        namespace: str,
        session_id: str,
        semantic_spec: dict[str, Any],
    ) -> dict[str, Any]:
        if self._semantic_compile_preview is None:
            return {
                "status": "not_configured",
                "message": "语义中心编译预演未配置，未生成物理 SQL。",
            }
        return dict(self._semantic_compile_preview(
            {
                "namespace": namespace,
                "session_id": session_id,
                "semantic_spec": deepcopy(semantic_spec),
            }
        ) or {})

    def _run_gateway_preview(
        self,
        *,
        namespace: str,
        session_id: str,
        compiled_sql: str,
    ) -> dict[str, Any]:
        if not compiled_sql.strip():
            return {
                "status": "not_configured",
                "message": "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
            }
        if self._gateway_sql_dry_run is None:
            return {
                "status": "not_configured",
                "message": "Gateway SQL dry-run 未配置，未执行物理 SQL dry-run。",
            }
        result = self._gateway_sql_dry_run(
            {
                "sql": compiled_sql,
                "access_context": {
                    "release_preview": {"namespace": namespace, "session_id": session_id},
                },
                "idempotency_key": f"semantic-release-preview:{namespace}:{session_id}",
                "runtime_options": {"mode": "semantic_release_preview", "dry_run": True},
            }
        )
        return dict(result or {})

    def _diff(
        self,
        spec: dict[str, Any],
        previous_spec: dict[str, Any] | None,
    ) -> dict[str, list[str]]:
        cube_name = str((spec.get("cube") or {}).get("name") or "unnamed")
        current_key = f"cube.{cube_name}"
        if not previous_spec:
            return {"added": [current_key], "changed": [], "removed": []}
        previous_name = str((previous_spec.get("cube") or {}).get("name") or "")
        if previous_name == cube_name:
            return {"added": [], "changed": [current_key], "removed": []}
        removed = [f"cube.{previous_name}"] if previous_name else []
        return {"added": [current_key], "changed": [], "removed": removed}

    def _impact_summary(self, spec: dict[str, Any]) -> dict[str, Any]:
        cube_name = str((spec.get("cube") or {}).get("name") or "unnamed")
        return {
            "affected_assets": [f"cube.{cube_name}"],
            "affected_consumers": ["Data Agent", "BI", "数据分析"],
            "risk_level": "medium",
        }

    def _consumer_validation(self, sample_questions: list[str]) -> dict[str, Any]:
        return {
            "status": "pending",
            "samples": [
                {
                    "question": question,
                    "consumer": "semantic_center",
                    "status": "pending_gateway_validation",
                }
                for question in sample_questions
            ],
        }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pytest tests/unit/application/semantic/test_release_validation_preview.py -q
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add app/application/semantic/release_validation_preview.py tests/unit/application/semantic/test_release_validation_preview.py
git commit -m "feat: add semantic release validation preview service"
```

Expected: commit created with only the service and unit test files.

---

### Task 2: Copilot Service Method

**Files:**
- Modify: `app/application/semantic/modeling_copilot_service.py`
- Modify: `tests/unit/application/semantic/test_modeling_copilot_service.py`

- [ ] **Step 1: Write the failing service test**

Add this test to `tests/unit/application/semantic/test_modeling_copilot_service.py` using the existing service factory pattern in that file:

```python
def test_preview_release_uses_session_spec_and_records_preview(make_service):
    calls = []

    class PreviewService:
        def preview(self, **kwargs):
            calls.append(kwargs)
            return {
                "target": "semantic_center",
                "compiled_sql": "",
                "release_diff": {"added": ["cube.learning_activity"], "changed": [], "removed": []},
                "gateway_validation": {"status": "not_configured"},
            }

    service, repo = make_service(release_preview_service=PreviewService())
    session = service.create_session({"user_goal": "建设学习行为语义", "id": "session_1"})
    service.update_spec("session_1", {
        "cube": {
            "name": "learning_activity",
            "table": "dwd_learning_activity_df",
            "measures": [{"name": "event_count", "sql": "event_id", "type": "count"}],
        }
    })

    payload = service.preview_release(
        "session_1",
        {"namespace": "default", "sample_questions": ["昨天学习行为数是多少？"]},
    )

    assert payload["workbench_state"]["release_preview"]["target"] == "semantic_center"
    assert payload["workbench_state"]["release_preview"]["compiled_sql"].startswith("SELECT")
    assert calls[0]["session_id"] == "session_1"
    assert calls[0]["namespace"] == "default"
    assert calls[0]["sample_questions"] == ["昨天学习行为数是多少？"]
    assert calls[0]["spec"]["cube"]["name"] == "learning_activity"
    assert repo.get("session_1").workbench_state["release_preview"]["gateway_validation"]["status"] == "not_configured"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_copilot_service.py::test_preview_release_uses_session_spec_and_records_preview -q
```

Expected: FAIL because `SemanticModelingCopilotService` has no `preview_release` method or `release_preview_service` dependency.

- [ ] **Step 3: Extend the service constructor**

Modify `SemanticModelingCopilotService.__init__` in `app/application/semantic/modeling_copilot_service.py`:

```python
def __init__(
    self,
    *,
    session_repository: IModelingAgentSessionRepository,
    agent_app: Any,
    tools: ModelingToolRegistry,
    proposal_service: Any,
    release_preview_service: Any | None = None,
    source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
):
    self._sessions = session_repository
    self._agent_app = agent_app
    self._tools = tools
    self._proposal_service = proposal_service
    self._release_preview_service = release_preview_service
    self._source_scoring_config = source_scoring_config or SourceCandidateScoringConfig.default()
    self._logger = logging.getLogger(__name__)
```

- [ ] **Step 4: Add preview_release**

Add this method near `sandbox()` in `app/application/semantic/modeling_copilot_service.py`:

```python
def preview_release(
    self,
    session_id: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    principal_id: Optional[str] = None,
) -> Dict[str, Any]:
    session = self._require(session_id)
    self._authorize(session, principal_id)
    self._hydrate_session_spec(session)
    state = deepcopy(session.workbench_state)
    raw_spec = state.get("raw_spec") if isinstance(state.get("raw_spec"), dict) else {}
    if not raw_spec:
        raise ValueError("缺少可校验的语义 Spec")
    if self._release_preview_service is None:
        raise ValueError("release preview service 未配置")
    payload_dict = dict(payload or {})
    preview = self._release_preview_service.preview(
        session_id=session.id,
        namespace=str(payload_dict.get("namespace") or "default"),
        spec=raw_spec,
        previous_spec=payload_dict.get("previous_spec") if isinstance(payload_dict.get("previous_spec"), dict) else None,
        sample_questions=[
            str(item)
            for item in (payload_dict.get("sample_questions") or [])
            if str(item).strip()
        ],
    )
    state["release_preview"] = preview
    state["agent_message"] = "已生成发布前校验预演，发布目标为语义中心。"
    session.workbench_state = state
    session.add_message(role="assistant", content=state["agent_message"])
    session.record_event(
        "session_action",
        actor=principal_id,
        action="preview_release",
        payload={
            "namespace": preview.get("namespace"),
            "gateway_status": (preview.get("gateway_validation") or {}).get("status"),
        },
    )
    self._save_session(session)
    return self._dump(session)
```

- [ ] **Step 5: Run the service test**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_copilot_service.py::test_preview_release_uses_session_spec_and_records_preview -q
```

Expected: PASS.

- [ ] **Step 6: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add app/application/semantic/modeling_copilot_service.py tests/unit/application/semantic/test_modeling_copilot_service.py
git commit -m "feat: store release preview in modeling sessions"
```

Expected: commit created with only the service and unit test files.

---

### Task 3: API Route

**Files:**
- Modify: `app/interfaces/api/v1/semantic_modeling_copilot.py`
- Modify: `tests/integration/test_semantic_modeling_copilot_api.py`

- [ ] **Step 1: Write the failing API test**

Add this method to `_CopilotStub` in `tests/integration/test_semantic_modeling_copilot_api.py`:

```python
def preview_release(self, session_id, payload, *, principal_id=None):
    self.calls.append(("preview_release", session_id, payload, principal_id))
    return {
        "id": session_id,
        "workbench_state": {
            "release_preview": {
                "target": "semantic_center",
                "compiled_sql": "",
                "release_diff": {"added": ["cube.learning_activity"], "changed": [], "removed": []},
                "gateway_validation": {"status": "not_configured"},
            }
        },
    }
```

Add this test:

```python
def test_release_preview_route_calls_service():
    client, service = _client()

    response = client.post(
        "/api/v1/semantic/modeling-copilot/sessions/session_1/release-preview",
        json={"namespace": "default", "sample_questions": ["昨天学习行为数是多少？"]},
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["workbench_state"]["release_preview"]["target"] == "semantic_center"
    assert service.calls[-1] == (
        "preview_release",
        "session_1",
        {"namespace": "default", "sample_questions": ["昨天学习行为数是多少？"]},
        None,
    )
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest tests/integration/test_semantic_modeling_copilot_api.py::test_release_preview_route_calls_service -q
```

Expected: FAIL with 404.

- [ ] **Step 3: Add the route**

In `app/interfaces/api/v1/semantic_modeling_copilot.py`, add this route before `/sessions/<session_id>/publish`:

```python
@bp.route("/sessions/<session_id>/release-preview", methods=["POST"])
@_require_identity_unless_testing
def preview_release(session_id: str):
    try:
        return success(data=copilot_service.preview_release(
            session_id,
            _body(),
            principal_id=_principal_id(),
        ))
    except Exception as exc:
        return _copilot_error("生成建模发布预演", exc)
```

- [ ] **Step 4: Run the API test**

Run:

```bash
pytest tests/integration/test_semantic_modeling_copilot_api.py::test_release_preview_route_calls_service -q
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add app/interfaces/api/v1/semantic_modeling_copilot.py tests/integration/test_semantic_modeling_copilot_api.py
git commit -m "feat: expose modeling release preview API"
```

Expected: commit created with only API route and integration test changes.

---

### Task 4: Dependency Injection

**Files:**
- Modify: `app/di/container.py`
- Modify: `tests/unit/test_semantic_modeling_copilot_registration.py`

- [ ] **Step 1: Write the failing registration assertion**

In `tests/unit/test_semantic_modeling_copilot_registration.py`, add:

```python
def test_release_preview_service_provider_is_registered(container):
    service = container.semantic_release_validation_preview_service()

    assert service.__class__.__name__ == "ReleaseValidationPreviewService"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest tests/unit/test_semantic_modeling_copilot_registration.py::test_release_preview_service_provider_is_registered -q
```

Expected: FAIL because the provider is not registered.

- [ ] **Step 3: Register the provider**

In `app/di/container.py`, add the import near other semantic service imports:

```python
from app.application.semantic.release_validation_preview import ReleaseValidationPreviewService
```

Add the provider near other semantic modeling providers:

```python
semantic_release_validation_preview_service = providers.Singleton(
    ReleaseValidationPreviewService,
)
```

Inject it into `semantic_modeling_copilot` provider:

```python
release_preview_service=semantic_release_validation_preview_service,
```

- [ ] **Step 4: Run registration tests**

Run:

```bash
pytest tests/unit/test_semantic_modeling_copilot_registration.py -q
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add app/di/container.py tests/unit/test_semantic_modeling_copilot_registration.py
git commit -m "feat: wire semantic release preview service"
```

Expected: commit created with only DI and registration test changes.

---

### Task 5: Frontend Contract Parser

**Files:**
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { extractReleasePreview, releasePreviewStatusLabel } from './releasePreview'

describe('releasePreview', () => {
  it('extracts release preview from workbench state', () => {
    const preview = extractReleasePreview({
      release_preview: {
        target: 'semantic_center',
        semantic_compile: { status: 'passed', message: '语义中心编译通过' },
        compiled_sql: 'SELECT COUNT(*) FROM dwd_learning_activity_df',
        release_diff: { added: ['cube.learning_activity'], changed: [], removed: [] },
        impact_summary: {
          affected_assets: ['cube.learning_activity'],
          affected_consumers: ['Data Agent', 'BI'],
          risk_level: 'medium',
        },
        gateway_validation: { status: 'not_configured' },
        consumer_validation: { status: 'pending', samples: [] },
      },
    })

    expect(preview?.target).toBe('semantic_center')
    expect(preview?.semanticCompile.status).toBe('passed')
    expect(preview?.compiledSql).toContain('SELECT')
    expect(preview?.releaseDiff.added).toEqual(['cube.learning_activity'])
    expect(releasePreviewStatusLabel(preview?.gatewayValidation.status)).toBe('未配置')
  })

  it('returns null for missing or non semantic center preview', () => {
    expect(extractReleasePreview({})).toBeNull()
    expect(extractReleasePreview({ release_preview: { target: 'data_agent' } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts
```

Expected: FAIL with module resolution error.

- [ ] **Step 3: Implement the parser**

Create `frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts`:

```ts
export interface ReleasePreview {
  target: 'semantic_center'
  semanticCompile: {
    status: string
    message?: string
  }
  compiledSql: string
  releaseDiff: {
    added: string[]
    changed: string[]
    removed: string[]
  }
  impactSummary: {
    affectedAssets: string[]
    affectedConsumers: string[]
    riskLevel: string
  }
  gatewayValidation: {
    status: string
    message?: string
  }
  consumerValidation: {
    status: string
    samples: Array<{ question: string; consumer: string; status: string }>
  }
}

export function extractReleasePreview(workbenchState: unknown): ReleasePreview | null {
  if (!workbenchState || typeof workbenchState !== 'object') return null
  const raw = (workbenchState as { release_preview?: unknown }).release_preview
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  if (payload.target !== 'semantic_center') return null
  const diff = asRecord(payload.release_diff)
  const impact = asRecord(payload.impact_summary)
  const semanticCompile = asRecord(payload.semantic_compile)
  const gateway = asRecord(payload.gateway_validation)
  const consumer = asRecord(payload.consumer_validation)
  return {
    target: 'semantic_center',
    semanticCompile: {
      status: String(semanticCompile.status || 'unknown'),
      message: semanticCompile.message ? String(semanticCompile.message) : undefined,
    },
    compiledSql: String(payload.compiled_sql || ''),
    releaseDiff: {
      added: asStringArray(diff.added),
      changed: asStringArray(diff.changed),
      removed: asStringArray(diff.removed),
    },
    impactSummary: {
      affectedAssets: asStringArray(impact.affected_assets),
      affectedConsumers: asStringArray(impact.affected_consumers),
      riskLevel: String(impact.risk_level || 'unknown'),
    },
    gatewayValidation: {
      status: String(gateway.status || 'unknown'),
      message: gateway.message ? String(gateway.message) : undefined,
    },
    consumerValidation: {
      status: String(consumer.status || 'pending'),
      samples: Array.isArray(consumer.samples)
        ? consumer.samples.map((item) => {
            const sample = asRecord(item)
            return {
              question: String(sample.question || ''),
              consumer: String(sample.consumer || ''),
              status: String(sample.status || ''),
            }
          })
        : [],
    },
  }
}

export function releasePreviewStatusLabel(status: string | undefined): string {
  if (status === 'passed') return '已通过'
  if (status === 'failed') return '未通过'
  if (status === 'not_configured') return '未配置'
  return '待校验'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}
```

- [ ] **Step 4: Run the frontend parser test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.ts frontend/src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts
git commit -m "feat: add semantic release preview frontend contract"
```

Expected: commit created with only frontend release preview contract files.

---

### Task 6: Verification and Documentation

**Files:**
- Modify: `docs/prd/semantic_cold_start_builder_prd.md`

- [ ] **Step 1: Document the API contract path**

In `docs/prd/semantic_cold_start_builder_prd.md`, under “发布校验契约”, add:

````markdown
首期 API 路径：

- `POST /api/v1/semantic/modeling-copilot/sessions/:session_id/release-preview`

请求体：

```json
{
  "namespace": "default",
  "sample_questions": ["昨天活跃学生数是多少？"]
}
```

响应体位于 `data.workbench_state.release_preview`，包含 `semantic_spec`、`semantic_compile`、`compiled_sql`、`release_diff`、`impact_summary`、`gateway_validation` 和 `consumer_validation`。`compiled_sql` 只能来自语义中心编译结果；语义中心未生成物理 SQL 时，`gateway_validation.status=not_configured` 且不会调用 gateway。
````

- [ ] **Step 2: Run backend focused tests**

Run:

```bash
pytest tests/unit/application/semantic/test_release_validation_preview.py tests/integration/test_semantic_modeling_copilot_api.py::test_release_preview_route_calls_service -q
```

Expected: PASS.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run:

```bash
make verify-detect
make verify-semantic
make verify-docs
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 5: Checkpoint in a dedicated worktree**

Run only in a dedicated subagent worktree:

```bash
git add docs/prd/semantic_cold_start_builder_prd.md
git commit -m "docs: record semantic release preview contract"
```

Expected: commit created with only PRD contract text.

---

## Self-Review

- Spec coverage: semantic spec, compiled SQL, release diff, impact summary, gateway SQL dry-run boundary, API route, frontend parser, release preview panel and docs are covered by Tasks 1-6 plus follow-up gateway adapter integration.
- Placeholder scan: no red-flag placeholder wording or unspecified implementation step remains.
- Type consistency: backend response keys use snake_case; frontend parser maps to camelCase only inside TypeScript.

## Verification Matrix

- Backend unit: `pytest tests/unit/application/semantic/test_release_validation_preview.py -q`
- API integration: `pytest tests/integration/test_semantic_modeling_copilot_api.py::test_release_preview_route_calls_service -q`
- Frontend unit: `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/releasePreview.test.ts`
- Repository: `make verify-detect && make verify-semantic && make verify-docs && git diff --check`
