from datetime import datetime, timezone

from app.domain.entities.semantic_registry_entry import SemanticRegistryEntry
from app.infrastructure.repositories.semantic_registry_repository import SemanticRegistryRepository


def test_registry_repository_upsert_and_get(db_session):
    repo = SemanticRegistryRepository(db_session)

    repo.upsert(
        "cube",
        "orders",
        definition_hash="hash-1",
        last_drift_status="warn",
    )
    repo.commit()

    entry = repo.get("cube", "orders")
    assert isinstance(entry, SemanticRegistryEntry)
    assert entry.definition_hash == "hash-1"
    assert entry.last_drift_status == "warn"


def test_registry_repository_updates_existing_entry(db_session):
    repo = SemanticRegistryRepository(db_session)
    repo.upsert("view", "sales_view", publish_status="published")
    repo.commit()

    repo.upsert("view", "sales_view", publish_status="unpublished", definition_hash="hash-2")
    repo.commit()

    entry = repo.get("view", "sales_view")
    assert entry.publish_status == "unpublished"
    assert entry.definition_hash == "hash-2"


def test_registry_repository_upsert_updates_optional_fields_and_normalizes_datetimes(db_session):
    repo = SemanticRegistryRepository(db_session)

    entry = repo.upsert(
        "domain",
        "academic",
        source_id=1,
        status="active",
        definition_hash="hash-3",
        publish_status="published",
        last_published_at="2026-01-01T00:00:00+00:00",
        last_drift_status="ok",
        last_drift_checked_at="2026-01-02T00:00:00+00:00",
        last_loaded_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
        measure_summary_snapshot={"count": 2},
        certified_measure_list=["m1"],
        lineage_summary={"nodes": 3},
        source_binding_summary={"source_id": 1},
        domain_fingerprint="fp-1",
    )
    repo.commit()

    assert isinstance(entry, SemanticRegistryEntry)
    assert entry.source_id == 1
    assert entry.status == "active"
    assert entry.publish_status == "published"
    assert entry.last_published_at.isoformat() == "2026-01-01T00:00:00"
    assert entry.last_drift_checked_at.isoformat() == "2026-01-02T00:00:00"
    assert entry.last_loaded_at.isoformat().startswith("2026-01-03T00:00:00")
    assert entry.measure_summary_snapshot == {"count": 2}
    assert entry.certified_measure_list == ["m1"]
    assert entry.lineage_summary == {"nodes": 3}
    assert entry.source_binding_summary == {"source_id": 1}
    assert entry.domain_fingerprint == "fp-1"


def test_registry_repository_normalize_datetime_passthrough_for_non_string_values():
    value = 123
    assert SemanticRegistryRepository._normalize_datetime(value) == 123
