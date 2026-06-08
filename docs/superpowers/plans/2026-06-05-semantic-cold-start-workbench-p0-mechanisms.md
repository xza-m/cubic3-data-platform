# Semantic Cold Start Workbench P0 Mechanisms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the P0 product mechanisms from the approved Build Project workbench design without changing semantic-center truth, compiler ownership, or gateway execution boundaries.

**Architecture:** Extend the existing uncommitted Build Project / Asset Package implementation as a control-plane workbench layer. Keep `Build Project`, `Asset Package`, `Field Candidate`, and `Proposal` as process/draft state stored in modeling-workbench persistence; only generated semantic spec drafts flow into the existing semantic-center compile and release-preview path. Do not write Build Project or Asset Package into the semantic registry, and do not make gateway accept semantic specs.

**Tech Stack:** Flask API, SQLAlchemy JSON payload persistence, Pydantic domain models, pytest, React 18, TypeScript, TanStack Query, Vitest, Testing Library, Playwright, Makefile.

---

## Scope Check

This plan implements P0 only:

- Build Project create/continue.
- Recommendation-empty manual fallback.
- Asset Package queue with split/merge/defer/duplicate/regenerate actions.
- Field candidate table grouping, filtering, progress, low-risk bulk accept.
- Lightweight ontology anchoring gates.
- Proposal revision/readiness and rollback path.
- User-facing publish checks that preserve semantic-center and gateway boundaries.

This plan does not implement P1/P2:

- Multi-user locking and approval.
- Complete ontology graph editor.
- Automatic batch publishing.
- Cross-domain governance workflows.
- New gateway semantic-spec or query-plan API.

The current worktree already contains uncommitted P0/P1 implementation files. Workers are not alone in the codebase: do not revert existing changes. Adapt to the current files and keep edits scoped to the task ownership below.

## File Structure

Backend domain and service:

- Modify: `app/domain/semantic/modeling_build_project.py`
  - Add field candidate, operation history, proposal revision, review summary, and readiness models.
  - Add pure helpers for review summaries, low-risk bulk eligibility, and proposal readiness.
- Modify: `app/application/semantic/modeling_build_project_service.py`
  - Add deterministic fallback packages when recommendation evidence is missing.
  - Add package action service for split, merge, defer, duplicate, and regenerate.
  - Add proposal-readiness calculation.
- Modify: `app/interfaces/api/v1/semantic_modeling_workbench.py`
  - Add action and proposal-readiness routes.
- No migration required for new domain fields because `SemanticModelingAssetPackageORM.payload_json` already stores the package payload.

Frontend API and hooks:

- Modify: `frontend/src/v2/api/semanticModelingWorkbench.ts`
  - Add action, readiness, field candidate, and review summary types.
  - Add package action and proposal-readiness client methods.
- Modify: `frontend/src/v2/hooks/semanticModelingWorkbench.ts`
  - Add mutation/query hooks for package actions and readiness.

Frontend UX:

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`
  - Add grouped review, filters, progress summary, Cube/Ontology binding columns, and low-risk bulk accept.
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
  - Add recommended range vs empty fallback copy.
  - Add package queue actions.
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
  - Surface package action status and readiness in candidate context.
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
  - Consume proposal readiness and publish-check labels without turning Build Project into semantic truth.

Tests:

- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`
- Modify: `tests/integration/test_semantic_modeling_workbench_api.py`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`
- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`

Validation entry points:

- `PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py -q`
- `PYTHONPATH=. python -m pytest --no-cov tests/integration/test_semantic_modeling_workbench_api.py -q`
- `npm --prefix frontend run test:unit -- FieldCandidateReview.test.tsx BatchModelingWorkbench.test.tsx modelingWorkbenchApi.test.ts --run`
- `npm --prefix frontend run test:unit -- SemanticModelingWorkbench.test.tsx ModelingAgent.test.tsx --run`
- `make verify-semantic`

---

### Task 1: Domain Models For P0 Mechanisms

**Files:**

- Modify: `app/domain/semantic/modeling_build_project.py`
- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`

- [ ] **Step 1: Write failing tests for field review summary and readiness**

Append these tests to `tests/unit/application/semantic/test_modeling_build_project_service.py`:

```python
def test_asset_package_review_summary_counts_field_states():
    from app.domain.semantic.modeling_build_project import (
        FieldCandidate,
        ModelingAssetPackage,
        build_review_summary,
    )

    package = ModelingAssetPackage(
        id="build-learning:fact:dwd-learning-activity-df",
        project_id="build-learning",
        title="学情分析事实主题候选",
        package_type="fact",
        source="dwd_learning_activity_df",
        grain="一条学习行为事件",
        field_candidates=[
            FieldCandidate(
                id="field_student_id",
                field="student_id",
                label="学生",
                role="dimension",
                cube_binding={"kind": "dimension", "name": "student_id"},
                ontology_binding={"kind": "property", "object": "student", "name": "student_id"},
                risk="low",
                action="accepted",
                evidence=["字段画像显示非空率 100%。"],
            ),
            FieldCandidate(
                id="field_duration",
                field="duration_sec",
                label="学习时长",
                role="measure",
                cube_binding={"kind": "measure", "name": "learning_duration", "aggregation": "sum"},
                ontology_binding={"kind": "metric", "object": "learning_activity", "name": "learning_duration"},
                risk="high",
                action="pending",
                evidence=[],
            ),
        ],
    )

    summary = build_review_summary(package)

    assert summary.total == 2
    assert summary.accepted == 1
    assert summary.pending == 1
    assert summary.high_risk == 1
    assert summary.blocking == 1
    assert summary.can_generate_proposal is False
    assert summary.blocking_reasons == ["high_risk_fields_pending"]


def test_asset_package_can_generate_proposal_after_required_light_ontology_bindings():
    from app.domain.semantic.modeling_build_project import (
        FieldCandidate,
        ModelingAssetPackage,
        build_review_summary,
        build_proposal_readiness,
    )

    package = ModelingAssetPackage(
        id="build-learning:fact:dwd-learning-activity-df",
        project_id="build-learning",
        title="学情分析事实主题候选",
        package_type="fact",
        source="dwd_learning_activity_df",
        grain="一条学习行为事件",
        field_candidates=[
            FieldCandidate(
                id="field_student_id",
                field="student_id",
                label="学生",
                role="dimension",
                cube_binding={"kind": "dimension", "name": "student_id"},
                ontology_binding={"kind": "property", "object": "student", "name": "student_id"},
                risk="low",
                action="accepted",
                evidence=["字段画像显示非空率 100%。"],
            ),
            FieldCandidate(
                id="field_activity_time",
                field="activity_time",
                label="行为时间",
                role="time",
                cube_binding={"kind": "time", "name": "activity_time"},
                ontology_binding={"kind": "property", "object": "learning_activity", "name": "activity_time"},
                risk="low",
                action="accepted",
                evidence=["时间字段可作为主时间。"],
            ),
            FieldCandidate(
                id="field_duration",
                field="duration_sec",
                label="学习时长",
                role="measure",
                cube_binding={"kind": "measure", "name": "learning_duration", "aggregation": "sum"},
                ontology_binding={"kind": "metric", "object": "learning_activity", "name": "learning_duration"},
                risk="medium",
                action="accepted",
                evidence=["指标口径来自历史查询。"],
            ),
        ],
        ontology_suggestions=[{"type": "object", "name": "learning_activity", "title": "学习行为"}],
    )

    summary = build_review_summary(package)
    readiness = build_proposal_readiness(package)

    assert summary.can_generate_proposal is True
    assert readiness.status == "ready"
    assert readiness.required_bindings == ["object_to_cube", "property_to_dimension", "metric_to_measure"]
    assert readiness.blocking_reasons == []
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_asset_package_review_summary_counts_field_states tests/unit/application/semantic/test_modeling_build_project_service.py::test_asset_package_can_generate_proposal_after_required_light_ontology_bindings -q
```

Expected: FAIL with `ImportError` or `TypeError` because `FieldCandidate`, `build_review_summary`, and `build_proposal_readiness` are not defined.

- [ ] **Step 3: Add domain models and pure helpers**

Modify `app/domain/semantic/modeling_build_project.py` with these additions. Put the literals near existing `RiskLevel`, the models before `ModelingAssetPackage`, and the helper functions after `create_asset_package_id`.

```python
FieldCandidateAction = Literal["pending", "accepted", "ignored", "renamed", "deferred"]
ProposalReadinessStatus = Literal["blocked", "ready"]


class FieldCandidate(BaseModel):
    """字段候选审阅行，只属于工作台过程态。"""

    id: str
    field: str
    label: str | None = None
    role: str | None = None
    aggregation: str | None = None
    semantic_type: str | None = None
    cube_binding: Dict[str, Any] = Field(default_factory=dict)
    ontology_binding: Dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    evidence: List[str] = Field(default_factory=list)
    risk: RiskLevel = "medium"
    action: FieldCandidateAction = "pending"


class FieldReviewSummary(BaseModel):
    total: int = 0
    accepted: int = 0
    pending: int = 0
    ignored: int = 0
    renamed: int = 0
    deferred: int = 0
    high_risk: int = 0
    blocking: int = 0
    can_bulk_accept: int = 0
    can_generate_proposal: bool = False
    blocking_reasons: List[str] = Field(default_factory=list)


class ProposalReadiness(BaseModel):
    status: ProposalReadinessStatus = "blocked"
    required_bindings: List[str] = Field(default_factory=list)
    blocking_reasons: List[str] = Field(default_factory=list)
    next_actions: List[str] = Field(default_factory=list)


class ProposalRevision(BaseModel):
    id: str
    package_id: str
    status: Literal["draft", "validated", "released", "superseded"] = "draft"
    field_candidate_ids: List[str] = Field(default_factory=list)
    semantic_patch: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: _utc_now())
```

Extend `ModelingAssetPackage`:

```python
    field_candidates: List[FieldCandidate] = Field(default_factory=list)
    review_summary: FieldReviewSummary = Field(default_factory=FieldReviewSummary)
    proposal_revisions: List[ProposalRevision] = Field(default_factory=list)
    proposal_readiness: ProposalReadiness = Field(default_factory=ProposalReadiness)
    operation_history: List[Dict[str, Any]] = Field(default_factory=list)
    split_from_package_id: str | None = None
    merged_from_package_ids: List[str] = Field(default_factory=list)
```

Add pure helpers:

```python
def build_review_summary(package: ModelingAssetPackage) -> FieldReviewSummary:
    summary = FieldReviewSummary(total=len(package.field_candidates))
    blocking_reasons: set[str] = set()
    for candidate in package.field_candidates:
        if candidate.action == "accepted":
            summary.accepted += 1
        elif candidate.action == "ignored":
            summary.ignored += 1
        elif candidate.action == "renamed":
            summary.renamed += 1
        elif candidate.action == "deferred":
            summary.deferred += 1
        else:
            summary.pending += 1
        if candidate.risk == "high":
            summary.high_risk += 1
            if candidate.action == "pending":
                summary.blocking += 1
                blocking_reasons.add("high_risk_fields_pending")
        if candidate.risk == "low" and candidate.action == "pending":
            summary.can_bulk_accept += 1
        if candidate.action == "accepted" and not candidate.cube_binding:
            summary.blocking += 1
            blocking_reasons.add("cube_binding_missing")
        if candidate.action == "accepted" and _requires_ontology_binding(candidate) and not candidate.ontology_binding:
            summary.blocking += 1
            blocking_reasons.add("ontology_binding_missing")
    if summary.total == 0:
        blocking_reasons.add("field_candidates_missing")
    if summary.accepted == 0:
        blocking_reasons.add("accepted_fields_missing")
    summary.blocking_reasons = sorted(blocking_reasons)
    summary.can_generate_proposal = len(summary.blocking_reasons) == 0
    return summary


def build_proposal_readiness(package: ModelingAssetPackage) -> ProposalReadiness:
    summary = build_review_summary(package)
    required_bindings = _required_binding_kinds(package)
    blocking_reasons = list(summary.blocking_reasons)
    if not any(item.get("type") == "object" for item in package.ontology_suggestions):
        blocking_reasons.append("primary_business_object_missing")
    readiness = ProposalReadiness(
        status="ready" if not blocking_reasons else "blocked",
        required_bindings=required_bindings,
        blocking_reasons=sorted(set(blocking_reasons)),
        next_actions=_next_actions_for_blockers(blocking_reasons),
    )
    return readiness


def refresh_package_review_state(package: ModelingAssetPackage) -> ModelingAssetPackage:
    package.review_summary = build_review_summary(package)
    package.proposal_readiness = build_proposal_readiness(package)
    return package


def _requires_ontology_binding(candidate: FieldCandidate) -> bool:
    return candidate.role in {"dimension", "measure", "time", "attribute"} or bool(candidate.label)


def _required_binding_kinds(package: ModelingAssetPackage) -> List[str]:
    kinds = ["object_to_cube"]
    if any(item.action == "accepted" and item.role in {"dimension", "time", "attribute"} for item in package.field_candidates):
        kinds.append("property_to_dimension")
    if any(item.action == "accepted" and item.role == "measure" for item in package.field_candidates):
        kinds.append("metric_to_measure")
    return kinds


def _next_actions_for_blockers(blocking_reasons: list[str]) -> list[str]:
    mapping = {
        "accepted_fields_missing": "至少采纳一个字段候选。",
        "cube_binding_missing": "补齐已采纳字段的 Cube 映射。",
        "field_candidates_missing": "先生成字段候选表。",
        "high_risk_fields_pending": "处理高风险字段，不能保持待处理状态。",
        "ontology_binding_missing": "补齐消费者可见字段的轻本体锚定。",
        "primary_business_object_missing": "确认主业务对象或创建对象草案。",
    }
    return [mapping[item] for item in sorted(set(blocking_reasons)) if item in mapping]
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_asset_package_review_summary_counts_field_states tests/unit/application/semantic/test_modeling_build_project_service.py::test_asset_package_can_generate_proposal_after_required_light_ontology_bindings -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/domain/semantic/modeling_build_project.py tests/unit/application/semantic/test_modeling_build_project_service.py
git commit -m "feat: model semantic workbench review readiness"
```

---

### Task 2: Package Queue Actions And Recommendation Fallback

**Files:**

- Modify: `app/application/semantic/modeling_build_project_service.py`
- Modify: `app/interfaces/api/v1/semantic_modeling_workbench.py`
- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`
- Modify: `tests/integration/test_semantic_modeling_workbench_api.py`

- [ ] **Step 1: Write failing service tests for fallback, split, merge, defer, duplicate**

Append to `tests/unit/application/semantic/test_modeling_build_project_service.py`:

```python
def test_build_project_scan_falls_back_to_selected_sources_when_recommendation_empty():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {
            "name": "新数据源建设",
            "business_domain": "新数据源",
            "scope": {
                "selected_sources": ["ods_new_fact_df"],
                "strategy": "conservative",
                "recommendation_empty": True,
            },
        },
        principal_id="alice",
    )

    scanned = service.scan_project(project["id"], {}, principal_id="alice")

    assert scanned["asset_package_count"] == 1
    package = scanned["asset_packages"][0]
    assert package["source"] == "ods_new_fact_df"
    assert package["status"] == "needs_scope"
    assert package["risk"] == "medium"
    assert "自动推荐证据不足" in package["evidence"][0]


def test_build_project_service_applies_defer_and_duplicate_package_actions():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]

    deferred = service.apply_asset_package_action(
        project["id"],
        package_id,
        {"action": "defer", "reason": "等待业务 owner 确认"},
        principal_id="alice",
    )
    duplicated = service.apply_asset_package_action(
        project["id"],
        package_id,
        {"action": "mark_duplicate", "reason": "与已发布 Cube 重复"},
        principal_id="alice",
    )

    assert deferred["status"] == "deferred"
    assert duplicated["status"] == "duplicate_candidate"
    assert duplicated["operation_history"][-1]["action"] == "mark_duplicate"


def test_build_project_service_splits_package_by_field_candidates():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService
    from app.domain.semantic.modeling_build_project import FieldCandidate

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    package = repo.get_package(package_id)
    package.field_candidates = [
        FieldCandidate(id="student_id", field="student_id", label="学生", role="dimension", risk="low"),
        FieldCandidate(id="duration_sec", field="duration_sec", label="学习时长", role="measure", risk="medium"),
    ]
    repo.save_package(package)

    result = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": ["duration_sec"],
            "title": "学情分析指标候选",
            "package_type": "metric",
            "reason": "指标组独立审阅",
        },
        principal_id="alice",
    )

    assert result["created_package"]["title"] == "学情分析指标候选"
    assert result["created_package"]["split_from_package_id"] == package_id
    assert [item["id"] for item in result["created_package"]["field_candidates"]] == ["duration_sec"]
    assert [item.id for item in repo.get_package(package_id).field_candidates] == ["student_id"]
```

- [ ] **Step 2: Write failing API route test for package action**

Append to `tests/integration/test_semantic_modeling_workbench_api.py`:

```python
def test_modeling_workbench_asset_package_action_route():
    class _ActionService(_ServiceStub):
        def apply_asset_package_action(self, project_id, package_id, payload, *, principal_id=None):
            self.calls.append(("apply_asset_package_action", project_id, package_id, payload, principal_id))
            return {
                "id": package_id,
                "project_id": project_id,
                "status": "deferred",
                "target": "semantic_center",
                "operation_history": [{"action": payload["action"], "reason": payload.get("reason")}],
            }

    service = _ActionService()
    client = _client(service)

    resp = client.post(
        "/api/v1/semantic/modeling-workbench/projects/build-learning/packages/build-learning:fact:dwd-learning/actions",
        json={"action": "defer", "reason": "等待业务 owner 确认"},
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "deferred"
    assert service.calls[-1] == (
        "apply_asset_package_action",
        "build-learning",
        "build-learning:fact:dwd-learning",
        {"action": "defer", "reason": "等待业务 owner 确认"},
        None,
    )
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_scan_falls_back_to_selected_sources_when_recommendation_empty tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_applies_defer_and_duplicate_package_actions tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_splits_package_by_field_candidates tests/integration/test_semantic_modeling_workbench_api.py::test_modeling_workbench_asset_package_action_route -q
```

Expected: FAIL because `apply_asset_package_action` and the action route do not exist, and fallback currently returns deterministic default packages.

- [ ] **Step 4: Implement fallback packages and action service**

Modify imports in `app/application/semantic/modeling_build_project_service.py`:

```python
from app.domain.semantic.modeling_build_project import (
    FieldCandidate,
    ModelingAssetPackage,
    ModelingBuildProject,
    RiskLevel,
    create_asset_package_id,
    normalize_build_project_id,
    refresh_package_review_state,
)
```

Add this method to `ModelingBuildProjectService`:

```python
    def apply_asset_package_action(
        self,
        project_id: str,
        package_id: str,
        payload: Dict[str, Any],
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        action = str(payload.get("action") or "").strip()
        reason = str(payload.get("reason") or "").strip()
        if action not in {"defer", "mark_duplicate", "regenerate", "split", "merge"}:
            raise ValueError("action 必须是 defer、mark_duplicate、regenerate、split 或 merge")
        if action == "defer":
            package.status = "deferred"
            self._record_operation(package, action, reason)
            self.repository.save_package(package)
            return package.model_dump(mode="json")
        if action == "mark_duplicate":
            package.status = "duplicate_candidate"
            self._record_operation(package, action, reason)
            self.repository.save_package(package)
            return package.model_dump(mode="json")
        if action == "regenerate":
            package.status = "needs_scope"
            package.risk = "medium"
            package.evidence = ["已退回重生成，等待重新扫描候选证据。"]
            self._record_operation(package, action, reason)
            self.repository.save_package(refresh_package_review_state(package))
            return package.model_dump(mode="json")
        if action == "split":
            return self._split_package(project, package, payload, reason)
        return self._merge_package(project, package, payload, reason)
```

Add helpers:

```python
    def _record_operation(self, package: ModelingAssetPackage, action: str, reason: str) -> None:
        package.operation_history.append(
            {
                "action": action,
                "reason": reason or "未填写原因",
                "at": package.updated_at,
            }
        )

    def _split_package(
        self,
        project: ModelingBuildProject,
        package: ModelingAssetPackage,
        payload: Dict[str, Any],
        reason: str,
    ) -> Dict[str, Any]:
        field_ids = {str(item) for item in payload.get("field_candidate_ids") or []}
        if not field_ids:
            raise ValueError("split 需要 field_candidate_ids")
        moved = [item for item in package.field_candidates if item.id in field_ids]
        if not moved:
            raise ValueError("split 未匹配到字段候选")
        package.field_candidates = [item for item in package.field_candidates if item.id not in field_ids]
        self._record_operation(package, "split_source", reason)
        package = refresh_package_review_state(package)
        new_type = str(payload.get("package_type") or package.package_type)
        new_title = str(payload.get("title") or f"{package.title}拆分候选")
        new_source = f"{package.source}_{new_type}_split"
        created = ModelingAssetPackage(
            id=create_asset_package_id(project.id, new_source, new_type),
            project_id=project.id,
            title=new_title,
            package_type=new_type,
            source=package.source,
            grain=package.grain,
            confidence=package.confidence,
            risk="medium",
            status="ready_for_review",
            evidence=[f"从 {package.title} 拆分：{reason or '字段粒度独立'}"],
            field_candidates=moved,
            split_from_package_id=package.id,
        )
        self._record_operation(created, "split_created", reason)
        created = refresh_package_review_state(created)
        self.repository.save_package(package)
        self.repository.save_package(created)
        packages = self.repository.list_packages(project.id)
        self.repository.save_project(self._with_package_summary(project, packages))
        return {
            "source_package": package.model_dump(mode="json"),
            "created_package": created.model_dump(mode="json"),
        }

    def _merge_package(
        self,
        project: ModelingBuildProject,
        package: ModelingAssetPackage,
        payload: Dict[str, Any],
        reason: str,
    ) -> Dict[str, Any]:
        target_id = str(payload.get("target_package_id") or "").strip()
        if not target_id:
            raise ValueError("merge 需要 target_package_id")
        target = self._require_package(project.id, target_id)
        target.field_candidates.extend(package.field_candidates)
        target.evidence.extend([f"合并 {package.title}: {reason or '候选重复'}"])
        target.merged_from_package_ids.append(package.id)
        self._record_operation(target, "merge_target", reason)
        package.status = "duplicate_candidate"
        self._record_operation(package, "merge_source", reason)
        self.repository.save_package(refresh_package_review_state(target))
        self.repository.save_package(refresh_package_review_state(package))
        packages = self.repository.list_packages(project.id)
        self.repository.save_project(self._with_package_summary(project, packages))
        return {
            "target_package": target.model_dump(mode="json"),
            "source_package": package.model_dump(mode="json"),
        }
```

Modify `scan_project` after `scope` and `strategy`:

```python
        if scope.get("recommendation_empty"):
            packages = [
                self._preserve_review_fields(package, existing_packages.get(package.id))
                for package in self._fallback_packages_from_scope(project, strategy)
            ]
        else:
            packages = [
                self._preserve_review_fields(package, existing_packages.get(package.id))
                for package in self._deterministic_packages(project, strategy)
            ]
```

Add fallback generator:

```python
    def _fallback_packages_from_scope(
        self,
        project: ModelingBuildProject,
        strategy: str,
    ) -> list[ModelingAssetPackage]:
        selected_sources = list(project.scope.get("selected_sources") or [])
        if not selected_sources:
            selected_sources = ["manual_selected_source"]
        risk: RiskLevel = "medium" if strategy != "exploratory" else "high"
        packages: list[ModelingAssetPackage] = []
        for source in selected_sources:
            source_name = str(source).strip() or "manual_selected_source"
            packages.append(
                ModelingAssetPackage(
                    id=create_asset_package_id(project.id, source_name, "fact"),
                    project_id=project.id,
                    title=f"{project.business_domain}{source_name}最小候选",
                    package_type="fact",
                    source=source_name,
                    grain="待确认粒度",
                    confidence=0.45,
                    risk=risk,
                    status="needs_scope",
                    evidence=[
                        "自动推荐证据不足，已按手动选择源表生成最小候选。",
                        "需要补充字段画像、业务对象和主时间字段。",
                    ],
                    field_candidates=[
                        FieldCandidate(
                            id=f"{source_name}_field_placeholder",
                            field="待选择字段",
                            label="待补字段",
                            role=None,
                            risk="medium",
                            action="pending",
                            evidence=["推荐为空时的手动字段选择默认项。"],
                        )
                    ],
                )
            )
        return [refresh_package_review_state(package) for package in packages]
```

In `_deterministic_packages`, wrap the return value before returning:

```python
        return [refresh_package_review_state(package) for package in packages]
```

- [ ] **Step 5: Add API route**

In `app/interfaces/api/v1/semantic_modeling_workbench.py`, add:

```python
    @bp.post("/projects/<project_id>/packages/<package_id>/actions")
    @_require_identity_unless_testing
    def apply_asset_package_action(project_id: str, package_id: str):
        try:
            return success(
                data=service.apply_asset_package_action(
                    project_id,
                    package_id,
                    _body(),
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("执行语义候选资产操作", exc)
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_scan_falls_back_to_selected_sources_when_recommendation_empty tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_applies_defer_and_duplicate_package_actions tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_splits_package_by_field_candidates tests/integration/test_semantic_modeling_workbench_api.py::test_modeling_workbench_asset_package_action_route -q
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/application/semantic/modeling_build_project_service.py app/interfaces/api/v1/semantic_modeling_workbench.py tests/unit/application/semantic/test_modeling_build_project_service.py tests/integration/test_semantic_modeling_workbench_api.py
git commit -m "feat: add semantic asset package queue actions"
```

---

### Task 3: Frontend API And Hooks For Package Actions And Readiness

**Files:**

- Modify: `frontend/src/v2/api/semanticModelingWorkbench.ts`
- Modify: `frontend/src/v2/hooks/semanticModelingWorkbench.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts`

- [ ] **Step 1: Write failing API tests**

Append to `frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts`:

```ts
import {
  applySemanticAssetPackageAction,
  type SemanticAssetPackageActionBody,
} from '@v2/api/semanticModelingWorkbench'

it('posts asset package actions with encoded ids', async () => {
  const body: SemanticAssetPackageActionBody = {
    action: 'defer',
    reason: '等待业务 owner 确认',
  }

  await applySemanticAssetPackageAction('build learning', 'build-learning:fact:dwd_learning_activity_df', body)

  expect(mockPost).toHaveBeenCalledWith(
    '/semantic/modeling-workbench/projects/build%20learning/packages/build-learning%3Afact%3Adwd_learning_activity_df/actions',
    body,
    undefined,
  )
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm --prefix frontend run test:unit -- modelingWorkbenchApi.test.ts --run
```

Expected: FAIL because `applySemanticAssetPackageAction` is not exported.

- [ ] **Step 3: Add API types and client**

In `frontend/src/v2/api/semanticModelingWorkbench.ts`, add field/review types after `SemanticBuildTarget`:

```ts
export type SemanticFieldCandidateAction = 'pending' | 'accepted' | 'ignored' | 'renamed' | 'deferred'
export type SemanticAssetPackageAction = 'defer' | 'mark_duplicate' | 'regenerate' | 'split' | 'merge'

export interface SemanticFieldCandidate {
  id: string
  field: string
  label?: string | null
  role?: string | null
  aggregation?: string | null
  semantic_type?: string | null
  cube_binding?: Record<string, unknown>
  ontology_binding?: Record<string, unknown>
  confidence?: number | null
  evidence?: string[]
  risk: SemanticAssetPackageRisk
  action: SemanticFieldCandidateAction
}

export interface SemanticFieldReviewSummary {
  total: number
  accepted: number
  pending: number
  ignored: number
  renamed: number
  deferred: number
  high_risk: number
  blocking: number
  can_bulk_accept: number
  can_generate_proposal: boolean
  blocking_reasons: string[]
}

export interface SemanticProposalReadiness {
  status: 'blocked' | 'ready'
  required_bindings: string[]
  blocking_reasons: string[]
  next_actions: string[]
}
```

Extend `SemanticAssetPackage`:

```ts
  field_candidates?: SemanticFieldCandidate[]
  review_summary?: SemanticFieldReviewSummary
  proposal_readiness?: SemanticProposalReadiness
  operation_history?: Array<Record<string, unknown>>
  split_from_package_id?: string | null
  merged_from_package_ids?: string[]
```

Add action body and method:

```ts
export interface SemanticAssetPackageActionBody {
  action: SemanticAssetPackageAction
  reason?: string
  field_candidate_ids?: string[]
  title?: string
  package_type?: SemanticAssetPackageType
  target_package_id?: string
}

export const applySemanticAssetPackageAction = (
  projectId: string,
  packageId: string,
  body: SemanticAssetPackageActionBody,
) =>
  post<SemanticAssetPackage | Record<string, unknown>>(
    `/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/packages/${encodeURIComponent(packageId)}/actions`,
    body,
  )
```

- [ ] **Step 4: Add hook mutation**

In `frontend/src/v2/hooks/semanticModelingWorkbench.ts`, import the new method and type:

```ts
  applySemanticAssetPackageAction,
  type SemanticAssetPackageActionBody,
```

Add:

```ts
export function useApplySemanticAssetPackageAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      packageId,
      body,
    }: {
      projectId: string
      packageId: string
      body: SemanticAssetPackageActionBody
    }) => applySemanticAssetPackageAction(projectId, packageId, body),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: qk('semantic', 'modeling-workbench-project', variables.projectId),
      })
      queryClient.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench-projects') })
    },
  })
}
```

- [ ] **Step 5: Run frontend API test**

Run:

```bash
npm --prefix frontend run test:unit -- modelingWorkbenchApi.test.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/api/semanticModelingWorkbench.ts frontend/src/v2/hooks/semanticModelingWorkbench.ts frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts
git commit -m "feat: expose semantic package action client"
```

---

### Task 4: Field Candidate Review For Large Tables

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx`

- [ ] **Step 1: Write failing tests for grouping, filtering, progress, low-risk bulk accept**

Append to `FieldCandidateReview.test.tsx`:

```tsx
it('展示审阅进度并支持只看高风险字段', async () => {
  const user = userEvent.setup()
  render(
    <FieldCandidateReview
      candidates={[
        { ...candidates[0], id: 'low_1', field: 'student_id', label: '学生', role: 'dimension', risk: 'low', action: 'accepted' },
        { ...candidates[0], id: 'high_1', field: 'duration_sec', label: '学习时长', role: 'measure', risk: 'high', action: 'pending' },
      ]}
    />,
  )

  expect(screen.getByText('已处理 1 / 2')).toBeInTheDocument()
  expect(screen.getByText('高风险 1')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '只看高风险' }))

  expect(screen.queryByText('student_id')).not.toBeInTheDocument()
  expect(screen.getByText('duration_sec')).toBeInTheDocument()
})

it('低风险批量采纳只提交 pending low risk candidates', async () => {
  const user = userEvent.setup()
  const onAction = vi.fn()
  render(
    <FieldCandidateReview
      candidates={[
        { ...candidates[0], id: 'low_1', field: 'student_id', label: '学生', risk: 'low', action: 'pending' },
        { ...candidates[0], id: 'high_1', field: 'duration_sec', label: '学习时长', risk: 'high', action: 'pending' },
        { ...candidates[0], id: 'low_done', field: 'school_id', label: '学校', risk: 'low', action: 'accepted' },
      ]}
      onAction={onAction}
    />,
  )

  await user.click(screen.getByRole('button', { name: '批量采纳低风险 1' }))

  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction).toHaveBeenCalledWith({ candidateId: 'low_1', action: 'accept' })
})

it('展示 Cube 与本体行内映射', () => {
  render(
    <FieldCandidateReview
      candidates={[
        {
          ...candidates[0],
          field: 'duration_sec',
          label: '学习时长',
          cubeBindingLabel: 'measure.learning_duration',
          ontologyBindingLabel: 'metric.learning_duration',
        },
      ]}
    />,
  )

  expect(screen.getByRole('columnheader', { name: 'Cube 映射' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: '本体锚定' })).toBeInTheDocument()
  expect(screen.getByText('measure.learning_duration')).toBeInTheDocument()
  expect(screen.getByText('metric.learning_duration')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend run test:unit -- FieldCandidateReview.test.tsx --run
```

Expected: FAIL because progress/filter/bulk/Cube/Ontology columns are not implemented.

- [ ] **Step 3: Extend component types**

In `FieldCandidateReview.tsx`, extend types:

```ts
export interface FieldCandidateReviewItem {
  id: string
  field: string
  label?: string
  role?: string
  aggregation?: string
  semanticType?: string
  cubeBindingLabel?: string
  ontologyBindingLabel?: string
  confidence?: number
  confidenceLabel?: string
  evidence?: string
  risk?: string
  action?: 'pending' | 'accepted' | 'ignored' | 'renamed' | 'deferred'
}
```

- [ ] **Step 4: Add summary/filter logic**

Inside `FieldCandidateReview`, before `return`, add:

```tsx
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all')
  const summary = candidates.reduce(
    (acc, candidate) => {
      acc.total += 1
      const action = candidate.action || 'pending'
      if (action !== 'pending') acc.done += 1
      if (normalizeRisk(candidate.risk) === 'high') acc.highRisk += 1
      if (normalizeRisk(candidate.risk) === 'low' && action === 'pending') acc.lowRiskPending += 1
      return acc
    },
    { total: 0, done: 0, highRisk: 0, lowRiskPending: 0 },
  )
  const visibleCandidates = riskFilter === 'high'
    ? candidates.filter((candidate) => normalizeRisk(candidate.risk) === 'high')
    : candidates
  const lowRiskPendingCandidates = candidates.filter(
    (candidate) => normalizeRisk(candidate.risk) === 'low' && (candidate.action || 'pending') === 'pending',
  )
```

- [ ] **Step 5: Add toolbar JSX**

After the heading block, add:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
        <div className="flex flex-wrap gap-2 text-[12px] text-2">
          <Chip>已处理 {summary.done} / {summary.total}</Chip>
          <Chip tone={summary.highRisk > 0 ? 'danger' : 'success'}>高风险 {summary.highRisk}</Chip>
          <Chip tone="success">可批量采纳 {summary.lowRiskPending}</Chip>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={riskFilter === 'high' ? 'primary' : 'ghost'} onClick={() => setRiskFilter(riskFilter === 'high' ? 'all' : 'high')}>
            只看高风险
          </Button>
          {onAction ? (
            <Button
              size="sm"
              variant="default"
              disabled={lowRiskPendingCandidates.length === 0}
              onClick={() => lowRiskPendingCandidates.forEach((candidate) => onAction({ candidateId: candidate.id, action: 'accept' }))}
            >
              批量采纳低风险 {lowRiskPendingCandidates.length}
            </Button>
          ) : null}
        </div>
      </div>
```

- [ ] **Step 6: Add columns and use visible candidates**

Change table headers:

```tsx
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">Cube 映射</th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-3">本体锚定</th>
```

Place those headers between `聚合/类型` and `置信度`.

Change row mapping:

```tsx
              {visibleCandidates.map((candidate) => (
```

In `FieldCandidateReviewRow`, add cells after semantic label:

```tsx
      <td className="min-w-[130px] px-3 py-2.5">
        <Chip>{candidate.cubeBindingLabel || '待映射'}</Chip>
      </td>
      <td className="min-w-[130px] px-3 py-2.5">
        <Chip>{candidate.ontologyBindingLabel || '待锚定'}</Chip>
      </td>
```

- [ ] **Step 7: Run tests to verify pass**

Run:

```bash
npm --prefix frontend run test:unit -- FieldCandidateReview.test.tsx --run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/FieldCandidateReview.test.tsx
git commit -m "feat: improve semantic field candidate review"
```

---

### Task 5: First Screen Fallback And Queue Actions

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`

- [ ] **Step 1: Write failing tests for fallback and action buttons**

Append to `BatchModelingWorkbench.test.tsx`:

```tsx
it('在推荐为空时展示手动选表降级路径', async () => {
  render(<BatchModelingWorkbench onOpenBuilder={vi.fn()} />)

  expect(screen.getByText('推荐建设范围')).toBeInTheDocument()
  expect(screen.getByText('若暂无自动推荐，可手动选择源表生成最小候选队列。')).toBeInTheDocument()
  expect(screen.getByLabelText('推荐为空，使用手动选表模式')).toBeInTheDocument()
})

it('候选资产支持暂缓和标记重复动作', async () => {
  const user = userEvent.setup()
  const onOpenBuilder = vi.fn()
  const actionSpy = vi.fn()
  vi.mocked(useApplySemanticAssetPackageAction).mockReturnValue({
    mutate: actionSpy,
    isPending: false,
  } as never)

  render(<BatchModelingWorkbench onOpenBuilder={onOpenBuilder} />)

  await user.click(screen.getByRole('button', { name: '生成批量建设队列' }))
  await screen.findByText('候选资产队列')
  await user.click(screen.getAllByRole('button', { name: '暂缓' })[0])
  await user.click(screen.getAllByRole('button', { name: '标记重复' })[0])

  expect(actionSpy).toHaveBeenCalledWith(expect.objectContaining({ body: { action: 'defer', reason: '用户在候选队列暂缓' } }))
  expect(actionSpy).toHaveBeenCalledWith(expect.objectContaining({ body: { action: 'mark_duplicate', reason: '用户在候选队列标记重复' } }))
})
```

If the current test file does not mock `useApplySemanticAssetPackageAction`, add it to the existing hook mock:

```ts
const applyPackageAction = vi.hoisted(() => vi.fn())
vi.mock('@v2/hooks/semanticModelingWorkbench', () => ({
  useCreateSemanticBuildProject: () => createProject,
  useScanSemanticBuildProject: () => scanProject,
  useApplySemanticAssetPackageAction: () => applyPackageAction,
}))
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --prefix frontend run test:unit -- BatchModelingWorkbench.test.tsx --run
```

Expected: FAIL because fallback copy and action buttons are missing.

- [ ] **Step 3: Import action hook and add fallback state**

Modify `BatchModelingWorkbench.tsx` imports:

```tsx
import {
  useApplySemanticAssetPackageAction,
  useCreateSemanticBuildProject,
  useScanSemanticBuildProject,
} from '@v2/hooks/semanticModelingWorkbench'
```

Add state near existing state:

```tsx
  const [manualFallback, setManualFallback] = useState(false)
  const applyPackageAction = useApplySemanticAssetPackageAction()
```

Include fallback in project scope:

```tsx
          recommendation_empty: manualFallback,
          selected_sources: manualFallback ? ['manual_selected_source'] : undefined,
```

- [ ] **Step 4: Add fallback UI**

After `<h2 className="m-0 text-[15px] font-semibold">建设范围</h2>`, add:

```tsx
          <div className="mt-3 rounded-[8px] border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface-2)' }}>
            <div className="text-[12px] font-semibold text-1">推荐建设范围</div>
            <p className="m-0 mt-1 text-[12px] leading-5 text-3">
              若暂无自动推荐，可手动选择源表生成最小候选队列。
            </p>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-2">
              <input
                aria-label="推荐为空，使用手动选表模式"
                type="checkbox"
                checked={manualFallback}
                onChange={(event) => setManualFallback(event.target.checked)}
              />
              推荐为空时使用手动选表降级
            </label>
          </div>
```

- [ ] **Step 5: Add queue action buttons**

Inside each queue item action area, before the primary `Button`, add:

```tsx
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={applyPackageAction.isPending}
                          onClick={() =>
                            applyPackageAction.mutate({
                              projectId: item.project_id,
                              packageId: item.id,
                              body: { action: 'defer', reason: '用户在候选队列暂缓' },
                            })
                          }
                        >
                          暂缓
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={applyPackageAction.isPending}
                          onClick={() =>
                            applyPackageAction.mutate({
                              projectId: item.project_id,
                              packageId: item.id,
                              body: { action: 'mark_duplicate', reason: '用户在候选队列标记重复' },
                            })
                          }
                        >
                          标记重复
                        </Button>
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm --prefix frontend run test:unit -- BatchModelingWorkbench.test.tsx --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx
git commit -m "feat: add semantic workbench fallback queue actions"
```

---

### Task 6: Proposal Readiness And Publish Check Copy

**Files:**

- Modify: `app/application/semantic/modeling_build_project_service.py`
- Modify: `app/interfaces/api/v1/semantic_modeling_workbench.py`
- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`
- Modify: `tests/integration/test_semantic_modeling_workbench_api.py`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts`

- [ ] **Step 1: Write failing backend readiness tests**

Append to `tests/unit/application/semantic/test_modeling_build_project_service.py`:

```python
def test_build_project_service_returns_proposal_readiness_for_package():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService
    from app.domain.semantic.modeling_build_project import FieldCandidate

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    package = repo.get_package(package_id)
    package.field_candidates = [
        FieldCandidate(
            id="student_id",
            field="student_id",
            label="学生",
            role="dimension",
            risk="low",
            action="accepted",
            cube_binding={"kind": "dimension", "name": "student_id"},
            ontology_binding={"kind": "property", "object": "student", "name": "student_id"},
        )
    ]
    package.ontology_suggestions = [{"type": "object", "name": "student"}]
    repo.save_package(package)

    readiness = service.get_package_proposal_readiness(project["id"], package_id, principal_id="alice")

    assert readiness["status"] == "ready"
    assert readiness["blocking_reasons"] == []
```

- [ ] **Step 2: Write failing release status test**

Append to `releaseValidationStatus.test.ts`:

```ts
it('把发布检查表达为用户可理解的四类状态', () => {
  const groups = buildPublishCheckGroups({
    draftCompleteness: { status: 'passed', message: 'Cube、本体和 Binding 已完整。' },
    semanticCompile: { status: 'passed', message: '语义中心编译通过。' },
    executionValidation: { status: 'not_configured', message: 'Gateway 未配置，本次未执行物理 SQL dry-run。' },
    consumerValidation: { status: 'pending', message: '等待样例问题验证。' },
  })

  expect(groups.map((item) => item.title)).toEqual(['语义草案完整性', '语义编译', '执行验证', '消费者可用性'])
  expect(groups[2].detail).toContain('Gateway 未配置')
})
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_returns_proposal_readiness_for_package -q
npm --prefix frontend run test:unit -- releaseValidationStatus.test.ts --run
```

Expected: FAIL because readiness service and `buildPublishCheckGroups` do not exist.

- [ ] **Step 4: Add backend readiness service and route**

In `modeling_build_project_service.py`, import `build_proposal_readiness` and `refresh_package_review_state`.

Add method:

```python
    def get_package_proposal_readiness(
        self,
        project_id: str,
        package_id: str,
        *,
        principal_id: str | None = None,
    ) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        package = self._require_package(project.id, package_id)
        package = refresh_package_review_state(package)
        self.repository.save_package(package)
        return package.proposal_readiness.model_dump(mode="json")
```

In `semantic_modeling_workbench.py`, add:

```python
    @bp.get("/projects/<project_id>/packages/<package_id>/proposal-readiness")
    @_require_identity_unless_testing
    def get_package_proposal_readiness(project_id: str, package_id: str):
        try:
            return success(
                data=service.get_package_proposal_readiness(
                    project_id,
                    package_id,
                    principal_id=_principal_id(),
                )
            )
        except Exception as exc:
            return _workbench_error("获取语义候选资产发布准备状态", exc)
```

- [ ] **Step 5: Add publish check group helper**

In `releaseValidationStatus.ts`, add:

```ts
export type PublishCheckStatus = 'passed' | 'failed' | 'pending' | 'not_configured'

export interface PublishCheckInput {
  status: PublishCheckStatus
  message: string
}

export interface PublishCheckGroupsInput {
  draftCompleteness: PublishCheckInput
  semanticCompile: PublishCheckInput
  executionValidation: PublishCheckInput
  consumerValidation: PublishCheckInput
}

export function buildPublishCheckGroups(input: PublishCheckGroupsInput) {
  return [
    { id: 'draft-completeness', title: '语义草案完整性', status: input.draftCompleteness.status, detail: input.draftCompleteness.message },
    { id: 'semantic-compile', title: '语义编译', status: input.semanticCompile.status, detail: input.semanticCompile.message },
    { id: 'execution-validation', title: '执行验证', status: input.executionValidation.status, detail: input.executionValidation.message },
    { id: 'consumer-validation', title: '消费者可用性', status: input.consumerValidation.status, detail: input.consumerValidation.message },
  ] as const
}
```

- [ ] **Step 6: Update ModelingAgent copy**

In `ModelingAgent.tsx`, find release-preview labels that mention raw gateway/semantic internals in the main title. Keep details, but make the user-facing section title:

```tsx
<h3 className="m-0 text-[13px] font-semibold text-1">可发布检查</h3>
```

Use these four labels in the release panel:

```tsx
const publishCheckLabels = ['语义草案完整性', '语义编译', '执行验证', '消费者可用性']
```

Do not remove detail text explaining gateway. It should remain inside execution validation detail.

- [ ] **Step 7: Run tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py::test_build_project_service_returns_proposal_readiness_for_package tests/integration/test_semantic_modeling_workbench_api.py -q
npm --prefix frontend run test:unit -- releaseValidationStatus.test.ts ModelingAgent.test.tsx --run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/application/semantic/modeling_build_project_service.py app/interfaces/api/v1/semantic_modeling_workbench.py tests/unit/application/semantic/test_modeling_build_project_service.py tests/integration/test_semantic_modeling_workbench_api.py frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.ts frontend/src/v2/pages/semantic/modeling-copilot/releaseValidationStatus.test.ts
git commit -m "feat: add semantic proposal readiness checks"
```

---

### Task 7: End-To-End P0 Smoke And Full Semantic Verification

**Files:**

- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
- Optionally modify: `docs/semantic_verification.md` only if validation commands or scope changes.

- [ ] **Step 1: Add P0 smoke assertions**

In `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`, extend the `P1 Build Project 批量语义建设生成真实候选队列` test with assertions:

```ts
await expect(page.getByText('推荐建设范围')).toBeVisible()
await expect(page.getByText('若暂无自动推荐，可手动选择源表生成最小候选队列。')).toBeVisible()
await expect(page.getByRole('button', { name: /生成批量建设队列/ })).toBeVisible()

await page.getByRole('button', { name: /生成批量建设队列/ }).click()
await expect(page.getByText('候选资产队列')).toBeVisible()
await expect(page.getByRole('button', { name: '暂缓' }).first()).toBeVisible()
await expect(page.getByRole('button', { name: '标记重复' }).first()).toBeVisible()
```

Extend the asset builder smoke after opening a candidate:

```ts
await expect(page.getByText('字段候选主画布')).toBeVisible()
await expect(page.getByText('可发布检查')).toBeVisible()
await expect(page.getByText('语义草案完整性')).toBeVisible()
await expect(page.getByText('语义编译')).toBeVisible()
await expect(page.getByText('执行验证')).toBeVisible()
await expect(page.getByText('消费者可用性')).toBeVisible()
```

- [ ] **Step 2: Run targeted frontend and backend tests**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov tests/unit/application/semantic/test_modeling_build_project_service.py tests/integration/test_semantic_modeling_workbench_api.py -q
npm --prefix frontend run test:unit -- FieldCandidateReview.test.tsx BatchModelingWorkbench.test.tsx modelingWorkbenchApi.test.ts releaseValidationStatus.test.ts SemanticModelingWorkbench.test.tsx ModelingAgent.test.tsx --run
```

Expected: PASS.

- [ ] **Step 3: Run P34 smoke**

Run:

```bash
cd frontend && npx playwright test --config tests/e2e-v2/playwright.config.ts tests/e2e-v2/p34-modeling-agent-smoke.spec.ts --grep "P1 Build Project|快速模式"
```

Expected: PASS, including the Build Project queue and asset canvas checks.

- [ ] **Step 4: Run semantic verification**

Run:

```bash
make verify-semantic
```

Expected: PASS. Acceptable warnings are existing dependency/localStorage/Browserslist warnings only. Any failed test, lint, typecheck, or smoke is blocking.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts docs/semantic_verification.md
git commit -m "test: cover semantic workbench p0 smoke"
```

If `docs/semantic_verification.md` was not modified, use:

```bash
git add frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts
git commit -m "test: cover semantic workbench p0 smoke"
```

---

## Self-Review

Spec coverage:

- Build Project process boundary: covered by Task 1 domain models and Task 6 readiness labels.
- Asset Package split/merge/defer/duplicate/regenerate: covered by Task 2 backend and Task 5 frontend.
- Large field candidate review: covered by Task 4.
- Recommendation-empty fallback: covered by Task 2 backend and Task 5 frontend.
- Lightweight ontology boundary: covered by Task 1 readiness and Task 6 publish checks.
- Proposal revision and rollback: Task 1 introduces revision model; Task 6 introduces readiness route. A later P1 plan should add a full Proposal editor if the team wants manual raw diff editing, but P0 deliberately avoids raw spec editing.
- Semantic-center/gateway non-intrusion: covered by plan architecture and Task 6 copy; no task writes Build Project into registry or makes gateway accept Semantic Spec.

Placeholder scan:

- No red-flag task markers or undefined filler tasks remain.
- Every task includes concrete files, test commands, expected failure/pass, and commit commands.

Type consistency:

- Backend names: `FieldCandidate`, `FieldReviewSummary`, `ProposalReadiness`, `ProposalRevision`, `refresh_package_review_state`, `apply_asset_package_action`.
- Frontend names: `SemanticFieldCandidate`, `SemanticFieldReviewSummary`, `SemanticProposalReadiness`, `SemanticAssetPackageActionBody`, `applySemanticAssetPackageAction`, `useApplySemanticAssetPackageAction`.
- Route: `/api/v1/semantic/modeling-workbench/projects/<project_id>/packages/<package_id>/actions`.
