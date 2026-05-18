from __future__ import annotations

import csv
import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Iterable

from app.shared.exceptions import InvalidOperationError


@dataclass
class StoredResultObject:
    """本地 result object 的轻量领域对象。"""

    query_id: str
    status: str
    relative_path: str
    content_type: str = "text/csv"
    row_count: int = 0
    byte_size: int = 0
    sha256: str | None = None
    preview_json: dict[str, Any] = field(default_factory=dict)
    expires_at: datetime | None = None


class LocalSpoolResultStore:
    """基于共享 spool 目录的第一版结果存储。"""

    def __init__(
        self,
        *,
        spool_dir: str | Path,
        max_preview_rows: int = 1000,
        max_result_bytes: int = 500 * 1024 * 1024,
    ):
        self.spool_dir = Path(spool_dir).resolve()
        self.max_preview_rows = max_preview_rows
        self.max_result_bytes = max_result_bytes
        self.spool_dir.mkdir(parents=True, exist_ok=True)

    def build_result_object(
        self,
        *,
        query_id: str,
        relative_path: str,
        status: str = "DRAFT",
        **kwargs: Any,
    ) -> StoredResultObject:
        return StoredResultObject(
            query_id=query_id,
            status=status,
            relative_path=relative_path,
            **kwargs,
        )

    def persist_rows(
        self,
        *,
        query_id: str,
        columns: list[str],
        rows: Iterable[dict[str, Any]],
        expires_at: datetime | None = None,
    ) -> StoredResultObject:
        preview_rows: list[dict[str, Any]] = []
        row_count = 0
        hasher = hashlib.sha256()
        relative_path = f"{query_id}.csv"
        final_path = self._resolve_path(relative_path)

        with NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=self.spool_dir,
            delete=False,
        ) as tmp_file:
            tmp_path = Path(tmp_file.name)
            writer = csv.DictWriter(tmp_file, fieldnames=columns)
            writer.writeheader()
            tmp_file.flush()
            self._check_size(tmp_path)

            for row in rows:
                writer.writerow({column: row.get(column) for column in columns})
                row_count += 1
                if len(preview_rows) < self.max_preview_rows:
                    preview_rows.append({column: row.get(column) for column in columns})
                tmp_file.flush()
                self._check_size(tmp_path)

        try:
            content = tmp_path.read_bytes()
            hasher.update(content)
            tmp_path.replace(final_path)
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise

        return StoredResultObject(
            query_id=query_id,
            status="READY",
            relative_path=relative_path,
            row_count=row_count,
            byte_size=final_path.stat().st_size,
            sha256=hasher.hexdigest(),
            preview_json={"columns": columns, "rows": preview_rows},
            expires_at=expires_at,
        )

    def read_text(self, result: StoredResultObject) -> str:
        if result.status != "READY":
            raise InvalidOperationError(
                f"Result object for {result.query_id} is not ready",
                code="RESULT_NOT_READY",
            )
        return self._resolve_path(result.relative_path).read_text(encoding="utf-8")

    def delete_relative_path(self, relative_path: str) -> bool:
        path = self._resolve_path(relative_path)
        existed = path.exists()
        path.unlink(missing_ok=True)
        return existed

    def _resolve_path(self, relative_path: str) -> Path:
        candidate = (self.spool_dir / relative_path).resolve()
        try:
            candidate.relative_to(self.spool_dir)
        except ValueError as exc:
            raise InvalidOperationError(
                "Result path escapes query execution spool directory",
                code="INVALID_RESULT_PATH",
            ) from exc
        return candidate

    def _check_size(self, path: Path) -> None:
        size = path.stat().st_size
        if size > self.max_result_bytes:
            path.unlink(missing_ok=True)
            raise InvalidOperationError(
                f"Query result exceeds byte limit {self.max_result_bytes}",
                code="RESULT_TOO_LARGE",
            )
