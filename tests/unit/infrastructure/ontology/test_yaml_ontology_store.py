from __future__ import annotations

from app.domain.ontology.entities import BusinessObject, GovernanceAuditTrace
from app.infrastructure.ontology.yaml_audit_trace_repository import YamlGovernanceAuditTraceRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


def test_yaml_entity_store_loads_yaml_files_and_skips_empty_documents(tmp_path):
    base_dir = tmp_path / "objects"
    base_dir.mkdir()
    (base_dir / "empty.yml").write_text("", encoding="utf-8")
    (base_dir / "order.yml").write_text("name: order\ntitle: 订单\n", encoding="utf-8")

    store = YamlEntityStore(str(base_dir), BusinessObject, "name")

    items = store.list_all()
    assert len(items) == 1
    assert items[0].name == "order"
    assert store.get("order").title == "订单"
    assert store.get("ghost") is None

    store.save(BusinessObject(name="customer", title="客户"))
    assert (base_dir / "customer.yml").exists()
    assert sorted(item.name for item in store.list_all()) == ["customer", "order"]


def test_yaml_governance_audit_repository_filters_by_policy_and_dimensions(tmp_path):
    repo = YamlGovernanceAuditTraceRepository(str(tmp_path / "audit"))
    repo.save(
        GovernanceAuditTrace(
            id="audit-1",
            target_type="metric",
            target_name="gmv",
            viewer_roles=["finance"],
            route_type="cube",
            execution_target="sql",
            decision="allow",
            policy={"name": "gmv_policy"},
            traceability={"metric": "gmv"},
            timestamp="2026-04-14T10:00:00",
        )
    )
    repo.save(
        GovernanceAuditTrace(
            id="audit-2",
            target_type="metric",
            target_name="revenue",
            viewer_roles=["analyst"],
            route_type="hybrid",
            execution_target="retrieval",
            decision="blocked",
            policy={"name": "revenue_policy"},
            traceability={"metric": "revenue"},
            timestamp="2026-04-14T10:05:00",
        )
    )
    repo.save(
        GovernanceAuditTrace(
            id="audit-3",
            target_type="action",
            target_name="pay",
            viewer_roles=["ops"],
            route_type="tool",
            execution_target="tool",
            decision="not_configured",
            policy=None,
            traceability={"action": "pay"},
            timestamp="2026-04-14T10:10:00",
        )
    )

    all_items = repo.list_all()
    assert [item.id for item in all_items] == ["audit-3", "audit-2", "audit-1"]
    assert [item.id for item in repo.list_by_policy("gmv_policy")] == ["audit-1"]
    assert [item.id for item in repo.list_filtered(target_type="metric")] == ["audit-2", "audit-1"]
    assert [item.id for item in repo.list_filtered(target_name="gmv")] == ["audit-1"]
    assert [item.id for item in repo.list_filtered(decision="blocked")] == ["audit-2"]
    assert [item.id for item in repo.list_filtered(route_type="tool")] == ["audit-3"]
