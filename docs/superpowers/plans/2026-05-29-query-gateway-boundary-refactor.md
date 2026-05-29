# Query Gateway Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本仓查询边界收敛为“数据源连接器 SPI + dw-query-gateway 正式执行面”，补齐规范治理与网关可观测入口，并从本项目完全下线 `query_execution` 执行面、API、worker、表结构和测试入口。

**Architecture:** `cubic3-data-platform` 只保留控制面、语义建模、治理编排、可视化监控 BFF 与异构数据源连接器 SPI；`dw-query-gateway` 是正式用户/Agent 发起、需要审计与治理的数仓查询执行面。本轮移除本仓 `query_execution`，不保留本地执行 fallback；查询工作台、SQL Lab、异构数据源探查继续走 DataSource Adapter SPI。

**Tech Stack:** Flask API、dependency-injector、SQLAlchemy/Alembic、pytest、OpenAPI contract checks、React/Vite/Vitest、dw-query-gateway HTTP API。

---

## 0. 边界原则与改造范围

本轮按以下职责边界执行，所有代码和文档不得再出现第二套口径。

- `cubic3-data-platform`
  - 负责语义中心、规范治理、访问决策、查询工作台、SQL Lab、异构数据源连接器 SPI、网关运行态基础监控 BFF。
  - 允许通过 `DataSourceAdapter.execute_query` 支撑交互式工作台、SQL Lab、预览、schema 探查和元数据同步。
  - 不负责正式数仓查询执行调度、查询结果落盘、查询执行 worker、网关级审计流水。
- `dw-query-gateway`
  - 负责正式、用户/Agent 发起、需要审计和治理的数仓查询执行。
  - 负责运行态原始指标采集、队列/执行/超时/拒绝/结果对象等查询事实。
- 本仓 `query_execution`
  - 删除 Flask blueprint、application/domain/infrastructure 层、worker、API contract、Makefile 目标、测试、前端入口和活跃文档描述。
  - 新增 Alembic forward migration，下线 `query_execution_jobs`、`query_execution_events`、`query_result_objects`。

原则检查：

- KISS：只保留一条正式执行链路，避免本仓与 gateway 双执行面并存。
- YAGNI：不为 `query_execution` 保留兼容 fallback；迁移期只保留数据库迁移和必要文档说明。
- SOLID：治理编排、gateway client、数据源连接器各自单一职责。
- DRY：AccessContext 构造逻辑集中到一个应用服务，避免 agent/query API 各自拼上下文。

## 1. 建立失败优先的边界保护测试

### 1.1 OpenAPI 不再暴露 `query-execution`

- [ ] 修改 [tests/integration/test_openapi_docs.py](../../../tests/integration/test_openapi_docs.py)，删除 `CONTRACT_REQUIRED_OPERATIONS` 中对 `/api/v1/query-execution/jobs` 和 `/api/v1/query-execution/jobs/{job_id}` 的期望。
- [ ] 在同文件新增断言，确保 OpenAPI 不再出现 `query-execution` 路径：

```python
def test_query_execution_api_is_not_exposed(openapi_spec):
    paths = openapi_spec["paths"]

    assert "/api/v1/query-execution/jobs" not in paths
    assert not any(path.startswith("/api/v1/query-execution/") for path in paths)
```

- [ ] 运行并确认先失败：

```bash
pytest tests/integration/test_openapi_docs.py -q
```

预期失败：当前仍注册 `app/interfaces/api/v1/query_execution.py`，OpenAPI 中存在 `query-execution` 路径。

### 1.2 查询工作台必须走 DataSource Adapter SPI，不走 gateway

- [ ] 新增 `tests/integration/query/test_query_console_datasource_spi_api.py`，覆盖 `/api/v1/queries/execute` 即使配置了 gateway token，也只调用 `ExecuteQueryHandler`。
- [ ] 测试使用最小 stub，避免真实数据源依赖：

```python
class _StubExecuteHandler:
    def __init__(self):
        self.commands = []

    def handle(self, command):
        self.commands.append(command)
        return {
            "columns": [{"name": "ok", "type": "int"}],
            "data": [{"ok": 1}],
            "row_count": 1,
            "execution_time_ms": 3,
            "status": "success",
        }


class _StubContainer:
    def __init__(self, handler):
        self._handler = handler

    def execute_query_handler(self):
        return self._handler
```

- [ ] 测试中 patch 掉 gateway client 构造，若被调用则失败：

```python
def test_query_console_execute_uses_datasource_adapter_spi(client, monkeypatch):
    handler = _StubExecuteHandler()
    monkeypatch.setattr(
        "app.interfaces.api.v1.queries.get_app_container",
        lambda: _StubContainer(handler),
    )
    monkeypatch.setattr(
        "app.interfaces.api.v1.queries.GatewayQueryClient",
        lambda *args, **kwargs: pytest.fail("query console must not call gateway"),
        raising=False,
    )

    response = client.post(
        "/api/v1/queries/execute",
        json={
            "source_id": "ds_maxcompute_dev",
            "sql_query": "select 1 as ok",
            "limit": 10,
            "principal_id": "developer",
        },
    )

    assert response.status_code == 200
    assert response.get_json()["data"][0]["ok"] == 1
    assert len(handler.commands) == 1
```

- [ ] 运行并确认先失败：

```bash
pytest tests/integration/query/test_query_console_datasource_spi_api.py -q
```

预期失败：当前 `/api/v1/queries/execute` 在 gateway token 存在时仍可能走 `_execute_via_gateway`。

### 1.3 Agent 语义执行必须走 gateway

- [ ] 新增 `tests/integration/access/test_agent_semantic_execute_gateway.py`，覆盖 `/api/v1/agent/semantic/execute`。
- [ ] 测试断言：
  - `allow` 决策会调用 gateway client。
  - `deny` 决策不会调用 gateway client，返回被治理拦截的结构化响应。
  - 响应体包含 `gateway_query_id` 或 `gateway_status_url`，不包含 `query_execution_job_id`。
- [ ] 运行并确认先失败：

```bash
pytest tests/integration/access/test_agent_semantic_execute_gateway.py -q
```

预期失败：当前 endpoint 依赖 `AgentSemanticExecuteService` 和 `QuerySubmissionService`。

### 1.4 前端不再展示“平台内置执行”

- [ ] 修改 [frontend/src/v2/pages/config/access/AccessIdentity.tsx](../../../frontend/src/v2/pages/config/access/AccessIdentity.tsx)，先提取可测试函数：

```ts
export function getCredentialModeOptions(currentMode?: string): string[] {
  const activeModes = ['gateway_binding', 'inline_policy_decision'];
  return currentMode === 'internal_query_execution'
    ? ['gateway_binding', 'inline_policy_decision', 'internal_query_execution']
    : activeModes;
}
```

- [ ] 新增或更新 Vitest，确保新建/编辑可选项不包含 `internal_query_execution`，历史记录只读展示为“已下线执行模式”。
- [ ] 运行并确认先失败：

```bash
cd frontend && npm run test -- AccessIdentity
```

预期失败：当前仍把 `internal_query_execution` 作为普通可选项。

## 2. 收敛查询工作台到 DataSource Adapter SPI

### 2.1 移除 `/api/v1/queries/execute` 的 gateway 分支

- [ ] 修改 [app/interfaces/api/v1/queries.py](../../../app/interfaces/api/v1/queries.py)，删除以下 gateway 专用逻辑：
  - `GatewayQueryClient` import。
  - `_gateway_query_enabled`。
  - `_gateway_query_client`。
  - `_request_principal`。
  - `_resource_refs_from_sql`。
  - `_compiled_targets_for_query`。
  - `_decision_id`。
  - `_gateway_access_context_from_decision`。
  - `_policy_denied_response`。
  - `_execute_via_gateway`。
- [ ] 保留并明确 `/api/v1/queries/execute` 的语义：查询工作台/SQL Lab 的交互式查询入口，走 `ExecuteQueryHandler`，由数据源连接器 SPI 执行。
- [ ] `execute_query` 保持如下核心结构：

```python
@queries_bp.route("/execute", methods=["POST"])
def execute_query() -> ResponseReturnValue:
    try:
        schema = ExecuteQueryRequest(**(request.get_json(silent=True) or {}))
    except ValidationError as error:
        return jsonify({"error": "Invalid request", "details": error.errors()}), 400

    container = get_app_container()
    handler = container.execute_query_handler()
    command = ExecuteQueryCommand(
        data_source_id=schema.source_id,
        query=schema.sql_query,
        parameters=schema.parameters or {},
        limit=schema.limit,
        timeout_seconds=schema.timeout_seconds,
        executed_by=schema.principal_id,
    )
    result = handler.handle(command)
    return jsonify(result), 200
```

- [ ] 删除旧的 `tests/integration/access/test_gateway_query_execution_api.py`。该文件不再验证 query console 走 gateway；对应 gateway 执行测试迁移到 Agent 语义执行测试。
- [ ] 运行：

```bash
pytest tests/integration/queries/test_query_console_datasource_spi_api.py tests/integration/access/test_agent_semantic_execute_gateway.py -q
```

预期结果：新测试通过；旧 gateway-query-console 测试已删除或改名为 Agent gateway 测试。

### 2.2 给 DataSource Adapter SPI 增加边界注释与文档锚点

- [ ] 在 [app/infrastructure/adapters/datasources/base_adapter.py](../../../app/infrastructure/adapters/datasources/base_adapter.py) 的 `DataSourceAdapter.execute_query` 附近补充中文注释：

```python
# 该 SPI 面向查询工作台、SQL Lab、元数据探查和预览，不承接正式受治理数仓查询。
# 正式用户/Agent 查询必须通过 dw-query-gateway。
```

- [ ] 更新 [docs/architecture/decisions/ADR-011-dw-query-gateway-execution-boundary.md](../../../docs/architecture/decisions/ADR-011-dw-query-gateway-execution-boundary.md)，确认 DataSource Adapter SPI 和 gateway 的责任边界与代码实现一致。

## 3. 开发规范治理共享能力

### 3.1 新增 Gateway AccessContext 构造器

- [ ] 新增 `app/application/governance/gateway_access_context.py`，集中构造传给 `dw-query-gateway` 的治理上下文。
- [ ] 实现以下函数：

```python
from __future__ import annotations

from typing import Any


def build_gateway_access_context(
    *,
    policy_decision: dict[str, Any],
    ticket_preview: dict[str, Any] | None = None,
    principal_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    permit = dict(policy_decision.get("execution_permit") or {})
    preview = dict(permit.get("access_context_preview") or {})
    ticket = dict(ticket_preview or policy_decision.get("ticket_preview") or {})
    principal = dict(principal_context or policy_decision.get("principal_context") or {})

    sql_hashes = (
        preview.get("sql_hashes")
        or ticket.get("sql_hashes")
        or policy_decision.get("sql_hashes")
        or []
    )

    return {
        "policy_decision_id": policy_decision.get("decision_id"),
        "policy_trace_id": policy_decision.get("trace_id"),
        "decision": policy_decision.get("decision"),
        "principal": principal,
        "resource_refs": preview.get("resource_refs") or ticket.get("resource_refs") or [],
        "compiled_targets": preview.get("compiled_targets") or ticket.get("compiled_targets") or [],
        "sql_hashes": list(sql_hashes),
        "ticket": {
            "id": ticket.get("id") or permit.get("ticket_id"),
            "expires_at": ticket.get("expires_at") or permit.get("expires_at"),
        },
    }
```

- [ ] 新增 `tests/unit/application/governance/test_gateway_access_context.py`，覆盖：
  - `execution_permit.access_context_preview` 优先级最高。
  - `ticket_preview` 可补齐资源、目标和 SQL hash。
  - principal 可由调用方覆盖。
- [ ] 运行并确认通过：

```bash
pytest tests/unit/application/governance/test_gateway_access_context.py -q
```

### 3.2 规范治理接口只输出控制面事实

- [ ] 检查 [app/interfaces/api/v1/governance.py](../../../app/interfaces/api/v1/governance.py)，保留：
  - 访问策略。
  - 身份绑定。
  - 执行 profile。
  - gateway telemetry summary/list 代理。
- [ ] 移除所有指向本仓 `query_execution` job/result 的治理字段、枚举或状态转换。
- [ ] 如响应 schema 中存在 `internal_query_execution`，仅用于历史记录展示，不作为可创建/可编辑模式。
- [ ] 增加测试，确保创建或更新执行 profile 时拒绝 `credential_mode=internal_query_execution`：

```bash
pytest tests/integration/access/test_access_identity_api.py -q
```

## 4. Agent 语义执行改走 dw-query-gateway

### 4.1 迁移请求 schema，切断 query_execution import

- [ ] 新增 `app/application/agent/semantic_execute_schema.py`：

```python
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentSemanticExecuteRequest(BaseModel):
    """POST /api/v1/agent/semantic/execute 请求体."""

    question: str = Field(..., min_length=1)
    principal_context: dict[str, Any] | None = None
    viewer_roles: list[str] | None = None
    runtime_options: dict[str, Any] | None = None
    idempotency_key: str | None = None
```

- [ ] 修改 [app/interfaces/api/v1/agent.py](../../../app/interfaces/api/v1/agent.py)，从新文件导入 `AgentSemanticExecuteRequest`。
- [ ] 运行并确认 import 不再依赖 `app.application.query_execution.schemas`：

```bash
rg -n "application\.query_execution\.schemas|AgentSemanticExecuteRequest" app tests
```

预期：`AgentSemanticExecuteRequest` 只来自 `app/application/agent/semantic_execute_schema.py`。

### 4.2 新增 Agent gateway 执行服务

- [ ] 新增 `app/application/agent/semantic_gateway_execute_service.py`，将语义规划和 gateway 提交串起来。
- [ ] 服务职责：
  - 调用现有语义规划/治理服务生成 query plan 和 policy decision。
  - 只接受 `decision=allow` 且包含可执行 SQL 的目标。
  - 使用 `build_gateway_access_context` 生成治理上下文。
  - 调用 `GatewayQueryClient.execute_sql` 提交正式查询。
  - 返回 gateway query id/status，不生成本仓 job。
- [ ] 服务核心结构：

```python
from __future__ import annotations

from typing import Any, Protocol

from app.application.governance.gateway_access_context import build_gateway_access_context


class GatewayQueryClientProtocol(Protocol):
    def execute_sql(
        self,
        *,
        sql: str,
        access_context: dict[str, Any],
        idempotency_key: str | None = None,
        wait_for_completion: bool = False,
        runtime_options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ...


class SemanticGatewayExecuteService:
    def __init__(self, *, plan_service: Any, gateway_client: GatewayQueryClientProtocol):
        self._plan_service = plan_service
        self._gateway_client = gateway_client

    def execute(
        self,
        *,
        question: str,
        principal_context: dict[str, Any] | None,
        viewer_roles: list[str] | None,
        runtime_options: dict[str, Any] | None,
        idempotency_key: str | None,
    ) -> dict[str, Any]:
        plan = self._plan_service.plan(
            question=question,
            principal_context=principal_context or {},
            viewer_roles=viewer_roles or [],
            runtime_options=runtime_options or {},
        )
        policy_decision = dict(plan.get("policy_decision") or {})

        if policy_decision.get("decision") != "allow":
            return {
                "status": "blocked",
                "decision": policy_decision.get("decision", "deny"),
                "policy_decision": policy_decision,
            }

        target = self._first_executable_target(plan)
        access_context = build_gateway_access_context(
            policy_decision=policy_decision,
            ticket_preview=plan.get("ticket_preview"),
            principal_context=principal_context,
        )
        gateway_result = self._gateway_client.execute_sql(
            sql=target["sql"],
            access_context=access_context,
            idempotency_key=idempotency_key,
            wait_for_completion=False,
            runtime_options=runtime_options or {},
        )

        return {
            "status": "submitted",
            "gateway": gateway_result,
            "gateway_query_id": gateway_result.get("query_id") or gateway_result.get("id"),
            "policy_decision": policy_decision,
        }

    @staticmethod
    def _first_executable_target(plan: dict[str, Any]) -> dict[str, Any]:
        for target in plan.get("compiled_targets") or []:
            sql = target.get("sql") or target.get("query_dsl", {}).get("sql")
            if sql:
                return {"sql": sql, "target": target}
        raise ValueError("semantic plan does not contain executable sql target")
```

- [ ] 若现有语义规划服务方法不是 `plan(...)`，新增轻量 adapter 类，不改动原规划服务公共契约。
- [ ] 新增 `tests/unit/application/agent/test_semantic_gateway_execute_service.py`，覆盖 allow、deny、missing SQL 三种路径。
- [ ] 运行：

```bash
pytest tests/unit/application/agent/test_semantic_gateway_execute_service.py -q
```

### 4.3 DI 与 API 切换到新服务

- [ ] 修改 [app/di/container.py](../../../app/di/container.py)：
  - 删除 `QuerySubmissionService`、`QueryResultService`、`QueryExecutionWorkerService`、`AgentSemanticExecuteService` 的 `query_execution` 依赖。
  - 新增 `GatewayQueryClient` provider。
  - 新增 `SemanticGatewayExecuteService` provider。
- [ ] `GatewayQueryClient` provider 使用现有配置项：
  - `QUERY_GATEWAY_BASE_URL`
  - `QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN`
  - `QUERY_GATEWAY_TIMEOUT_SECONDS`
- [ ] 修改 [app/interfaces/api/v1/agent.py](../../../app/interfaces/api/v1/agent.py)，从 container 获取新服务：

```python
service = get_app_container().semantic_gateway_execute_service()
result = service.execute(
    question=payload.question,
    principal_context=payload.principal_context,
    viewer_roles=payload.viewer_roles,
    runtime_options=payload.runtime_options,
    idempotency_key=payload.idempotency_key,
)
return jsonify(result), 202 if result.get("status") == "submitted" else 200
```

- [ ] gateway 未配置 token 时返回 `503`，错误信息明确为 `dw-query-gateway is not configured`。
- [ ] 运行：

```bash
pytest tests/integration/access/test_agent_semantic_execute_gateway.py tests/unit/application/agent/test_semantic_gateway_execute_service.py -q
```

## 5. 完全下线本仓 `query_execution`

### 5.1 删除执行面代码

- [ ] 删除以下目录和文件：

```bash
rm -rf app/application/query_execution
rm -rf app/domain/query_execution
rm -rf app/infrastructure/query_execution
rm -f app/interfaces/api/v1/query_execution.py
rm -f app/workers/query_execution_worker.py
```

- [ ] 修改 [app/__init__.py](../../../app/__init__.py)：
  - 删除 `query_execution_bp` import。
  - 删除 `app.register_blueprint(query_execution_bp, url_prefix="/api/v1/query-execution")`。
  - 删除 query execution ORM model import。
- [ ] 修改 [tests/conftest.py](../../../tests/conftest.py)，删除 query execution ORM model import 和 fixture 依赖。
- [ ] 修改 [app/interfaces/api/openapi_metadata.py](../../../app/interfaces/api/openapi_metadata.py)，删除 `query-execution` tags、operation metadata 和 required operation。
- [ ] 修改 [Makefile](../../../Makefile)，删除 `test-query-execution` 目标，并从 `verify-semantic` 或其他聚合目标中移除该依赖。
- [ ] 修改 [scripts/checks/agent_runtime_live_acceptance.py](../../../scripts/checks/agent_runtime_live_acceptance.py)，删除对 `QueryExecutionWorkerService`、`/api/v1/query-execution/*` 的 live acceptance 依赖；保留 agent runtime 自身 smoke。
- [ ] 删除 query execution 专项测试：

```bash
rm -rf tests/unit/application/query_execution
rm -rf tests/unit/domain/query_execution
rm -rf tests/unit/infrastructure/query_execution
rm -rf tests/integration/query_execution
```

- [ ] 检查无活跃代码引用：

```bash
rg -n "query_execution|query-execution|QueryExecution|test-query-execution" app tests scripts Makefile frontend
```

预期：无输出。若有 Alembic 历史迁移引用，不在该命令范围内处理。

### 5.2 数据库 forward migration 删除旧表

- [ ] 新增 `migrations/versions/0007_drop_query_execution_tables.py`：

```python
"""drop query execution tables

Revision ID: 0007_drop_query_execution_tables
Revises: 0006_add_access_governance
Create Date: 2026-05-29
"""

from __future__ import annotations

from alembic import op

revision = "0007_drop_query_execution_tables"
down_revision = "0006_add_access_governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("query_result_objects")
    op.drop_table("query_execution_events")
    op.drop_table("query_execution_jobs")


def downgrade() -> None:
    raise RuntimeError("query_execution tables are retired and cannot be recreated by downgrade")
```

- [ ] 若当前 head 不是 `0006_add_access_governance`，以 `alembic heads` 结果调整 `down_revision`，保持单 head。
- [ ] 修改 [scripts/checks/semantic_alembic_baseline.py](../../../scripts/checks/semantic_alembic_baseline.py)，从最终基线表集合中移除 `query_execution_jobs`、`query_execution_events`、`query_result_objects`。
- [ ] 如 [tests/unit/scripts/test_alembic_initial_schema_contract.py](../../../tests/unit/scripts/test_alembic_initial_schema_contract.py) 静态断言 `0001_initial_schema.py` 中包含 query execution 表，移除该断言；不回写历史初始迁移。
- [ ] 运行：

```bash
alembic heads
pytest tests/unit/scripts/test_alembic_initial_schema_contract.py -q
python scripts/checks/semantic_alembic_baseline.py
```

### 5.3 删除前端旧执行模式入口

- [ ] 修改 [frontend/src/v2/pages/config/access/AccessIdentity.tsx](../../../frontend/src/v2/pages/config/access/AccessIdentity.tsx)：
  - 新建/编辑 execution profile 时不提供 `internal_query_execution`。
  - 历史 profile 如果仍是该模式，展示“已下线执行模式”，禁用保存，提示迁移到 `gateway_binding`。
  - 保留 `gateway_binding` 和 `inline_policy_decision`。
- [ ] 搜索并处理前端其他引用：

```bash
rg -n "internal_query_execution|平台内置执行|query_execution|query-execution" frontend/src
```

- [ ] 运行：

```bash
cd frontend && npm run typecheck && npm run test -- AccessIdentity
```

## 6. 完善 gateway 运行态可观测

### 6.1 BFF 统一网关 telemetry 响应

- [ ] 修改 [app/infrastructure/gateway/telemetry_client.py](../../../app/infrastructure/gateway/telemetry_client.py)，将 gateway 原始响应规范化为控制面展示模型，至少包含：
  - `queued_count`
  - `running_count`
  - `pending_count`
  - `avg_queue_wait_ms`
  - `max_current_queue_wait_ms`
  - `avg_execute_ms`
  - `remote_timeout_count`
  - `client_wait_timeout_count`
  - `timeout_count`
  - `rejected_count`
  - `result_object_count`
  - `spool_object_count`
  - `generated_at`
- [ ] 修改 [app/interfaces/api/v1/governance.py](../../../app/interfaces/api/v1/governance.py) 的 `/api/v1/governance/gateway/summary`，只做 BFF 代理和字段规整，不自行计算执行事实。
- [ ] 新增或更新测试：

```bash
pytest tests/unit/infrastructure/gateway/test_telemetry_client.py tests/integration/access/test_gateway_observability_api.py -q
```

### 6.2 前端治理页展示基础运行态监控

- [ ] 在访问治理或 gateway 配置页面新增“Gateway 运行态”区域，使用已有 `/api/v1/governance/gateway/summary`。
- [ ] 展示以下卡片或表格字段：
  - 排队中、运行中、等待中。
  - 平均排队等待、当前最大等待、平均执行耗时。
  - 远端超时、客户端等待超时、总超时、拒绝数。
  - 结果对象与 spool 对象数量。
- [ ] UI 文案明确该页面是运行态基础监控，不是执行面本身。
- [ ] 运行：

```bash
cd frontend && npm run typecheck && npm run test -- gateway
```

## 7. OpenSpec 与项目文档同步

### 7.1 OpenSpec 清理

- [ ] 检查 [openspec/changes/integrate-gateway-query-execution/proposal.md](../../../openspec/changes/integrate-gateway-query-execution/proposal.md)、[openspec/changes/integrate-gateway-query-execution/design.md](../../../openspec/changes/integrate-gateway-query-execution/design.md) 和 [openspec/changes/integrate-gateway-query-execution/tasks.md](../../../openspec/changes/integrate-gateway-query-execution/tasks.md)，将 active proposal 改为“gateway 边界收敛与 query_execution 下线”或归档到 superseded 状态。
- [ ] 确保 OpenSpec 中不再把本仓 `query_execution` 描述为目标态执行面。
- [ ] 运行：

```bash
openspec validate integrate-gateway-query-execution --strict
```

若本机没有 `openspec` 命令，记录为未运行，并用 `rg` 做文本级兜底：

```bash
rg -n "query_execution|query-execution|internal_query_execution|平台内置执行" openspec
```

### 7.2 基线文档更新

- [ ] 更新 [README.md](../../../README.md)，查询能力描述改为：
  - 查询工作台/SQL Lab：DataSource Adapter SPI。
  - 正式受治理数仓查询：dw-query-gateway。
  - 本仓不再内置 `query_execution`。
- [ ] 更新 [docs/TECH_STACK_AND_ARCHITECTURE.md](../../../docs/TECH_STACK_AND_ARCHITECTURE.md)，删除 `query_execution` worker 和表结构描述。
- [ ] 更新 [docs/architecture/README.md](../../../docs/architecture/README.md)，把 ADR-011 标为当前边界基线。
- [ ] 更新 [docs/DOC_ALIGNMENT_REPORT.md](../../../docs/DOC_ALIGNMENT_REPORT.md)，确认 ADR-011、Tech Stack、README 已对齐。
- [ ] 更新 [docs/quality/testing.md](../../../docs/quality/testing.md)，删除 `make test-query-execution`，增加 gateway boundary 验证入口。
- [ ] 更新 [docs/semantic_verification.md](../../../docs/semantic_verification.md)，语义执行验收改为 gateway 提交，不再验证本仓 job。
- [ ] 更新 [docs/QUICK_START.md](../../../docs/QUICK_START.md)、[docs/STARTUP_GUIDE.md](../../../docs/STARTUP_GUIDE.md)、[docs/runbooks/local-dev.md](../../../docs/runbooks/local-dev.md)，删除 query execution worker 启动说明。
- [ ] 运行：

```bash
make verify-docs
```

## 8. 回归验证矩阵

- [ ] 静态引用检查：

```bash
rg -n "query_execution|query-execution|QueryExecution|test-query-execution" app tests scripts Makefile frontend
```

预期：无输出。

- [ ] Python 单元与集成专项：

```bash
pytest tests/unit/application/governance/test_gateway_access_context.py \
  tests/unit/application/agent/test_semantic_gateway_execute_service.py \
  tests/unit/infrastructure/gateway/test_telemetry_client.py \
  tests/integration/query/test_query_console_datasource_spi_api.py \
  tests/integration/access/test_agent_semantic_execute_gateway.py \
  tests/integration/access/test_gateway_observability_api.py \
  tests/integration/test_openapi_docs.py -q
```

- [ ] Alembic 与 schema baseline：

```bash
alembic heads
python scripts/checks/semantic_alembic_baseline.py
```

- [ ] 前端类型和测试：

```bash
cd frontend && npm run typecheck && npm run test -- AccessIdentity gateway
```

- [ ] 仓库级变更验证：

```bash
make verify-changed
```

- [ ] 如果变更跨越 API、前端、数据库迁移和文档，最终运行：

```bash
make verify
```

## 9. Commit 拆分建议

- [ ] Commit 1：测试先行，新增边界保护测试与 OpenAPI 断言。
- [ ] Commit 2：查询工作台收敛到 DataSource Adapter SPI。
- [ ] Commit 3：规范治理 AccessContext 与 Agent gateway 执行服务。
- [ ] Commit 4：删除 `query_execution` 代码、API、worker、Makefile 目标和测试。
- [ ] Commit 5：Alembic forward migration 与 schema baseline。
- [ ] Commit 6：gateway 可观测 BFF 与前端运行态监控。
- [ ] Commit 7：OpenSpec 与基线文档同步。

每个 commit 前执行对应 task 的最小验证命令；最终 commit 前执行第 8 节验证矩阵。

## 10. 自检清单

- [ ] `/api/v1/query-execution/*` 不再出现在 Flask route 和 OpenAPI。
- [ ] `app/application/query_execution`、`app/domain/query_execution`、`app/infrastructure/query_execution` 已删除。
- [ ] 本仓没有 `QueryExecutionWorkerService`、`QuerySubmissionService`、`QueryResultService` 的活跃引用。
- [ ] `/api/v1/queries/execute` 只服务查询工作台/SQL Lab，走数据源连接器 SPI。
- [ ] `/api/v1/agent/semantic/execute` 走 dw-query-gateway，返回 gateway query id/status。
- [ ] 前端不再允许新建 `internal_query_execution` profile。
- [ ] gateway 运行态基础监控在本仓展示，但原始执行事实仍来自 dw-query-gateway。
- [ ] 文档明确 DataSource Adapter SPI 与 dw-query-gateway 的职责边界。
- [ ] 所有无法运行的验证命令都有原因、风险和替代证据。

## 11. 执行方式

该计划适合按 task-by-task 方式执行。推荐使用 `superpowers:subagent-driven-development` 并行处理“后端边界测试与删除”“治理/gateway 服务”“前端与文档”三组互不重叠任务；如果单 agent 执行，则使用 `superpowers:executing-plans` 按章节顺序推进，并在每个任务完成后更新 checkbox。
