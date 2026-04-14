import types
import pytest

from app.application.semantic.semantic_definition_service import SemanticDefinitionService
from app.domain.semantic.compiler import CompilationError
from app.domain.semantic.entities import (
    CubeDefinition,
    DefaultFilterDef,
    DimensionDef,
    ForeignKeyDef,
    JoinDef,
    MeasureDef,
    RecipeDefinition,
    ViewCubeRef,
    ViewDefinition,
)


class _CubeRepo:
    def __init__(self, cubes):
        self._items = {cube.name: cube for cube in cubes}

    def list_all(self):
        return list(self._items.values())

    def get(self, name):
        return self._items.get(name)


class _ViewRepo:
    def __init__(self, views):
        self._items = {view.name: view for view in views}

    def list_all(self):
        return list(self._items.values())

    def get(self, name):
        return self._items.get(name)


class _RecipeRepo:
    def __init__(self, recipes=None):
        self._recipes = list(recipes or [])
        self.last_cube_name = None

    def get_by_cube(self, cube_name):
        self.last_cube_name = cube_name
        return list(self._recipes)


class _DomainRepo:
    def __init__(self, domains):
        self._items = {domain.id or domain.code: domain for domain in domains}

    def get(self, domain_id):
        return self._items.get(domain_id)

    def get_by_code(self, code):
        for domain in self._items.values():
            if domain.code == code:
                return domain
        return None

    def list_all(self):
        return list(self._items.values())


class _RegistryEntry:
    def __init__(self, summary):
        self._summary = dict(summary)

    def to_summary(self):
        return dict(self._summary)


class _RegistryRepo:
    def __init__(self, entries=None):
        self._entries = dict(entries or {})
        self.upserts = []
        self.commit_count = 0

    def get(self, object_type, object_name):
        return self._entries.get((object_type, object_name))

    def upsert(self, object_type, object_name, **kwargs):
        self.upserts.append((object_type, object_name, kwargs))

    def commit(self):
        self.commit_count += 1


class _RuntimeBindingService:
    def __init__(self, *, invalid_cubes=None, enum_map=None):
        self.invalid_cubes = set(invalid_cubes or [])
        self.enum_map = dict(enum_map or {})
        self.enum_calls = []

    def resolve_cube_datasource(self, cube):
        if cube.name in self.invalid_cubes:
            raise RuntimeError(f"invalid binding for {cube.name}")
        return types.SimpleNamespace(id=cube.source_id)

    def resolve_source_binding_summary(self, cube):
        return {
            "source_id": cube.source_id,
            "source_type": "maxcompute",
            "database": cube.source_database,
            "schema": cube.source_schema,
            "display": cube.table,
        }

    def fetch_dict_enums(self, cube, dict_type):
        self.enum_calls.append((cube.name, dict_type))
        value = self.enum_map.get((cube.name, dict_type))
        if isinstance(value, Exception):
            raise value
        return value


def _cube(name: str, *, status: str = "active", domain_id: str | None = None, source_id: int | None = 1) -> CubeDefinition:
    return CubeDefinition(
        name=name,
        title=name,
        table=f"dws.{name}",
        domain_id=domain_id,
        source_id=source_id,
        source_database="warehouse",
        source_schema="dws",
        status=status,
        dimensions={
            "id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True),
        },
        measures={
            "total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id"),
        },
    )


def test_list_cubes_resolves_domain_and_registry_summary():
    cube = _cube("orders")
    domain = types.SimpleNamespace(id="sales", code="sales", name="销售域", cubes=["orders"])
    registry = _RegistryRepo(
        {
            ("cube", "orders"): _RegistryEntry(
                {
                    "status": "active",
                    "last_drift_status": "ok",
                    "source_binding_summary": {"display": "dws.orders"},
                }
            )
        }
    )
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
        registry_repo=registry,
        domain_repo=_DomainRepo([domain]),
    )

    cubes = service.list_cubes()

    assert cubes[0]["domain_id"] == "sales"
    assert cubes[0]["domain_name"] == "销售域"
    assert cubes[0]["domain_ids"] == ["sales"]
    assert cubes[0]["domains"] == [{"id": "sales", "code": "sales", "name": "销售域"}]
    assert cubes[0]["domain_count"] == 1
    assert cubes[0]["sync_status"] == "ok"


def test_list_cubes_uses_deterministic_primary_domain_projection():
    cube = _cube("orders", domain_id="ghost")
    academic = types.SimpleNamespace(id="academic", code="academic", name="学业域", cubes=["orders"])
    teaching = types.SimpleNamespace(id="teaching", code="teaching", name="教学域", cubes=["orders"])
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
        domain_repo=_DomainRepo([teaching, academic]),
    )

    cubes = service.list_cubes()

    assert cubes[0]["domain_id"] == "academic"
    assert cubes[0]["domain_name"] == "学业域"
    assert cubes[0]["domain_ids"] == ["academic", "teaching"]
    assert cubes[0]["domain_count"] == 2


def test_describe_cube_includes_multi_domain_projection_fields():
    cube = _cube("orders", domain_id="teaching")
    academic = types.SimpleNamespace(id="academic", code="academic", name="学业域", cubes=["orders"])
    teaching = types.SimpleNamespace(id="teaching", code="teaching", name="教学域", cubes=["orders"])
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
        domain_repo=_DomainRepo([academic, teaching]),
    )

    detail = service.describe_cube("orders")

    assert detail["domain_id"] == "teaching"
    assert detail["domain_name"] == "教学域"
    assert detail["domain_ids"] == ["academic", "teaching"]
    assert detail["domains"] == [
        {"id": "academic", "code": "academic", "name": "学业域"},
        {"id": "teaching", "code": "teaching", "name": "教学域"},
    ]
    assert detail["domain_count"] == 2


def test_describe_cube_reports_binding_join_foreign_key_and_enum_issues():
    cube = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        source_id=11,
        source_database="warehouse",
        source_schema="dws",
        grain="missing_grain",
        entity_key="missing_entity",
        joins={},
        dimensions={
            "id": DimensionDef(
                title="ID",
                type="number",
                sql="{CUBE}.id",
                description="订单主键",
                source_data_type="bigint",
                format="identity",
                synonyms=["订单ID"],
                tags=["主键"],
                primary_key=True,
            ),
            "status": DimensionDef(
                title="状态",
                type="string",
                sql="{CUBE}.status",
                enum_source={"dict_type": "order_status"},
            ),
            "missing_cube_fk": DimensionDef(
                title="缺失外键Cube",
                type="number",
                sql="{CUBE}.missing_cube_fk",
                foreign_key=ForeignKeyDef(cube="ghost_cube", field="id"),
            ),
            "missing_field_fk": DimensionDef(
                title="缺失外键字段",
                type="number",
                sql="{CUBE}.missing_field_fk",
                foreign_key=ForeignKeyDef(cube="customers", field="ghost_id"),
            ),
        },
        measures={
            "total_count": MeasureDef(
                title="总数",
                type="count",
                sql="COUNT({CUBE}.id)",
                description="订单总数",
                source_data_type="bigint",
                synonyms=["订单量"],
                tags=["核心指标"],
            )
        },
        default_filters=[DefaultFilterDef(sql="{CUBE}.is_deleted = 0", description="过滤删除数据")],
    )
    cube.joins["customer"] = types.SimpleNamespace(cube="ghost_cube", type="left")
    customer_cube = CubeDefinition(
        name="customers",
        title="客户",
        table="dws.customers",
        source_id=11,
        source_database="warehouse",
        source_schema="dws",
        dimensions={"id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True)},
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )
    runtime = _RuntimeBindingService(invalid_cubes={"orders"})
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube, customer_cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
        runtime_binding_service=runtime,
    )

    result = service.describe_cube("orders")
    kinds = {item["kind"] for item in result["diagnostics"]}

    assert "invalid_source_binding" in kinds
    assert "invalid_grain_dimension" in kinds
    assert "invalid_entity_key_dimension" in kinds
    assert "missing_join_target_cube" in kinds
    assert "missing_foreign_key_cube" in kinds
    assert "missing_foreign_key_field" in kinds
    assert result["dimensions"]["id"]["sql"] == "{CUBE}.id"
    assert result["dimensions"]["id"]["description"] == "订单主键"
    assert result["dimensions"]["id"]["source_data_type"] == "bigint"
    assert result["dimensions"]["id"]["format"] == "identity"
    assert result["dimensions"]["id"]["synonyms"] == ["订单ID"]
    assert result["dimensions"]["id"]["tags"] == ["主键"]
    assert result["measures"]["total_count"]["sql"] == "COUNT({CUBE}.id)"
    assert result["measures"]["total_count"]["description"] == "订单总数"
    assert result["measures"]["total_count"]["source_data_type"] == "bigint"
    assert result["measures"]["total_count"]["synonyms"] == ["订单量"]
    assert result["measures"]["total_count"]["tags"] == ["核心指标"]
    assert result["default_filters"][0]["sql"] == "{CUBE}.is_deleted = 0"


def test_describe_cube_uses_recipe_truncation_and_enum_cache():
    cube = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        source_id=1,
        source_database="warehouse",
        source_schema="dws",
        dimensions={
            "id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True),
            "status": DimensionDef(
                title="状态",
                type="string",
                sql="{CUBE}.status",
                enum_source={"dict_type": "order_status"},
            ),
        },
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )
    recipes = [
        RecipeDefinition(
            name=f"recipe_{index}",
            title=f"示例{index}",
            examples=[
                {"question": f"问题{index}-1", "dsl": {"measures": ["orders.total_count"]}},
                {"question": f"问题{index}-2", "dsl": {"measures": ["orders.total_count"]}},
                {"question": f"问题{index}-3", "dsl": {"measures": ["orders.total_count"]}},
            ],
        )
        for index in range(4)
    ]
    calls = []

    def _enum_loader(dict_type: str):
        calls.append(dict_type)
        return {"1": "已支付"}

    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo(recipes),
        enum_loader=_enum_loader,
    )

    first = service.describe_cube("orders")
    second = service.describe_cube("orders")
    service.invalidate_cache()
    third = service.describe_cube("orders")

    assert len(first["examples"]) == 6
    assert first["dimensions"]["status"]["enum"] == {"1": "已支付"}
    assert second["dimensions"]["status"]["enum"] == {"1": "已支付"}
    assert third["dimensions"]["status"]["enum"] == {"1": "已支付"}
    assert calls == ["order_status", "order_status"]


def test_describe_view_handles_private_and_dependency_states():
    public_view = ViewDefinition(
        name="public_orders",
        title="公开订单视图",
        cubes=[{"join_path": "orders", "includes": ["id"]}],
    )
    private_view = ViewDefinition(
        name="private_orders",
        title="私有订单视图",
        public=False,
        cubes=[{"join_path": "orders", "includes": ["id"]}],
    )
    deprecated_cube = _cube("orders", status="deprecated")
    registry = _RegistryRepo(
        {
            ("view", "private_orders"): _RegistryEntry(
                {
                    "definition_hash": "hash-1",
                    "publish_status": "published",
                    "last_published_at": "2026-03-25T12:00:00",
                    "last_drift_status": "error",
                    "last_drift_checked_at": "2026-03-25T12:30:00",
                }
            )
        }
    )
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([deprecated_cube]),
        view_repo=_ViewRepo([public_view, private_view]),
        recipe_repo=_RecipeRepo([]),
        registry_repo=registry,
    )

    assert service.describe_view("missing")["error"] == "未找到 View: missing"
    assert service.describe_view("private_orders")["error"] == "View 'private_orders' 未公开暴露"


def test_describe_view_success_and_expand_dsl_cover_success_paths():
    cube = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        source_id=1,
        source_database="warehouse",
        source_schema="dws",
        dimensions={"id": DimensionDef(title="订单ID", type="number", sql="{CUBE}.id", primary_key=True)},
        measures={"amount": MeasureDef(title="金额", type="sum", sql="{CUBE}.amount")},
    )
    view = ViewDefinition(
        name="public_orders",
        title="公开订单视图",
        cubes=[{"join_path": "orders", "includes": ["id", "amount"], "prefix": True}],
    )
    registry = _RegistryRepo(
        {
            ("view", "public_orders"): _RegistryEntry(
                {
                    "definition_hash": "hash-public",
                    "publish_status": "published",
                    "last_published_at": "2026-03-25T12:00:00",
                    "last_drift_status": "error",
                    "last_drift_checked_at": "2026-03-25T12:30:00",
                }
            )
        }
    )
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([view]),
        recipe_repo=_RecipeRepo([]),
        registry_repo=registry,
    )

    result = service.describe_view("public_orders")
    dsl = service.expand_view_to_dsl(view)

    assert result["publish_summary"]["publish_status"] == "published"
    assert result["drift_summary"]["last_drift_status"] == "error"
    assert any(item["kind"] == "view_ref_resolved" for item in result["diagnostics"])
    assert dsl["dimensions"] == ["orders.id"]
    assert dsl["measures"] == ["orders.amount"]
    assert dsl["field_mappings"][1]["display_name"] == "订单.金额"


def test_definition_helpers_cover_domain_registry_enum_and_view_dependency_paths():
    cube = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        domain_id="sales",
        source_id=7,
        source_database="warehouse",
        source_schema="dws",
        status="draft",
        dimensions={
            "id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True),
            "status": DimensionDef(
                title="状态",
                type="string",
                sql="{CUBE}.status",
                enum_source={"dict_type": "order_status"},
            ),
        },
        measures={
            "total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id", certified=True),
            "pay_amount": MeasureDef(title="支付金额", type="sum", sql="{CUBE}.pay_amount"),
        },
    )
    archived_cube = _cube("legacy_orders", status="draft")
    fallback_domain = types.SimpleNamespace(id="sales-id", code="sales", name="销售域", cubes=["orders"])
    registry = _RegistryRepo()
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube, archived_cube]),
        view_repo=_ViewRepo([
            ViewDefinition(
                name="legacy_view",
                title="遗留视图",
                cubes=[{"join_path": "ghost.legacy_orders", "includes": "*"}],
            )
        ]),
        recipe_repo=_RecipeRepo([]),
        registry_repo=registry,
        domain_repo=_DomainRepo([fallback_domain]),
    )

    assert service._resolve_cube_domain(cube) == ("sales-id", "销售域")
    assert service._resolve_dimension_enum(
        cube,
        DimensionDef(title="枚举状态", type="string", sql="{CUBE}.status", enum={"1": "完成"}),
    ) == {"1": "完成"}
    assert service._resolve_dimension_enum(cube, cube.dimensions["id"]) is None
    assert service._load_dynamic_enum("ghost:order_status") is None
    assert service._build_source_binding_summary(cube)["display"] == "dws.orders"
    assert service._build_measure_summary_snapshot(cube) == {"count": 2, "names": ["total_count", "pay_amount"]}
    assert service._to_sync_status("error") == "error"
    assert service._to_sync_status("other") == "warn"

    service._sync_cube_registry(cube)
    service._sync_view_registry(service.list_views(public_only=False)[0])

    assert registry.commit_count == 2
    assert registry.upserts[0][0:2] == ("cube", "orders")
    assert registry.upserts[1][0:2] == ("view", "legacy_view")
    assert registry.upserts[0][2]["certified_measure_list"] == ["total_count"]

    cube_summary = service._build_cube_state_summary(cube)
    view_summary = service._build_view_state_summary(service.list_views(public_only=False)[0])
    diagnostics = service._validate_view_dependencies(
        ViewDefinition(
            name="legacy_view",
            title="遗留视图",
            cubes=[{"join_path": "ghost.legacy_orders", "includes": "*"}],
        )
    )

    assert cube_summary["sync_status"] == "warn"
    assert view_summary["publish_status"] == "unpublished"
    assert diagnostics == [
        {
            "level": "error",
            "kind": "inactive_view_dependency",
            "field": "ghost.legacy_orders",
            "message": "View 'legacy_view' 依赖的 Cube 'legacy_orders' 当前状态为 'draft'，不应进入默认发布/消费链路",
        }
    ]

    no_registry_service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
    )
    tmp_view = ViewDefinition(name="tmp_view", title="临时视图", cubes=[{"join_path": "orders", "includes": "*"}])
    no_registry_service._sync_view_registry(tmp_view)
    assert no_registry_service._build_view_state_summary(tmp_view)["publish_status"] == "unpublished"

def test_expand_view_to_dsl_and_validate_view_cover_reference_errors():
    orders = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        source_id=1,
        source_database="warehouse",
        source_schema="dws",
        dimensions={"id": DimensionDef(title="订单ID", type="number", sql="{CUBE}.id", primary_key=True)},
        measures={"amount": MeasureDef(title="金额", type="sum", sql="{CUBE}.amount")},
        joins={"ghost": JoinDef(cube="ghost", type="left", sql="{CUBE}.ghost_id = {ghost}.id")},
    )
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([orders]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
    )
    single_cube_view = ViewDefinition(
        name="order_view",
        title="订单视图",
        cubes=[{"join_path": "orders", "includes": "*", "excludes": ["amount"]}],
    )
    invalid_view = ViewDefinition(
        name="broken_view",
        title="坏视图",
        cubes=[
            {"join_path": " ", "includes": ["id"]},
            {"join_path": "orders", "includes": ["ghost_field"]},
            {"join_path": "ghost.orders", "includes": ["id"]},
            {"join_path": "orders.ghost", "includes": ["id"]},
        ],
    )

    dsl = service.expand_view_to_dsl(single_cube_view)
    diagnostics = service.validate_view(invalid_view)

    assert dsl["dimensions"] == ["orders.id"]
    assert dsl["measures"] == []
    assert dsl["join_path"] is None
    assert any(item["kind"] == "invalid_view_reference" and "join_path 不能为空" in item["message"] for item in diagnostics)
    assert any(item["kind"] == "invalid_view_reference" and "ghost_field" in item["message"] for item in diagnostics)
    assert any(item["kind"] == "invalid_view_reference" and "不存在的 Cube" in item["message"] for item in diagnostics)
    assert any(item["kind"] == "invalid_view_reference" and "终点 Cube 不存在" in item["message"] for item in diagnostics)

    with pytest.raises(CompilationError, match="No JOIN path"):
        service._resolve_view_reference(
            "broken_view",
            ViewCubeRef(join_path="orders.customers", includes=["id"]),
        )


def test_default_enum_loader_uses_runtime_binding_summary_and_fetch():
    cube = CubeDefinition(
        name="orders",
        title="订单",
        table="dws.orders",
        source_id=1,
        source_database="warehouse",
        source_schema="dws",
        dimensions={
            "status": DimensionDef(
                title="状态",
                type="string",
                sql="{CUBE}.status",
                enum_source={"dict_type": "order_status"},
            ),
        },
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )
    runtime = _RuntimeBindingService(enum_map={("orders", "order_status"): {"1": "完成"}})
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([]),
        recipe_repo=_RecipeRepo([]),
        runtime_binding_service=runtime,
    )

    result = service.describe_cube("orders")

    assert result["dimensions"]["status"]["enum"] == {"1": "完成"}
    assert result["source_binding_summary"]["display"] == "dws.orders"
    assert runtime.enum_calls == [("orders", "order_status")]


def test_list_view_and_recipe_summaries_cover_summary_builders():
    cube = _cube("orders")
    view = ViewDefinition(
        name="orders_view",
        title="订单视图",
        public=False,
        cubes=[{"join_path": "orders.detail", "includes": ["id"]}],
    )
    registry = _RegistryRepo(
        {
            ("view", "orders_view"): _RegistryEntry(
                {
                    "publish_status": "published",
                    "last_published_at": "2026-04-14T10:00:00",
                }
            )
        }
    )
    recipes = [
        RecipeDefinition(
            name="orders_recipe",
            title="订单示例",
            tags=["core"],
            examples=[{"question": "看订单", "dsl": {"measures": ["orders.total_count"]}}],
        ),
        type(
            "_DraftRecipe",
            (),
            {
                "name": "draft_recipe",
                "title": "空示例",
                "tags": [],
                "examples": [],
                "extract_cube_names": staticmethod(lambda: []),
            },
        )(),
    ]
    recipe_repo = _RecipeRepo(recipes)
    recipe_repo.list_all = lambda: list(recipes)
    service = SemanticDefinitionService(
        cube_repo=_CubeRepo([cube]),
        view_repo=_ViewRepo([view]),
        recipe_repo=recipe_repo,
        registry_repo=registry,
    )

    view_summaries = service.list_view_summaries(public_only=False)
    recipe_summaries = service.list_recipe_summaries()

    assert view_summaries[0]["cubes"] == ["orders"]
    assert view_summaries[0]["status"] == "active"
    assert view_summaries[0]["publish_summary"]["publish_status"] == "published"
    assert recipe_summaries[0]["related_cubes"] == ["orders"]
    assert recipe_summaries[0]["state_summary"]["status"] == "active"
    assert recipe_summaries[1]["state_summary"]["status"] == "draft"
