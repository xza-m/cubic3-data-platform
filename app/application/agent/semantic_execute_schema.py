"""Agent 语义执行请求 schema。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AgentSemanticExecuteRequest(BaseModel):
    """POST /api/v1/agent/semantic/execute 请求体。"""

    question: str = Field(..., min_length=1)
    principal_context: dict[str, Any] | None = None
    viewer_roles: list[str] | None = None
    runtime_options: dict[str, Any] | None = None
    idempotency_key: str | None = None
