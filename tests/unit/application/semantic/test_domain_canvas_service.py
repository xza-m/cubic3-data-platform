import pytest

from app.application.semantic.domain_canvas_service import DomainCanvasService
from app.domain.semantic.entities import CatalogDefinition, CubeDefinition, DimensionDef, DomainDefinition, MeasureDef
from app.shared.exceptions import ApplicationException


class _DomainRepo:
    def __init__(self, domains):
        self._items = {domain.id or domain.code: domain for domain in domains}

    def list_all(self):
        return list(self._items.values())

    def get(self, domain_id):
        return self._items.get(domain_id)

    def get_by_code(self, code):
        for domain in self._items.values():
            if domain.code == code:
                return domain
        return None


class _CubeRepo:
    def __init__(self, cubes):
        self._items = {cube.name: cube for cube in cubes}

    def get(self, name):
        return self._items.get(name)

    def list_all(self):
        return list(self._items.values())


class _CatalogRepo:
    def __init__(self, catalogs):
        self._items = {catalog.code: catalog for catalog in catalogs}

    def get(self, code):
        return self._items.get(code)


class _RegistryEntry:
    def __init__(self, summary):
        self._summary = dict(summary)

    def to_summary(self):
        return dict(self._summary)


class _RegistryRepo:
    def __init__(self, entries=None, *, raise_on_get=False):
        self._entries = dict(entries or {})
        self.raise_on_get = raise_on_get

    def get(self, object_type, object_name):
        if self.raise_on_get:
            raise RuntimeError("registry unavailable")
        return self._entries.get((object_type, object_name))


def _cube(name: str):
    return CubeDefinition(
        name=name,
        title=name,
        table=f"public.{name}",
        source_id=1,
        source_database="analytics",
        dimensions={"id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True)},
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )


def test_get_canvas_returns_nodes_edges_and_library():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        catalog_code="learning",
        cubes=["answer_records"],
        joins=[],
    )
    service = DomainCanvasService(
        domain_repo=_DomainRepo([domain]),
        catalog_repo=_CatalogRepo([CatalogDefinition(code="learning", name="学习分析")]),
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
    )

    data = service.get_canvas("academic")

    assert data["domain"]["code"] == "academic"
    assert data["domain"]["catalog_name"] == "学习分析"
    assert len(data["nodes"]) == 1
    assert data["nodes"][0]["id"] == "answer_records"
    assert any(item["name"] == "student" for item in data["library_cubes"])


def test_get_canvas_handles_missing_domain_and_registry_failures():
    service = DomainCanvasService(
        domain_repo=_DomainRepo([]),
        catalog_repo=None,
        cube_repo=_CubeRepo([_cube("answer_records")]),
    )

    with pytest.raises(ApplicationException, match="未找到领域"):
        service.get_canvas("ghost")

    domain = DomainDefinition(
        code="academic",
        name="学业域",
        catalog_code=None,
        cubes=["answer_records", "ghost"],
        joins=[],
    )
    cube = _cube("answer_records")
    cube.status = "deprecated"
    service = DomainCanvasService(
        domain_repo=_DomainRepo([domain]),
        catalog_repo=None,
        cube_repo=_CubeRepo([cube, _cube("active_cube")]),
        registry_repo=_RegistryRepo(raise_on_get=True),
    )

    data = service.get_canvas("academic")

    assert data["domain"]["catalog_name"] is None
    assert len(data["nodes"]) == 1
    assert data["nodes"][0]["state_summary"] == {}
    assert all(item["name"] != "answer_records" for item in data["library_cubes"])
    assert any(item["name"] == "active_cube" for item in data["library_cubes"])


def test_get_canvas_includes_registry_summaries_without_domain_edges():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        catalog_code="learning",
        cubes=["answer_records", "student"],
        joins=[
            {
                "name": "answer_to_student",
                "source_cube": "answer_records",
                "target_cube": "student",
                "source_field": "student_id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
                "description": "答题关联学生",
            }
        ],
    )
    registry = _RegistryRepo(
        {
            ("domain", "academic"): _RegistryEntry({"sync_status": "warn"}),
            ("cube", "answer_records"): _RegistryEntry({"source_binding_summary": {"display": "dws.answer_records"}}),
        }
    )
    service = DomainCanvasService(
        domain_repo=_DomainRepo([domain]),
        catalog_repo=_CatalogRepo([CatalogDefinition(code="learning", name="学习分析")]),
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
        registry_repo=registry,
    )

    data = service.get_canvas("academic")

    assert data["domain"]["state_summary"]["sync_status"] == "warn"
    assert data["nodes"][0]["source_binding_summary"] == {"display": "dws.answer_records"}
    assert data["edges"] == []


def test_get_canvas_uses_default_catalog_name_for_blank_catalog_code():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        catalog_code="  ",
        cubes=["answer_records"],
        joins=[],
    )
    service = DomainCanvasService(
        domain_repo=_DomainRepo([domain]),
        catalog_repo=_CatalogRepo([CatalogDefinition(code="default", name="默认目录")]),
        cube_repo=_CubeRepo([_cube("answer_records")]),
    )

    data = service.get_canvas("academic")

    assert data["domain"]["catalog_name"] == "默认目录"


def test_get_canvas_includes_governance_summary_and_related_domain_projections():
    domains = [
        DomainDefinition(
            code="academic",
            name="学业域",
            catalog_code="learning",
            cubes=["orders", "users"],
            joins=[
                {
                    "name": "orders_to_users",
                    "source_cube": "orders",
                    "target_cube": "users",
                    "source_field": "user_id",
                    "target_field": "id",
                    "join_type": "left",
                    "cardinality": "N:1",
                    "aggregation_strategy": "none",
                }
            ],
        ),
        DomainDefinition(
            code="teaching",
            name="教学域",
            catalog_code="learning",
            cubes=["orders"],
            joins=[],
        ),
    ]
    orders = _cube("orders")
    users = _cube("users")
    users.status = "draft"
    service = DomainCanvasService(
        domain_repo=_DomainRepo(domains),
        catalog_repo=_CatalogRepo([CatalogDefinition(code="learning", name="学习分析")]),
        cube_repo=_CubeRepo([orders, users, _cube("orphan")]),
    )

    data = service.get_canvas("academic")
    orders_node = next(item for item in data["nodes"] if item["id"] == "orders")
    users_node = next(item for item in data["nodes"] if item["id"] == "users")
    orders_library = next(item for item in data["library_cubes"] if item["name"] == "orders")

    assert data["domain"]["governance_summary"] == {
        "cube_count": 2,
        "active_cube_count": 1,
        "draft_cube_count": 1,
        "deprecated_cube_count": 0,
        "join_count": 0,
        "dangling_cube_count": 0,
    }
    assert orders_node["related_domain_ids"] == ["academic", "teaching"]
    assert orders_node["related_domain_names"] == ["学业域", "教学域"]
    assert orders_node["domain_count"] == 2
    assert users_node["related_domain_ids"] == ["academic"]
    assert orders_library["related_domain_names"] == ["学业域", "教学域"]
    assert orders_library["domain_count"] == 2


def test_domain_canvas_projection_index_deduplicates_duplicate_cube_refs():
    domain = type(
        "_Domain",
        (),
        {
            "id": "academic",
            "code": "academic",
            "name": "学业域",
            "catalog_code": "learning",
            "cubes": ["orders", "orders"],
            "joins": [],
        },
    )()
    service = DomainCanvasService(
        domain_repo=_DomainRepo([domain]),
        catalog_repo=_CatalogRepo([CatalogDefinition(code="learning", name="学习分析")]),
        cube_repo=_CubeRepo([_cube("orders")]),
    )

    mapping = service._build_cube_domain_projection_index()
    assert mapping["orders"]["related_domain_ids"] == ["academic"]
    assert mapping["orders"]["domain_count"] == 1
