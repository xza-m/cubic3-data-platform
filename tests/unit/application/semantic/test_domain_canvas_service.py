from app.application.semantic.domain_canvas_service import DomainCanvasService
from app.domain.semantic.entities import CatalogDefinition, CubeDefinition, DimensionDef, DomainDefinition, MeasureDef


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
