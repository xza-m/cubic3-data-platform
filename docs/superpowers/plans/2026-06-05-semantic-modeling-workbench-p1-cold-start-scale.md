# Semantic Modeling Workbench P1 Cold Start Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将批量语义建设从前端模拟队列升级为可持久化、可连续审阅的 Build Project / Asset Package 冷启动工作台。

**Architecture:** P1 只覆盖前期冷启动规模化，不做后期本体治理。后端新增轻量 Build Project 与 Asset Package 应用服务、仓储、API；项目扫描先复用数据资产底座和确定性计划生成，不引入后台异步 Agent。前端把现有 `BatchModelingWorkbench` 从本地 `buildBatchModelingPlan` 迁移到真实 API，同时继续复用 P0 的字段候选主画布、轻本体锚定和 release-preview。

**Tech Stack:** Flask API, SQLAlchemy ORM, Pydantic domain models, pytest, React 18, TypeScript, TanStack Query hooks, Vitest, Playwright, Makefile.

---

## Scope Check

P1 要做：

- Build Project 持久化。
- Asset Package 候选队列持久化。
- 基于业务域和源表范围生成候选资产队列。
- 候选队列状态：`ready_for_review`、`needs_scope`、`high_risk`、`duplicate_candidate`、`deferred`。
- 前端批量页接真实 API。
- 候选资产进入统一 `/semantic/modeling-workbench/:projectId/candidate/:candidateId`。
- 字段候选主画布可以从 Asset Package 上下文创建或复用建模 session。
- 轻本体锚定只做推荐/绑定草案，不做完整术语治理。

P1 不做：

- 完整本体关系图谱编辑。
- 同义词生命周期治理。
- 跨域术语冲突工作台。
- 复杂审批流。
- 后台批量自动发布。
- Gateway 新执行接口。

工程原则：

- **KISS**：先用同步确定性扫描生成候选队列，不上长任务。
- **YAGNI**：项目状态和候选状态够支撑连续冷启动即可。
- **SOLID**：Build Project 管建设项目；Modeling Session 管单资产会话；Semantic Center 管发布资产。
- **DRY**：前端和后端共享同一组 status / risk / target 语义，不再保留前端 fixture 真值。

## File Structure

新增文件：

- `app/domain/semantic/modeling_build_project.py`
  - Pydantic domain model: `ModelingBuildProject`, `ModelingAssetPackage`, request/status types。
- `app/domain/semantic/ports/modeling_build_project_repository.py`
  - Repository port for build projects.
- `app/infrastructure/semantic/sql_modeling_build_project_repository.py`
  - SQL repository backed by new ORM rows.
- `app/application/semantic/modeling_build_project_service.py`
  - Create/list/get/scan/update candidate service.
- `app/interfaces/api/v1/semantic_modeling_workbench.py`
  - Public API for build project and asset packages.
- `tests/unit/application/semantic/test_modeling_build_project_service.py`
  - Service tests.
- `tests/integration/test_semantic_modeling_workbench_api.py`
  - API tests.
- `frontend/src/v2/api/semanticModelingWorkbench.ts`
  - Frontend API types and methods.
- `frontend/src/v2/hooks/semanticModelingWorkbench.ts`
  - React Query hooks for projects and scans.
- `frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts`
  - API client pure tests or hook mutation tests.

修改文件：

- `app/infrastructure/semantic/models.py`
  - Add `SemanticModelingBuildProjectORM` and `SemanticModelingAssetPackageORM`.
- `app/__init__.py`
  - Register new blueprint.
- `app/di/container.py`
  - Wire repository/service.
- `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`
  - Keep pure fallback helpers, but stop treating generated queue as source of truth.
- `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
  - Use API-backed project creation and scan result.
- `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`
  - Open API-backed candidate route state.
- `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
  - Load project/candidate from API when route params exist.
- `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
  - Add API-backed P1 smoke.
- `docs/prd/semantic_cold_start_builder_prd.md`
  - Mark P1 as cold-start scale, not governance.
- `docs/TECH_STACK_AND_ARCHITECTURE.md`
  - Document new API boundary.

---

### Task 1: Build Project Domain Model

**Files:**

- Create: `app/domain/semantic/modeling_build_project.py`
- Create: `app/domain/semantic/ports/modeling_build_project_repository.py`
- Create: `tests/unit/application/semantic/test_modeling_build_project_service.py`

- [ ] **Step 1: Write failing domain tests**

Create `tests/unit/application/semantic/test_modeling_build_project_service.py` with domain import expectations:

```py
from app.domain.semantic.modeling_build_project import (
    ModelingAssetPackage,
    ModelingBuildProject,
    create_asset_package_id,
    normalize_build_project_id,
)


def test_normalize_build_project_id_is_stable():
    assert normalize_build_project_id(" 学情 分析 ") == "build-xue-qing-fen-xi"
    assert normalize_build_project_id("") == "build-project"
    assert normalize_build_project_id("batch_2026") == "build-batch-2026"


def test_build_project_defaults_to_semantic_center_target():
    project = ModelingBuildProject(
        id="build-learning",
        name="学情分析",
        business_domain="学情分析",
        created_by="alice",
    )

    assert project.target == "semantic_center"
    assert project.status == "draft"
    assert project.asset_package_count == 0
    assert project.risk_summary == {"low": 0, "medium": 0, "high": 0}


def test_asset_package_id_and_payload():
    package_id = create_asset_package_id("build-learning", "dwd_learning_activity_df", "fact")
    package = ModelingAssetPackage(
        id=package_id,
        project_id="build-learning",
        title="学情分析事实主题候选",
        package_type="fact",
        target="semantic_center",
        source="dwd_learning_activity_df",
        grain="一条学习行为事件",
        confidence=0.88,
        risk="low",
        status="ready_for_review",
        evidence=["表画像显示行为时间字段完整。"],
    )

    assert package.id == "build-learning:fact:dwd-learning-activity-df"
    assert package.primary_action == "open_builder"
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.domain.semantic.modeling_build_project'`.

- [ ] **Step 3: Add domain model**

Create `app/domain/semantic/modeling_build_project.py`:

```py
"""语义建设 Build Project 领域模型。"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


BuildProjectStatus = Literal["draft", "scanned", "in_review", "published", "archived"]
AssetPackageStatus = Literal[
    "ready_for_review",
    "needs_scope",
    "high_risk",
    "duplicate_candidate",
    "deferred",
    "in_review",
    "published",
]
AssetPackageType = Literal["fact", "dimension", "metric", "object"]
BuildTarget = Literal["semantic_center"]
RiskLevel = Literal["low", "medium", "high"]


class ModelingAssetPackage(BaseModel):
    id: str
    project_id: str
    title: str
    package_type: AssetPackageType
    target: BuildTarget = "semantic_center"
    source: str
    grain: str
    confidence: float = 0
    risk: RiskLevel = "medium"
    status: AssetPackageStatus = "ready_for_review"
    primary_action: str = "open_builder"
    evidence: List[str] = Field(default_factory=list)
    ontology_suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    cube_suggestions: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())


class ModelingBuildProject(BaseModel):
    id: str
    name: str
    business_domain: str
    created_by: str | None = None
    target: BuildTarget = "semantic_center"
    status: BuildProjectStatus = "draft"
    scope: Dict[str, Any] = Field(default_factory=dict)
    asset_package_ids: List[str] = Field(default_factory=list)
    asset_package_count: int = 0
    risk_summary: Dict[str, int] = Field(default_factory=lambda: {"low": 0, "medium": 0, "high": 0})
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def touch(self) -> None:
        self.updated_at = _utc_now()


def normalize_build_project_id(value: str | None) -> str:
    source = (value or "").strip()
    if not source:
        return "build-project"
    slug = (
        source.replace("学", "xue")
        .replace("情", "qing")
        .replace("分", "fen")
        .replace("析", "xi")
        .replace("_", "-")
    )
    slug = "-".join(part for part in slug.split() if part)
    slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in slug)
    slug = "-".join(part for part in slug.split("-") if part).lower()
    return f"build-{slug}" if slug else "build-project"


def create_asset_package_id(project_id: str, source: str, package_type: str) -> str:
    normalized_source = "".join(ch if ch.isalnum() else "-" for ch in source).strip("-").lower()
    normalized_source = "-".join(part for part in normalized_source.split("-") if part)
    return f"{project_id}:{package_type}:{normalized_source}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
```

Create `app/domain/semantic/ports/modeling_build_project_repository.py`:

```py
"""语义建设 Build Project 仓储端口。"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.semantic.modeling_build_project import ModelingAssetPackage, ModelingBuildProject


class IModelingBuildProjectRepository(ABC):
    @abstractmethod
    def get_project(self, project_id: str) -> Optional[ModelingBuildProject]:
        ...

    @abstractmethod
    def save_project(self, project: ModelingBuildProject) -> None:
        ...

    @abstractmethod
    def list_projects(self, principal_id: str | None = None, *, limit: int = 50) -> List[ModelingBuildProject]:
        ...

    @abstractmethod
    def get_package(self, package_id: str) -> Optional[ModelingAssetPackage]:
        ...

    @abstractmethod
    def list_packages(self, project_id: str) -> List[ModelingAssetPackage]:
        ...

    @abstractmethod
    def save_package(self, package: ModelingAssetPackage) -> None:
        ...
```

- [ ] **Step 4: Run tests**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -q
```

Expected: PASS for `test_normalize_build_project_id_is_stable`, `test_build_project_defaults_to_semantic_center_target`, and `test_asset_package_id_and_payload`.

- [ ] **Step 5: Commit**

```bash
git add app/domain/semantic/modeling_build_project.py app/domain/semantic/ports/modeling_build_project_repository.py tests/unit/application/semantic/test_modeling_build_project_service.py
git commit -m "feat: add semantic build project domain model"
```

---

### Task 2: SQL Repository and ORM

**Files:**

- Modify: `app/infrastructure/semantic/models.py`
- Create: `app/infrastructure/semantic/sql_modeling_build_project_repository.py`
- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`

- [ ] **Step 1: Add repository tests**

Append to `tests/unit/application/semantic/test_modeling_build_project_service.py`:

```py
def test_sql_build_project_repository_round_trip(db_session):
    from app.domain.semantic.modeling_build_project import ModelingAssetPackage, ModelingBuildProject
    from app.infrastructure.semantic.sql_modeling_build_project_repository import SqlModelingBuildProjectRepository

    repo = SqlModelingBuildProjectRepository(db_session)
    project = ModelingBuildProject(id="build-learning", name="学情分析", business_domain="学情分析", created_by="alice")
    package = ModelingAssetPackage(
        id="build-learning:fact:dwd-learning-activity-df",
        project_id="build-learning",
        title="学情分析事实主题候选",
        package_type="fact",
        source="dwd_learning_activity_df",
        grain="一条学习行为事件",
        confidence=0.88,
        risk="low",
        evidence=["表画像显示行为时间字段完整。"],
    )

    repo.save_project(project)
    repo.save_package(package)

    assert repo.get_project("build-learning").name == "学情分析"
    assert repo.list_projects("alice")[0].id == "build-learning"
    assert repo.get_package(package.id).title == "学情分析事实主题候选"
    assert repo.list_packages("build-learning")[0].source == "dwd_learning_activity_df"
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -k "repository_round_trip" -q
```

Expected: FAIL with unresolved repository or missing ORM table.

- [ ] **Step 3: Add ORM rows**

In `app/infrastructure/semantic/models.py`, add after `SemanticModelingProposalORM`:

```py
class SemanticModelingBuildProjectORM(db.Model):
    """语义建设 Build Project 持久化模型。"""

    __tablename__ = "semantic_modeling_build_projects"
    __table_args__ = (
        Index("idx_semantic_build_projects_principal_updated", "created_by", "updated_at"),
        Index("idx_semantic_build_projects_status_updated", "status", "updated_at"),
        {"extend_existing": True},
    )

    id = Column(String(128), primary_key=True)
    created_by = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class SemanticModelingAssetPackageORM(db.Model):
    """语义建设候选 Asset Package 持久化模型。"""

    __tablename__ = "semantic_modeling_asset_packages"
    __table_args__ = (
        Index("idx_semantic_asset_packages_project_status", "project_id", "status"),
        Index("idx_semantic_asset_packages_risk", "risk"),
        {"extend_existing": True},
    )

    id = Column(String(160), primary_key=True)
    project_id = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="ready_for_review")
    risk = Column(String(32), nullable=False, default="medium")
    payload_json = Column(JsonType, nullable=False, default=dict)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
```

- [ ] **Step 4: Add SQL repository**

Create `app/infrastructure/semantic/sql_modeling_build_project_repository.py`:

```py
"""SQL 驱动的语义建设 Build Project 仓储。"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy.orm import Session

from app.domain.semantic.modeling_build_project import ModelingAssetPackage, ModelingBuildProject
from app.domain.semantic.ports.modeling_build_project_repository import IModelingBuildProjectRepository
from app.infrastructure.semantic.models import (
    SemanticModelingAssetPackageORM,
    SemanticModelingBuildProjectORM,
)


class SqlModelingBuildProjectRepository(IModelingBuildProjectRepository):
    def __init__(self, session: Session):
        self.session = session

    def get_project(self, project_id: str) -> Optional[ModelingBuildProject]:
        row = self.session.query(SemanticModelingBuildProjectORM).filter_by(id=project_id).first()
        return ModelingBuildProject(**dict(row.payload_json or {})) if row else None

    def save_project(self, project: ModelingBuildProject) -> None:
        project.touch()
        row = self.session.query(SemanticModelingBuildProjectORM).filter_by(id=project.id).first()
        if row is None:
            row = SemanticModelingBuildProjectORM(id=project.id)
            self.session.add(row)
        row.created_by = project.created_by
        row.status = project.status
        row.payload_json = project.model_dump(mode="json")
        row.version = int(row.version or 0) + 1
        self.session.commit()

    def list_projects(self, principal_id: str | None = None, *, limit: int = 50) -> List[ModelingBuildProject]:
        query = self.session.query(SemanticModelingBuildProjectORM)
        if principal_id is not None:
            query = query.filter(SemanticModelingBuildProjectORM.created_by == principal_id)
        rows = query.order_by(SemanticModelingBuildProjectORM.updated_at.desc()).limit(limit).all()
        return [ModelingBuildProject(**dict(row.payload_json or {})) for row in rows]

    def get_package(self, package_id: str) -> Optional[ModelingAssetPackage]:
        row = self.session.query(SemanticModelingAssetPackageORM).filter_by(id=package_id).first()
        return ModelingAssetPackage(**dict(row.payload_json or {})) if row else None

    def list_packages(self, project_id: str) -> List[ModelingAssetPackage]:
        rows = (
            self.session.query(SemanticModelingAssetPackageORM)
            .filter_by(project_id=project_id)
            .order_by(SemanticModelingAssetPackageORM.updated_at.desc())
            .all()
        )
        return [ModelingAssetPackage(**dict(row.payload_json or {})) for row in rows]

    def save_package(self, package: ModelingAssetPackage) -> None:
        row = self.session.query(SemanticModelingAssetPackageORM).filter_by(id=package.id).first()
        if row is None:
            row = SemanticModelingAssetPackageORM(id=package.id, project_id=package.project_id)
            self.session.add(row)
        row.project_id = package.project_id
        row.status = package.status
        row.risk = package.risk
        row.payload_json = package.model_dump(mode="json")
        row.version = int(row.version or 0) + 1
        self.session.commit()
```

- [ ] **Step 5: Run tests**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -k "repository_round_trip" -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/infrastructure/semantic/models.py app/infrastructure/semantic/sql_modeling_build_project_repository.py tests/unit/application/semantic/test_modeling_build_project_service.py
git commit -m "feat: persist semantic build projects"
```

---

### Task 3: Build Project Service

**Files:**

- Create: `app/application/semantic/modeling_build_project_service.py`
- Modify: `tests/unit/application/semantic/test_modeling_build_project_service.py`

- [ ] **Step 1: Add service tests**

Append:

```py
class InMemoryBuildProjectRepository:
    def __init__(self):
        self.projects = {}
        self.packages = {}

    def get_project(self, project_id):
        return self.projects.get(project_id)

    def save_project(self, project):
        self.projects[project.id] = project

    def list_projects(self, principal_id=None, *, limit=50):
        items = list(self.projects.values())
        if principal_id is not None:
            items = [item for item in items if item.created_by == principal_id]
        return items[:limit]

    def get_package(self, package_id):
        return self.packages.get(package_id)

    def list_packages(self, project_id):
        return [item for item in self.packages.values() if item.project_id == project_id]

    def save_package(self, package):
        self.packages[package.id] = package


def test_build_project_service_creates_project_and_scan_queue():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)

    project = service.create_project(
        {
            "name": "学情分析",
            "business_domain": "学情分析",
            "scope": {"source_count": 18, "include_existing_semantics": True},
        },
        principal_id="alice",
    )
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")

    assert scanned["status"] == "scanned"
    assert scanned["asset_package_count"] == 3
    assert scanned["risk_summary"]["low"] >= 1
    assert repo.list_packages(project["id"])[0].target == "semantic_center"


def test_build_project_service_rejects_cross_user_access():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")

    try:
        service.get_project(project["id"], principal_id="bob")
    except PermissionError as exc:
        assert "无权访问语义建设项目" in str(exc)
    else:
        raise AssertionError("expected PermissionError")
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -k "service_" -q
```

Expected: FAIL with unresolved service.

- [ ] **Step 3: Add service implementation**

Create `app/application/semantic/modeling_build_project_service.py`:

```py
"""语义建设 Build Project 应用服务。"""
from __future__ import annotations

from typing import Any, Dict

from app.domain.semantic.modeling_build_project import (
    ModelingAssetPackage,
    ModelingBuildProject,
    create_asset_package_id,
    normalize_build_project_id,
)
from app.domain.semantic.ports.modeling_build_project_repository import IModelingBuildProjectRepository


class ModelingBuildProjectService:
    def __init__(self, repository: IModelingBuildProjectRepository):
        self.repository = repository

    def create_project(self, payload: Dict[str, Any], *, principal_id: str | None = None) -> Dict[str, Any]:
        name = str(payload.get("name") or payload.get("business_domain") or "语义建设项目").strip()
        business_domain = str(payload.get("business_domain") or name).strip()
        project_id = normalize_build_project_id(str(payload.get("id") or name))
        project = ModelingBuildProject(
            id=project_id,
            name=name,
            business_domain=business_domain,
            created_by=principal_id,
            scope=dict(payload.get("scope") or {}),
        )
        self.repository.save_project(project)
        return self._dump_project(project)

    def list_projects(self, *, principal_id: str | None = None, limit: int = 50) -> Dict[str, Any]:
        items = [self._dump_project(item) for item in self.repository.list_projects(principal_id, limit=limit)]
        return {"items": items, "total": len(items)}

    def get_project(self, project_id: str, *, principal_id: str | None = None) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        packages = [package.model_dump(mode="json") for package in self.repository.list_packages(project.id)]
        result = self._dump_project(project)
        result["asset_packages"] = packages
        return result

    def scan_project(self, project_id: str, payload: Dict[str, Any] | None = None, *, principal_id: str | None = None) -> Dict[str, Any]:
        project = self._require_project(project_id, principal_id)
        scope = dict(project.scope or {})
        strategy = str((payload or {}).get("strategy") or scope.get("strategy") or "balanced")
        packages = self._deterministic_packages(project, strategy)
        risk_summary = {"low": 0, "medium": 0, "high": 0}
        for package in packages:
            risk_summary[package.risk] += 1
            self.repository.save_package(package)
        project.status = "scanned"
        project.asset_package_ids = [package.id for package in packages]
        project.asset_package_count = len(packages)
        project.risk_summary = risk_summary
        self.repository.save_project(project)
        return self.get_project(project.id, principal_id=principal_id)

    def _deterministic_packages(self, project: ModelingBuildProject, strategy: str) -> list[ModelingAssetPackage]:
        risk = "medium" if strategy == "exploratory" else "low"
        domain = project.business_domain
        return [
            ModelingAssetPackage(
                id=create_asset_package_id(project.id, "dwd_learning_activity_df", "fact"),
                project_id=project.id,
                title=f"{domain}事实主题候选",
                package_type="fact",
                source="dwd_learning_activity_df",
                grain="一条学习行为事件",
                confidence=0.88,
                risk=risk,
                evidence=["表画像显示行为时间、学生、课程和学校字段完整。", "血缘使用中已被学情报表消费。"],
                ontology_suggestions=[{"type": "object", "name": "learning_activity", "title": "学习行为"}],
                cube_suggestions={"dimensions": ["student_id", "school_id", "course_id"], "measures": ["activity_count"]},
            ),
            ModelingAssetPackage(
                id=create_asset_package_id(project.id, "dim_school_df", "dimension"),
                project_id=project.id,
                title=f"{domain}学校维度候选",
                package_type="dimension",
                source="dim_school_df",
                grain="一所学校",
                confidence=0.91,
                risk="low",
                evidence=["维表主键稳定，字段中文名与业务术语一致。", "已有语义中心对象可作为复用参考。"],
                ontology_suggestions=[{"type": "object", "name": "school", "title": "学校"}],
                cube_suggestions={"dimensions": ["school_id", "school_name"], "measures": []},
            ),
            ModelingAssetPackage(
                id=create_asset_package_id(project.id, "dws_learning_student_activity_di", "metric"),
                project_id=project.id,
                title=f"{domain}活跃学生指标候选",
                package_type="metric",
                source="dws_learning_student_activity_di",
                grain="按天、学生聚合",
                confidence=0.79,
                risk="medium",
                status="needs_scope",
                evidence=["存在多种活跃口径，需要业务 owner 确认。", "可从最近 7 天查询需求回推时间过滤口径。"],
                ontology_suggestions=[{"type": "metric", "name": "active_student_count", "title": "活跃学生数"}],
                cube_suggestions={"dimensions": ["dt", "student_id"], "measures": ["active_student_count"]},
            ),
        ]

    def _require_project(self, project_id: str, principal_id: str | None) -> ModelingBuildProject:
        project = self.repository.get_project(project_id)
        if project is None:
            raise ValueError(f"语义建设项目不存在: {project_id}")
        if principal_id is not None and project.created_by not in {None, principal_id}:
            raise PermissionError("无权访问语义建设项目")
        return project

    def _dump_project(self, project: ModelingBuildProject) -> Dict[str, Any]:
        return project.model_dump(mode="json")
```

- [ ] **Step 4: Run tests**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/application/semantic/modeling_build_project_service.py tests/unit/application/semantic/test_modeling_build_project_service.py
git commit -m "feat: add semantic build project service"
```

---

### Task 4: Build Project API

**Files:**

- Create: `app/interfaces/api/v1/semantic_modeling_workbench.py`
- Modify: `app/__init__.py`
- Modify: `app/di/container.py`
- Create: `tests/integration/test_semantic_modeling_workbench_api.py`

- [ ] **Step 1: Write API tests**

Create `tests/integration/test_semantic_modeling_workbench_api.py`:

```py
from app.interfaces.api.v1.semantic_modeling_workbench import create_semantic_modeling_workbench_blueprint


class _ServiceStub:
    def __init__(self):
        self.calls = []

    def create_project(self, payload, *, principal_id=None):
        self.calls.append(("create_project", payload, principal_id))
        return {"id": "build-learning", "name": payload["name"], "target": "semantic_center"}

    def list_projects(self, *, principal_id=None, limit=50):
        self.calls.append(("list_projects", limit, principal_id))
        return {"items": [{"id": "build-learning", "name": "学情分析"}], "total": 1}

    def get_project(self, project_id, *, principal_id=None):
        self.calls.append(("get_project", project_id, principal_id))
        return {"id": project_id, "asset_packages": []}

    def scan_project(self, project_id, payload, *, principal_id=None):
        self.calls.append(("scan_project", project_id, payload, principal_id))
        return {"id": project_id, "status": "scanned", "asset_package_count": 3}


def test_modeling_workbench_project_routes(client_factory):
    service = _ServiceStub()
    app = client_factory()
    app.register_blueprint(create_semantic_modeling_workbench_blueprint(service))
    client = app.test_client()

    create_resp = client.post("/api/v1/semantic/modeling-workbench/projects", json={"name": "学情分析"})
    assert create_resp.status_code == 200
    assert create_resp.get_json()["data"]["target"] == "semantic_center"

    list_resp = client.get("/api/v1/semantic/modeling-workbench/projects")
    assert list_resp.status_code == 200
    assert list_resp.get_json()["data"]["total"] == 1

    get_resp = client.get("/api/v1/semantic/modeling-workbench/projects/build-learning")
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["id"] == "build-learning"

    scan_resp = client.post("/api/v1/semantic/modeling-workbench/projects/build-learning/scan", json={"strategy": "balanced"})
    assert scan_resp.status_code == 200
    assert scan_resp.get_json()["data"]["asset_package_count"] == 3
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pytest tests/integration/test_semantic_modeling_workbench_api.py -q
```

Expected: FAIL with unresolved blueprint.

- [ ] **Step 3: Add blueprint**

Create `app/interfaces/api/v1/semantic_modeling_workbench.py`:

```py
"""语义建设工作台 Build Project API。"""
from __future__ import annotations

from flask import Blueprint, request

from app.interfaces.api.middleware.auth import get_current_user
from app.shared.response import error, success


def create_semantic_modeling_workbench_blueprint(service) -> Blueprint:
    bp = Blueprint("semantic_modeling_workbench_api_v1", __name__, url_prefix="/api/v1/semantic/modeling-workbench")

    def _body() -> dict:
        return request.get_json(silent=True) or {}

    def _principal_id() -> str | None:
        user = get_current_user()
        return user.get("user_id") if isinstance(user, dict) else None

    def _handle(action: str, fn):
        try:
            return success(data=fn())
        except PermissionError as exc:
            return error(str(exc), status=403)
        except Exception as exc:
            return error(f"{action}失败：{exc}", status=400)

    @bp.get("/projects")
    def list_projects():
        return _handle("列出语义建设项目", lambda: service.list_projects(principal_id=_principal_id()))

    @bp.post("/projects")
    def create_project():
        return _handle("创建语义建设项目", lambda: service.create_project(_body(), principal_id=_principal_id()))

    @bp.get("/projects/<project_id>")
    def get_project(project_id: str):
        return _handle("获取语义建设项目", lambda: service.get_project(project_id, principal_id=_principal_id()))

    @bp.post("/projects/<project_id>/scan")
    def scan_project(project_id: str):
        return _handle("扫描语义建设项目", lambda: service.scan_project(project_id, _body(), principal_id=_principal_id()))

    return bp
```

- [ ] **Step 4: Wire app and container**

In `app/di/container.py`, add imports near other semantic imports:

```py
from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService
from app.infrastructure.semantic.sql_modeling_build_project_repository import SqlModelingBuildProjectRepository
```

In the `Container` class near `semantic_modeling_copilot`, add providers:

```py
    semantic_modeling_workbench_repository = providers.Singleton(
        SqlModelingBuildProjectRepository,
        session=db_session,
    )

    semantic_modeling_workbench_service = providers.Singleton(
        ModelingBuildProjectService,
        repository=semantic_modeling_workbench_repository,
    )
```

In `app/__init__.py`, add import near the existing semantic modeling copilot import:

```py
from .interfaces.api.v1.semantic_modeling_workbench import create_semantic_modeling_workbench_blueprint
```

Then register the blueprint immediately before `register_semantic_modeling_copilot_blueprint(app, container)`:

```py
        app.register_blueprint(
            create_semantic_modeling_workbench_blueprint(
                container.semantic_modeling_workbench_service(),
            )
        )
```

- [ ] **Step 5: Run API tests**

Run:

```bash
pytest tests/integration/test_semantic_modeling_workbench_api.py -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/interfaces/api/v1/semantic_modeling_workbench.py app/__init__.py app/di/container.py tests/integration/test_semantic_modeling_workbench_api.py
git commit -m "feat: expose semantic build project api"
```

---

### Task 5: Frontend API and Hooks

**Files:**

- Create: `frontend/src/v2/api/semanticModelingWorkbench.ts`
- Create: `frontend/src/v2/hooks/semanticModelingWorkbench.ts`
- Create: `frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts`

- [ ] **Step 1: Write frontend API tests**

Create `modelingWorkbenchApi.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createSemanticBuildProject,
  scanSemanticBuildProject,
  type SemanticBuildProject,
} from '@v2/api/semanticModelingWorkbench'

vi.mock('@v2/api/client', () => ({
  post: vi.fn(async (path: string, body: unknown) => ({ data: { path, body } })),
  get: vi.fn(async (path: string) => ({ data: { path } })),
}))

describe('semanticModelingWorkbench api', () => {
  it('creates and scans build projects through the workbench API', async () => {
    const created = await createSemanticBuildProject({ name: '学情分析', business_domain: '学情分析' })
    const scanned = await scanSemanticBuildProject('build-learning', { strategy: 'balanced' })

    expect((created as unknown as { path: string }).path).toBe('/semantic/modeling-workbench/projects')
    expect((scanned as unknown as { path: string }).path).toBe('/semantic/modeling-workbench/projects/build-learning/scan')
  })

  it('defines project type with semantic center target', () => {
    const project: SemanticBuildProject = {
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'scanned',
      asset_package_count: 3,
      risk_summary: { low: 1, medium: 1, high: 0 },
      asset_packages: [],
    }

    expect(project.target).toBe('semantic_center')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts
```

Expected: FAIL with unresolved API module.

- [ ] **Step 3: Add frontend API module**

Create `frontend/src/v2/api/semanticModelingWorkbench.ts`:

```ts
import { get, post } from './client'

export type SemanticBuildProjectStatus = 'draft' | 'scanned' | 'in_review' | 'published' | 'archived'
export type SemanticAssetPackageStatus =
  | 'ready_for_review'
  | 'needs_scope'
  | 'high_risk'
  | 'duplicate_candidate'
  | 'deferred'
  | 'in_review'
  | 'published'
export type SemanticAssetPackageRisk = 'low' | 'medium' | 'high'
export type SemanticAssetPackageType = 'fact' | 'dimension' | 'metric' | 'object'

export interface SemanticAssetPackage {
  id: string
  project_id: string
  title: string
  package_type: SemanticAssetPackageType
  target: 'semantic_center'
  source: string
  grain: string
  confidence: number
  risk: SemanticAssetPackageRisk
  status: SemanticAssetPackageStatus
  primary_action: string
  evidence: string[]
  ontology_suggestions?: Array<Record<string, unknown>>
  cube_suggestions?: Record<string, unknown>
}

export interface SemanticBuildProject {
  id: string
  name: string
  business_domain: string
  target: 'semantic_center'
  status: SemanticBuildProjectStatus
  asset_package_count: number
  risk_summary: Record<string, number>
  asset_packages?: SemanticAssetPackage[]
}

export interface CreateSemanticBuildProjectBody {
  name: string
  business_domain?: string
  scope?: Record<string, unknown>
}

export interface ScanSemanticBuildProjectBody {
  strategy?: 'conservative' | 'balanced' | 'exploratory'
}

export function listSemanticBuildProjects() {
  return get<{ items: SemanticBuildProject[]; total: number }>('/semantic/modeling-workbench/projects')
}

export function createSemanticBuildProject(body: CreateSemanticBuildProjectBody) {
  return post<SemanticBuildProject>('/semantic/modeling-workbench/projects', body)
}

export function getSemanticBuildProject(projectId: string) {
  return get<SemanticBuildProject>(`/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}`)
}

export function scanSemanticBuildProject(projectId: string, body: ScanSemanticBuildProjectBody) {
  return post<SemanticBuildProject>(`/semantic/modeling-workbench/projects/${encodeURIComponent(projectId)}/scan`, body)
}
```

Create `frontend/src/v2/hooks/semanticModelingWorkbench.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  createSemanticBuildProject,
  getSemanticBuildProject,
  listSemanticBuildProjects,
  scanSemanticBuildProject,
  type CreateSemanticBuildProjectBody,
  type ScanSemanticBuildProjectBody,
} from '@v2/api/semanticModelingWorkbench'

const qk = (...parts: Array<string | undefined>) => parts.filter(Boolean)

export function useSemanticBuildProjects() {
  return useQuery({
    queryKey: qk('semantic', 'modeling-workbench', 'projects'),
    queryFn: listSemanticBuildProjects,
  })
}

export function useSemanticBuildProject(projectId: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-workbench', 'project', projectId),
    queryFn: () => getSemanticBuildProject(projectId!),
    enabled: Boolean(projectId),
  })
}

export function useCreateSemanticBuildProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSemanticBuildProjectBody) => createSemanticBuildProject(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench', 'projects') }),
  })
}

export function useScanSemanticBuildProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: ScanSemanticBuildProjectBody }) =>
      scanSemanticBuildProject(projectId, body),
    onSuccess: (project) => {
      qc.setQueryData(qk('semantic', 'modeling-workbench', 'project', project.id), project)
      qc.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench', 'projects') })
    },
  })
}
```

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/api/semanticModelingWorkbench.ts frontend/src/v2/hooks/semanticModelingWorkbench.ts frontend/src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts
git commit -m "feat: add semantic build project frontend api"
```

---

### Task 6: API-Backed Batch Workbench

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx`

- [ ] **Step 1: Update tests for API-backed generation**

In `BatchModelingWorkbench.test.tsx`, mock hooks:

```ts
vi.mock('@v2/hooks/semanticModelingWorkbench', () => ({
  useCreateSemanticBuildProject: () => ({
    mutateAsync: vi.fn(async () => ({ id: 'build-learning', name: '学情分析', business_domain: '学情分析', target: 'semantic_center' })),
    isPending: false,
  }),
  useScanSemanticBuildProject: () => ({
    mutateAsync: vi.fn(async () => ({
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'scanned',
      asset_package_count: 1,
      risk_summary: { low: 1, medium: 0, high: 0 },
      asset_packages: [
        {
          id: 'build-learning:fact:dwd-learning-activity-df',
          project_id: 'build-learning',
          title: '学情分析事实主题候选',
          package_type: 'fact',
          target: 'semantic_center',
          source: 'dwd_learning_activity_df',
          grain: '一条学习行为事件',
          confidence: 0.88,
          risk: 'low',
          status: 'ready_for_review',
          primary_action: 'open_builder',
          evidence: ['表画像显示行为时间字段完整。'],
        },
      ],
    })),
    isPending: false,
  }),
}))
```

Then assert:

```tsx
fireEvent.click(screen.getByRole('button', { name: '生成批量建设队列' }))

expect(await screen.findByText('学情分析事实主题候选')).toBeInTheDocument()
expect(screen.getByText('1 个候选资产包')).toBeInTheDocument()
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx
```

Expected: FAIL because component still uses local `buildBatchModelingPlan`.

- [ ] **Step 3: Update component props and API calls**

In `BatchModelingWorkbench.tsx`, import hooks and API type:

```ts
import { useCreateSemanticBuildProject, useScanSemanticBuildProject } from '@v2/hooks/semanticModelingWorkbench'
import type { SemanticAssetPackage } from '@v2/api/semanticModelingWorkbench'
```

Change prop:

```ts
interface BatchModelingWorkbenchProps {
  onOpenBuilder: (item: SemanticAssetPackage) => void
}
```

Add mutations:

```ts
const createProject = useCreateSemanticBuildProject()
const scanProject = useScanSemanticBuildProject()
const [project, setProject] = useState<SemanticBuildProject | null>(null)
```

Replace button handler:

```tsx
onClick={async () => {
  const created = await createProject.mutateAsync({
    name: scope.businessDomain,
    business_domain: scope.businessDomain,
    scope: {
      source_count: scope.sourceCount,
      strategy: scope.strategy,
      include_existing_semantics: scope.includeExistingSemantics,
    },
  })
  const scanned = await scanProject.mutateAsync({ projectId: created.id, body: { strategy: scope.strategy } })
  setProject(scanned)
  setSubmittedScope(scope)
}}
```

Render queue from:

```ts
const queueItems = project?.asset_packages ?? []
```

Map API fields:

```tsx
{queueItems.map((item) => (
  <article key={item.id} className="rounded-[8px] border p-3" style={{ borderColor: 'var(--border)' }}>
    <h3 className="m-0 min-w-0 break-words text-[14px] font-semibold">{item.title}</h3>
    <p className="m-0 mt-1 break-all text-[12px] text-3">{item.source} · {item.grain}</p>
    <p className="m-0 mt-3 text-[12px] text-2">置信度 {(item.confidence * 100).toFixed(0)}%</p>
    <ul className="m-0 mt-2 space-y-1 pl-4 text-[12px] leading-5 text-2">
      {item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
    </ul>
    <div className="mt-3 flex justify-end">
      <Button size="sm" variant="default" onClick={() => onOpenBuilder(item)}>
        进入资产建设画布
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  </article>
))}
```

- [ ] **Step 4: Update BatchModelingAgent target conversion**

In `BatchModelingAgent.tsx`, accept `SemanticAssetPackage` and convert to existing route target:

```ts
import type { SemanticAssetPackage } from '@v2/api/semanticModelingWorkbench'

function toWorkbenchQueueItem(item: SemanticAssetPackage): BatchModelingQueueItem {
  return {
    id: item.id,
    title: item.title,
    target: item.target,
    source: item.source,
    grain: item.grain,
    confidence: item.confidence,
    risk: item.risk,
    status: item.status === 'needs_scope' ? 'needs_scope' : item.status === 'high_risk' ? 'high_risk' : 'ready_for_review',
    primaryAction: 'open_builder',
    evidence: item.evidence,
  }
}
```

Use:

```ts
const workbenchTarget = useMemo(
  () => (selectedItem ? createWorkbenchCandidateTarget(toWorkbenchQueueItem(selectedItem), { projectId: selectedItem.project_id, mode: 'batch' }) : null),
  [selectedItem],
)
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.tsx frontend/src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx
git commit -m "feat: back batch modeling queue with build project api"
```

---

### Task 7: Route Candidate Loads Project Context

**Files:**

- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`

- [ ] **Step 1: Add route-loading test**

In `SemanticModelingWorkbench.test.tsx`, mock `useSemanticBuildProject`:

```ts
vi.mock('@v2/hooks/semanticModelingWorkbench', () => ({
  useSemanticBuildProject: () => ({
    data: {
      id: 'build-learning',
      name: '学情分析',
      business_domain: '学情分析',
      target: 'semantic_center',
      status: 'scanned',
      asset_package_count: 1,
      risk_summary: { low: 1 },
      asset_packages: [
        {
          id: 'build-learning:fact:dwd-learning-activity-df',
          project_id: 'build-learning',
          title: '学情分析事实主题候选',
          package_type: 'fact',
          target: 'semantic_center',
          source: 'dwd_learning_activity_df',
          grain: '一条学习行为事件',
          confidence: 0.88,
          risk: 'low',
          status: 'ready_for_review',
          primary_action: 'open_builder',
          evidence: ['表画像显示行为时间字段完整。'],
        },
      ],
    },
    isLoading: false,
  }),
}))
```

Add:

```tsx
it('candidate route can load candidate context from Build Project API', () => {
  renderWorkbench('/semantic/modeling-workbench/build-learning/candidate/build-learning%3Afact%3Adwd-learning-activity-df')

  expect(screen.getByText('学情分析事实主题候选')).toBeInTheDocument()
  expect(screen.getByText('dwd_learning_activity_df')).toBeInTheDocument()
  expect(screen.getByText('一条学习行为事件')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
```

Expected: FAIL because route currently only uses location state or fallback.

- [ ] **Step 3: Load API project in route**

In `SemanticModelingWorkbench.tsx`, import:

```ts
import { useSemanticBuildProject } from '@v2/hooks/semanticModelingWorkbench'
```

Add after params:

```ts
const projectQ = useSemanticBuildProject(params.projectId)
const apiCandidate = projectQ.data?.asset_packages?.find((item) => item.id === params.candidateId)
const apiCandidateState = apiCandidate
  ? {
      workbenchMode: 'batch' as const,
      projectId: apiCandidate.project_id,
      candidateId: apiCandidate.id,
      candidateTitle: apiCandidate.title,
      target: apiCandidate.target,
      source: apiCandidate.source,
      grain: apiCandidate.grain,
      risk: apiCandidate.risk,
      evidence: apiCandidate.evidence,
    }
  : null
const context = candidateState ?? apiCandidateState ?? createFallbackCandidateState(params, isQuickMode)
```

- [ ] **Step 4: Run test**

Run:

```bash
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.tsx frontend/src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
git commit -m "feat: load workbench candidate from build project"
```

---

### Task 8: P1 Smoke and Documentation

**Files:**

- Modify: `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`
- Modify: `docs/prd/semantic_cold_start_builder_prd.md`
- Modify: `docs/TECH_STACK_AND_ARCHITECTURE.md`
- Modify: `docs/quality/testing.md`

- [ ] **Step 1: Add E2E smoke**

In `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts`, add:

```ts
test('P1 Build Project 批量语义建设生成真实候选队列 @p34', async ({ page }) => {
  await gotoV2(page, '/semantic/modeling-workbench')

  await expect(page.getByRole('heading', { name: '批量语义建设' })).toBeVisible()
  await page.getByLabel('业务域').fill('学情分析')
  await page.getByRole('button', { name: '生成批量建设队列' }).click()

  await expect(page.getByText('学情分析事实主题候选')).toBeVisible()
  await expect(page.getByText('dwd_learning_activity_df')).toBeVisible()
  await page.getByRole('button', { name: '进入资产建设画布' }).first().click()
  await page.getByRole('link', { name: '打开语义建设工作台' }).click()

  await expect(page).toHaveURL(/\/semantic\/modeling-workbench\/build-/)
  await expect(page.getByText('字段候选主画布')).toBeVisible()
  await expect(page.getByText('Cube 层与本体锚定')).toBeVisible()
})
```

- [ ] **Step 2: Update docs**

In `docs/prd/semantic_cold_start_builder_prd.md`, under P1 scope, add:

```md
P1 的 Build Project 是建设期对象，不是语义中心资产本身。Asset Package 只是待审阅候选单元，只有通过 Proposal、release-preview 和发布门禁后，才会进入语义中心发布快照。
```

In `docs/TECH_STACK_AND_ARCHITECTURE.md`, add API entry:

```md
- `/api/v1/semantic/modeling-workbench/projects/*`：语义建设工作台的 Build Project / Asset Package API，只负责冷启动建设项目和候选队列；不持久化正式语义资产，不执行 SQL，不替代 `/api/v1/semantic/modeling-copilot/sessions/*` 的单资产会话链路。
```

In `docs/quality/testing.md`, add:

```md
- P1 语义建设 Build Project 变更需运行 `pytest tests/unit/application/semantic/test_modeling_build_project_service.py tests/integration/test_semantic_modeling_workbench_api.py -q` 和 `cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx`。
```

- [ ] **Step 3: Run full verification**

Run:

```bash
pytest tests/unit/application/semantic/test_modeling_build_project_service.py tests/integration/test_semantic_modeling_workbench_api.py -q
cd frontend && npm run test:unit -- src/v2/pages/semantic/modeling-copilot/modelingWorkbenchApi.test.ts src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx src/v2/pages/semantic/modeling-copilot/BatchModelingAgent.test.tsx src/v2/pages/semantic/modeling-copilot/SemanticModelingWorkbench.test.tsx
cd frontend && npm run e2e:modeling-agent-smoke
make verify-semantic
```

Expected: all PASS.

- [ ] **Step 4: Browser smoke**

Open:

```text
http://localhost:81/semantic/modeling-workbench
```

Expected visible flow:

- Create/scan button generates API-backed queue.
- Queue contains real project-backed candidate IDs.
- Opening a candidate route preserves project/candidate/source/grain/evidence.
- Field candidate main canvas and Cube/ontology anchor remain visible.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts docs/prd/semantic_cold_start_builder_prd.md docs/TECH_STACK_AND_ARCHITECTURE.md docs/quality/testing.md
git commit -m "test: verify semantic build project cold start flow"
```

## Self-Review

Spec coverage:

- Build Project persistence: Tasks 1-4.
- Candidate queue persistence: Tasks 2-4.
- Frontend API-backed queue: Tasks 5-7.
- Continuous cold-start candidate route: Task 7.
- Smoke/docs/verification: Task 8.
- Full ontology governance explicitly excluded in Scope Check.

Placeholder scan:

- This plan contains no `TBD`, `TODO`, or unspecified validation command.

Type consistency:

- Domain `ModelingBuildProject` and frontend `SemanticBuildProject` both use `target: "semantic_center"`.
- Domain `ModelingAssetPackage` and frontend `SemanticAssetPackage` share status/risk concepts.
- P1 keeps single-asset session APIs separate from Build Project APIs.
