from __future__ import annotations

import json
import sys
from typing import Any, Iterable


def emit(data: Any, *, output: str = "json") -> None:
    if output == "human":
        _emit_table(data)
        return
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")


def _emit_table(data: Any) -> None:
    rows = _rows(data)
    if not rows:
        print("(empty)")
        return
    columns = _columns(rows)
    widths = {
        column: max(len(column), *(len(_cell(row.get(column))) for row in rows))
        for column in columns
    }
    header = "  ".join(column.ljust(widths[column]) for column in columns)
    divider = "  ".join("-" * widths[column] for column in columns)
    print(header)
    print(divider)
    for row in rows:
        print("  ".join(_cell(row.get(column)).ljust(widths[column]) for column in columns))


def _rows(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return [row for row in data["items"] if isinstance(row, dict)]
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _columns(rows: Iterable[dict[str, Any]]) -> list[str]:
    preferred = [
        "id",
        "name",
        "title",
        "source_id",
        "database",
        "schema",
        "status",
        "sync_status",
        "field_count",
        "total",
    ]
    seen: list[str] = []
    for row in rows:
        for column in preferred:
            if column in row and column not in seen:
                seen.append(column)
        for column in row:
            if column not in seen and _is_scalar(row[column]):
                seen.append(column)
        if len(seen) >= 8:
            break
    return seen[:8]


def _is_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if _is_scalar(value):
        return str(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True)
