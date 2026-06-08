"""语义建设 Build Project 领域模型。"""
from __future__ import annotations

from datetime import datetime
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
    """字段候选审阅摘要；blocking 表示阻塞事项数，不是字段数。"""

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


class ModelingAssetPackage(BaseModel):
    """一次冷启动扫描生成的候选语义资产包。"""

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
    modeling_source: Dict[str, Any] = Field(default_factory=dict)
    ontology_suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    cube_suggestions: Dict[str, Any] = Field(default_factory=dict)
    field_candidates: List[FieldCandidate] = Field(default_factory=list)
    review_summary: FieldReviewSummary = Field(default_factory=FieldReviewSummary)
    proposal_revisions: List[ProposalRevision] = Field(default_factory=list)
    proposal_readiness: ProposalReadiness = Field(default_factory=ProposalReadiness)
    operation_history: List[Dict[str, Any]] = Field(default_factory=list)
    split_from_package_id: str | None = None
    merged_from_package_ids: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def touch(self) -> None:
        self.updated_at = _utc_now()


class ModelingBuildProject(BaseModel):
    """语义中心冷启动建设项目，不作为正式 Runtime 语义源。"""

    id: str
    name: str
    business_domain: str
    created_by: str | None = None
    target: BuildTarget = "semantic_center"
    status: BuildProjectStatus = "draft"
    scope: Dict[str, Any] = Field(default_factory=dict)
    asset_package_ids: List[str] = Field(default_factory=list)
    asset_package_count: int = 0
    risk_summary: Dict[str, int] = Field(
        default_factory=lambda: {"low": 0, "medium": 0, "high": 0}
    )
    created_at: str = Field(default_factory=lambda: _utc_now())
    updated_at: str = Field(default_factory=lambda: _utc_now())

    def touch(self) -> None:
        self.updated_at = _utc_now()


def normalize_build_project_id(value: str | None) -> str:
    """生成稳定的 Build Project id。

    这里保持轻量规则，先覆盖当前冷启动页面使用的中文业务域和英文批次名。
    """

    source = (value or "").strip()
    if not source:
        return "build-project"
    transliteration = {
        "学": "xue",
        "情": "qing",
        "分": "fen",
        "析": "xi",
    }
    slug = "".join(
        f"-{transliteration[ch]}-" if ch in transliteration else ch
        for ch in source
    ).replace("_", "-")
    slug = "-".join(part for part in slug.split() if part)
    slug = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in slug)
    slug = "-".join(part for part in slug.split("-") if part).lower()
    if not slug:
        return "build-project"
    return slug if slug.startswith("build-") else f"build-{slug}"


def create_asset_package_id(project_id: str, source: str, package_type: str) -> str:
    normalized_source = "".join(
        ch if ch.isalnum() else "-" for ch in source
    ).strip("-").lower()
    normalized_source = "-".join(part for part in normalized_source.split("-") if part)
    return f"{project_id}:{package_type}:{normalized_source}"


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
    package.review_summary.can_generate_proposal = (
        package.proposal_readiness.status == "ready"
    )
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


def _utc_now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"
