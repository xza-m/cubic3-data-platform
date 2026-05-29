# Agent Runtime Platform Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前 Agent Runtime Management MVP 基线上，完成 Codex app-server 真实运行链路、平台级配置治理、artifact 权限、第二业务消费方和上线验证，使建模 Copilot 能交付数据开发人员使用。

**Architecture:** 继续采用平台内 `AgentInferenceRuntimeService`，不新建独立网关项目；业务模块只声明 action，平台负责 runtime binding、provider lifecycle、trace、artifact 和权限。普通用户不选择 runtime，OpenAI 主链用于低延迟候选生成，Codex app-server 固定服务 review / repair / audit / 长上下文 artifact 场景，所有业务副作用仍回到业务应用服务。

**Tech Stack:** Flask、dependency-injector、SQLAlchemy/Alembic、PostgreSQL、Redis/RQ、pytest、React 18、Vite、Vitest、React Query、Playwright、Docker Compose、Codex app-server local HTTP/Unix socket。

---

## 0. 当前实现进度基线

### 已完成

- Phase 1 / Phase 2 / Phase 3 已实现：平台 runtime contract、router、fake/OpenAI-compatible adapter、run/artifact 查询面、语义建模 Copilot 第一个 consumer。
- Runtime Management MVP 已实现：`ActionRuntimeBindingRegistry`、`AgentRuntimeManagementService`、受控 `CodexProcessManager`、provider status / binding / test / start / stop / restart / logs / capabilities API。
- Copilot 产品行为已收敛：普通主链不展示 runtime selector；固定 Codex 的 review/repair/audit 场景才展示连接提示和受控启动入口。
- 后端已限制前端任意命令输入：Codex 启动只接受 `local-codex-app-server` allowlist profile，并校验 `AGENT_CODEX_ALLOWED_PROJECT_ROOTS`。
- 已通过验证：
  - `make test-platform-agent-runtime`
  - `make test-modeling-agent`
  - `make verify-docs`
  - `cd frontend && npm run build`
  - `git diff --check`

### 未完成

- 当前 Codex manager 还没有对接真实 Codex app-server protocol，没有稳定的 health / capabilities / submit / poll / cancel / artifact collect contract。
- Runtime provider 配置仍以环境变量为主，缺少平台级持久配置、敏感字段脱敏、管理审计日志。
- Codex review / repair action 还没有完整接入异步 run lifecycle，无法形成可追踪的事件流、结果读取和 artifact 下载。
- Artifact 还缺 owner 权限、hash 校验、过期策略和下载 API。
- 还没有第二业务消费方验证平台 runtime 抽象是否脱离语义建模私有概念。
- 还缺 Codex live smoke、端到端 browser E2E、OpenAPI / runbook / 发布验收记录。
- 当前分支存在未提交实现，应先整理成 baseline commit，再继续拆任务。

## 1. 目标文件结构

新增：

```text
app/application/agent_inference_runtime/runtime_config_service.py
app/application/agent_inference_runtime/codex_run_service.py
app/infrastructure/agent_inference_runtime/sql_runtime_config_repository.py
app/infrastructure/agent_inference_runtime/codex_http_client.py
app/infrastructure/agent_inference_runtime/codex_workspace.py
app/application/semantic/data_asset_agent_app.py
frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx
tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py
tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py
tests/unit/application/agent_inference_runtime/test_codex_run_service.py
tests/unit/application/semantic/test_data_asset_agent_app.py
tests/integration/agent_inference_runtime/test_codex_live_smoke.py
frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts
migrations/versions/0005_agent_runtime_management.py
```

修改：

```text
app/domain/agent_inference_runtime/types.py
app/domain/agent_inference_runtime/ports.py
app/application/agent_inference_runtime/management.py
app/application/agent_inference_runtime/action_binding.py
app/application/agent_inference_runtime/router.py
app/application/semantic/semantic_modeling_agent_app.py
app/application/semantic/modeling_copilot_service.py
app/di/container.py
app/interfaces/api/v1/agent_runtime.py
app/interfaces/api/v1/semantic_assets.py
frontend/src/v2/api/agent-runtime.ts
frontend/src/v2/hooks/agent-runtime.ts
frontend/src/v2/pages/settings/Settings.tsx
frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx
frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
docs/architecture/agent-runtime-platform.md
docs/runbooks/local-dev.md
docs/quality/testing.md
```

文件职责：

- `runtime_config_service.py`：合并环境 bootstrap 与数据库配置，统一 provider 配置读取、脱敏和审计写入。
- `codex_http_client.py`：只负责 Codex app-server transport，不引用语义、资产或 Copilot 类型。
- `codex_run_service.py`：管理 Codex run 的 submit / poll / cancel / read_result / read_events / collect_artifacts。
- `data_asset_agent_app.py`：作为第二 consumer，把资产上下文转为平台 runtime request，输出字段语义候选或质量问题解释。
- `AgentRuntimeSettings.tsx`：平台设置页，只展示 provider 配置、连接测试、Codex 启停、日志和 capabilities；业务页面不暴露全局 runtime 切换。

## 2. 并行执行图

```text
Task 0 baseline commit
  -> Task 1 persistent config + audit
  -> Task 2 Codex transport health/capabilities

Task 1 + Task 2
  -> Task 3 Codex async run lifecycle
  -> Task 4 wire semantic review/repair to Codex
  -> Task 5 artifact permission/download

Task 1
  -> Task 6 frontend platform runtime settings

Task 3
  -> Task 7 second consumer: data asset agent action

Task 4 + Task 5 + Task 6 + Task 7
  -> Task 8 live E2E + docs + release review
```

推荐 subagent 分配：

- Subagent A：Task 0、Task 1，收口 baseline 与配置审计。
- Subagent B：Task 2、Task 3，专注 Codex transport 与 run lifecycle。
- Subagent C：Task 4、Task 5，接语义 review/repair 和 artifact 权限。
- Subagent D：Task 6、Task 7，做平台设置页和数据资产第二 consumer。
- 主 agent：Task 8，统一验收、review、commit、push。

## 3. 任务拆分

### Task 0: 整理当前 Runtime Management MVP baseline

**Files:**
- Stage current changes:
  - `app/__init__.py`
  - `app/application/agent_inference_runtime/action_binding.py`
  - `app/application/agent_inference_runtime/codex_process_manager.py`
  - `app/application/agent_inference_runtime/management.py`
  - `app/application/agent_inference_runtime/router.py`
  - `app/di/container.py`
  - `app/domain/agent_inference_runtime/types.py`
  - `app/interfaces/api/v1/agent_runtime.py`
  - `docs/architecture/agent-runtime-platform.md`
  - `docs/runbooks/local-dev.md`
  - `frontend/src/v2/api/agent-runtime.ts`
  - `frontend/src/v2/api/client.ts`
  - `frontend/src/v2/hooks/agent-runtime.ts`
  - `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
  - `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx`
  - `tests/integration/test_agent_runtime_api.py`
  - `tests/unit/application/agent_inference_runtime/test_codex_process_manager.py`
  - `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`

- [ ] **Step 1: 查看当前变更**

Run:

```bash
git status --short
git diff --stat
```

Expected: 只包含 Agent Runtime Management MVP 相关文件和本计划文档。

- [ ] **Step 2: 运行 baseline 验证**

Run:

```bash
make test-platform-agent-runtime
make test-modeling-agent
make verify-docs
cd frontend && npm run build
git diff --check
```

Expected: 所有命令通过；`make test-platform-agent-runtime` 至少覆盖 runtime management API、action binding、process manager、Codex live smoke skip guard。

- [ ] **Step 3: 提交 baseline**

Run:

```bash
git add app/__init__.py \
  app/application/agent_inference_runtime/action_binding.py \
  app/application/agent_inference_runtime/codex_process_manager.py \
  app/application/agent_inference_runtime/management.py \
  app/application/agent_inference_runtime/router.py \
  app/di/container.py \
  app/domain/agent_inference_runtime/types.py \
  app/interfaces/api/v1/agent_runtime.py \
  docs/architecture/agent-runtime-platform.md \
  docs/runbooks/local-dev.md \
  frontend/src/v2/api/agent-runtime.ts \
  frontend/src/v2/api/client.ts \
  frontend/src/v2/hooks/agent-runtime.ts \
  frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx \
  frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx \
  tests/integration/test_agent_runtime_api.py \
  tests/unit/application/agent_inference_runtime/test_codex_process_manager.py \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py
git commit -m "feat: add platform agent runtime management mvp"
```

Expected: baseline commit 只包含当前 MVP，不混入后续 Codex live lifecycle 改动。

### Task 1: 增加 provider 持久配置与管理审计

**Files:**
- Create: `app/application/agent_inference_runtime/runtime_config_service.py`
- Create: `app/infrastructure/agent_inference_runtime/sql_runtime_config_repository.py`
- Create: `migrations/versions/0005_agent_runtime_management.py`
- Modify: `app/domain/agent_inference_runtime/ports.py`
- Modify: `app/application/agent_inference_runtime/management.py`
- Modify: `app/di/container.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py`
- Test: `tests/integration/test_agent_runtime_api.py`

- [ ] **Step 1: 写 provider config 和 audit repository 失败测试**

Add to `tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py`:

```python
from __future__ import annotations

from app.domain.agent_inference_runtime.types import RuntimeProviderConfigUpdate
from app.infrastructure.agent_inference_runtime.sql_runtime_config_repository import (
    SqlRuntimeConfigRepository,
)


def test_runtime_config_round_trip_masks_secret(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.com/v1",
            model="gpt-5.1",
            api_key="sk-live-value",
            extra={"organization": "org_123"},
            updated_by="alice",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved is not None
    assert saved.enabled is True
    assert saved.endpoint == "https://api.openai.com/v1"
    assert saved.secret_ref == "runtime_provider:openai_compatible:api_key"
    assert saved.to_public_dict()["api_key"] == "********"


def test_runtime_audit_log_records_management_action(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    audit = repo.record_audit_event(
        runtime_name="codex_app_server",
        action="start",
        principal_id="alice",
        status="accepted",
        metadata={"profile": "local-codex-app-server"},
    )

    assert audit.runtime_name == "codex_app_server"
    assert audit.action == "start"
    assert audit.status == "accepted"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py -q
```

Expected: FAIL，缺少 `RuntimeProviderConfigUpdate`、`SqlRuntimeConfigRepository` 或表模型。

- [ ] **Step 3: 添加 domain 类型**

Modify `app/domain/agent_inference_runtime/types.py`:

```python
@dataclass(frozen=True)
class RuntimeProviderConfigUpdate:
    runtime_name: RuntimeName
    enabled: bool
    endpoint: str | None
    model: str | None
    api_key: str | None
    extra: dict[str, Any]
    updated_by: str


@dataclass(frozen=True)
class RuntimeProviderConfigSnapshot:
    runtime_name: RuntimeName
    enabled: bool
    endpoint: str | None
    model: str | None
    secret_ref: str | None
    extra: dict[str, Any]
    updated_by: str | None
    updated_at: datetime | None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "runtime_name": self.runtime_name,
            "enabled": self.enabled,
            "endpoint": self.endpoint,
            "model": self.model,
            "api_key": "********" if self.secret_ref else None,
            "extra": self.extra,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
```

- [ ] **Step 4: 添加 Alembic migration**

Create `migrations/versions/0005_agent_runtime_management.py`:

```python
"""agent runtime provider config and audit

Revision ID: 0005_agent_runtime_management
Revises: 0004_instance_heartbeats
Create Date: 2026-05-29 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_agent_runtime_management"
down_revision = "0004_instance_heartbeats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_runtime_provider_configs",
        sa.Column("runtime_name", sa.String(length=64), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("endpoint", sa.String(length=512), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("secret_ref", sa.String(length=256), nullable=True),
        sa.Column("extra_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("updated_by", sa.String(length=128), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "agent_runtime_audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("runtime_name", sa.String(length=64), nullable=False, index=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("principal_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("agent_runtime_audit_logs")
    op.drop_table("agent_runtime_provider_configs")
```

- [ ] **Step 5: 实现 repository**

Create `app/infrastructure/agent_inference_runtime/sql_runtime_config_repository.py`:

```python
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, String, BigInteger, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.agent_inference_runtime.types import (
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
)
from app.infrastructure.database import Base


class AgentRuntimeProviderConfigORM(Base):
    __tablename__ = "agent_runtime_provider_configs"

    runtime_name: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    endpoint: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    secret_ref: Mapped[str | None] = mapped_column(String(256), nullable=True)
    extra_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentRuntimeAuditLogORM(Base):
    __tablename__ = "agent_runtime_audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    runtime_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    principal_id: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SqlRuntimeConfigRepository:
    def __init__(self, session):
        self._session = session

    def get_provider_config(self, runtime_name: str) -> RuntimeProviderConfigSnapshot | None:
        row = self._session.get(AgentRuntimeProviderConfigORM, runtime_name)
        if row is None:
            return None
        return RuntimeProviderConfigSnapshot(
            runtime_name=row.runtime_name,
            enabled=row.enabled,
            endpoint=row.endpoint,
            model=row.model,
            secret_ref=row.secret_ref,
            extra=row.extra_json or {},
            updated_by=row.updated_by,
            updated_at=row.updated_at,
        )

    def upsert_provider_config(self, update: RuntimeProviderConfigUpdate) -> RuntimeProviderConfigSnapshot:
        now = datetime.now(timezone.utc)
        secret_ref = f"runtime_provider:{update.runtime_name}:api_key" if update.api_key else None
        row = self._session.get(AgentRuntimeProviderConfigORM, update.runtime_name)
        if row is None:
            row = AgentRuntimeProviderConfigORM(runtime_name=update.runtime_name, updated_at=now)
            self._session.add(row)
        row.enabled = update.enabled
        row.endpoint = update.endpoint
        row.model = update.model
        row.secret_ref = secret_ref
        row.extra_json = update.extra
        row.updated_by = update.updated_by
        row.updated_at = now
        self._session.flush()
        return self.get_provider_config(update.runtime_name)

    def record_audit_event(self, runtime_name: str, action: str, principal_id: str, status: str, metadata: dict[str, Any]):
        row = AgentRuntimeAuditLogORM(
            runtime_name=runtime_name,
            action=action,
            principal_id=principal_id,
            status=status,
            metadata_json=metadata,
            created_at=datetime.now(timezone.utc),
        )
        self._session.add(row)
        self._session.flush()
        return row
```

- [ ] **Step 6: 运行 repository 测试**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py -q
```

Expected: PASS。

- [ ] **Step 7: 接入 management service 与 API 审计**

Modify `app/application/agent_inference_runtime/management.py` so `start_provider`, `stop_provider`, `restart_provider`, `test_provider` call `runtime_config_service.record_management_event(...)` after success and after failure.

Expected API behavior:

```json
{
  "runtime_name": "codex_app_server",
  "action": "start",
  "status": "accepted",
  "audit_recorded": true
}
```

- [ ] **Step 8: 运行集成测试**

Run:

```bash
pytest tests/integration/test_agent_runtime_api.py -q
make test-platform-agent-runtime
```

Expected: PASS。

- [ ] **Step 9: 提交 Task 1**

Run:

```bash
git add app/domain/agent_inference_runtime/types.py \
  app/domain/agent_inference_runtime/ports.py \
  app/application/agent_inference_runtime/runtime_config_service.py \
  app/application/agent_inference_runtime/management.py \
  app/infrastructure/agent_inference_runtime/sql_runtime_config_repository.py \
  app/di/container.py \
  app/interfaces/api/v1/agent_runtime.py \
  migrations/versions/0005_agent_runtime_management.py \
  tests/unit/infrastructure/agent_inference_runtime/test_runtime_config_repository.py \
  tests/integration/test_agent_runtime_api.py
git commit -m "feat: persist agent runtime provider config"
```

### Task 2: 实现 Codex app-server transport health 与 capabilities

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/codex_http_client.py`
- Modify: `app/application/agent_inference_runtime/management.py`
- Modify: `app/application/agent_inference_runtime/codex_process_manager.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py`
- Test: `tests/unit/application/agent_inference_runtime/test_codex_process_manager.py`

- [ ] **Step 1: 写 Codex HTTP client 失败测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py`:

```python
from __future__ import annotations

from app.infrastructure.agent_inference_runtime.codex_http_client import CodexAppServerClient


class _Response:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class _Session:
    def __init__(self):
        self.calls = []

    def get(self, url, timeout):
        self.calls.append(("GET", url, timeout))
        if url.endswith("/health"):
            return _Response({"status": "ok", "version": "0.1.0"})
        if url.endswith("/capabilities"):
            return _Response({"tools": ["read_file"], "max_context_tokens": 200000})
        raise AssertionError(url)


def test_health_and_capabilities_use_configured_endpoint():
    session = _Session()
    client = CodexAppServerClient(endpoint="http://127.0.0.1:8765", session=session, timeout_seconds=3)

    assert client.healthcheck()["status"] == "ok"
    assert client.capabilities()["tools"] == ["read_file"]
    assert session.calls == [
        ("GET", "http://127.0.0.1:8765/health", 3),
        ("GET", "http://127.0.0.1:8765/capabilities", 3),
    ]
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py -q
```

Expected: FAIL，缺少 `CodexAppServerClient`。

- [ ] **Step 3: 实现 HTTP client**

Create `app/infrastructure/agent_inference_runtime/codex_http_client.py`:

```python
from __future__ import annotations

from typing import Any

import requests


class CodexAppServerClient:
    def __init__(self, endpoint: str, session: requests.Session | None = None, timeout_seconds: int = 5):
        self._endpoint = endpoint.rstrip("/")
        self._session = session or requests.Session()
        self._timeout_seconds = timeout_seconds

    def healthcheck(self) -> dict[str, Any]:
        return self._get("/health")

    def capabilities(self) -> dict[str, Any]:
        return self._get("/capabilities")

    def _get(self, path: str) -> dict[str, Any]:
        response = self._session.get(f"{self._endpoint}{path}", timeout=self._timeout_seconds)
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Codex app-server returned a non-object JSON payload")
        return payload
```

- [ ] **Step 4: 接入 provider test / capabilities API**

Modify `app/application/agent_inference_runtime/management.py`:

```python
def test_provider(self, runtime_name: str, principal_id: str) -> RuntimeProviderTestResult:
    if runtime_name == "codex_app_server":
        config = self._runtime_config_service.provider_config(runtime_name)
        client = self._codex_client_factory(config.endpoint)
        health = client.healthcheck()
        self._runtime_config_service.record_management_event(
            runtime_name=runtime_name,
            action="test",
            principal_id=principal_id,
            status="succeeded",
            metadata={"status": health.get("status"), "version": health.get("version")},
        )
        return RuntimeProviderTestResult(runtime_name=runtime_name, ok=True, detail=health)
    return self._test_openai_provider(runtime_name, principal_id)
```

- [ ] **Step 5: 运行测试**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py -q
pytest tests/unit/application/agent_inference_runtime/test_codex_process_manager.py -q
make test-platform-agent-runtime
```

Expected: PASS。

- [ ] **Step 6: 提交 Task 2**

Run:

```bash
git add app/infrastructure/agent_inference_runtime/codex_http_client.py \
  app/application/agent_inference_runtime/management.py \
  app/application/agent_inference_runtime/codex_process_manager.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_http_client.py \
  tests/unit/application/agent_inference_runtime/test_codex_process_manager.py
git commit -m "feat: connect codex app server health checks"
```

### Task 3: 实现 Codex 异步 run lifecycle

**Files:**
- Create: `app/application/agent_inference_runtime/codex_run_service.py`
- Modify: `app/domain/agent_inference_runtime/types.py`
- Modify: `app/infrastructure/agent_inference_runtime/codex_http_client.py`
- Modify: `app/infrastructure/agent_inference_runtime/sql_repository.py`
- Modify: `app/interfaces/api/v1/agent_runtime.py`
- Test: `tests/unit/application/agent_inference_runtime/test_codex_run_service.py`
- Test: `tests/integration/test_agent_runtime_api.py`

- [ ] **Step 1: 写 submit / poll / cancel 失败测试**

Create `tests/unit/application/agent_inference_runtime/test_codex_run_service.py`:

```python
from __future__ import annotations

from app.application.agent_inference_runtime.codex_run_service import CodexRunService
from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeContextRef, RuntimePolicy


class _CodexClient:
    def __init__(self):
        self.submitted = []

    def submit_run(self, payload):
        self.submitted.append(payload)
        return {"provider_run_id": "codex_run_1", "status": "queued"}

    def poll_run(self, provider_run_id):
        return {"provider_run_id": provider_run_id, "status": "succeeded", "result": {"summary": "reviewed"}}

    def cancel_run(self, provider_run_id):
        return {"provider_run_id": provider_run_id, "status": "cancelled"}


class _Repository:
    def __init__(self):
        self.records = {}

    def create_runtime_run(self, request, runtime_name, provider_ref):
        run_id = "run_1"
        self.records[run_id] = {"request": request, "runtime_name": runtime_name, "provider_ref": provider_ref, "status": "queued"}
        return run_id

    def update_runtime_run(self, run_id, status, result=None, error=None):
        self.records[run_id]["status"] = status
        self.records[run_id]["result"] = result
        self.records[run_id]["error"] = error

    def get_runtime_run(self, run_id):
        return self.records[run_id]


def _request():
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(project_id="p1", session_id="s1", thread_id="t1", turn_id="u1"),
        principal_id="alice",
        input={"proposal_id": "proposal_1"},
        context_pack={"proposal": {"id": "proposal_1"}},
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=300),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_submit_poll_and_cancel_codex_run():
    client = _CodexClient()
    repo = _Repository()
    service = CodexRunService(client=client, repository=repo)

    submitted = service.submit(_request())
    assert submitted["run_id"] == "run_1"
    assert client.submitted[0]["action"] == "semantic.modeling.review_proposal"

    polled = service.poll("run_1")
    assert polled["status"] == "succeeded"
    assert repo.records["run_1"]["result"]["summary"] == "reviewed"

    cancelled = service.cancel("run_1")
    assert cancelled["status"] == "cancelled"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pytest tests/unit/application/agent_inference_runtime/test_codex_run_service.py -q
```

Expected: FAIL，缺少 `CodexRunService`。

- [ ] **Step 3: 扩展 Codex client transport**

Modify `app/infrastructure/agent_inference_runtime/codex_http_client.py`:

```python
    def submit_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._post("/runs", payload)

    def poll_run(self, provider_run_id: str) -> dict[str, Any]:
        return self._get(f"/runs/{provider_run_id}")

    def cancel_run(self, provider_run_id: str) -> dict[str, Any]:
        return self._post(f"/runs/{provider_run_id}/cancel", {})

    def events(self, provider_run_id: str) -> list[dict[str, Any]]:
        payload = self._get(f"/runs/{provider_run_id}/events")
        events = payload.get("events", [])
        if not isinstance(events, list):
            raise ValueError("Codex app-server events payload must contain an events list")
        return events

    def artifacts(self, provider_run_id: str) -> list[dict[str, Any]]:
        payload = self._get(f"/runs/{provider_run_id}/artifacts")
        artifacts = payload.get("artifacts", [])
        if not isinstance(artifacts, list):
            raise ValueError("Codex app-server artifacts payload must contain an artifacts list")
        return artifacts

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = self._session.post(f"{self._endpoint}{path}", json=payload, timeout=self._timeout_seconds)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict):
            raise ValueError("Codex app-server returned a non-object JSON payload")
        return data
```

- [ ] **Step 4: 实现 CodexRunService**

Create `app/application/agent_inference_runtime/codex_run_service.py`:

```python
from __future__ import annotations

from typing import Any

from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest


class CodexRunService:
    def __init__(self, client, repository):
        self._client = client
        self._repository = repository

    def submit(self, request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
        payload = {
            "app_id": request.app_id,
            "action": request.action,
            "context_ref": request.runtime_context_ref.to_dict(),
            "principal_id": request.principal_id,
            "input": request.input,
            "context_pack": request.context_pack,
            "output_schema": request.output_schema,
            "runtime_policy": request.runtime_policy.to_dict(),
        }
        provider = self._client.submit_run(payload)
        run_id = self._repository.create_runtime_run(
            request=request,
            runtime_name="codex_app_server",
            provider_ref={"provider_run_id": provider["provider_run_id"]},
        )
        return {"run_id": run_id, "provider_run_id": provider["provider_run_id"], "status": provider.get("status", "queued")}

    def poll(self, run_id: str) -> dict[str, Any]:
        record = self._repository.get_runtime_run(run_id)
        provider_run_id = record["provider_ref"]["provider_run_id"]
        payload = self._client.poll_run(provider_run_id)
        status = payload["status"]
        self._repository.update_runtime_run(run_id, status=status, result=payload.get("result"), error=payload.get("error"))
        return {"run_id": run_id, "provider_run_id": provider_run_id, "status": status, "result": payload.get("result")}

    def cancel(self, run_id: str) -> dict[str, Any]:
        record = self._repository.get_runtime_run(run_id)
        provider_run_id = record["provider_ref"]["provider_run_id"]
        payload = self._client.cancel_run(provider_run_id)
        self._repository.update_runtime_run(run_id, status="cancelled", result=None, error=None)
        return {"run_id": run_id, "provider_run_id": provider_run_id, "status": payload.get("status", "cancelled")}
```

- [ ] **Step 5: 暴露 API**

Modify `app/interfaces/api/v1/agent_runtime.py`:

```python
@bp.post("/runs/<run_id>/poll")
def poll_runtime_run(run_id: str):
    principal = _current_principal()
    result = current_app.container.codex_run_service().poll(run_id=run_id, principal_id=principal.id)
    return jsonify(result)


@bp.post("/runs/<run_id>/cancel")
def cancel_runtime_run(run_id: str):
    principal = _current_principal()
    result = current_app.container.codex_run_service().cancel(run_id=run_id, principal_id=principal.id)
    return jsonify(result)
```

- [ ] **Step 6: 运行测试**

Run:

```bash
pytest tests/unit/application/agent_inference_runtime/test_codex_run_service.py -q
pytest tests/integration/test_agent_runtime_api.py -q
make test-platform-agent-runtime
```

Expected: PASS。

- [ ] **Step 7: 提交 Task 3**

Run:

```bash
git add app/application/agent_inference_runtime/codex_run_service.py \
  app/domain/agent_inference_runtime/types.py \
  app/infrastructure/agent_inference_runtime/codex_http_client.py \
  app/infrastructure/agent_inference_runtime/sql_repository.py \
  app/interfaces/api/v1/agent_runtime.py \
  tests/unit/application/agent_inference_runtime/test_codex_run_service.py \
  tests/integration/test_agent_runtime_api.py
git commit -m "feat: add codex runtime run lifecycle"
```

### Task 4: 将语义 review / repair action 接入 Codex run lifecycle

**Files:**
- Modify: `app/application/semantic/semantic_modeling_agent_app.py`
- Modify: `app/application/semantic/modeling_copilot_service.py`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Test: `tests/unit/application/semantic/test_semantic_modeling_agent_app.py`
- Test: `tests/unit/application/semantic/test_modeling_copilot_service.py`
- Test: `tests/integration/test_semantic_modeling_copilot_api.py`

- [ ] **Step 1: 写语义 review 固定 Codex 的失败测试**

Add to `tests/unit/application/semantic/test_semantic_modeling_agent_app.py`:

```python
def test_review_proposal_submits_codex_async_run(agent_app, runtime_service):
    runtime_service.enqueue_result = {
        "run_id": "run_review_1",
        "status": "queued",
        "runtime_name": "codex_app_server",
    }

    result = agent_app.review_proposal(
        session_id="session_1",
        proposal_id="proposal_1",
        principal_id="alice",
    )

    request = runtime_service.requests[0]
    assert request.action == "semantic.modeling.review_proposal"
    assert request.preferred_runtime == "codex_app_server"
    assert request.execution_mode == "async"
    assert result["run_id"] == "run_review_1"
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pytest tests/unit/application/semantic/test_semantic_modeling_agent_app.py::test_review_proposal_submits_codex_async_run -q
```

Expected: FAIL，当前 review action 未走 Codex async enqueue。

- [ ] **Step 3: 实现 review request 构建**

Modify `app/application/semantic/semantic_modeling_agent_app.py`:

```python
def review_proposal(self, session_id: str, proposal_id: str, principal_id: str) -> dict[str, Any]:
    session = self._session_repository.get_session(session_id)
    proposal = self._proposal_repository.get_proposal(proposal_id)
    request = AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action="semantic.modeling.review_proposal",
        runtime_context_ref=RuntimeContextRef(
            project_id=session.project_id,
            session_id=session_id,
            thread_id=session.thread_id,
            turn_id=self._turn_id_factory(),
        ),
        principal_id=principal_id,
        input={"proposal_id": proposal_id, "question": "review semantic modeling proposal"},
        context_pack=self._evidence_builder.build_review_context(session=session, proposal=proposal),
        output_schema="semantic.modeling.review.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=600, allowed_tools=["read_context_pack"]),
        preferred_runtime="codex_app_server",
        execution_mode="async",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )
    return self._runtime_service.enqueue(request)
```

- [ ] **Step 4: 前端只展示 review run 状态和 artifact 链接**

Modify `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`:

```tsx
{reviewRun ? (
  <div className="rounded border border-slate-200 bg-white px-3 py-2 text-sm">
    <div className="font-medium text-slate-900">复审任务 {reviewRun.status}</div>
    {reviewRun.artifacts?.length ? (
      <button className="btn btn-secondary" onClick={() => openArtifact(reviewRun.artifacts[0].artifact_id)}>
        查看复审报告
      </button>
    ) : null}
  </div>
) : null}
```

- [ ] **Step 5: 运行测试**

Run:

```bash
pytest tests/unit/application/semantic/test_semantic_modeling_agent_app.py -q
pytest tests/unit/application/semantic/test_modeling_copilot_service.py -q
pytest tests/integration/test_semantic_modeling_copilot_api.py -q
cd frontend && npm test -- ModelingAgent
make test-modeling-agent
```

Expected: PASS。

- [ ] **Step 6: 提交 Task 4**

Run:

```bash
git add app/application/semantic/semantic_modeling_agent_app.py \
  app/application/semantic/modeling_copilot_service.py \
  frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx \
  tests/unit/application/semantic/test_semantic_modeling_agent_app.py \
  tests/unit/application/semantic/test_modeling_copilot_service.py \
  tests/integration/test_semantic_modeling_copilot_api.py
git commit -m "feat: route semantic review actions to codex runtime"
```

### Task 5: 增加 artifact 权限、hash、过期和下载 API

**Files:**
- Create: `app/infrastructure/agent_inference_runtime/codex_workspace.py`
- Modify: `app/infrastructure/agent_inference_runtime/sql_repository.py`
- Modify: `app/interfaces/api/v1/agent_runtime.py`
- Test: `tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py`
- Test: `tests/integration/test_agent_runtime_api.py`

- [ ] **Step 1: 写 artifact owner 权限失败测试**

Add to `tests/integration/test_agent_runtime_api.py`:

```python
def test_artifact_download_requires_run_owner(client, runtime_repository):
    run_id = runtime_repository.insert_run_for_test(
        principal_id="alice",
        runtime_name="codex_app_server",
        action="semantic.modeling.review_proposal",
    )
    artifact_id = runtime_repository.insert_artifact_for_test(
        run_id=run_id,
        principal_id="alice",
        artifact_type="review_report",
        content=b"# Review\nok",
    )

    response = client.get(
        f"/api/v1/agent-runtime/runs/{run_id}/artifacts/{artifact_id}/download",
        headers={"X-Principal-Id": "bob"},
    )

    assert response.status_code == 403
```

- [ ] **Step 2: 写 hash 校验测试**

Create `tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py`:

```python
from __future__ import annotations

from app.infrastructure.agent_inference_runtime.codex_workspace import CodexWorkspaceStore


def test_store_artifact_returns_sha256_and_relative_uri(tmp_path):
    store = CodexWorkspaceStore(runtime_root=tmp_path)

    artifact = store.write_artifact(
        project_id="p1",
        session_id="s1",
        thread_id="t1",
        turn_id="u1",
        run_id="run_1",
        artifact_id="artifact_1",
        filename="review.md",
        content=b"# Review\nok\n",
    )

    assert artifact.storage_uri.endswith("/p1/s1/t1/u1/run_1/artifacts/artifact_1/review.md")
    assert artifact.content_hash == "sha256:f3c4f21563dca1fa80a709f3e90d5004fd58933db22d63d2cfd328be54f6f229"
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py -q
pytest tests/integration/test_agent_runtime_api.py::test_artifact_download_requires_run_owner -q
```

Expected: FAIL，缺少 workspace store 或 download 权限。

- [ ] **Step 4: 实现 workspace artifact 存储**

Create `app/infrastructure/agent_inference_runtime/codex_workspace.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path


@dataclass(frozen=True)
class StoredRuntimeArtifact:
    storage_uri: str
    content_hash: str
    size_bytes: int


class CodexWorkspaceStore:
    def __init__(self, runtime_root: Path):
        self._runtime_root = Path(runtime_root).resolve()

    def write_artifact(
        self,
        project_id: str,
        session_id: str,
        thread_id: str,
        turn_id: str,
        run_id: str,
        artifact_id: str,
        filename: str,
        content: bytes,
    ) -> StoredRuntimeArtifact:
        artifact_dir = self._runtime_root / project_id / session_id / thread_id / turn_id / run_id / "artifacts" / artifact_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / filename
        target.write_bytes(content)
        digest = sha256(content).hexdigest()
        return StoredRuntimeArtifact(
            storage_uri=str(target),
            content_hash=f"sha256:{digest}",
            size_bytes=len(content),
        )
```

- [ ] **Step 5: 实现下载 API 权限校验**

Modify `app/interfaces/api/v1/agent_runtime.py`:

```python
@bp.get("/runs/<run_id>/artifacts/<artifact_id>/download")
def download_runtime_artifact(run_id: str, artifact_id: str):
    principal = _current_principal()
    artifact = current_app.container.agent_runtime_repository().get_artifact_for_download(
        run_id=run_id,
        artifact_id=artifact_id,
        principal_id=principal.id,
    )
    if artifact is None:
        abort(403)
    return send_file(
        artifact.storage_uri,
        as_attachment=True,
        download_name=artifact.filename,
        mimetype=artifact.content_type or "application/octet-stream",
    )
```

- [ ] **Step 6: 运行测试**

Run:

```bash
pytest tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py -q
pytest tests/integration/test_agent_runtime_api.py -q
make test-platform-agent-runtime
```

Expected: PASS。

- [ ] **Step 7: 提交 Task 5**

Run:

```bash
git add app/infrastructure/agent_inference_runtime/codex_workspace.py \
  app/infrastructure/agent_inference_runtime/sql_repository.py \
  app/interfaces/api/v1/agent_runtime.py \
  tests/unit/infrastructure/agent_inference_runtime/test_codex_workspace.py \
  tests/integration/test_agent_runtime_api.py
git commit -m "feat: secure agent runtime artifacts"
```

### Task 6: 增加平台级 AI Runtime 设置页

**Files:**
- Create: `frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx`
- Modify: `frontend/src/v2/pages/settings/Settings.tsx`
- Modify: `frontend/src/v2/components/ui/Tabs.tsx`
- Modify: `frontend/src/v2/api/agent-runtime.ts`
- Modify: `frontend/src/v2/hooks/agent-runtime.ts`
- Modify: `frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.tsx`
- Test: `frontend/src/v2/pages/settings/Settings.test.tsx`

- [x] **Step 1: 写设置页失败测试**

Add to `frontend/src/v2/pages/settings/Settings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "./Settings";

test("shows platform agent runtime management tab and codex start action", async () => {
  render(<Settings initialTab="agent-runtime" />);

  expect(screen.getByText("AI Runtime")).toBeInTheDocument();
  expect(screen.getByText("OpenAI SDK / LLM API")).toBeInTheDocument();
  expect(screen.getByText("Codex app-server")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "启动 Codex" }));

  expect(await screen.findByText("已提交 Codex 启动请求")).toBeInTheDocument();
});
```

- [x] **Step 2: 运行测试确认失败**

Run:

```bash
cd frontend && npm test -- Settings
```

Expected: FAIL，缺少 `agent-runtime` tab 或按钮。

- [x] **Step 3: 实现 AgentRuntimeSettings**

Create `frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx`:

```tsx
import { useAgentRuntimeProviders, useStartAgentRuntimeProvider, useTestAgentRuntimeProvider } from "../../hooks/agent-runtime";

export function AgentRuntimeSettings() {
  const providers = useAgentRuntimeProviders();
  const startProvider = useStartAgentRuntimeProvider();
  const testProvider = useTestAgentRuntimeProvider();

  const codex = providers.data?.providers.find((item) => item.runtime_name === "codex_app_server");
  const openai = providers.data?.providers.find((item) => item.runtime_name === "openai_compatible");

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">AI Runtime</h2>
        <p className="text-sm text-slate-500">平台级 agent runtime 配置、连接测试与受控启动。</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        <ProviderCard title="OpenAI SDK / LLM API" provider={openai} onTest={() => testProvider.mutate("openai_compatible")} />
        <ProviderCard
          title="Codex app-server"
          provider={codex}
          onTest={() => testProvider.mutate("codex_app_server")}
          actionLabel="启动 Codex"
          onAction={() => startProvider.mutate("codex_app_server")}
        />
      </div>
      {startProvider.isSuccess ? <div className="alert alert-success">已提交 Codex 启动请求</div> : null}
    </section>
  );
}
```

- [x] **Step 4: 接入 Settings 页面**

Modify `frontend/src/v2/pages/settings/Settings.tsx`:

```tsx
import { AgentRuntimeSettings } from "./AgentRuntimeSettings";

const tabs = [
  { key: "general", label: "通用" },
  { key: "agent-runtime", label: "AI Runtime" },
];

export function Settings({ initialTab = "general" }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  return (
    <div className="space-y-4">
      <SettingsTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === "agent-runtime" ? <AgentRuntimeSettings /> : <GeneralSettings />}
    </div>
  );
}
```

- [x] **Step 5: 运行前端验证**

Run:

```bash
cd frontend && npm test -- Settings
cd frontend && npm run build
```

Expected: PASS。

- [x] **Step 6: 提交 Task 6**

Run:

```bash
git add frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx \
  frontend/src/v2/pages/settings/Settings.tsx \
  frontend/src/v2/api/agent-runtime.ts \
  frontend/src/v2/hooks/agent-runtime.ts \
  frontend/src/v2/pages/settings/Settings.test.tsx
git commit -m "feat: add platform agent runtime settings"
```

### Task 7: 增加数据资产第二 consumer

**Files:**
- Create: `app/application/semantic/data_asset_agent_app.py`
- Modify: `app/application/agent_inference_runtime/action_binding.py`
- Modify: `app/interfaces/api/v1/semantic_assets.py`
- Test: `tests/unit/application/semantic/test_data_asset_agent_app.py`
- Test: `tests/unit/interfaces/api/v1/test_semantic_assets_api.py`
- Test: `tests/unit/application/agent_inference_runtime/test_contract_and_router.py`

- [x] **Step 1: 写字段语义候选失败测试**

Create `tests/unit/application/semantic/test_data_asset_agent_app.py`:

```python
from __future__ import annotations

from app.application.semantic.data_asset_agent_app import DataAssetAgentApp


class _RuntimeService:
    def __init__(self):
        self.requests = []

    def invoke(self, request):
        self.requests.append(request)
        return type("Result", (), {"structured_output": {"candidates": [{"field_name": "p75_difficulty", "semantic_role": "metric", "data_type": "decimal"}]}})()


def test_infer_field_semantics_uses_asset_context_and_openai_runtime():
    runtime = _RuntimeService()
    app = DataAssetAgentApp(runtime_service=runtime)

    result = app.infer_field_semantics(
        table_id="table_1",
        fields=[{"name": "p75_difficulty", "physical_type": "DECIMAL(10,4)", "sample_values": ["0.7500"]}],
        principal_id="alice",
    )

    request = runtime.requests[0]
    assert request.action == "asset.field.infer_semantics"
    assert request.preferred_runtime == "openai_compatible"
    assert request.asset_revision_refs == ["table:table_1"]
    assert result["candidates"][0]["semantic_role"] == "metric"
```

- [x] **Step 2: 运行测试确认失败**

Run:

```bash
pytest tests/unit/application/semantic/test_data_asset_agent_app.py -q
```

Expected: FAIL，缺少 `DataAssetAgentApp`。

- [x] **Step 3: 注册 asset action binding**

Modify `app/application/agent_inference_runtime/action_binding.py`:

```python
ActionRuntimeBinding(
    action="asset.field.infer_semantics",
    default_runtime="openai_compatible",
    allowed_runtimes=("openai_compatible",),
    expose_selector=False,
    reason="字段语义候选生成是低延迟结构化输出，不需要 Codex workspace",
)
```

- [x] **Step 4: 实现 DataAssetAgentApp**

Create `app/application/semantic/data_asset_agent_app.py`:

```python
from __future__ import annotations

from typing import Any

from app.domain.agent_inference_runtime.types import AgentInferenceRuntimeRequest, RuntimeContextRef, RuntimePolicy


class DataAssetAgentApp:
    def __init__(self, runtime_service):
        self._runtime_service = runtime_service

    def infer_field_semantics(self, table_id: str, fields: list[dict[str, Any]], principal_id: str) -> dict[str, Any]:
        request = AgentInferenceRuntimeRequest(
            app_id="data_assets",
            action="asset.field.infer_semantics",
            runtime_context_ref=RuntimeContextRef(
                project_id="default",
                session_id=f"asset_table_{table_id}",
                thread_id=f"asset_table_{table_id}",
                turn_id="infer_field_semantics",
            ),
            principal_id=principal_id,
            input={"table_id": table_id, "fields": fields},
            context_pack={"table_id": table_id, "fields": fields},
            output_schema="asset.field.infer_semantics.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=60),
            preferred_runtime="openai_compatible",
            execution_mode="sync",
            semantic_runtime_pin=None,
            asset_revision_refs=[f"table:{table_id}"],
        )
        result = self._runtime_service.invoke(request)
        return result.structured_output
```

- [x] **Step 5: 暴露资产 API**

Modify `app/interfaces/api/v1/semantic_assets.py`:

```python
@bp.post("/tables/<table_id>/field-semantic-candidates")
def infer_field_semantic_candidates(table_id: str):
    principal = _current_principal()
    payload = request.get_json(silent=True) or {}
    fields = payload.get("fields") or []
    result = current_app.container.data_asset_agent_app().infer_field_semantics(
        table_id=table_id,
        fields=fields,
        principal_id=principal.id,
    )
    return jsonify(result)
```

- [x] **Step 6: 运行测试**

Run:

```bash
pytest tests/unit/application/semantic/test_data_asset_agent_app.py -q
pytest tests/unit/interfaces/api/v1/test_semantic_assets_api.py -q
make test-platform-agent-runtime
```

Expected: PASS。

- [x] **Step 7: 提交 Task 7**

Run:

```bash
git add app/application/semantic/data_asset_agent_app.py \
  app/application/agent_inference_runtime/action_binding.py \
  app/interfaces/api/v1/semantic_assets.py \
  tests/unit/application/semantic/test_data_asset_agent_app.py \
  tests/unit/interfaces/api/v1/test_semantic_assets_api.py \
  tests/unit/application/agent_inference_runtime/test_contract_and_router.py \
  app/__init__.py \
  app/di/container.py
git commit -m "feat: add data asset agent runtime consumer"
```

### Task 8: Live E2E、文档与发布验收

**Files:**
- Modify: `tests/integration/agent_inference_runtime/test_codex_live_smoke.py`
- Create: `frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts`
- Modify: `docs/architecture/agent-runtime-platform.md`
- Modify: `docs/runbooks/local-dev.md`
- Modify: `docs/quality/testing.md`
- Modify: `README.md`

- [x] **Step 1: 写 Codex live smoke guard**

Create `tests/integration/agent_inference_runtime/test_codex_live_smoke.py`:

```python
from __future__ import annotations

import os

import pytest

from app.infrastructure.agent_inference_runtime.codex_http_client import CodexAppServerClient


@pytest.mark.skipif(os.getenv("AGENT_CODEX_LIVE") != "1", reason="set AGENT_CODEX_LIVE=1 to run Codex live smoke")
def test_codex_app_server_live_health_and_capabilities():
    endpoint = os.environ["AGENT_CODEX_ENDPOINT"]
    client = CodexAppServerClient(endpoint=endpoint, timeout_seconds=10)

    health = client.healthcheck()
    capabilities = client.capabilities()

    assert health["status"] in {"ok", "ready"}
    assert "tools" in capabilities
```

- [x] **Step 2: 写 Copilot runtime E2E**

Create `frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("modeling copilot shows fixed runtime status and starts codex only for review", async ({ page }) => {
  await page.goto("/semantic/modeling-copilot/session_runtime_1");
  await expect(page.getByTestId("agent-runtime-status")).toHaveText("AI · OpenAI");
  await expect(page.getByRole("button", { name: "启动 Codex" })).toHaveCount(0);
  await expect(page.getByTestId("codex-review-runtime-notice")).toContainText("Codex 复审未连接");

  await page.getByRole("button", { name: "打开 AI Runtime 设置" }).click();
  await page.getByRole("button", { name: "启动 Codex" }).click();
  await expect(page.getByText("已提交 Codex 启动请求")).toBeVisible();
});
```

- [x] **Step 3: 运行常规验证**

Run:

```bash
make test-platform-agent-runtime
make test-modeling-agent
make verify-docs
cd frontend && npm run build
git diff --check
```

Expected: PASS。

- [x] **Step 4: 运行 live smoke**

Run:

```bash
AGENT_CODEX_LIVE=1 AGENT_CODEX_ENDPOINT=http://127.0.0.1:8765 pytest tests/integration/agent_inference_runtime/test_codex_live_smoke.py -q
```

Expected: PASS；如果本机没有 Codex app-server，记录为 blocked by local runtime unavailable，不把常规 CI 判失败。

Actual: `AGENT_CODEX_LIVE=1 AGENT_CODEX_ENDPOINT=http://127.0.0.1:8799 ...` 已执行，失败于 `Connection refused`，本机没有运行中的真实 Codex app-server；默认 smoke guard 仍为 skip，常规 CI 不受影响。

- [x] **Step 5: 更新文档**

Update `docs/architecture/agent-runtime-platform.md`:

```markdown
### Release readiness as of 2026-05-29

- Platform runtime contract, action binding, provider management and semantic modeling consumer are implemented.
- Codex app-server lifecycle supports allowlisted local start, health, capabilities, submit, poll, cancel, event and artifact collection.
- Runtime provider configuration is persisted with secret masking and management audit logs.
- Artifact download requires run owner permission and validates stored content hash.
- Data asset field semantic candidate generation is the second consumer and confirms the runtime layer is not coupled to semantic modeling.
```

Update `docs/runbooks/local-dev.md`:

```markdown
### Codex app-server 本地联调

1. 在设置页打开 `AI Runtime`。
2. 确认 `AGENT_CODEX_ALLOWED_PROJECT_ROOTS` 包含当前仓库根目录。
3. 点击 `启动 Codex`，平台只会执行 `AGENT_CODEX_COMMAND_PROFILE=local-codex-app-server` 对应的后端白名单命令。
4. 点击 `连接测试`，成功后 capabilities 面板展示 app-server 工具和上下文能力。
5. 建模 Copilot 主链不展示 runtime selector；复审、修复和审计入口会使用 Codex runtime。
```

- [x] **Step 6: 最终 review**

Run:

```bash
make review
git status --short
git log --oneline --decorate -n 8
```

Expected: `make review` PASS；工作区只剩预期文档或无未提交文件。

- [x] **Step 7: 提交 Task 8**

Run:

```bash
git add tests/integration/agent_inference_runtime/test_codex_live_smoke.py \
  frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts \
  Makefile \
  docs/architecture/agent-runtime-platform.md \
  docs/runbooks/local-dev.md \
  docs/quality/testing.md \
  README.md
git commit -m "test: add agent runtime release verification"
```

## 4. 上线验收清单

- [x] 普通建模 Copilot 主链只显示 runtime 状态，不显示 runtime selector。
- [x] OpenAI-compatible runtime 未配置时，Copilot 给出可理解状态，不阻断非 AI 页面。
- [x] Codex app-server 只能通过后端 allowlist profile 启动，前端不能传任意命令。
- [x] Codex provider test、capabilities、start、stop、restart 全部写入 audit log。
- [x] Review / repair action 固定 `codex_app_server`，不可被请求体切到 OpenAI。
- [x] Runtime 输出只形成 proposal patch、review report 或 artifact，不直接发布 Cube / Ontology。
- [x] Artifact 下载需要 run owner 权限，过期 artifact 返回 404 或 410。
- [x] 数据资产第二 consumer 不引用语义建模私有对象。
- [x] `make test-platform-agent-runtime`、`make test-modeling-agent`、`make verify-docs`、`cd frontend && npm run build` 全部通过。
- [x] Codex live smoke 在本地 app-server 可用时通过；不可用时有明确阻断说明。

## 5. 工程原则检查

- KISS：继续保留一个平台内 runtime service，不拆独立 gateway 服务，不把普通用户暴露到 runtime 选择复杂度里。
- YAGNI：不做 marketplace、跨产品 quota、跨集群 runtime 编排；只做当前交付所需的 provider 管理、Codex lifecycle、artifact 权限和第二 consumer。
- SOLID：业务 Agent App 负责业务语义，runtime adapter 负责 provider 调用，management service 负责配置和生命周期，repository 负责持久化。
- DRY：OpenAI / Codex / 数据资产 / 语义建模共享同一 `AgentInferenceRuntimeRequest`、action binding、trace 和 artifact 查询面，避免每个模块重复造 adapter。

## 6. 执行策略

优先顺序：

1. 先完成 Task 0，把当前 MVP 固化为干净 baseline。
2. Task 1 和 Task 2 可并行，分别收配置审计与 Codex transport。
3. Task 3 是后续 Codex review/repair 的硬依赖。
4. Task 4 和 Task 5 完成后，建模 Copilot 才算具备可交付的 Codex 复审链路。
5. Task 6 和 Task 7 验证平台级产品入口与跨业务复用。
6. Task 8 统一做上线验收、文档和 release review。
