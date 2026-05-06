import pytest

from app.application.semantic.domain_modeling_service import DomainModelingService
from app.domain.semantic.entities import (
    CatalogDefinition,
    CubeDefinition,
    DimensionDef,
    DomainDefinition,
    MeasureDef,
    generate_catalog_code,
    generate_domain_code,
)
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
        self.reload_count = 0

    def list_all(self):
        return list(self.items.values())

    def get(self, code):
        return self.items.get(code)

    def save(self, catalog):
        self.items[catalog.code] = catalog

    def delete(self, code):
        return self.items.pop(code, None) is not None

    def reload(self):
        self.reload_count += 1
        return None


class _RegistryEntry:
    def __init__(self, summary):
        self._summary = dict(summary)

    def to_summary(self):
        return dict(self._summary)


class _RegistryRepo:
    def __init__(self, entries=None, *, raise_on_get=False, raise_on_commit=False):
        self.entries = dict(entries or {})
        self.raise_on_get = raise_on_get
        self.raise_on_commit = raise_on_commit
        self.upserts = []

    def get(self, object_type, object_name):
        if self.raise_on_get:
            raise RuntimeError("registry unavailable")
        return self.entries.get((object_type, object_name))

    def upsert(self, object_type, object_name, **kwargs):
        self.upserts.append((object_type, object_name, kwargs))

    def commit(self):
        if self.raise_on_commit:
            raise RuntimeError("commit failed")


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


def test_publish_domain_ignores_join_payload_and_keeps_context_only():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("order_items")]),
    )
    domain = service.create_domain({"name": "商业域"})

    published = service.publish_domain(
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

    assert published.cubes == ["orders", "order_items"]
    assert published.joins == []


def test_validate_domain_checks_cube_assets_only():
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
    assert not any(item["kind"] == "cyclic_graph" for item in diagnostics)


def test_domain_context_preview_returns_candidate_scope_without_join_truth():
    repo = _InMemoryDomainRepo()
    service = DomainModelingService(
        domain_repo=repo,
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("student_comments"), _cube("comment_audit_events")]),
    )
    domain = DomainDefinition(
        code="comment_governance",
        name="评论治理域",
        status="active",
        cubes=["student_comments", "comment_audit_events"],
        ontology_refs={
            "objects": ["student_comment"],
            "metrics": ["student_comment_count"],
        },
        default_context={
            "time_dimension": "comment_time",
            "default_roles": ["content_audit"],
        },
        agent_hints={
            "priority_terms": ["评论", "举报", "审核"],
        },
    )
    repo.save(domain)

    preview = service.get_domain_context_preview("comment_governance")

    assert preview["domain"]["code"] == "comment_governance"
    assert preview["role"] == "business_context"
    assert preview["candidate_scope"]["cube_refs"] == ["student_comments", "comment_audit_events"]
    assert preview["candidate_scope"]["ontology_refs"]["metrics"] == ["student_comment_count"]
    assert preview["agent_hints"]["priority_terms"] == ["评论", "举报", "审核"]
    assert preview["execution_truth_source"] == "cube"
    assert "joins" not in preview


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


def test_find_duplicate_domain_cubes_skips_blank_entries():
    assert DomainModelingService._find_duplicate_domain_cubes(["", "orders", "orders", "orders", "users"]) == ["orders"]


def test_update_domain_rejects_unknown_catalog():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    domain = service.create_domain({"name": "学业分析"})

    with pytest.raises(ApplicationException, match="未找到目录"):
        service.update_domain(domain.id or domain.code, {"catalog_code": "ghost"})


def test_create_domain_rejects_duplicate_generated_code():
    domain_repo = _InMemoryDomainRepo()
    existing = DomainDefinition(
        id="domain_learning",
        code="domain_learning",
        name="学习分析",
        status="draft",
        cubes=[],
        joins=[],
    )
    domain_repo.save(existing)
    service = DomainModelingService(
        domain_repo=domain_repo,
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    service._generate_unique_code = lambda name: "domain_learning"

    with pytest.raises(ApplicationException, match="领域已存在"):
        service.create_domain({"name": "学习分析"})


def test_update_domain_keeps_existing_status_when_payload_omits_status():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    domain = service.create_domain({"name": "学业分析"})

    updated = service.update_domain(domain.id or domain.code, {"name": "学业分析升级版"})

    assert updated.name == "学业分析升级版"
    assert updated.status == domain.status


def test_get_domain_syncs_registry_before_returning(monkeypatch):
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    domain = service.create_domain({"name": "学业分析"})
    calls = []

    monkeypatch.setattr(service, "_sync_registry", lambda current: calls.append(current.code))

    loaded = service.get_domain(domain.id or domain.code)

    assert loaded.code == domain.code
    assert calls == [domain.code]


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

    with pytest.raises(ApplicationException, match="资产范围"):
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


def test_create_catalog_validates_name_duplicate_and_repo_presence():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    with pytest.raises(ApplicationException, match="必须提供目录名称"):
        service.create_catalog({"name": "   "})

    created = service.create_catalog({"name": "学习分析", "code": "learning"})
    assert created.code == "learning"

    with pytest.raises(ApplicationException, match="目录已存在"):
        service.create_catalog({"name": "重复", "code": "learning"})

    no_repo_service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=None,
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    with pytest.raises(ApplicationException, match="未启用目录仓储"):
        no_repo_service.create_catalog({"name": "新目录"})


def test_update_and_delete_catalog_cover_default_and_failure_paths():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    with pytest.raises(ApplicationException, match="默认目录不能归档"):
        service.update_catalog("default", {"status": "archived"})

    created = service.create_catalog({"name": "教学运营", "code": "teaching_ops"})
    service._catalog_repo.delete = lambda code: False

    with pytest.raises(ApplicationException, match="删除目录失败"):
        service.delete_catalog("teaching_ops")

    with pytest.raises(ApplicationException, match="默认目录不能删除"):
        service.delete_catalog("default")

    no_repo_service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=None,
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    with pytest.raises(ApplicationException, match="未启用目录仓储"):
        no_repo_service.update_catalog("default", {"name": "新默认目录"})


def test_get_domain_detail_falls_back_to_default_catalog_and_registry_summary():
    domain_repo = _InMemoryDomainRepo()
    catalog_repo = _InMemoryCatalogRepo()
    domain = DomainDefinition(
        id="broken_catalog",
        code="broken_catalog",
        name="坏目录领域",
        catalog_code="ghost",
        status="draft",
        cubes=[],
        joins=[],
    )
    domain_repo.save(domain)
    registry = _RegistryRepo(
        {
            ("domain", "broken_catalog"): _RegistryEntry(
                {"sync_status": "warn", "publish_status": "draft"}
            )
        }
    )
    service = DomainModelingService(
        domain_repo=domain_repo,
        catalog_repo=catalog_repo,
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
        registry_repo=registry,
    )

    detail = service.get_domain_detail("broken_catalog")

    assert detail["catalog_code"] == "default"
    assert detail["catalog_name"] == "默认目录"
    assert detail["state_summary"]["publish_status"] == "draft"


def test_add_cube_dedups_and_add_join_is_rejected():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
    )
    domain = service.create_domain({"name": "学业分析"})
    published = service.publish_domain(domain.id or domain.code, cubes=["orders", "student"])

    with pytest.raises(ApplicationException, match="未找到 Cube"):
        service.add_cube(published.id or published.code, "ghost")

    same_domain = service.add_cube(published.id or published.code, "orders")
    assert same_domain.cubes == ["orders", "student"]

    with pytest.raises(ApplicationException, match="不再维护 Join"):
        service.add_join(
            published.id or published.code,
            {
                "name": "orders_to_student",
                "source_cube": "orders",
                "target_cube": "student",
                "source_field": "student_id",
                "target_field": "id",
                "join_type": "left",
                "cardinality": "N:1",
                "aggregation_strategy": "none",
            },
        )


def test_validate_domain_reports_missing_cube_without_join_diagnostics():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
    )
    domain = DomainDefinition(
        id="broken",
        code="broken",
        name="错误领域",
        status="draft",
        cubes=["orders", "ghost"],
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
    domain.joins.append(domain.joins[0].model_copy(update={"name": "orders_to_student_duplicate"}))

    diagnostics = service.validate_domain(domain)
    kinds = {item["kind"] for item in diagnostics}

    assert "missing_cube" in kinds
    assert "join_cube_outside_domain" not in kinds
    assert "duplicate_edge" not in kinds


def test_registry_failures_do_not_break_publish_or_summary():
    registry = _RegistryRepo(raise_on_commit=True)
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
        registry_repo=registry,
    )
    domain = service.create_domain({"name": "学业分析"})

    assert domain.status == "draft"

    failing_summary_service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
        registry_repo=_RegistryRepo(raise_on_get=True),
    )
    broken = failing_summary_service.create_domain({"name": "学业分析二"})
    summary = failing_summary_service._build_state_summary(broken)

    assert summary["status"] == "draft"
    assert summary["sync_status"] == "ok"


def test_generate_unique_codes_append_suffixes():
    domain_repo = _InMemoryDomainRepo()
    base_domain_code = generate_domain_code("学习分析")
    domain_repo.save(
        DomainDefinition(id=base_domain_code, code=base_domain_code, name="学习分析", status="draft", cubes=[], joins=[])
    )
    base_catalog_code = generate_catalog_code("教学")
    catalog_repo = _InMemoryCatalogRepo([CatalogDefinition(code=base_catalog_code, name="教学")])
    service = DomainModelingService(
        domain_repo=domain_repo,
        catalog_repo=catalog_repo,
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )

    domain = service.create_domain({"name": "学习分析"})
    catalog = service.create_catalog({"name": "教学", "code": ""})

    assert domain.code == f"{base_domain_code}_2"
    assert catalog.code == f"{base_catalog_code}_2"


def test_domain_modeling_helper_paths_cover_catalog_fallback_cache_and_missing_domain():
    invalidated = []
    catalog_repo = _InMemoryCatalogRepo()
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=catalog_repo,
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
        cache_invalidator=lambda: invalidated.append("called"),
    )

    updated = service.update_catalog(
        "default",
        {"name": "默认目录升级", "description": "说明", "sort_order": 3},
    )

    assert updated.name == "默认目录升级"
    assert updated.sort_order == 3
    assert catalog_repo.reload_count >= 2

    published = service.create_domain({"name": "学业分析"})
    published = service.publish_domain(published.id or published.code, cubes=["orders"])
    extended = service.add_cube(published.id or published.code, "student")

    assert invalidated
    assert extended.cubes == ["orders", "student"]

    no_repo_service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=None,
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
    )
    assert no_repo_service._list_catalog_definitions()[0].code == "default"
    with pytest.raises(ApplicationException, match="未找到目录: ghost"):
        no_repo_service._find_catalog("ghost")
    with pytest.raises(ApplicationException, match="未找到领域: ghost"):
        service.get_domain("ghost")


def test_publish_domain_reports_validation_errors_and_summary_recovers_missing_registry_entry():
    domain_repo = _InMemoryDomainRepo()
    registry = _RegistryRepo()
    service = DomainModelingService(
        domain_repo=domain_repo,
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("student")]),
        registry_repo=registry,
    )
    domain = service.create_domain({"name": "学业分析"})

    published = service.publish_domain(
        domain.id or domain.code,
        cubes=["orders"],
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
    assert published.joins == []

    registry.entries[("domain", domain.id or domain.code)] = _RegistryEntry({"sync_status": "warn", "publish_status": "draft"})
    assert service._build_state_summary(domain)["publish_status"] == "draft"

    registry.entries.clear()
    original_sync = service._sync_registry

    def _sync_and_persist(current):
        original_sync(current)
        registry.entries[("domain", current.id or current.code)] = _RegistryEntry(
            {"sync_status": "ok", "publish_status": current.status}
        )

    service._sync_registry = _sync_and_persist
    summary = service._build_state_summary(domain)

    assert summary["publish_status"] == "draft"
    assert registry.upserts[-1][0:2] == ("domain", domain.id or domain.code)


def test_domain_modeling_handles_blank_name_default_catalog_and_summary_without_registry_entry():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders")]),
        registry_repo=_RegistryRepo(),
    )

    with pytest.raises(ApplicationException, match="必须提供领域名称"):
        service.create_domain({"name": "   "})

    domain = service.create_domain({"name": "学业分析"})
    assert service._resolve_catalog_definition(None).code == "default"

    service._sync_registry = lambda current: None
    summary = service._build_state_summary(domain)

    assert summary == {
        "object_type": "domain",
        "object_name": domain.id or domain.code,
        "status": domain.status,
        "sync_status": "ok",
    }


def test_publish_domain_rejects_duplicate_cube_references_with_clear_message():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo([_cube("orders"), _cube("users"), _cube("classes")]),
    )
    domain = service.create_domain({"name": "学业分析"})

    with pytest.raises(ApplicationException, match="同一领域内不能重复引用同一个 Cube"):
        service.publish_domain(
            domain.id or domain.code,
            cubes=["orders", "users", "orders", "classes"],
        )


def test_update_domain_normalizes_cube_order_and_allows_cross_domain_reuse():
    domain_repo = _InMemoryDomainRepo()
    cube_repo = _InMemoryCubeRepo([_cube("orders"), _cube("users"), _cube("classes")])
    service = DomainModelingService(
        domain_repo=domain_repo,
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=cube_repo,
    )
    first = service.create_domain({"name": "领域一"})
    second = service.create_domain({"name": "领域二"})

    updated = service.update_domain(
        first.id or first.code,
        {"cubes": ["orders", "users", "orders", "classes"]},
    )
    published = service.publish_domain(second.id or second.code, cubes=["orders"])

    assert updated.cubes == ["orders", "users", "classes"]
    assert published.cubes == ["orders"]


def test_get_domain_detail_includes_governance_summary():
    service = DomainModelingService(
        domain_repo=_InMemoryDomainRepo(),
        catalog_repo=_InMemoryCatalogRepo(),
        cube_repo=_InMemoryCubeRepo(
            [
                _cube("orders", status="active"),
                _cube("users", status="draft"),
                _cube("archive_orders", status="deprecated"),
            ]
        ),
    )
    domain = service.create_domain({"name": "学业分析"})
    updated = service.update_domain(
        domain.id or domain.code,
        {
            "cubes": ["orders", "users", "archive_orders", "ghost"],
            "joins": [
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
        },
    )

    detail = service.get_domain_detail(updated.id or updated.code)

    assert detail["governance_summary"] == {
        "cube_count": 4,
        "active_cube_count": 1,
        "draft_cube_count": 1,
        "deprecated_cube_count": 1,
        "join_count": 0,
        "dangling_cube_count": 1,
    }
