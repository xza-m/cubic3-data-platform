from app.domain.semantic.entities import CatalogDefinition, DomainDefinition
from app.infrastructure.semantic.yaml_catalog_repository import YamlCatalogRepository
from app.infrastructure.semantic.yaml_domain_repository import YamlDomainRepository


def test_yaml_catalog_repository_roundtrip(tmp_path):
    repo = YamlCatalogRepository(str(tmp_path / "catalogs"))
    catalog = CatalogDefinition(
        code="learning",
        name="学习分析",
        description="学业和学习行为领域目录",
        status="active",
        sort_order=10,
    )

    repo.save(catalog)
    repo.reload()

    assert repo.get("learning") is not None
    assert repo.list_all()[0].name == "学习分析"


def test_yaml_domain_repository_roundtrip(tmp_path):
    repo = YamlDomainRepository(str(tmp_path / "domains"))
    domain = DomainDefinition(
        code="academic",
        name="学业分析域",
        catalog_code="learning",
        cubes=["answer_records", "student"],
        joins=[],
    )

    repo.save(domain)
    repo.reload()

    assert repo.get("academic") is not None
    assert repo.get_by_code("academic") is not None
    assert repo.list_all()[0].name == "学业分析域"
    assert repo.list_all()[0].catalog_code == "learning"
