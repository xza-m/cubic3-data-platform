"""统一输出契约 + 命令执行包装 + 语义化退出码。

约定（与 app/shared/response.py 同构，但 CLI 自构造 dict——success()/error() 返回的是
Flask Response 元组，不能直接 json.dumps）：
  成功: {"code": 0,  "message": "success", "data": <payload>, "trace_id": None}
  失败: {"code": -1, "message": <msg>, "trace_id": None, ["details": ...]}
默认 stdout 输出 JSON（agent 的稳定机器可读契约）；--output human 给可读表格/键值。
"""
from __future__ import annotations

import json
import sys
from typing import Any, Callable, Iterable

# 语义化退出码
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_NOT_FOUND = 4
EXIT_NOT_READY = 5


def parse_optional_bool(value: str | None) -> bool | None:
    """三态布尔：None 保持 None；'true/1/yes' → True；'false/0/no' → False。"""
    if value is None:
        return None
    v = value.strip().lower()
    if v in ("true", "1", "yes", "y"):
        return True
    if v in ("false", "0", "no", "n"):
        return False
    raise ValueError(f"无法解析布尔值: {value!r}（用 true/false）")


def envelope(data: Any, message: str = "success") -> dict:
    return {"code": 0, "message": message, "data": data, "trace_id": None}


def err_envelope(message: str, details: Any = None) -> dict:
    payload: dict = {"code": -1, "message": message, "trace_id": None}
    if details is not None:
        payload["details"] = details
    return payload


def _emit(payload: Any, output: str) -> None:
    if output == "human":
        _emit_human(payload)
        return
    json.dump(payload, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True, default=str)
    sys.stdout.write("\n")


def emit_success(data: Any, output: str = "json", message: str = "success") -> None:
    _emit(envelope(data, message), output)


def fail(message: str, exit_code: int = EXIT_ERROR, details: Any = None, output: str = "json") -> None:
    """输出失败 envelope 到 stdout 并以语义化退出码结束进程。"""
    _emit(err_envelope(message, details=details), output)
    raise SystemExit(exit_code)


def not_found(message: str, output: str = "json") -> None:
    fail(message, exit_code=EXIT_NOT_FOUND, output=output)


def run(obj, fn: Callable[[Any], Any]) -> None:
    """在 app_context 内执行 fn(container) → data，统一包 envelope 与异常。

    fn 抛 SystemExit（如 not_found/fail）按其退出码透传；其它异常归一为失败 envelope。
    """
    from app.interfaces.cli.bootstrap import app_context

    try:
        with app_context() as (_app, container):
            data = fn(container)
            emit_success(data, output=obj.output)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — CLI 边界统一兜底
        fail(f"{type(exc).__name__}: {exc}", output=obj.output)


# ---- human 表格渲染（仅 --output human；JSON 是默认与 agent 契约）-----------------

def _emit_human(payload: Any) -> None:
    data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
    if isinstance(payload, dict) and payload.get("code") not in (0, None):
        print(f"[error] {payload.get('message')}", file=sys.stderr)
        if payload.get("details") is not None:
            print(json.dumps(payload["details"], ensure_ascii=False, indent=2, default=str), file=sys.stderr)
        return
    rows = _rows(data)
    if rows:
        _emit_table(rows)
    elif isinstance(data, dict):
        for key, value in data.items():
            print(f"{key}: {_cell(value)}")
    else:
        print(_cell(data))


def _rows(data: Any) -> list[dict]:
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return [r for r in data["items"] if isinstance(r, dict)]
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    return []


def _emit_table(rows: list[dict]) -> None:
    columns = _columns(rows)
    widths = {c: max(len(c), *(len(_cell(r.get(c))) for r in rows)) for c in columns}
    print("  ".join(c.ljust(widths[c]) for c in columns))
    print("  ".join("-" * widths[c] for c in columns))
    for r in rows:
        print("  ".join(_cell(r.get(c)).ljust(widths[c]) for c in columns))


def _columns(rows: Iterable[dict]) -> list[str]:
    preferred = ["id", "name", "title", "term", "canonical_name", "status", "source_id",
                 "database", "schema", "table", "qualified_name", "sync_status"]
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
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
