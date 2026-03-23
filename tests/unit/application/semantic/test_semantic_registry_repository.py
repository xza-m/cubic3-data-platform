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
