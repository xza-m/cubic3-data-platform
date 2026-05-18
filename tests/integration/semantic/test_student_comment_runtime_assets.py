from __future__ import annotations

from pathlib import Path

import pytest

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_property_repository import YamlBusinessPropertyRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


@pytest.mark.redesign
def test_student_comment_official_runtime_assets_are_consumable():
    root = Path("app/infrastructure")
    cube_repo = YamlCubeRepository(str(root / "semantic/cubes"))
    object_repo = YamlBusinessObjectRepository(str(root / "ontology/objects"))
    property_repo = YamlBusinessPropertyRepository(str(root / "ontology/properties"))
    metric_repo = YamlBusinessMetricRepository(str(root / "ontology/metrics"))
    glossary_repo = YamlGlossaryRepository(str(root / "ontology/glossary"))
    policy_repo = YamlPolicyMetadataRepository(str(root / "ontology/policies"))
    relation_repo = YamlBusinessRelationRepository(str(root / "ontology/relations"))
    action_repo = YamlBusinessActionRepository(str(root / "ontology/actions"))
    policy_guard = PolicyGuardService(policy_repository=policy_repo)
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=policy_guard,
    )
    router = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        policy_guard_service=policy_guard,
    )

    cube = cube_repo.get("dwd_interaction_comment_reports_df")
    assert cube is not None
    assert cube.status == "active"
    assert "total_count" in cube.measures

    obj = object_repo.get("student_comment")
    metric = metric_repo.get("student_comment_total_count")
    assert obj is not None and obj.status == "active"
    assert metric is not None and metric.status == "active"
    assert metric.measure_refs == ["dwd_interaction_comment_reports_df.total_count"]

    properties = [item for item in property_repo.list_all() if item.object_name == "student_comment"]
    assert properties
    assert all(item.status == "active" for item in properties)
    assert {
        item.name.removeprefix("student_comment_")
        for item in properties
    }.issubset(set(cube.dimensions))

    metric_links = mapper.metric_links("student_comment_total_count")
    assert metric_links["consistency"]["status"] == "ok"
    assert metric_links["linked_measures"][0]["status"] == "linked"

    blocked_plan = router.plan(
        question="查询最近7天学生评论总数，按学校汇总",
        runtime_mode="official",
        viewer_roles=["viewer"],
    )
    assert blocked_plan["route"]["route_type"] == "hybrid"
    assert blocked_plan["route"]["execution_preview"]["status"] == "blocked"
    assert blocked_plan["route"]["execution_preview"]["reason"] == "当前目标受限，需要匹配授权角色后才能访问"

    allowed_plan = router.plan(
        question="查询最近7天学生评论总数，按学校汇总",
        runtime_mode="official",
        viewer_roles=["ops_readonly"],
    )
    assert allowed_plan["route"]["route_type"] == "hybrid"
    assert "cube" in allowed_plan["route"]["targets"]
    assert allowed_plan["projection_result"]["binding_status"] == "linked"
    assert allowed_plan["resolved_bindings"][0]["measure_ref"] == "dwd_interaction_comment_reports_df.total_count"
    execution_preview = allowed_plan["route"]["execution_preview"]
    assert execution_preview["status"] == "ready"
    assert execution_preview["bindings"]["cube_name"] == "dwd_interaction_comment_reports_df"
    assert "COUNT(`report_id`) AS `dwd_interaction_comment_reports_df__total_count`" in execution_preview["logical_sql"]
    assert "`comment_school_name` AS `dwd_interaction_comment_reports_df__comment_school_name`" in execution_preview["logical_sql"]
    assert "`comment_published_at` >= '" in execution_preview["logical_sql"]
    assert "`comment_published_at` <= '" in execution_preview["logical_sql"]
    assert "GROUP BY `dwd_interaction_comment_reports_df__comment_school_name`" in execution_preview["logical_sql"]
    assert "`dwd_interaction_comment_reports_df__comment_published_at`" not in execution_preview["logical_sql"]
