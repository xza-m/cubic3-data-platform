from __future__ import annotations

import pytest

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


def test_asset_package_accepts_review_lifecycle_statuses():
    for status in (
        "ready_for_review",
        "needs_scope",
        "high_risk",
        "duplicate_candidate",
        "deferred",
        "in_review",
        "published",
    ):
        package = ModelingAssetPackage(
            id=f"build-learning:fact:{status}",
            project_id="build-learning",
            title="候选资产",
            package_type="fact",
            source="dwd_learning_activity_df",
            grain="一条学习行为事件",
            status=status,
        )
        assert package.status == status


def test_sql_build_project_repository_round_trip(db_session):
    from app.infrastructure.semantic.sql_modeling_build_project_repository import (
        SqlModelingBuildProjectRepository,
    )

    repo = SqlModelingBuildProjectRepository(db_session)
    project = ModelingBuildProject(
        id="build-learning",
        name="学情分析",
        business_domain="学情分析",
        created_by="alice",
    )
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

    loaded_project = repo.get_project("build-learning")
    assert loaded_project is not None
    assert loaded_project.name == "学情分析"
    assert repo.list_projects("alice")[0].id == "build-learning"
    loaded_package = repo.get_package(package.id)
    assert loaded_package is not None
    assert loaded_package.title == "学情分析事实主题候选"
    assert repo.list_packages("build-learning")[0].source == "dwd_learning_activity_df"


def test_sql_build_project_repository_scan_result_rolls_back_failed_batch(
    db_session,
    monkeypatch,
):
    from app.infrastructure.semantic.sql_modeling_build_project_repository import (
        SqlModelingBuildProjectRepository,
    )

    repo = SqlModelingBuildProjectRepository(db_session)
    project = ModelingBuildProject(
        id="build-learning-atomic",
        name="学情分析",
        business_domain="学情分析",
        created_by="alice",
    )
    repo.save_project(project)
    packages = [
        ModelingAssetPackage(
            id="build-learning-atomic:fact:dwd-learning-activity-df",
            project_id="build-learning-atomic",
            title="学情分析事实主题候选",
            package_type="fact",
            source="dwd_learning_activity_df",
            grain="一条学习行为事件",
        ),
        ModelingAssetPackage(
            id="build-learning-atomic:dimension:dim-school-df",
            project_id="build-learning-atomic",
            title="学情分析学校维度候选",
            package_type="dimension",
            source="dim_school_df",
            grain="一所学校",
        ),
    ]

    original = repo._upsert_package_row
    calls = 0

    def fail_on_second_package(package):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("package write failed")
        return original(package)

    monkeypatch.setattr(repo, "_upsert_package_row", fail_on_second_package)

    with pytest.raises(RuntimeError, match="package write failed"):
        repo.save_scan_result(project, packages)

    assert repo.list_packages("build-learning-atomic") == []


class InMemoryBuildProjectRepository:
    def __init__(self):
        self.projects = {}
        self.packages = {}
        self.scan_commits = 0
        self.save_package_calls = 0

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
        self.save_package_calls += 1
        self.packages[package.id] = package

    def save_scan_result(self, project, packages):
        self.scan_commits += 1
        for package in packages:
            self.packages[package.id] = package
        self.projects[project.id] = project


def test_build_project_service_creates_project_and_scan_queue():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

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


def test_build_project_service_updates_candidate_status():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]

    updated = service.update_asset_package(
        project["id"],
        package_id,
        {"status": "in_review", "risk": "high", "evidence": ["业务 owner 已确认优先审阅。"]},
        principal_id="alice",
    )

    assert updated["status"] == "in_review"
    assert updated["risk"] == "high"
    assert updated["target"] == "semantic_center"
    assert service.get_project(project["id"], principal_id="alice")["risk_summary"]["high"] == 1


def test_build_project_service_update_refreshes_proposal_readiness():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )
    from app.domain.semantic.modeling_build_project import FieldCandidate, refresh_package_review_state

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    package = repo.get_package(package_id)
    package.field_candidates = [
        FieldCandidate(
            id="field_student_id",
            field="student_id",
            label="学生",
            role="dimension",
            cube_binding={"kind": "dimension", "name": "student_id"},
            ontology_binding={"kind": "property", "object": "student", "name": "student_id"},
            risk="low",
            action="accepted",
        )
    ]
    package.ontology_suggestions = []
    repo.save_package(refresh_package_review_state(package))

    assert repo.get_package(package_id).proposal_readiness.status == "blocked"

    updated = service.update_asset_package(
        project["id"],
        package_id,
        {
            "ontology_suggestions": [
                {"type": "object", "name": "learning_activity", "title": "学习行为"}
            ]
        },
        principal_id="alice",
    )

    assert updated["proposal_readiness"]["status"] == "ready"
    assert updated["review_summary"]["can_generate_proposal"] is True


def test_build_project_service_rejects_cross_user_access():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")

    with pytest.raises(PermissionError, match="无权访问语义建设项目"):
        service.get_project(project["id"], principal_id="bob")


def test_build_project_service_does_not_overwrite_duplicate_project_owner():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    first = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )
    same_owner = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )

    assert same_owner["id"] == first["id"]
    assert repo.get_project(first["id"]).created_by == "alice"

    with pytest.raises(PermissionError, match="Build Project ID 已被其他用户占用"):
        service.create_project(
            {"name": "学情分析", "business_domain": "其他域"},
            principal_id="bob",
        )
    assert repo.get_project(first["id"]).created_by == "alice"
    assert repo.get_project(first["id"]).business_domain == "学情分析"


def test_build_project_service_scan_uses_single_repository_write():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )

    service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")

    assert repo.scan_commits == 1
    assert repo.get_project(project["id"]).asset_package_count == 3


def test_build_project_service_repeated_scan_preserves_reviewed_package_fields():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    service.update_asset_package(
        project["id"],
        package_id,
        {
            "status": "in_review",
            "risk": "high",
            "evidence": ["业务 owner 已确认优先审阅。"],
            "ontology_suggestions": [{"type": "object", "name": "reviewed"}],
        },
        principal_id="alice",
    )

    rescanned = service.scan_project(
        project["id"],
        {"strategy": "exploratory"},
        principal_id="alice",
    )
    reviewed = next(item for item in rescanned["asset_packages"] if item["id"] == package_id)

    assert reviewed["status"] == "in_review"
    assert reviewed["risk"] == "high"
    assert reviewed["evidence"] == ["业务 owner 已确认优先审阅。"]
    assert reviewed["ontology_suggestions"] == [{"type": "object", "name": "reviewed"}]


def test_build_project_service_scan_after_regenerate_accepts_new_material_and_keeps_history():
    from app.application.semantic.modeling_build_project_service import (
        ModelingBuildProjectService,
    )

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {"name": "学情分析", "business_domain": "学情分析"},
        principal_id="alice",
    )
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    created_at = repo.get_package(package_id).created_at

    service.apply_asset_package_action(
        project["id"],
        package_id,
        {"action": "regenerate", "reason": "证据过期"},
        principal_id="alice",
    )
    rescanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package = next(item for item in rescanned["asset_packages"] if item["id"] == package_id)

    assert package["evidence"][0] == "表画像显示行为时间、学生、课程和学校字段完整。"
    assert package["status"] == "ready_for_review"
    assert package["risk"] == "low"
    assert package["operation_history"][-1]["action"] == "regenerate"
    assert package["created_at"] == created_at


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
        build_proposal_readiness,
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


def test_refresh_package_review_state_aligns_summary_with_readiness_blockers():
    from app.domain.semantic.modeling_build_project import (
        FieldCandidate,
        ModelingAssetPackage,
        refresh_package_review_state,
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
                risk="medium",
                action="accepted",
                evidence=["指标口径来自历史查询。"],
            ),
        ],
    )

    refresh_package_review_state(package)

    assert package.proposal_readiness.status == "blocked"
    assert "primary_business_object_missing" in package.proposal_readiness.blocking_reasons
    assert package.review_summary.can_generate_proposal is False


def test_review_summary_blocking_counts_blocking_items_not_fields():
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
                id="field_duration",
                field="duration_sec",
                label="学习时长",
                role="measure",
                risk="medium",
                action="accepted",
                evidence=["指标口径来自历史查询。"],
            ),
        ],
    )

    summary = build_review_summary(package)

    assert summary.blocking == 2
    assert summary.blocking_reasons == ["cube_binding_missing", "ontology_binding_missing"]


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


def test_build_project_scan_falls_back_to_manual_source_when_selected_sources_empty():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project(
        {
            "name": "手动源表建设",
            "business_domain": "手动源表",
            "scope": {
                "recommendation_empty": True,
                "manual_selected_source": "ods_manual_fact_df",
            },
        },
        principal_id="alice",
    )

    scanned = service.scan_project(project["id"], {}, principal_id="alice")

    assert scanned["asset_package_count"] == 1
    assert scanned["asset_packages"][0]["source"] == "ods_manual_fact_df"


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


def test_build_project_service_regenerate_refreshes_project_risk_summary():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    service.update_asset_package(
        project["id"],
        package_id,
        {"risk": "high", "status": "in_review"},
        principal_id="alice",
    )

    high_risk_project = service.get_project(project["id"], principal_id="alice")
    assert high_risk_project["risk_summary"] == {"low": 1, "medium": 1, "high": 1}

    regenerated = service.apply_asset_package_action(
        project["id"],
        package_id,
        {"action": "regenerate", "reason": "重新扫描候选证据"},
        principal_id="alice",
    )
    persisted_project = repo.get_project(project["id"])

    assert regenerated["risk"] == "medium"
    assert persisted_project.risk_summary["high"] == 0
    assert persisted_project.risk_summary["medium"] == 2
    refreshed_project = service.get_project(project["id"], principal_id="alice")
    assert refreshed_project["risk_summary"]["high"] == 0
    assert refreshed_project["risk_summary"]["medium"] == 2


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


def test_build_project_service_split_package_ids_include_moved_fields():
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
        FieldCandidate(id="score", field="score", label="得分", role="measure", risk="medium"),
    ]
    repo.save_package(package)

    duration_split = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": ["duration_sec"],
            "package_type": "metric",
            "reason": "学习时长独立审阅",
        },
        principal_id="alice",
    )
    score_split = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": ["score"],
            "package_type": "metric",
            "reason": "得分独立审阅",
        },
        principal_id="alice",
    )
    created_ids = {
        duration_split["created_package"]["id"],
        score_split["created_package"]["id"],
    }

    assert len(created_ids) == 2
    assert all(repo.get_package(package_id) is not None for package_id in created_ids)


def test_build_project_service_split_package_ids_use_stable_hash_for_collisions_and_length():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService
    from app.domain.semantic.modeling_build_project import FieldCandidate

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]
    long_field_id = "very_long_metric_" + "x" * 180
    package = repo.get_package(package_id)
    package.field_candidates = [
        FieldCandidate(id="a_b", field="a_b", label="下划线字段", role="measure", risk="medium"),
        FieldCandidate(id="a-b", field="a-b", label="横线字段", role="measure", risk="medium"),
        FieldCandidate(id=long_field_id, field=long_field_id, label="长字段", role="measure", risk="medium"),
    ]
    repo.save_package(package)

    underscore_split = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": ["a_b"],
            "package_type": "metric",
            "reason": "归一化碰撞验证",
        },
        principal_id="alice",
    )
    hyphen_split = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": ["a-b"],
            "package_type": "metric",
            "reason": "归一化碰撞验证",
        },
        principal_id="alice",
    )
    long_split = service.apply_asset_package_action(
        project["id"],
        package_id,
        {
            "action": "split",
            "field_candidate_ids": [long_field_id],
            "package_type": "metric",
            "reason": "长字段验证",
        },
        principal_id="alice",
    )

    collision_ids = {
        underscore_split["created_package"]["id"],
        hyphen_split["created_package"]["id"],
    }
    assert len(collision_ids) == 2
    assert all(repo.get_package(package_id) is not None for package_id in collision_ids)
    assert len(long_split["created_package"]["id"]) < 160


def test_build_project_service_split_and_merge_use_scan_result_batch_write():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService
    from app.domain.semantic.modeling_build_project import FieldCandidate

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    source_id = scanned["asset_packages"][0]["id"]
    target_id = scanned["asset_packages"][1]["id"]
    source = repo.get_package(source_id)
    source.field_candidates = [
        FieldCandidate(id="duration_sec", field="duration_sec", label="学习时长", role="measure", risk="medium"),
        FieldCandidate(id="score", field="score", label="得分", role="measure", risk="medium"),
    ]
    repo.save_package(source)

    save_calls_before_split = repo.save_package_calls
    scan_commits_before_split = repo.scan_commits
    service.apply_asset_package_action(
        project["id"],
        source_id,
        {
            "action": "split",
            "field_candidate_ids": ["duration_sec"],
            "package_type": "metric",
            "reason": "指标组独立审阅",
        },
        principal_id="alice",
    )

    assert repo.save_package_calls == save_calls_before_split
    assert repo.scan_commits == scan_commits_before_split + 1

    save_calls_before_merge = repo.save_package_calls
    scan_commits_before_merge = repo.scan_commits
    service.apply_asset_package_action(
        project["id"],
        source_id,
        {
            "action": "merge",
            "target_package_id": target_id,
            "reason": "候选重复",
        },
        principal_id="alice",
    )

    assert repo.save_package_calls == save_calls_before_merge
    assert repo.scan_commits == scan_commits_before_merge + 1


def test_build_project_service_rejects_self_merge_package_action():
    from app.application.semantic.modeling_build_project_service import ModelingBuildProjectService

    repo = InMemoryBuildProjectRepository()
    service = ModelingBuildProjectService(repo)
    project = service.create_project({"name": "学情分析", "business_domain": "学情分析"}, principal_id="alice")
    scanned = service.scan_project(project["id"], {"strategy": "balanced"}, principal_id="alice")
    package_id = scanned["asset_packages"][0]["id"]

    with pytest.raises(ValueError, match="目标不能是当前包"):
        service.apply_asset_package_action(
            project["id"],
            package_id,
            {"action": "merge", "target_package_id": package_id},
            principal_id="alice",
        )


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
