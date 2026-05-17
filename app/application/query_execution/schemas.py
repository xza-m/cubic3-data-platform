from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SubmitQueryExecutionRequest(BaseModel):
    """POST /api/v1/query-execution/jobs 请求体。"""

    source_id: int = Field(..., ge=1)
    sql_query: str = Field(..., min_length=1)
    route_type: str = Field("manual_sql")
    semantic_plan_id: str | None = None
    resource_set: Any = Field(default_factory=list)
    sql_hash: str | None = None
    data_level: str = Field("M1")
    project_name: str | None = None
    governance_snapshot: dict[str, Any] | None = None
    idempotency_key: str | None = None
    result_mode: str = Field("preview")


class AgentSemanticExecuteRequest(BaseModel):
    """POST /api/v1/agent/semantic/execute 请求体。"""

    question: str = Field(..., min_length=1)
    principal_context: dict[str, Any] | None = None
    viewer_roles: list[str] | None = None
    runtime_options: dict[str, Any] | None = None
    idempotency_key: str | None = None
