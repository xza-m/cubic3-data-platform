from __future__ import annotations

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.domain.ontology.entities import BusinessMetric
from app.domain.semantic.entities import CubeDefinition, DimensionDef, MeasureDef
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


def test_compile_metric_blocks_stale_measure_ref_with_standard_target_shape(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["missing.gmv"],
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview("gmv")

    assert preview["status"] == "blocked"
    assert preview["logical_sql"] is None
    assert preview["sql_hash"] is None
    assert preview["bindings"]["measure_ref"] == "missing.gmv"
    assert preview["resource_set"]["logical"]["metrics"] == ["gmv"]
    assert preview["ticket_material"]["target_type"] == "sql"


def test_compile_metric_blocks_non_active_cube(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            status="draft",
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id")},
            measures={"gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount")},
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview("gmv")

    assert preview["status"] == "blocked"
    assert "不能进入默认查询链路" in preview["reason"]
    assert preview["bindings"]["cube_status"] == "draft"
    assert preview["resource_set"]["logical"]["cubes"] == ["orders"]
    assert preview["execution_request"] is None
