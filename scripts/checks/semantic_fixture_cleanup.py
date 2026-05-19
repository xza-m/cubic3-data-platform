"""清理语义专项 live / fixture namespace。"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from tests.support.semantic_fixture_manager import SemanticTestFixtureManager


def cleanup_database(
    *,
    database_url: str,
    namespace: str,
    yaml_fixture_root: str | None = None,
) -> dict[str, Any]:
    engine = create_engine(database_url)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    try:
        return SemanticTestFixtureManager(
            session,
            yaml_fixture_root=Path(yaml_fixture_root) if yaml_fixture_root else None,
        ).cleanup_namespace(namespace)
    finally:
        session.close()
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="cleanup semantic fixture namespace")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--yaml-fixture-root")
    args = parser.parse_args()

    summary = cleanup_database(
        database_url=args.database_url,
        namespace=args.namespace,
        yaml_fixture_root=args.yaml_fixture_root,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
