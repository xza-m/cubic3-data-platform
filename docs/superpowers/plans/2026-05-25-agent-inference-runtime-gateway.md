# Agent Inference Runtime Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将语义建模 Copilot 私有的 LLM / Codex runtime 调度迁移为平台内 `AgentInferenceRuntimeService`，形成可被语义建模、数据资产、查询解释和治理中心复用的 platform-local Agent Runtime Gateway。

**Architecture:** 当前不新建独立 gateway 项目，也不让 `cubic3-agent-gateway` 成为数据平台主链依赖。后端新增 `domain/application/infrastructure` 三层的 `agent_inference_runtime` 模块，统一 `request / run / result / policy / artifact / trace` contract；OpenAI-compatible LLM 和 Codex app-server 作为两个 adapter 接入。语义建模 Copilot 通过 `SemanticModelingAgentApp` 消费平台 runtime，业务状态、Proposal、Cube / Ontology 发布仍由语义业务服务控制。

**Tech Stack:** Flask、dependency-injector、SQLAlchemy/Alembic、Pydantic/domain dataclass、pytest、RQ/本地异步约定、现有 Makefile 验证入口。

---

## 0. 范围检查

本计划覆盖 `docs/architecture/agent-runtime-platform.md` 的 MVP 到 Codex Phase 4 骨架落地：

- 平台级 `AgentInferenceRuntimeService / Router / Port`。
- OpenAI-compatible LLM adapter 使用 `AGENT_OPENAI_*` 配置。
- 语义建模 Copilot 迁移为第一个 consumer。
- Codex app-server runtime 的 workspace、transport client、event、artifact、command policy 骨架和 fake/live smoke。
- 最小 run trace、artifact 元数据、API 查询面和测试入口。

不在本计划内：

- 不建设独立 `cubic3-agent-gateway` 服务。
- 不建设 marketplace、跨产品租户配额中心或复杂 runtime 编排平台。
- 不让 runtime adapter 直接发布 Cube、修改 Ontology、写数据资产事实或执行生产查询。
- 不把 Codex 作为低延迟主对话默认链路。
- 不保留 `SemanticModelingRuntimeShim` 或旧 `LLM_API_*` 双读逻辑。

推荐并行方式：

- Subagent A：Task 1、Task 2，先完成平台 contract、router、trace 存储。
- Subagent B：Task 3，基于 Task 1 的 port 落 OpenAI-compatible adapter。
- Subagent C：Task 4、Task 5，基于 Task 1/3 迁移语义建模 Copilot。
- Subagent D：Task 6、Task 7，基于 Task 1/2 落 Codex workspace / client / adapter。
- Subagent E：Task 8，收口 API、Makefile、文档和 E2E；依赖前面任务接口稳定。

## 1. 目标文件结构

新增：

```text
app/domain/agent_inference_runtime/__init__.py
app/domain/agent_inference_runtime/types.py
app/domain/agent_inference_runtime/ports.py
app/application/agent_inference_runtime/__init__.py
app/application/agent_inference_runtime/router.py
app/application/agent_inference_runtime/service.py
app/application/agent_inference_runtime/errors.py
app/infrastructure/agent_inference_runtime/__init__.py
app/infrastructure/agent_inference_runtime/models.py
app/infrastructure/agent_inference_runtime/sql_repository.py
app/infrastructure/agent_inference_runtime/openai_compatible_adapter.py
app/infrastructure/agent_inference_runtime/codex_client.py
app/infrastructure/agent_inference_runtime/codex_workspace.py
app/infrastructure/agent_inference_runtime/codex_adapter.py
app/infrastructure/agent_inference_runtime/command_policy.py
app/interfaces/api/v1/agent_runtime.py
migrations/versions/0003_agent_inference_runtime_tables.py
tests/unit/application/agent_inference_runtime/test_contract_and_router.py
tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py
tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py
tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py
tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py
tests/integration/test_agent_runtime_api.py
tests/integration/agent_inference_runtime/test_codex_live_smoke.py
```

新增语义建模应用层：

```text
app/application/semantic/semantic_modeling_agent_app.py
app/application/semantic/semantic_evidence_builder.py
tests/unit/application/semantic/test_semantic_modeling_agent_app.py
```

修改：

```text
app/__init__.py
app/di/container.py
app/application/semantic/modeling_copilot_service.py
app/application/semantic/modeling_copilot_runtime.py
app/interfaces/api/v1/semantic_modeling_copilot.py
tests/conftest.py
tests/unit/application/semantic/test_modeling_copilot_service.py
tests/integration/test_semantic_modeling_copilot_api.py
Makefile
docs/architecture/agent-runtime-platform.md
docs/architecture/README.md
docs/quality/testing.md
docs/runbooks/local-dev.md
```

文件职责锁定：

- `domain/agent_inference_runtime/types.py`：只放平台 runtime contract，不依赖 Flask、SQLAlchemy、OpenAI SDK 或 Codex SDK。
- `application/agent_inference_runtime/service.py`：负责创建 run、调用 router、写 trace，不理解语义建模业务。
- `application/agent_inference_runtime/router.py`：按 action、execution_mode、policy 选择 adapter。
- `infrastructure/agent_inference_runtime/*adapter.py`：只接外部 runtime，不写业务表。
- `application/semantic/semantic_modeling_agent_app.py`：把 `semantic.modeling.*` action 与 `AgentInferenceRuntimeResult.structured_output` 转成语义建模工作台 patch。
- `SemanticModelingCopilotService`：继续负责 session 状态、用户动作、Proposal 保存和发布；不再直接依赖具体 LLM adapter。

## 2. 执行依赖图

```text
Task 1 Contract + fake runtime
  -> Task 2 SQL trace/artifact repository
  -> Task 3 OpenAI-compatible adapter
  -> Task 4 SemanticModelingAgentApp
  -> Task 5 Copilot migration
  -> Task 8 API/docs/verify

Task 1 + Task 2
  -> Task 6 Codex workspace/client/policy
  -> Task 7 Codex adapter
  -> Task 8 API/docs/verify
```

## 3. 任务拆分

### Task 1: 平台 Agent Inference Runtime contract、router 与 fake adapter

**Files:**
- Create: `app/domain/agent_inference_runtime/__init__.py`
- Create: `app/domain/agent_inference_runtime/types.py`
- Create: `app/domain/agent_inference_runtime/ports.py`
- Create: `app/application/agent_inference_runtime/__init__.py`
- Create: `app/application/agent_inference_runtime/errors.py`
- Create: `app/application/agent_inference_runtime/router.py`
- Create: `app/application/agent_inference_runtime/service.py`
- Test: `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`:

```python
from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeContextRef,
    RuntimePolicy,
    RuntimeSelection,
)


class _FakeAdapter(AgentInferenceRuntimePort):
    runtime_name = "fake"

    def __init__(self):
        self.requests = []

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, "fake"}

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self.requests.append(request)
        return AgentInferenceRuntimeResult(
            run_id="run_fake_1",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output={
                "message": "已生成候选建议",
                "workbench_state_patch": {"agent_message": "已生成候选建议"},
                "proposal_patch": {"source_mode": "agent_led"},
            },
            artifacts=[],
            usage={"total_tokens": 0},
            trace=[{"event_type": "run.succeeded", "seq": 1}],
            error=None,
        )


def _request(action: str = "semantic.modeling.chat") -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action=action,
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"message": "查询学生评论数"},
        context_pack={"session": {"id": "session_1"}},
        output_schema="semantic.modeling.chat.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime=None,
        execution_mode="sync",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_service_routes_request_to_fake_runtime_and_returns_trace():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    service = AgentInferenceRuntimeService(router=router)

    result = service.invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "fake"
    assert result.structured_output["message"] == "已生成候选建议"
    assert adapter.requests[0].runtime_context_ref.session_id == "session_1"


def test_router_rejects_unknown_runtime_without_silent_fallback():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    request = replace(_request(), preferred_runtime="codex")

    with pytest.raises(ValueError, match="no runtime adapter"):
        router.select(request)


def test_router_defaults_review_action_to_codex_when_adapter_exists():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_app_server"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[openai, codex])

    selected = router.select(_request("semantic.modeling.review_proposal"))

    assert selected.runtime_name == "codex_app_server"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.application.agent_inference_runtime'
```

- [ ] **Step 3: 新增 domain contract**

Create `app/domain/agent_inference_runtime/types.py`:

```python
"""平台级 Agent 推理 Runtime 契约。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Mapping, Optional

RuntimeName = Literal["openai_agents_sdk", "openai_compatible", "codex_app_server", "fake"]
ExecutionMode = Literal["sync", "async"]
RunStatus = Literal["queued", "running", "succeeded", "failed", "cancelled", "timeout"]


@dataclass(frozen=True)
class RuntimeContextRef:
    project_id: str
    session_id: str
    thread_id: str
    turn_id: str


@dataclass(frozen=True)
class SemanticRuntimePin:
    snapshot_id: str
    release_id: str
    namespace: str = "default"


@dataclass(frozen=True)
class AssetRevisionRef:
    asset_id: str
    revision_id: str
    asset_type: str
    asset_key: str


@dataclass(frozen=True)
class RuntimePolicy:
    max_runtime_seconds: int = 60
    max_output_bytes: int = 262144
    allow_network: bool = False
    allowed_tools: List[str] = field(default_factory=list)
    command_policy: Dict[str, Any] = field(default_factory=dict)
    fallback_runtime: Optional[RuntimeName] = None


@dataclass(frozen=True)
class AgentInferenceRuntimeRequest:
    app_id: str
    action: str
    runtime_context_ref: RuntimeContextRef
    principal_id: Optional[str]
    input: Mapping[str, Any]
    context_pack: Mapping[str, Any]
    output_schema: str
    runtime_policy: RuntimePolicy
    preferred_runtime: Optional[RuntimeName]
    execution_mode: ExecutionMode
    semantic_runtime_pin: Optional[SemanticRuntimePin]
    asset_revision_refs: List[AssetRevisionRef]


@dataclass(frozen=True)
class AgentInferenceRuntimeArtifact:
    artifact_id: str
    run_id: str
    artifact_type: str
    title: str
    summary: str
    mime_type: str
    size_bytes: int
    sha256: str


@dataclass(frozen=True)
class AgentInferenceRuntimeResult:
    run_id: str
    status: RunStatus
    runtime_name: str
    action: str
    structured_output: Dict[str, Any]
    artifacts: List[AgentInferenceRuntimeArtifact]
    usage: Dict[str, Any]
    trace: List[Dict[str, Any]]
    error: Optional[Dict[str, Any]]


@dataclass(frozen=True)
class AgentInferenceRuntimeRun:
    run_id: str
    app_id: str
    action: str
    runtime_name: str
    status: RunStatus
    runtime_context_ref: RuntimeContextRef
    principal_id: Optional[str]
    provider_ref: Optional[Mapping[str, str]]
    usage: Dict[str, Any] = field(default_factory=dict)
    error: Optional[Dict[str, Any]] = None


@dataclass(frozen=True)
class RuntimeSelection:
    runtime_name: RuntimeName
    reason: str
```

Create `app/domain/agent_inference_runtime/ports.py`:

```python
"""Agent 推理 Runtime 端口。"""
from __future__ import annotations

from typing import Protocol

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class AgentInferenceRuntimePort(Protocol):
    runtime_name: str

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        ...

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        ...
```

Create `app/domain/agent_inference_runtime/__init__.py`:

```python
"""平台级 Agent 推理 Runtime domain contract。"""

from .ports import AgentInferenceRuntimePort
from .types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    AgentInferenceRuntimeRun,
    AssetRevisionRef,
    RuntimeContextRef,
    RuntimePolicy,
    RuntimeSelection,
    SemanticRuntimePin,
)

__all__ = [
    "AgentInferenceRuntimeArtifact",
    "AgentInferenceRuntimePort",
    "AgentInferenceRuntimeRequest",
    "AgentInferenceRuntimeResult",
    "AgentInferenceRuntimeRun",
    "AssetRevisionRef",
    "RuntimeContextRef",
    "RuntimePolicy",
    "RuntimeSelection",
    "SemanticRuntimePin",
]
```

- [ ] **Step 4: 新增 router 与 service**

Create `app/application/agent_inference_runtime/router.py`:

```python
"""Agent 推理 Runtime 路由。"""
from __future__ import annotations

from typing import Iterable, List

from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest


class AgentInferenceRuntimeRouter:
    def __init__(self, *, adapters: Iterable[AgentInferenceRuntimePort]):
        self._adapters: List[AgentInferenceRuntimePort] = list(adapters)

    def select(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimePort:
        desired = request.preferred_runtime or self._default_runtime(request.action)
        for adapter in self._adapters:
            if adapter.runtime_name == desired and adapter.can_handle(request):
                return adapter
        raise ValueError(f"no runtime adapter for action={request.action} runtime={desired}")

    @staticmethod
    def _default_runtime(action: str) -> str:
        if any(token in action for token in ("review", "repair", "audit")):
            return "codex_app_server"
        return "openai_compatible"
```

Create `app/application/agent_inference_runtime/service.py`:

```python
"""平台级 Agent 推理 Runtime 服务。"""
from __future__ import annotations

from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class AgentInferenceRuntimeService:
    def __init__(self, *, router: AgentInferenceRuntimeRouter):
        self._router = router

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        adapter = self._router.select(request)
        return adapter.invoke(request)
```

Create `app/application/agent_inference_runtime/errors.py`:

```python
"""Agent 推理 Runtime 错误。"""


class AgentInferenceRuntimeError(RuntimeError):
    def __init__(self, message: str, *, code: str, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}
```

Create `app/application/agent_inference_runtime/__init__.py`:

```python
"""平台级 Agent 推理 Runtime 应用层。"""
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py \
  -q
```

Expected:

```text
3 passed
```

- [ ] **Step 6: 提交**

```bash
git add \
  app/domain/agent_inference_runtime \
  app/application/agent_inference_runtime \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py
git commit -m "feat: add agent inference runtime contract"
```

### Task 2: SQL run trace 与 artifact 元数据持久化

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/__init__.py`
- Create: `app/infrastructure/agent_inference_runtime/models.py`
- Create: `app/infrastructure/agent_inference_runtime/sql_repository.py`
- Create: `migrations/versions/0003_agent_inference_runtime_tables.py`
- Modify: `app/__init__.py`
- Modify: `tests/conftest.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py`:

```python
from __future__ import annotations

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.sql_repository import (
    SqlAgentInferenceRuntimeRepository,
)


def test_sql_runtime_repository_round_trips_run_and_artifact(db_session):
    repo = SqlAgentInferenceRuntimeRepository(db_session)
    ref = RuntimeContextRef(
        project_id="cubic3-data-platform",
        session_id="session_1",
        thread_id="thread_1",
        turn_id="turn_1",
    )
    run = AgentInferenceRuntimeRun(
        run_id="run_1",
        app_id="semantic_modeling",
        action="semantic.modeling.chat",
        runtime_name="openai_compatible",
        status="succeeded",
        runtime_context_ref=ref,
        principal_id="alice",
        provider_ref={"provider_run_id": "provider_1"},
        usage={"total_tokens": 12},
    )
    artifact = AgentInferenceRuntimeArtifact(
        artifact_id="artifact_1",
        run_id="run_1",
        artifact_type="json",
        title="结构化输出",
        summary="候选语义结果",
        mime_type="application/json",
        size_bytes=42,
        sha256="abc123",
    )

    repo.save_run(run)
    repo.save_artifact(artifact, context_ref=ref, app_id="semantic_modeling", principal_id="alice")

    loaded = repo.get_run("run_1")
    assert loaded is not None
    assert loaded.status == "succeeded"
    assert loaded.runtime_context_ref.turn_id == "turn_1"
    assert loaded.provider_ref == {"provider_run_id": "provider_1"}

    artifacts = repo.list_artifacts(run_id="run_1", principal_id="alice")
    assert [item.artifact_id for item in artifacts] == ["artifact_1"]
    assert repo.list_artifacts(run_id="run_1", principal_id="bob") == []
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.infrastructure.agent_inference_runtime'
```

- [ ] **Step 3: 新增 ORM 与 repository**

Create `app/infrastructure/agent_inference_runtime/models.py`:

```python
from __future__ import annotations

from sqlalchemy import Column, DateTime, Index, String

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.utils.time import utcnow


class AgentInferenceRuntimeRunORM(db.Model):
    """Agent 推理 Runtime run 摘要表。"""

    __tablename__ = "agent_inference_runtime_runs"
    __table_args__ = (
        Index("idx_agent_runtime_runs_context", "project_id", "session_id", "thread_id", "turn_id"),
        Index("idx_agent_runtime_runs_app_status", "app_id", "status"),
        Index("idx_agent_runtime_runs_principal_created", "principal_id", "created_at"),
        {"extend_existing": True},
    )

    run_id = Column(String(128), primary_key=True)
    app_id = Column(String(128), nullable=False)
    action = Column(String(128), nullable=False)
    runtime_name = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False)
    project_id = Column(String(128), nullable=False)
    session_id = Column(String(128), nullable=False)
    thread_id = Column(String(128), nullable=False)
    turn_id = Column(String(128), nullable=False)
    principal_id = Column(String(128), nullable=True)
    provider_ref_json = Column(JsonType, nullable=False, default=dict)
    usage_json = Column(JsonType, nullable=False, default=dict)
    error_json = Column(JsonType, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class AgentInferenceRuntimeArtifactORM(db.Model):
    """Agent 推理 Runtime artifact 元数据表。"""

    __tablename__ = "agent_inference_runtime_artifacts"
    __table_args__ = (
        Index("idx_agent_runtime_artifacts_run", "run_id"),
        Index("idx_agent_runtime_artifacts_owner", "project_id", "session_id", "thread_id", "turn_id"),
        {"extend_existing": True},
    )

    artifact_id = Column(String(128), primary_key=True)
    run_id = Column(String(128), nullable=False)
    app_id = Column(String(128), nullable=False)
    principal_id = Column(String(128), nullable=True)
    project_id = Column(String(128), nullable=False)
    session_id = Column(String(128), nullable=False)
    thread_id = Column(String(128), nullable=False)
    turn_id = Column(String(128), nullable=False)
    artifact_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    summary = Column(String(1024), nullable=False)
    mime_type = Column(String(128), nullable=False)
    size_bytes = Column(String(32), nullable=False)
    sha256 = Column(String(128), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
```

Create `app/infrastructure/agent_inference_runtime/sql_repository.py`:

```python
from __future__ import annotations

from typing import List, Optional

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeArtifact,
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.models import (
    AgentInferenceRuntimeArtifactORM,
    AgentInferenceRuntimeRunORM,
)


class SqlAgentInferenceRuntimeRepository:
    def __init__(self, session):
        self.session = session

    def save_run(self, run: AgentInferenceRuntimeRun) -> None:
        ref = run.runtime_context_ref
        row = self.session.get(AgentInferenceRuntimeRunORM, run.run_id)
        if row is None:
            row = AgentInferenceRuntimeRunORM(run_id=run.run_id)
            self.session.add(row)
        row.app_id = run.app_id
        row.action = run.action
        row.runtime_name = run.runtime_name
        row.status = run.status
        row.project_id = ref.project_id
        row.session_id = ref.session_id
        row.thread_id = ref.thread_id
        row.turn_id = ref.turn_id
        row.principal_id = run.principal_id
        row.provider_ref_json = dict(run.provider_ref or {})
        row.usage_json = dict(run.usage or {})
        row.error_json = dict(run.error or {}) if run.error else None
        self.session.commit()

    def get_run(self, run_id: str) -> Optional[AgentInferenceRuntimeRun]:
        row = self.session.get(AgentInferenceRuntimeRunORM, run_id)
        if row is None:
            return None
        return AgentInferenceRuntimeRun(
            run_id=row.run_id,
            app_id=row.app_id,
            action=row.action,
            runtime_name=row.runtime_name,
            status=row.status,
            runtime_context_ref=RuntimeContextRef(
                project_id=row.project_id,
                session_id=row.session_id,
                thread_id=row.thread_id,
                turn_id=row.turn_id,
            ),
            principal_id=row.principal_id,
            provider_ref=dict(row.provider_ref_json or {}),
            usage=dict(row.usage_json or {}),
            error=dict(row.error_json or {}) if row.error_json else None,
        )

    def save_artifact(
        self,
        artifact: AgentInferenceRuntimeArtifact,
        *,
        context_ref: RuntimeContextRef,
        app_id: str,
        principal_id: str | None,
    ) -> None:
        row = self.session.get(AgentInferenceRuntimeArtifactORM, artifact.artifact_id)
        if row is None:
            row = AgentInferenceRuntimeArtifactORM(artifact_id=artifact.artifact_id)
            self.session.add(row)
        row.run_id = artifact.run_id
        row.app_id = app_id
        row.principal_id = principal_id
        row.project_id = context_ref.project_id
        row.session_id = context_ref.session_id
        row.thread_id = context_ref.thread_id
        row.turn_id = context_ref.turn_id
        row.artifact_type = artifact.artifact_type
        row.title = artifact.title
        row.summary = artifact.summary
        row.mime_type = artifact.mime_type
        row.size_bytes = str(artifact.size_bytes)
        row.sha256 = artifact.sha256
        self.session.commit()

    def list_artifacts(self, *, run_id: str, principal_id: str | None) -> List[AgentInferenceRuntimeArtifact]:
        query = self.session.query(AgentInferenceRuntimeArtifactORM).filter_by(run_id=run_id)
        if principal_id is not None:
            query = query.filter_by(principal_id=principal_id)
        rows = query.order_by(AgentInferenceRuntimeArtifactORM.created_at.asc()).all()
        return [
            AgentInferenceRuntimeArtifact(
                artifact_id=row.artifact_id,
                run_id=row.run_id,
                artifact_type=row.artifact_type,
                title=row.title,
                summary=row.summary,
                mime_type=row.mime_type,
                size_bytes=int(row.size_bytes),
                sha256=row.sha256,
            )
            for row in rows
        ]
```

Create `app/infrastructure/agent_inference_runtime/__init__.py`:

```python
"""Agent 推理 Runtime 基础设施。"""
```

- [ ] **Step 4: 新增 Alembic migration**

Create `migrations/versions/0003_agent_inference_runtime_tables.py`:

```python
"""add agent inference runtime tables

Revision ID: 0003_agent_inference_runtime_tables
Revises: 0002_data_asset_tables
Create Date: 2026-05-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.shared import db_types


revision = "0003_agent_inference_runtime_tables"
down_revision = "0002_data_asset_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "agent_inference_runtime_runs" not in existing:
        op.create_table(
            "agent_inference_runtime_runs",
            sa.Column("run_id", sa.String(length=128), nullable=False),
            sa.Column("app_id", sa.String(length=128), nullable=False),
            sa.Column("action", sa.String(length=128), nullable=False),
            sa.Column("runtime_name", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("project_id", sa.String(length=128), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("thread_id", sa.String(length=128), nullable=False),
            sa.Column("turn_id", sa.String(length=128), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=True),
            sa.Column("provider_ref_json", db_types.JsonType(), nullable=False),
            sa.Column("usage_json", db_types.JsonType(), nullable=False),
            sa.Column("error_json", db_types.JsonType(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("run_id"),
        )
        op.create_index("idx_agent_runtime_runs_context", "agent_inference_runtime_runs", ["project_id", "session_id", "thread_id", "turn_id"])
        op.create_index("idx_agent_runtime_runs_app_status", "agent_inference_runtime_runs", ["app_id", "status"])
        op.create_index("idx_agent_runtime_runs_principal_created", "agent_inference_runtime_runs", ["principal_id", "created_at"])

    if "agent_inference_runtime_artifacts" not in existing:
        op.create_table(
            "agent_inference_runtime_artifacts",
            sa.Column("artifact_id", sa.String(length=128), nullable=False),
            sa.Column("run_id", sa.String(length=128), nullable=False),
            sa.Column("app_id", sa.String(length=128), nullable=False),
            sa.Column("principal_id", sa.String(length=128), nullable=True),
            sa.Column("project_id", sa.String(length=128), nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("thread_id", sa.String(length=128), nullable=False),
            sa.Column("turn_id", sa.String(length=128), nullable=False),
            sa.Column("artifact_type", sa.String(length=64), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("summary", sa.String(length=1024), nullable=False),
            sa.Column("mime_type", sa.String(length=128), nullable=False),
            sa.Column("size_bytes", sa.String(length=32), nullable=False),
            sa.Column("sha256", sa.String(length=128), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("artifact_id"),
        )
        op.create_index("idx_agent_runtime_artifacts_run", "agent_inference_runtime_artifacts", ["run_id"])
        op.create_index("idx_agent_runtime_artifacts_owner", "agent_inference_runtime_artifacts", ["project_id", "session_id", "thread_id", "turn_id"])


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "agent_inference_runtime_artifacts" in existing:
        op.drop_index("idx_agent_runtime_artifacts_owner", table_name="agent_inference_runtime_artifacts")
        op.drop_index("idx_agent_runtime_artifacts_run", table_name="agent_inference_runtime_artifacts")
        op.drop_table("agent_inference_runtime_artifacts")
    if "agent_inference_runtime_runs" in existing:
        op.drop_index("idx_agent_runtime_runs_principal_created", table_name="agent_inference_runtime_runs")
        op.drop_index("idx_agent_runtime_runs_app_status", table_name="agent_inference_runtime_runs")
        op.drop_index("idx_agent_runtime_runs_context", table_name="agent_inference_runtime_runs")
        op.drop_table("agent_inference_runtime_runs")
```

- [ ] **Step 5: 注册模型导入**

Modify `app/__init__.py`，在现有 semantic model import 后添加：

```python
    from .infrastructure.agent_inference_runtime.models import (  # noqa
        AgentInferenceRuntimeArtifactORM,
        AgentInferenceRuntimeRunORM,
    )
```

Modify `tests/conftest.py`，在 `_register_all_models` 内添加：

```python
    from app.infrastructure.agent_inference_runtime.models import (  # noqa
        AgentInferenceRuntimeArtifactORM,
        AgentInferenceRuntimeRunORM,
    )
```

- [ ] **Step 6: 运行 repository 和 migration 检查**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py \
  -q
make verify-alembic
```

Expected:

```text
1 passed
```

`make verify-alembic` should finish without multiple-head or missing-revision errors.

- [ ] **Step 7: 提交**

```bash
git add \
  app/__init__.py \
  tests/conftest.py \
  app/infrastructure/agent_inference_runtime \
  migrations/versions/0003_agent_inference_runtime_tables.py \
  tests/unit/infrastructure/agent_inference_runtime/test_sql_repository.py
git commit -m "feat: persist agent inference runtime traces"
```

### Task 3: OpenAI-compatible adapter 与 `AGENT_OPENAI_*` 配置收敛

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/openai_compatible_adapter.py`
- Modify: `app/di/container.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py`:

```python
from __future__ import annotations

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.openai_compatible_adapter import (
    OpenAICompatibleRuntimeAdapter,
)


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.chat",
        runtime_context_ref=RuntimeContextRef("cubic3-data-platform", "s1", "t1", "turn1"),
        principal_id="alice",
        input={"message": "查询学生评论数"},
        context_pack={"evidence": []},
        output_schema="semantic.modeling.chat.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime="openai_compatible",
        execution_mode="sync",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_openai_adapter_uses_agent_openai_config_not_legacy_llm_env(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "legacy-key")
    monkeypatch.delenv("AGENT_OPENAI_API_KEY", raising=False)

    adapter = OpenAICompatibleRuntimeAdapter()

    assert adapter.runtime_name == "openai_compatible"
    assert adapter.is_configured is False
    with pytest.raises(AgentInferenceRuntimeError) as exc:
        adapter.invoke(_request())
    assert exc.value.code == "RUNTIME_NOT_CONFIGURED"


def test_openai_adapter_parses_json_response(monkeypatch):
    monkeypatch.setenv("AGENT_OPENAI_API_KEY", "agent-key")
    monkeypatch.setenv("AGENT_OPENAI_MODEL", "stub-model")

    class _Completion:
        choices = [type("Choice", (), {"message": type("Msg", (), {"content": '{"message":"ok"}'})()})]
        usage = type("Usage", (), {"model_dump": lambda self: {"total_tokens": 7}})()

    class _Client:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.chat = type("Chat", (), {"completions": type("Completions", (), {"create": lambda *_args, **_kwargs: _Completion()})()})()

    monkeypatch.setattr("app.infrastructure.agent_inference_runtime.openai_compatible_adapter.OpenAI", _Client)

    result = OpenAICompatibleRuntimeAdapter().invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "openai_compatible"
    assert result.structured_output == {"message": "ok"}
    assert result.usage == {"total_tokens": 7}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.infrastructure.agent_inference_runtime.openai_compatible_adapter'
```

- [ ] **Step 3: 实现 OpenAI-compatible adapter**

Create `app/infrastructure/agent_inference_runtime/openai_compatible_adapter.py`:

```python
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional
from uuid import uuid4

from openai import OpenAI

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class OpenAICompatibleRuntimeAdapter:
    runtime_name = "openai_compatible"

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float | None = None,
    ):
        self._api_key = api_key if api_key is not None else os.getenv("AGENT_OPENAI_API_KEY")
        self._api_base = api_base if api_base is not None else os.getenv("AGENT_OPENAI_BASE_URL")
        self._model = model or os.getenv("AGENT_OPENAI_MODEL") or "gpt-4o-mini"
        self._timeout = timeout or float(os.getenv("AGENT_OPENAI_TIMEOUT_SECONDS", "60"))

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, "openai_compatible"} and request.execution_mode == "sync"

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        if not self._api_key:
            raise AgentInferenceRuntimeError(
                "未配置 AGENT_OPENAI_API_KEY，无法运行 OpenAI-compatible runtime。",
                code="RUNTIME_NOT_CONFIGURED",
                details={"runtime_name": self.runtime_name},
            )
        client_kwargs: Dict[str, Any] = {"api_key": self._api_key, "timeout": self._timeout}
        if self._api_base:
            client_kwargs["base_url"] = self._api_base
        client = OpenAI(**client_kwargs)
        completion = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": "你是 Cubic3 平台的结构化推理 runtime，只输出 JSON。"},
                {"role": "user", "content": json.dumps({
                    "action": request.action,
                    "input": request.input,
                    "context_pack": request.context_pack,
                    "output_schema": request.output_schema,
                }, ensure_ascii=False, default=str)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        text = completion.choices[0].message.content or "{}"
        try:
            structured_output = json.loads(text)
        except json.JSONDecodeError as exc:
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime 返回了非 JSON 输出。",
                code="RUNTIME_INVALID_OUTPUT",
                details={"runtime_name": self.runtime_name},
            ) from exc
        usage = completion.usage.model_dump() if getattr(completion, "usage", None) else {}
        return AgentInferenceRuntimeResult(
            run_id=f"run_{uuid4().hex}",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output=structured_output,
            artifacts=[],
            usage=usage,
            trace=[{"event_type": "run.succeeded", "seq": 1, "runtime_name": self.runtime_name}],
            error=None,
        )
```

- [ ] **Step 4: 修改 DI 配置为 `AGENT_OPENAI_*`**

Modify `app/di/container.py` imports:

```python
from app.infrastructure.agent_inference_runtime.openai_compatible_adapter import (
    OpenAICompatibleRuntimeAdapter,
)
```

Modify `init_container` config dict:

```python
        'agent_openai': {
            'api_key': app.config.get('AGENT_OPENAI_API_KEY', ''),
            'api_base': app.config.get('AGENT_OPENAI_BASE_URL', 'https://api.openai.com/v1'),
            'model': app.config.get('AGENT_OPENAI_MODEL', 'gpt-4o-mini'),
            'timeout': app.config.get('AGENT_OPENAI_TIMEOUT_SECONDS', 60),
        },
```

Add provider near semantic runtime providers:

```python
    agent_openai_runtime_adapter = providers.Singleton(
        OpenAICompatibleRuntimeAdapter,
        api_key=config.agent_openai.api_key,
        api_base=config.agent_openai.api_base,
        model=config.agent_openai.model,
        timeout=config.agent_openai.timeout,
    )
```

- [ ] **Step 5: 运行测试**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py \
  -q
```

Expected:

```text
2 passed
```

- [ ] **Step 6: 提交**

```bash
git add \
  app/di/container.py \
  app/infrastructure/agent_inference_runtime/openai_compatible_adapter.py \
  tests/unit/infrastructure/agent_inference_runtime/test_openai_compatible_adapter.py
git commit -m "feat: add openai compatible runtime adapter"
```

### Task 4: 语义建模 Agent App 与 Evidence Builder

**Files:**
- Create: `app/application/semantic/semantic_evidence_builder.py`
- Create: `app/application/semantic/semantic_modeling_agent_app.py`
- Test: `tests/unit/application/semantic/test_semantic_modeling_agent_app.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/application/semantic/test_semantic_modeling_agent_app.py`:

```python
from __future__ import annotations

from app.application.semantic.semantic_modeling_agent_app import SemanticModelingAgentApp
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeResult
from app.domain.semantic.modeling_agent_session import AgentSession


class _Runtime:
    def __init__(self):
        self.requests = []

    def invoke(self, request):
        self.requests.append(request)
        return AgentInferenceRuntimeResult(
            run_id="run_1",
            status="succeeded",
            runtime_name="openai_compatible",
            action=request.action,
            structured_output={
                "message": "已识别学生评论分析诉求",
                "workbench_state_patch": {
                    "agent_message": "已识别学生评论分析诉求",
                    "readiness": {"exploratory_ready": False, "reasons": ["need_source_table"]},
                },
                "proposal_patch": {"source_mode": "agent_led", "source_kind": "business_question"},
                "required_confirmations": [],
                "suggested_actions": ["provide_source_table"],
            },
            artifacts=[],
            usage={"total_tokens": 7},
            trace=[{"event_type": "run.succeeded", "seq": 1}],
            error=None,
        )


class _EvidenceBuilder:
    def build(self, *, session, user_message, request_payload):
        return {
            "session": {"id": session.id, "user_goal": session.user_goal},
            "request_payload": request_payload,
            "evidence": [],
        }


def test_semantic_modeling_agent_app_builds_runtime_request_and_output():
    session = AgentSession(
        id="session_1",
        user_goal="查询最近 7 天学生评论数",
        entry_type="business_question",
        principal_id="alice",
    )
    runtime = _Runtime()
    app = SemanticModelingAgentApp(runtime=runtime, evidence_builder=_EvidenceBuilder())

    output = app.run_chat(session=session, user_message="按学校汇总", request_payload={"source": "chat"})

    assert output.message == "已识别学生评论分析诉求"
    assert output.workbench_state_patch["agent_message"] == "已识别学生评论分析诉求"
    assert output.suggested_actions == ["provide_source_table"]
    request = runtime.requests[0]
    assert request.app_id == "semantic_modeling"
    assert request.action == "semantic.modeling.chat"
    assert request.runtime_context_ref.session_id == "session_1"
    assert request.runtime_context_ref.turn_id.startswith("turn_")
    assert request.output_schema == "semantic.modeling.chat.output.v1"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.application.semantic.semantic_modeling_agent_app'
```

- [ ] **Step 3: 新增 Evidence Builder**

Create `app/application/semantic/semantic_evidence_builder.py`:

```python
from __future__ import annotations

from typing import Any, Dict

from app.domain.semantic.modeling_agent_session import AgentSession


class SemanticEvidenceBuilder:
    """构建语义建模 runtime context pack。"""

    def build(
        self,
        *,
        session: AgentSession,
        user_message: str,
        request_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        return {
            "session": session.model_dump(mode="json"),
            "latest_user_message": user_message,
            "request_payload": dict(request_payload or {}),
            "workbench_state": dict(session.workbench_state or {}),
            "conversation_tail": list(session.conversation[-8:]),
        }
```

- [ ] **Step 4: 新增 SemanticModelingAgentApp**

Create `app/application/semantic/semantic_modeling_agent_app.py`:

```python
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List
from uuid import uuid4

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.domain.semantic.modeling_agent_session import AgentSession


@dataclass(frozen=True)
class SemanticModelingChatOutput:
    message: str
    workbench_state_patch: Dict[str, Any] = field(default_factory=dict)
    proposal_patch: Dict[str, Any] = field(default_factory=dict)
    required_confirmations: List[Dict[str, Any]] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    tool_traces: List[Dict[str, Any]] = field(default_factory=list)


class SemanticModelingAgentApp:
    def __init__(self, *, runtime: Any, evidence_builder: Any):
        self._runtime = runtime
        self._evidence_builder = evidence_builder

    def run_chat(
        self,
        *,
        session: AgentSession,
        user_message: str,
        request_payload: Dict[str, Any],
    ) -> SemanticModelingChatOutput:
        turn_id = f"turn_{uuid4().hex}"
        request = AgentInferenceRuntimeRequest(
            app_id="semantic_modeling",
            action="semantic.modeling.chat",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=session.id,
                thread_id=f"thread_{session.id}",
                turn_id=turn_id,
            ),
            principal_id=session.principal_id,
            input={"message": user_message, "user_goal": session.user_goal},
            context_pack=self._evidence_builder.build(
                session=session,
                user_message=user_message,
                request_payload=request_payload,
            ),
            output_schema="semantic.modeling.chat.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=60),
            preferred_runtime=None,
            execution_mode="sync",
            semantic_runtime_pin=None,
            asset_revision_refs=[],
        )
        result = self._runtime.invoke(request)
        payload = dict(result.structured_output or {})
        message = str(payload.get("message") or "").strip() or "已完成建模分析。"
        return SemanticModelingChatOutput(
            message=message,
            workbench_state_patch=dict(payload.get("workbench_state_patch") or {}),
            proposal_patch=dict(payload.get("proposal_patch") or {}),
            required_confirmations=list(payload.get("required_confirmations") or []),
            suggested_actions=list(payload.get("suggested_actions") or []),
            tool_traces=list(result.trace or []),
        )
```

- [ ] **Step 5: 运行测试**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
  -q
```

Expected:

```text
1 passed
```

- [ ] **Step 6: 提交**

```bash
git add \
  app/application/semantic/semantic_evidence_builder.py \
  app/application/semantic/semantic_modeling_agent_app.py \
  tests/unit/application/semantic/test_semantic_modeling_agent_app.py
git commit -m "feat: add semantic modeling agent app"
```

### Task 5: 迁移语义建模 Copilot 到平台 runtime

**Files:**
- Modify: `app/application/semantic/modeling_copilot_service.py`
- Modify: `app/application/semantic/modeling_copilot_runtime.py`
- Modify: `app/interfaces/api/v1/semantic_modeling_copilot.py`
- Modify: `app/di/container.py`
- Modify: `tests/unit/application/semantic/test_modeling_copilot_service.py`
- Modify: `tests/integration/test_semantic_modeling_copilot_api.py`

- [ ] **Step 1: 写失败测试**

Append to `tests/unit/application/semantic/test_modeling_copilot_service.py`:

```python
def test_copilot_service_uses_semantic_agent_app_instead_of_private_runtime():
    session_repo = _SessionRepo()
    proposal_service = _ProposalService()
    tools = _Tools()
    agent_app = _AgentApp(
        message="平台 runtime 已响应",
        workbench_patch={"agent_message": "平台 runtime 已响应"},
        proposal_patch={"source_mode": "agent_led"},
    )
    service = SemanticModelingCopilotService(
        session_repository=session_repo,
        agent_app=agent_app,
        tools=tools,
        proposal_service=proposal_service,
    )
    created = service.create_session({"user_goal": "查询学生评论数", "principal_id": "alice"})

    result = service.send_message(created["id"], {"message": "继续分析"}, principal_id="alice")

    assert result["workbench_state"]["agent_message"] == "平台 runtime 已响应"
    assert agent_app.calls[0]["session_id"] == created["id"]
```

Add helper class in the same test file:

```python
class _AgentApp:
    def __init__(self, *, message, workbench_patch, proposal_patch):
        self.message = message
        self.workbench_patch = workbench_patch
        self.proposal_patch = proposal_patch
        self.calls = []

    def run_chat(self, *, session, user_message, request_payload):
        from app.application.semantic.semantic_modeling_agent_app import SemanticModelingChatOutput

        self.calls.append({
            "session_id": session.id,
            "user_message": user_message,
            "request_payload": request_payload,
        })
        return SemanticModelingChatOutput(
            message=self.message,
            workbench_state_patch=self.workbench_patch,
            proposal_patch=self.proposal_patch,
            required_confirmations=[],
            suggested_actions=[],
            tool_traces=[{"event_type": "run.succeeded", "seq": 1}],
        )
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_modeling_copilot_service.py::test_copilot_service_uses_semantic_agent_app_instead_of_private_runtime \
  -q
```

Expected:

```text
TypeError: SemanticModelingCopilotService.__init__() got an unexpected keyword argument 'agent_app'
```

- [ ] **Step 3: 修改 Copilot service 构造与 send_message**

Modify import in `app/application/semantic/modeling_copilot_service.py`:

```python
from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.semantic.semantic_modeling_agent_app import SemanticModelingChatOutput
```

Remove direct import of `AgentRunResult, LLMRequiredError, ModelingAgentRuntimePort` from `modeling_copilot_runtime.py`.

Modify constructor:

```python
    def __init__(
        self,
        *,
        session_repository: IModelingAgentSessionRepository,
        agent_app: Any,
        tools: ModelingToolRegistry,
        proposal_service: Any,
        source_scoring_config: Optional[SourceCandidateScoringConfig] = None,
    ):
        self._sessions = session_repository
        self._agent_app = agent_app
        self._tools = tools
        self._proposal_service = proposal_service
        self._source_scoring_config = source_scoring_config or SourceCandidateScoringConfig.default()
```

Modify `send_message` runtime call:

```python
        result = self._agent_app.run_chat(
            session=session,
            user_message=message,
            request_payload=payload,
        )
        self._apply_agent_result(session, result)
        session.add_message(role="assistant", content=result.message)
```

Modify `_apply_agent_result` signature:

```python
    def _apply_agent_result(self, session: AgentSession, result: SemanticModelingChatOutput) -> None:
```

- [ ] **Step 4: 修改 API 错误映射**

Modify `app/interfaces/api/v1/semantic_modeling_copilot.py` import:

```python
from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
```

Replace `LLMRequiredError` branch with:

```python
    if isinstance(exc, AgentInferenceRuntimeError):
        status = 503 if exc.code in {"RUNTIME_NOT_CONFIGURED", "RUNTIME_UNAVAILABLE"} else 422
        return error(
            str(exc),
            status=status,
            details={"code": exc.code, **exc.details},
        )
```

- [ ] **Step 5: 修改 DI 装配**

Modify imports in `app/di/container.py`:

```python
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService
from app.application.semantic.semantic_evidence_builder import SemanticEvidenceBuilder
from app.application.semantic.semantic_modeling_agent_app import SemanticModelingAgentApp
```

Add providers:

```python
    agent_inference_runtime_router = providers.Singleton(
        AgentInferenceRuntimeRouter,
        adapters=providers.List(agent_openai_runtime_adapter),
    )

    agent_inference_runtime_service = providers.Singleton(
        AgentInferenceRuntimeService,
        router=agent_inference_runtime_router,
    )

    semantic_evidence_builder = providers.Singleton(SemanticEvidenceBuilder)

    semantic_modeling_agent_app = providers.Singleton(
        SemanticModelingAgentApp,
        runtime=agent_inference_runtime_service,
        evidence_builder=semantic_evidence_builder,
    )
```

Modify `semantic_modeling_copilot` provider:

```python
    semantic_modeling_copilot = providers.Singleton(
        SemanticModelingCopilotService,
        session_repository=semantic_modeling_agent_session_repository,
        agent_app=semantic_modeling_agent_app,
        tools=semantic_modeling_copilot_tools,
        proposal_service=semantic_modeling_proposal_service,
    )
```

- [ ] **Step 6: 保留旧 runtime 文件为迁移期只读壳并删除 DI 使用**

Modify `app/application/semantic/modeling_copilot_runtime.py` top docstring to say:

```python
"""旧语义建模 Copilot runtime 实现。

新主链已迁移到 app.application.semantic.semantic_modeling_agent_app 和
app.application.agent_inference_runtime。该文件仅在删除旧单元测试前保留
历史 adapter 测试，不再由 DI 容器注入。
"""
```

Do not import `OpenAIAgentsSdkAdapter` from `app/di/container.py`.

- [ ] **Step 7: 运行测试**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
  tests/unit/application/semantic/test_modeling_copilot_service.py::test_copilot_service_uses_semantic_agent_app_instead_of_private_runtime \
  tests/integration/test_semantic_modeling_copilot_api.py \
  -q
```

Expected:

```text
all selected tests passed
```

- [ ] **Step 8: 提交**

```bash
git add \
  app/application/semantic/modeling_copilot_service.py \
  app/application/semantic/modeling_copilot_runtime.py \
  app/interfaces/api/v1/semantic_modeling_copilot.py \
  app/di/container.py \
  tests/unit/application/semantic/test_modeling_copilot_service.py \
  tests/integration/test_semantic_modeling_copilot_api.py
git commit -m "refactor: route modeling copilot through agent runtime"
```

### Task 6: Codex workspace store、transport client 与 command policy

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/codex_workspace.py`
- Create: `app/infrastructure/agent_inference_runtime/codex_client.py`
- Create: `app/infrastructure/agent_inference_runtime/command_policy.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py`:

```python
from __future__ import annotations

import json

import pytest

from app.domain.agent_inference_runtime.types import RuntimeContextRef
from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore
from app.infrastructure.agent_inference_runtime.command_policy import CommandPolicy


def test_codex_workspace_writes_turn_and_rejects_path_escape(tmp_path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)
    ref = RuntimeContextRef("cubic3-data-platform", "session_1", "thread_1", "turn_1")

    turn_dir = store.prepare_turn(ref, request_payload={"input": {"message": "review"}}, runtime_policy={"max_runtime_seconds": 300})

    assert (turn_dir / "request.json").exists()
    assert json.loads((turn_dir / "runtime_policy.json").read_text())["max_runtime_seconds"] == 300
    with pytest.raises(ValueError, match="artifact path escapes"):
        store.resolve_artifact_path(ref, "../secret.txt")


def test_command_policy_rejects_unlisted_write_command():
    policy = CommandPolicy.from_dict({
        "allowed_commands": [
            {"command": "python", "args_pattern": ["-m", "pytest", "*"], "requires_approval": False}
        ],
        "network": "disabled",
    })

    policy.assert_allowed(["python", "-m", "pytest", "tests/unit"], cwd="/repo")

    with pytest.raises(PermissionError, match="RUNTIME_TOOL_FORBIDDEN"):
        policy.assert_allowed(["rm", "-rf", "app"], cwd="/repo")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.infrastructure.agent_inference_runtime.codex_workspace'
```

- [ ] **Step 3: 实现 workspace store**

Create `app/infrastructure/agent_inference_runtime/codex_workspace.py`:

```python
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from app.domain.agent_inference_runtime.types import RuntimeContextRef


class CodexWorkspaceStore:
    def __init__(self, *, runtime_root: str | Path):
        self._runtime_root = Path(runtime_root).resolve()

    def prepare_turn(
        self,
        ref: RuntimeContextRef,
        *,
        request_payload: Dict[str, Any],
        runtime_policy: Dict[str, Any],
    ) -> Path:
        turn_dir = self._turn_dir(ref)
        (turn_dir / "artifacts").mkdir(parents=True, exist_ok=True)
        self._write_json(turn_dir / "request.json", request_payload)
        self._write_json(turn_dir / "runtime_policy.json", runtime_policy)
        self._write_json(turn_dir / "turn_ref.json", {
            "project_id": ref.project_id,
            "session_id": ref.session_id,
            "thread_id": ref.thread_id,
            "turn_id": ref.turn_id,
        })
        return turn_dir

    def resolve_artifact_path(self, ref: RuntimeContextRef, relative_path: str) -> Path:
        artifact_root = (self._turn_dir(ref) / "artifacts").resolve()
        target = (artifact_root / relative_path).resolve()
        if artifact_root not in target.parents and target != artifact_root:
            raise ValueError("artifact path escapes runtime root")
        return target

    def _turn_dir(self, ref: RuntimeContextRef) -> Path:
        return (
            self._runtime_root
            / "projects"
            / ref.project_id
            / "sessions"
            / ref.session_id
            / "threads"
            / ref.thread_id
            / "turns"
            / ref.turn_id
        )

    @staticmethod
    def _write_json(path: Path, payload: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)
```

- [ ] **Step 4: 实现 command policy**

Create `app/infrastructure/agent_inference_runtime/command_policy.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from typing import Any, Dict, List


@dataclass(frozen=True)
class CommandRule:
    command: str
    args_pattern: List[str]
    requires_approval: bool


class CommandPolicy:
    def __init__(self, *, rules: List[CommandRule], network: str):
        self._rules = rules
        self._network = network

    @classmethod
    def from_dict(cls, payload: Dict[str, Any]) -> "CommandPolicy":
        rules = [
            CommandRule(
                command=str(item.get("command") or ""),
                args_pattern=list(item.get("args_pattern") or []),
                requires_approval=bool(item.get("requires_approval")),
            )
            for item in payload.get("allowed_commands") or []
        ]
        return cls(rules=rules, network=str(payload.get("network") or "disabled"))

    def assert_allowed(self, argv: List[str], *, cwd: str) -> None:
        if not argv:
            raise PermissionError("RUNTIME_TOOL_FORBIDDEN: empty command")
        command = argv[0]
        args = argv[1:]
        for rule in self._rules:
            if rule.command != command:
                continue
            if self._matches(args, rule.args_pattern):
                return
        raise PermissionError(f"RUNTIME_TOOL_FORBIDDEN: command={command} cwd={cwd}")

    @staticmethod
    def _matches(args: List[str], pattern: List[str]) -> bool:
        if len(args) < len([p for p in pattern if p != "*"]):
            return False
        for index, expected in enumerate(pattern):
            if expected == "*":
                return True
            if index >= len(args) or not fnmatch(args[index], expected):
                return False
        return len(args) == len(pattern)
```

- [ ] **Step 5: 定义 Codex client protocol**

Create `app/infrastructure/agent_inference_runtime/codex_client.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Protocol

from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeContextRef


@dataclass(frozen=True)
class ProviderThreadRef:
    provider_thread_id: str


@dataclass(frozen=True)
class ProviderRunRef:
    provider_run_id: str


class CodexAppServerClient(Protocol):
    def healthcheck(self) -> Dict[str, Any]:
        ...

    def capabilities(self) -> Dict[str, Any]:
        ...

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        ...

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef:
        ...

    def poll_run(self, provider_run_id: str) -> Dict[str, Any]:
        ...

    def stream_events(self, provider_run_id: str, *, cursor: str | None = None) -> Dict[str, Any]:
        ...

    def cancel_run(self, provider_run_id: str) -> Dict[str, Any]:
        ...

    def collect_artifacts(self, provider_run_id: str) -> List[Dict[str, Any]]:
        ...
```

- [ ] **Step 6: 运行测试**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py \
  -q
```

Expected:

```text
2 passed
```

- [ ] **Step 7: 提交**

```bash
git add \
  app/infrastructure/agent_inference_runtime/codex_workspace.py \
  app/infrastructure/agent_inference_runtime/codex_client.py \
  app/infrastructure/agent_inference_runtime/command_policy.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py
git commit -m "feat: add codex runtime workspace contract"
```

### Task 7: Codex app-server runtime adapter

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/codex_adapter.py`
- Modify: `app/di/container.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py`

- [ ] **Step 1: 写失败测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py`:

```python
from __future__ import annotations

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_adapter import CodexAppServerRuntimeAdapter
from app.infrastructure.agent_inference_runtime.codex_client import ProviderRunRef, ProviderThreadRef
from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore


class _Client:
    def __init__(self):
        self.submitted = []

    def healthcheck(self):
        return {"status": "ok", "version": "local-test"}

    def capabilities(self):
        return {"supports_artifacts": True}

    def ensure_thread(self, ref):
        return ProviderThreadRef(provider_thread_id="codex_thread_1")

    def submit_run(self, request):
        self.submitted.append(request)
        return ProviderRunRef(provider_run_id="codex_run_1")

    def poll_run(self, provider_run_id):
        return {
            "status": "succeeded",
            "structured_output": {"message": "复审通过", "findings": []},
            "usage": {"total_tokens": 11},
        }

    def stream_events(self, provider_run_id, *, cursor=None):
        return {"events": [{"event_type": "run.succeeded", "seq": 1}], "next_cursor": "1", "has_more": False}

    def cancel_run(self, provider_run_id):
        return {"status": "cancelled"}

    def collect_artifacts(self, provider_run_id):
        return []


def _request() -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef("cubic3-data-platform", "s1", "t1", "turn1"),
        principal_id="alice",
        input={"proposal_id": "proposal_1"},
        context_pack={"diff": []},
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=300),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_codex_adapter_submits_run_and_returns_structured_output(tmp_path):
    client = _Client()
    adapter = CodexAppServerRuntimeAdapter(
        client=client,
        workspace_store=CodexWorkspaceStore(runtime_root=tmp_path),
    )

    result = adapter.invoke(_request())

    assert result.status == "succeeded"
    assert result.runtime_name == "codex_app_server"
    assert result.structured_output["message"] == "复审通过"
    assert result.trace[0]["event_type"] == "run.succeeded"
    assert client.submitted[0].runtime_context_ref.turn_id == "turn1"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.infrastructure.agent_inference_runtime.codex_adapter'
```

- [ ] **Step 3: 实现 Codex adapter**

Create `app/infrastructure/agent_inference_runtime/codex_adapter.py`:

```python
from __future__ import annotations

from uuid import uuid4

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class CodexAppServerRuntimeAdapter:
    runtime_name = "codex_app_server"

    def __init__(self, *, client, workspace_store):
        self._client = client
        self._workspace_store = workspace_store

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, "codex_app_server"} and request.execution_mode == "async"

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self._client.healthcheck()
        self._client.ensure_thread(request.runtime_context_ref)
        self._workspace_store.prepare_turn(
            request.runtime_context_ref,
            request_payload={
                "app_id": request.app_id,
                "action": request.action,
                "input": dict(request.input),
                "context_pack": dict(request.context_pack),
                "output_schema": request.output_schema,
            },
            runtime_policy={
                "max_runtime_seconds": request.runtime_policy.max_runtime_seconds,
                "allow_network": request.runtime_policy.allow_network,
                "command_policy": request.runtime_policy.command_policy,
            },
        )
        provider_run = self._client.submit_run(request)
        status_payload = self._client.poll_run(provider_run.provider_run_id)
        event_page = self._client.stream_events(provider_run.provider_run_id)
        artifacts = self._client.collect_artifacts(provider_run.provider_run_id)
        return AgentInferenceRuntimeResult(
            run_id=f"run_{uuid4().hex}",
            status=status_payload.get("status", "failed"),
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output=dict(status_payload.get("structured_output") or {}),
            artifacts=list(artifacts or []),
            usage=dict(status_payload.get("usage") or {}),
            trace=list(event_page.get("events") or []),
            error=dict(status_payload.get("error") or {}) if status_payload.get("error") else None,
        )
```

- [ ] **Step 4: 接入 DI 配置**

Modify `app/di/container.py` config dict:

```python
        'agent_codex': {
            'enabled': app.config.get('AGENT_CODEX_ENABLED', False),
            'project_id': app.config.get('AGENT_CODEX_PROJECT_ID', 'cubic3-data-platform'),
            'project_root': app.config.get('AGENT_CODEX_PROJECT_ROOT', os.getcwd()),
            'runtime_root': app.config.get('AGENT_CODEX_RUNTIME_ROOT', '.cubic3/agent-codex'),
            'transport': app.config.get('AGENT_CODEX_TRANSPORT', 'unix_socket'),
            'endpoint': app.config.get('AGENT_CODEX_ENDPOINT', ''),
            'unix_socket': app.config.get('AGENT_CODEX_UNIX_SOCKET', ''),
            'max_concurrency': int(app.config.get('AGENT_CODEX_MAX_CONCURRENCY', 2)),
        },
```

Do not add Codex adapter to `AgentInferenceRuntimeRouter` until a real `CodexAppServerClient` implementation or test fake is provided in DI. In production config where `AGENT_CODEX_ENABLED=false`, router should only include `agent_openai_runtime_adapter`.

- [ ] **Step 5: 运行测试**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py \
  -q
```

Expected:

```text
3 passed
```

- [ ] **Step 6: 提交**

```bash
git add \
  app/di/container.py \
  app/infrastructure/agent_inference_runtime/codex_adapter.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_adapter.py
git commit -m "feat: add codex app server runtime adapter"
```

### Task 8: Runtime 查询 API、验证入口、文档收口与 E2E

**Files:**
- Create: `app/interfaces/api/v1/agent_runtime.py`
- Modify: `app/__init__.py`
- Modify: `app/di/container.py`
- Modify: `Makefile`
- Modify: `docs/architecture/agent-runtime-platform.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/quality/testing.md`
- Modify: `docs/runbooks/local-dev.md`
- Test: `tests/integration/test_agent_runtime_api.py`
- Test: `tests/integration/agent_inference_runtime/test_codex_live_smoke.py`

- [ ] **Step 1: 写失败测试**

Create `tests/integration/test_agent_runtime_api.py`:

```python
from __future__ import annotations

from flask import Flask

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRun,
    RuntimeContextRef,
)
from app.interfaces.api.v1.agent_runtime import create_agent_runtime_blueprint


class _Repo:
    def get_run(self, run_id):
        if run_id != "run_1":
            return None
        return AgentInferenceRuntimeRun(
            run_id="run_1",
            app_id="semantic_modeling",
            action="semantic.modeling.chat",
            runtime_name="openai_compatible",
            status="succeeded",
            runtime_context_ref=RuntimeContextRef("cubic3-data-platform", "s1", "t1", "turn1"),
            principal_id="alice",
            provider_ref={},
            usage={"total_tokens": 7},
        )

    def list_artifacts(self, *, run_id, principal_id):
        return []


def test_agent_runtime_api_returns_run_detail():
    app = Flask(__name__)
    app.config.update(TESTING=True)
    app.register_blueprint(create_agent_runtime_blueprint(_Repo()))

    resp = app.test_client().get("/api/v1/agent-runtime/runs/run_1")

    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert data["run_id"] == "run_1"
    assert data["runtime_name"] == "openai_compatible"
    assert data["runtime_context_ref"]["turn_id"] == "turn1"
```

Create `tests/integration/agent_inference_runtime/test_codex_live_smoke.py`:

```python
from __future__ import annotations

import os

import pytest


@pytest.mark.skipif(os.getenv("AGENT_CODEX_LIVE") != "1", reason="set AGENT_CODEX_LIVE=1 to run live Codex smoke")
def test_codex_live_smoke_requires_explicit_enablement():
    assert os.getenv("AGENT_CODEX_ENDPOINT") or os.getenv("AGENT_CODEX_UNIX_SOCKET")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
PYTHONPATH=. python -m pytest --no-cov \
  tests/integration/test_agent_runtime_api.py \
  tests/integration/agent_inference_runtime/test_codex_live_smoke.py \
  -q
```

Expected:

```text
ModuleNotFoundError: No module named 'app.interfaces.api.v1.agent_runtime'
```

- [ ] **Step 3: 新增 API blueprint**

Create `app/interfaces/api/v1/agent_runtime.py`:

```python
from __future__ import annotations

from typing import Any

from flask import Blueprint

from app.shared.response import error, success


def _run_payload(run) -> dict[str, Any]:
    ref = run.runtime_context_ref
    return {
        "run_id": run.run_id,
        "app_id": run.app_id,
        "action": run.action,
        "runtime_name": run.runtime_name,
        "status": run.status,
        "principal_id": run.principal_id,
        "runtime_context_ref": {
            "project_id": ref.project_id,
            "session_id": ref.session_id,
            "thread_id": ref.thread_id,
            "turn_id": ref.turn_id,
        },
        "usage": run.usage,
        "error": run.error,
    }


def create_agent_runtime_blueprint(repository):
    bp = Blueprint("agent_runtime", __name__, url_prefix="/api/v1/agent-runtime")

    @bp.route("/runs/<run_id>", methods=["GET"])
    def get_run(run_id: str):
        run = repository.get_run(run_id)
        if run is None:
            return error("Agent runtime run not found", status=404, details={"code": "RUNTIME_RUN_NOT_FOUND"})
        return success(data=_run_payload(run))

    @bp.route("/runs/<run_id>/artifacts", methods=["GET"])
    def list_artifacts(run_id: str):
        artifacts = repository.list_artifacts(run_id=run_id, principal_id=None)
        return success(data={"items": [artifact.__dict__ for artifact in artifacts]})

    return bp
```

- [ ] **Step 4: 注册 API 和 repository provider**

Modify `app/di/container.py` imports:

```python
from app.infrastructure.agent_inference_runtime.sql_repository import (
    SqlAgentInferenceRuntimeRepository,
)
```

Add provider:

```python
    agent_inference_runtime_repository = providers.Factory(
        SqlAgentInferenceRuntimeRepository,
        session=db_session,
    )
```

Modify `app/__init__.py` imports:

```python
from .interfaces.api.v1.agent_runtime import create_agent_runtime_blueprint
```

Register blueprint in `create_app` web route section:

```python
        app.register_blueprint(create_agent_runtime_blueprint(
            container.agent_inference_runtime_repository(),
        ))
```

- [ ] **Step 5: 添加 Makefile 测试入口**

Modify `Makefile` phony list to include:

```makefile
	test-platform-agent-runtime \
```

Add target:

```makefile
test-platform-agent-runtime:
	@printf '%s\n' '[layer3][agent-runtime] 运行平台 Agent 推理 Runtime 测试'
	PYTHONPATH=. $(PYTHON) -m pytest --no-cov \
		tests/unit/application/agent_inference_runtime \
		tests/unit/infrastructure/agent_inference_runtime \
		tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
		tests/integration/test_agent_runtime_api.py
```

- [ ] **Step 6: 更新文档**

Modify `docs/architecture/agent-runtime-platform.md`:

```markdown
## Implementation Status

- Phase 1 contract / router / fake runtime: implemented.
- Phase 2 OpenAI-compatible adapter: implemented through `AGENT_OPENAI_*`.
- Phase 3 Semantic Modeling Agent App: implemented for `semantic.modeling.chat`.
- Phase 4 Codex app-server adapter: implemented as workspace/client/adapter skeleton with fake tests; live smoke is opt-in through `AGENT_CODEX_LIVE=1`.
```

Modify `docs/architecture/README.md` entry for `agent-runtime-platform.md`:

```markdown
- [agent-runtime-platform.md](agent-runtime-platform.md)：平台内 Agent 推理 Runtime 目标架构与实施状态；统一 OpenAI-compatible LLM 与 Codex app-server runtime adapter，语义建模 Copilot 为首个 consumer
```

Modify `docs/quality/testing.md`:

```markdown
### Agent Inference Runtime

- 最小必跑：`make test-platform-agent-runtime`
- 涉及 Copilot 主链：补跑 `make test-modeling-agent`
- 涉及 migration：补跑 `make verify-alembic`
- 真实 Codex app-server smoke：显式设置 `AGENT_CODEX_LIVE=1`，并配置 `AGENT_CODEX_ENDPOINT` 或 `AGENT_CODEX_UNIX_SOCKET`
```

Modify `docs/runbooks/local-dev.md`:

````markdown
### Agent Runtime 本地配置

```bash
export AGENT_OPENAI_API_KEY=...
export AGENT_OPENAI_BASE_URL=https://api.openai.com/v1
export AGENT_OPENAI_MODEL=gpt-4o-mini
export AGENT_CODEX_ENABLED=false
export AGENT_CODEX_RUNTIME_ROOT=.cubic3/agent-codex
```

本地默认只启用 OpenAI-compatible runtime。Codex app-server live smoke 必须显式开启，避免普通开发启动时创建长任务工作区。
````

- [ ] **Step 7: 运行完整验证**

Run:

```bash
make test-platform-agent-runtime
make test-modeling-agent
make verify-changed VERIFY_FILES="app/domain/agent_inference_runtime/types.py app/application/agent_inference_runtime/service.py app/infrastructure/agent_inference_runtime/openai_compatible_adapter.py app/application/semantic/modeling_copilot_service.py docs/architecture/agent-runtime-platform.md"
```

Expected:

```text
all selected tests passed
```

- [ ] **Step 8: 提交**

```bash
git add \
  app/__init__.py \
  app/di/container.py \
  app/interfaces/api/v1/agent_runtime.py \
  Makefile \
  docs/architecture/agent-runtime-platform.md \
  docs/architecture/README.md \
  docs/quality/testing.md \
  docs/runbooks/local-dev.md \
  tests/integration/test_agent_runtime_api.py \
  tests/integration/agent_inference_runtime/test_codex_live_smoke.py
git commit -m "test: add agent runtime verification surface"
```

## 4. 验收标准

MVP 验收：

- `SemanticModelingCopilotService` 不再直接依赖 `OpenAIAgentsSdkAdapter`、`OpenAICompatibleLLMAdapter` 或 `ModelingAgentRuntimePort`。
- `AgentInferenceRuntimeService` 是语义建模 Copilot 调用生成式 runtime 的唯一入口。
- OpenAI-compatible runtime 只读取 `AGENT_OPENAI_*`，不读取 `LLM_API_KEY`、`OPENAI_API_KEY`、`LLM_API_BASE`、`LLM_MODEL`。
- Runtime 输出必须经过 `SemanticModelingAgentApp` action schema 投影，再由 Copilot service 写 session state。
- `make test-platform-agent-runtime`、`make test-modeling-agent` 通过。

Codex Phase 4 验收：

- `CodexWorkspaceStore` 按 `project / session / thread / turn / run / artifact` 派生路径，拒绝 path traversal。
- `CodexAppServerRuntimeAdapter` 实现平台 `AgentInferenceRuntimePort`。
- Codex adapter 不参与 `semantic.modeling.chat` 默认链路，只处理 review / repair / audit 类 action。
- Command allowlist 默认拒绝未列出的写入型命令。
- Live smoke 通过 `AGENT_CODEX_LIVE=1` 显式开启，默认测试不会尝试连接真实 Codex app-server。

工程原则检查：

- KISS：一个 `AgentInferenceRuntimeService` + 两个 adapter，不引入独立 gateway 项目。
- YAGNI：不建设 marketplace、跨产品租户治理和复杂资源池。
- SOLID：业务 app 负责语义，runtime service 负责路由和生命周期，adapter 只接外部 runtime。
- DRY：trace、artifact、policy、错误码、config 收敛为平台通用实现。

## 5. 自检记录

- Spec coverage：覆盖 `agent-runtime-platform.md` 的 contract、OpenAI-compatible、Codex workspace、command policy、artifact、Copilot 迁移、配置收敛、测试入口。
- Placeholder scan：计划中没有未定义占位、空泛实现描述或未说明的“补测试”步骤。
- Type consistency：`AgentInferenceRuntimeRequest / Result / Run / RuntimeContextRef / RuntimePolicy` 在 Task 1 定义，后续任务只复用这些名字。
- 风险提示：Task 5 会触碰现有 Copilot 主链，必须先用 fake `SemanticModelingAgentApp` 保证 session 行为不变，再接真实 OpenAI-compatible adapter。
