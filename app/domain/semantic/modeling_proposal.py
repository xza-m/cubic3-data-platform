"""建模助手 Proposal 领域模型。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


ProposalStatus = Literal[
    "created",
    "drafted",
    "validated",
    "approved",
    "applied",
    "published",
    "closed",
    "rejected",
    "blocked",
    "archived",
]


class ModelingProposal(BaseModel):
    """构建期建模提案，不作为正式 Runtime 语义源。"""

    id: str
    source_mode: Literal["human_led", "agent_led"] = "human_led"
    status: ProposalStatus = "created"
    close_reason: Optional[str] = None
    intent: Dict[str, Any] = Field(default_factory=dict)
    source_context: Dict[str, Any] = Field(default_factory=dict)
    spec: Dict[str, Any] = Field(default_factory=dict)
    drafts: Dict[str, Any] = Field(default_factory=dict)
    coverage_result: Dict[str, Any] = Field(default_factory=dict)
    semantic_diff: Dict[str, Any] = Field(default_factory=dict)
    validation_matrix: Dict[str, List[Dict[str, Any]]] = Field(
        default_factory=lambda: {"blockers": [], "warnings": [], "infos": []}
    )
    review_records: List[Dict[str, Any]] = Field(default_factory=list)
    publish_result: Dict[str, Any] = Field(default_factory=dict)
    runtime_consumption_result: Dict[str, Any] = Field(default_factory=dict)
    readiness_label: str = "Save Draft Only"
    approved_spec_hash: Optional[str] = None
    applied_spec_hash: Optional[str] = None
    last_transition_actor: Optional[str] = None
    last_transition_at: Optional[str] = None
    audit_snapshot: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def touch(self) -> None:
        self.updated_at = _utc_now()


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
