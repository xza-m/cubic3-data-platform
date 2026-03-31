from app.domain.semantic.entities import CatalogDefinition, DomainDefinition
from app.infrastructure.semantic.yaml_catalog_repository import YamlCatalogRepository
from app.infrastructure.semantic.yaml_domain_repository import YamlDomainRepository
import yaml
import pytest


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


def test_yaml_catalog_repository_ignores_playwright_fixtures(tmp_path):
    catalogs_dir = tmp_path / "catalogs"
    catalogs_dir.mkdir()
    (catalogs_dir / "learning.yml").write_text(
        yaml.dump(
            {
                "code": "learning",
                "name": "学习分析",
                "description": "学业和学习行为领域目录",
                "status": "active",
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    (catalogs_dir / "playwright_catalog_1773801359162.yml").write_text(
        yaml.dump(
            {
                "code": "playwright",
                "name": "调试目录",
                "description": "不应被运行时加载",
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    repo = YamlCatalogRepository(str(catalogs_dir))

    catalogs = repo.list_all()
    assert [catalog.code for catalog in catalogs] == ["learning"]


def test_yaml_catalog_repository_handles_missing_dir_and_delete_edges(tmp_path):
    repo = YamlCatalogRepository(str(tmp_path / "missing_catalogs"))

    assert repo.list_all() == []
    assert repo.delete("missing") is False

    catalog = CatalogDefinition(
        code="learning",
        name="学习分析",
        description="学业和学习行为领域目录",
    )
    repo.save(catalog)
    assert repo.delete("learning") is True
    assert repo.get("learning") is None
    assert repo.delete("learning") is False


def test_yaml_catalog_repository_invalid_yaml_raises(tmp_path):
    catalogs_dir = tmp_path / "catalogs"
    catalogs_dir.mkdir()
    (catalogs_dir / "bad.yml").write_text(yaml.dump({"name": "bad"}), encoding="utf-8")

    repo = YamlCatalogRepository(str(catalogs_dir))
    with pytest.raises(ValueError, match="Failed to load Catalog YAML"):
        repo.list_all()


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


def test_yaml_domain_repository_handles_id_lookup_reload_and_delete_edges(tmp_path):
    repo = YamlDomainRepository(str(tmp_path / "domains"))
    domain = DomainDefinition(
        id="domain-1",
        code="academic",
        name="学业分析域",
        catalog_code="learning",
        cubes=["answer_records"],
        joins=[],
    )
    repo.save(domain)

    assert repo.get("domain-1") is not None
    assert repo.get_by_code("academic").code == domain.code

    updated_domain = DomainDefinition(
        id="domain-2",
        code="teaching",
        name="教学域",
        catalog_code="learning",
        cubes=[],
        joins=[],
    )
    repo.save(updated_domain)
    repo.reload()

    assert {item.code for item in repo.list_all()} == {"academic", "teaching"}
    assert repo.delete("domain-1") is True
    assert repo.get("domain-1") is None
    assert repo.delete("domain-1") is False


def test_yaml_domain_repository_ignores_runtime_debug_fixtures(tmp_path):
    domains_dir = tmp_path / "domains"
    domains_dir.mkdir()
    (domains_dir / "domain_academic.yml").write_text(
        yaml.dump(
            {
                "code": "academic",
                "name": "学业分析域",
                "catalog_code": "learning",
                "cubes": ["answer_records"],
                "joins": [],
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    (domains_dir / "domain_playwright_1773801359162.yml").write_text(
        yaml.dump(
            {
                "code": "playwright",
                "name": "调试域",
                "catalog_code": "learning",
                "cubes": [],
                "joins": [],
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    repo = YamlDomainRepository(str(domains_dir))

    domains = repo.list_all()
    assert [domain.code for domain in domains] == ["academic"]


def test_yaml_domain_repository_invalid_yaml_raises(tmp_path):
    domains_dir = tmp_path / "domains"
    domains_dir.mkdir()
    (domains_dir / "domain_bad.yml").write_text(yaml.dump({"name": "bad"}), encoding="utf-8")

    repo = YamlDomainRepository(str(domains_dir))
    with pytest.raises(ValueError, match="Failed to load Domain YAML"):
        repo.list_all()


def test_yaml_domain_repository_handles_missing_dir_and_unknown_code(tmp_path):
    repo = YamlDomainRepository(str(tmp_path / "missing_domains"))

    assert repo.list_all() == []
    assert repo.get_by_code("missing") is None
