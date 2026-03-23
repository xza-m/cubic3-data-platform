import pytest

from app.application.semantic.semantic_query_service import SemanticQueryService
from app.domain.semantic.compiler import CompilationError
from app.domain.semantic.entities import CubeDefinition, DimensionDef, DomainDefinition, MeasureDef


class _CubeRepo:
    def __init__(self, cubes):
        self._items = {cube.name: cube for cube in cubes}

    def get(self, name):
        return self._items.get(name)

    def list_all(self):
        return list(self._items.values())


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


def _cube(name: str) -> CubeDefinition:
    return CubeDefinition(
        name=name,
        title=name,
        table=f"public.{name}",
        source_id=1,
        source_database="analytics",
        status="active",
        dimensions={
            "id": DimensionDef(title="ID", type="number", sql="{CUBE}.id", primary_key=True),
            "student_id": DimensionDef(title="学生ID", type="number", sql="{CUBE}.student_id"),
        },
        measures={"total_count": MeasureDef(title="总数", type="count", sql="{CUBE}.id")},
    )


def test_multi_cube_query_requires_domain_context():
    service = SemanticQueryService(cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]))

    with pytest.raises(CompilationError, match="domain_code"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
            }
        )


def test_domain_context_builds_join_graph():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="active",
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
            }
        ],
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
        domain_repo=_DomainRepo([domain]),
    )

    result = service.compile_query(
        {
            "measures": ["answer_records.total_count"],
            "dimensions": ["student.id"],
            "domain_code": "academic",
        }
    )

    assert "LEFT JOIN public.student student ON answer_records.student_id = student.id" in result.sql


def test_multi_cube_query_rejects_non_active_domain():
    domain = DomainDefinition(
        code="academic",
        name="学业域",
        status="draft",
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
            }
        ],
    )
    service = SemanticQueryService(
        cube_repo=_CubeRepo([_cube("answer_records"), _cube("student")]),
        domain_repo=_DomainRepo([domain]),
    )

    with pytest.raises(CompilationError, match="当前状态为 'draft'"):
        service.compile_query(
            {
                "measures": ["answer_records.total_count"],
                "dimensions": ["student.id"],
                "domain_code": "academic",
            }
        )
