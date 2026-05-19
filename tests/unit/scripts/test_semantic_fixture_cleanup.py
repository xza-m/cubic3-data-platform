from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.extensions import db
from app.infrastructure.semantic.models import SemanticAssetORM
from scripts.checks.semantic_fixture_cleanup import cleanup_database


def test_semantic_fixture_cleanup_cli_removes_namespace_rows(tmp_path):
    db_path = tmp_path / "semantic-fixture.db"
    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    try:
        session.add(
            SemanticAssetORM(
                id="asset_fixture",
                namespace="qa_live_fixture",
                asset_type="cube",
                asset_key="student_comment",
                status="active",
                source_kind="test_fixture",
            )
        )
        session.commit()
    finally:
        session.close()

    summary = cleanup_database(database_url=database_url, namespace="qa_live_fixture")

    session = sessionmaker(bind=engine)()
    try:
        assert summary["ok"] is True
        assert summary["deleted"]["assets"] == 1
        assert session.get(SemanticAssetORM, "asset_fixture") is None
    finally:
        session.close()
        engine.dispose()


def test_semantic_fixture_cleanup_cli_removes_yaml_namespace(tmp_path):
    db_path = tmp_path / "semantic-fixture.db"
    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url)
    db.metadata.create_all(bind=engine)
    engine.dispose()
    yaml_root = tmp_path / "yaml"
    namespace_dir = yaml_root / "qa_live_fixture"
    namespace_dir.mkdir(parents=True)
    (namespace_dir / "cube.yml").write_text("name: student_comment\n", encoding="utf-8")

    summary = cleanup_database(
        database_url=database_url,
        namespace="qa_live_fixture",
        yaml_fixture_root=str(yaml_root),
    )

    assert summary["ok"] is True
    assert summary["deleted"]["yaml_fixture_outputs"] == 1
    assert not Path(namespace_dir).exists()
