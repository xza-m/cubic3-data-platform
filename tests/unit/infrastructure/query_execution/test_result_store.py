from datetime import timedelta

import pytest

from app.infrastructure.query_execution.result_store import LocalSpoolResultStore
from app.shared.exceptions import InvalidOperationError
from app.shared.utils.time import utcnow


def test_local_spool_writes_preview_and_marks_ready(tmp_path):
    store = LocalSpoolResultStore(spool_dir=tmp_path, max_preview_rows=2, max_result_bytes=1024)

    result = store.persist_rows(
        query_id="qry_1",
        columns=["id", "body"],
        rows=[
            {"id": 1, "body": "a"},
            {"id": 2, "body": "b"},
            {"id": 3, "body": "c"},
        ],
        expires_at=utcnow() + timedelta(days=1),
    )

    assert result.status == "READY"
    assert result.row_count == 3
    assert len(result.preview_json["rows"]) == 2
    assert store.read_text(result).count("\n") == 4


def test_local_spool_blocks_path_escape(tmp_path):
    store = LocalSpoolResultStore(spool_dir=tmp_path)
    result = store.build_result_object(
        query_id="qry_1",
        relative_path="../secret.csv",
        status="READY",
    )

    with pytest.raises(InvalidOperationError):
        store.read_text(result)


def test_local_spool_fails_when_result_too_large(tmp_path):
    store = LocalSpoolResultStore(spool_dir=tmp_path, max_result_bytes=10)

    with pytest.raises(InvalidOperationError) as info:
        store.persist_rows(
            query_id="qry_1",
            columns=["body"],
            rows=[{"body": "this row is too large"}],
        )

    assert info.value.code == "RESULT_TOO_LARGE"

