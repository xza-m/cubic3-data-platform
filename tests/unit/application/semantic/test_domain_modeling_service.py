import pytest

from app.application.semantic.domain_modeling_service import DomainModelingService
from app.domain.semantic.entities import CatalogDefinition, CubeDefinition, DimensionDef, DomainDefinition, MeasureDef
from app.shared.exceptions import ApplicationException


class _InMemoryDomainRepo:
    def __init__(self):
        self.items = {}

    def list_all(self):
        return list(self.items.values())

    def get(self, domain_id):
        return self.items.get(domain_id)

    def get_by_code(self, code):
        return self.items.get(code)

    def save(self, domain):
        self.items[domain.id or domain.code] = domain

    def delete(self, domain_id):
        return self.items.pop(domain_id, None) is not None

    def reload(self):
        return None


class _InMemoryCubeRepo:
    def __init__(self, cubes):
        self._items = {cube.name: cube for cube in cubes}

    def get(self, name):
        return self._items.get(name)

    def list_all(self):
        return list(self._items.values())


class _InMemoryCatalogRepo:
    def __init__(self, catalogs=None):
        self.items = {catalog.code: catalog for catalog in (catalogs or [])}

    def list_all(self):
        return list(self.items.values())

    def get(self, code):
        return self.items.get(code)

    def save(self, catalog):
        self.items[catalog.code] = catalog

    def delete(self, code):
        return self.items.pop(code, None) is not None

    def reload(self):
        return None


def _cube(name: str, status: str = "active") -> CubeDefinition:
    return CubeDefinition(
        name=name,
        title=name,
        table=f"public.{name}",
        source_id=1,
        source_database="analytics",
        status=status,
        dimensions={"id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True)},
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )


def test_publish_domain_rejects_1n_without_strategy():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("order_items")]),
    )
    domain = service.create_domain({"name": "商业域"})

    with pytest.raises(ApplicationException, match="1:N"):
        service.publish_domain(
            domain.id or domain.code,
            cubes=["orders", "order_items"],
            joins=[
                {
                    "name": "orders_to_items",
                    "source_cube": "orders",
                    "target_cube": "order_items",
                    "source_field": "id",
                    "target_field": "order_id",
                    "join_type": "left",
                    "cardinality": "1:N",
                    "aggregation_strategy": "none",
                }
            ],
        )


def test_validate_domain_detects_cycle_and_inactive_cube():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("a"), _cube("b", status="deprecated")]),
    )
    domain = DomainDefinition(
        id="academic",
        code="academic",
        name="学业域",
        status="draft",
        cubes=["a", "b"],
        joins=[
            {
                "name": "a_to_b",
                "source_cube": "a",
                "target_cube": "b",
                "source_field": "id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
            },
            {
                "name": "b_to_a",
                "source_cube": "b",
                "target_cube": "a",
                "source_field": "id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
            },
        ],
    )

    diagnostics = service.validate_domain(domain)

    assert any(item["kind"] == "inactive_cube" for item in diagnostics)
    assert any(item["kind"] == "cyclic_graph" for item in diagnostics)


def test_create_domain_generates_code_and_draft_status():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    domain = service.create_domain({"name": "答题分析"})

    assert domain.name == "答题分析"
    assert domain.status == "draft"
    assert domain.code.startswith("domain_")
    assert domain.id == domain.code
    assert domain.catalog_code == "default"
    assert domain.cubes == []
    assert domain.joins == []


def test_list_catalogs_groups_domains_and_assigns_default_catalog():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(
            [CatalogDefinition(code="learning", name="学习分析", status="active", sort_order=10)]
        ),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    service.create_domain({"name": "默认领域"})
    service.create_domain({"name": "学业分析", "catalog_code": "learning"})

    catalogs = service.list_catalogs()

    assert catalogs[0]["code"] == "default"
    assert catalogs[0]["domain_count"] == 1
    assert any(item["code"] == "learning" for item in catalogs)


def test_create_catalog_and_delete_empty_catalog():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    catalog = service.create_catalog({"name": "教学运营", "code": "teaching_ops"})

    assert catalog.code == "teaching_ops"
    assert service.list_catalogs()[1]["code"] == "teaching_ops"

    service.delete_catalog("teaching_ops")

    assert all(item["code"] != "teaching_ops" for item in service.list_catalogs())


def test_delete_catalog_rejects_when_domains_exist():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(
            [CatalogDefinition(code="learning", name="学习分析", status="active", sort_order=10)]
        ),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    service.create_domain({"name": "学业分析", "catalog_code": "learning"})

    with pytest.raises(ApplicationException, match="目录下仍存在领域"):
        service.delete_catalog("learning")


def test_update_domain_rejects_unknown_catalog():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    domain = service.create_domain({"name": "学业分析"})

    with pytest.raises(ApplicationException, match="未找到目录"):
        service.update_domain(domain.id or domain.code, {"catalog_code": "ghost"})


def test_publish_domain_activates_domain():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
    )
    domain = service.create_domain({"name": "学业分析"})

    published = service.publish_domain(
        domain.id or domain.code,
        cubes=["orders", "student"],
        joins=[
            {
                "name": "orders_to_student",
                "source_cube": "orders",
                "target_cube": "student",
                "source_field": "student_id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
            }
        ],
    )

    assert published.status == "active"


def test_publish_domain_rejects_duplicate_fingerprint():
    repo = _InMemoryDomainRepo()
    service = DomainModelingService(
        domain_repo=repo,
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
    )
    existing = service.create_domain({"name": "现有领域"})
    service.publish_domain(
        existing.id or existing.code,
        cubes=["orders", "student"],
        joins=[
            {
                "name": "orders_to_student",
                "source_cube": "orders",
                "target_cube": "student",
                "source_field": "student_id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
            }
        ],
    )

    duplicate = service.create_domain({"name": "重复领域"})

    with pytest.raises(ApplicationException, match="结构完全重复"):
        service.publish_domain(
            duplicate.id or duplicate.code,
            cubes=["student", "orders"],
            joins=[
                {
                    "name": "another_name",
                    "source_cube": "orders",
                    "target_cube": "student",
                    "source_field": "student_id",
                    "target_field": "id",
                    "join_type": "left",
                    "cardinality": "N:1",
                    "aggregation_strategy": "none",
                }
            ],
        )
