"""数据资产底座的 Agent Runtime consumer。"""
from __future__ import annotations

from typing import Any, Protocol

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    AssetRevisionRef,
    RuntimeContextRef,
    RuntimePolicy,
)


class _AgentRuntime(Protocol):
    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        ...


class DataAssetAgentApp:
    """把数据资产上下文转换为平台 Agent Runtime 请求。"""

    def __init__(self, *, runtime_service: _AgentRuntime):
        self._runtime_service = runtime_service

    def infer_field_semantics(
        self,
        *,
        table_id: str,
        fields: list[dict[str, Any]],
        principal_id: str | None,
    ) -> dict[str, Any]:
        normalized_table_id = str(table_id or "").strip()
        request = AgentInferenceRuntimeRequest(
            app_id="data_assets",
            action="asset.field.infer_semantics",
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=f"asset_table_{normalized_table_id}",
                thread_id=f"asset_table_{normalized_table_id}",
                turn_id="infer_field_semantics",
            ),
            principal_id=principal_id,
            input={"table_id": normalized_table_id, "fields": fields},
            context_pack={"table_id": normalized_table_id, "fields": fields},
            output_schema="asset.field.infer_semantics.output.v1",
            runtime_policy=RuntimePolicy(max_runtime_seconds=60),
            preferred_runtime="openai_compatible",
            execution_mode="sync",
            semantic_runtime_pin=None,
            asset_revision_refs=[
                AssetRevisionRef(
                    asset_id=normalized_table_id,
                    revision_id="latest",
                    asset_type="data_asset_table",
                    asset_key=f"data_asset_table:{normalized_table_id}",
                )
            ],
        )
        return self._runtime_service.invoke(request).structured_output
