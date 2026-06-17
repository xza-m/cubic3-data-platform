"""语义层管理 REST API。

原 1292 行单文件 blueprint 已按工作域拆分：
- `cubes.py`：Cube 建模、字段候选、指标 dry-run
- `domains.py`：Catalog / Domain / 发布与发布历史
- `views.py`：View / 物化 / Recipe
- `runtime.py`：健康检查、DSL 编译查询、关系图、文件、治理、schema-sync、诊断
- `_context.py`：服务装配（生产走 DI 容器，fallback 仅供测试 bootstrap）
"""
from flask import Blueprint

from ._shared import (  # noqa: F401 — 保持原模块级符号可导入（含单测引用）
    logger,
    _json_scalar,
    _extract_view_cube_name,
    _default_query_adapter_getter,
    _semantic_base,
)
from ._context import build_semantic_context
from .cubes import register_cube_routes
from .domains import register_domain_routes
from .views import register_view_routes
from .runtime import register_runtime_routes


def create_semantic_blueprint(
    semantic_service,
    dataset_repo,
    dataset_handler,
    publish_service=None,
    registry_repo=None,
    modeling_service=None,
    modeling_source_service=None,
    domain_modeling_service=None,
    domain_canvas_service=None,
    query_adapter_getter=None,
    view_materialize_service=None,
    cube_listing_service=None,
    runtime_snapshot_service=None,
    mapper_service=None,
    field_candidate_service=None,
):
    """Blueprint 工厂：依赖在初始化时注入，便于单元测试时传入 Mock。"""
    bp = Blueprint('semantic', __name__, url_prefix='/api/v1/semantic')
    ctx = build_semantic_context(
        semantic_service=semantic_service,
        dataset_repo=dataset_repo,
        dataset_handler=dataset_handler,
        publish_service=publish_service,
        registry_repo=registry_repo,
        modeling_service=modeling_service,
        modeling_source_service=modeling_source_service,
        domain_modeling_service=domain_modeling_service,
        domain_canvas_service=domain_canvas_service,
        query_adapter_getter=query_adapter_getter,
        view_materialize_service=view_materialize_service,
        cube_listing_service=cube_listing_service,
        runtime_snapshot_service=runtime_snapshot_service,
        mapper_service=mapper_service,
        field_candidate_service=field_candidate_service,
    )
    register_runtime_routes(bp, ctx)
    register_cube_routes(bp, ctx)
    register_domain_routes(bp, ctx)
    register_view_routes(bp, ctx)
    return bp
