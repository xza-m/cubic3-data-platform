#!/usr/bin/env python
"""校验 OpenAPI Agent 契约。

该脚本属于 layer2 contract check：只通过 Flask test client 生成规范并做
结构化静态校验，不访问外部服务、不执行真实业务动作。
"""
from __future__ import annotations

import os
import sys
import logging
from contextlib import redirect_stdout
from io import StringIO
from typing import Any

from app.interfaces.api.openapi_metadata import (
    AGENT_EXTENSION_KEYS,
    AGENT_RISK_LEVELS,
    AGENT_SIDE_EFFECTS,
    CONTRACT_REQUIRED_OPERATIONS,
)


HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
REQUIRED_ERROR_STATUSES = {"401", "403", "422", "500"}


def build_openapi_spec() -> dict[str, Any]:
    os.environ.setdefault("FLASK_TESTING", "1")
    os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
    os.environ["LOG_LEVEL"] = "ERROR"
    previous_disable_level = logging.root.manager.disable
    log_buffer = StringIO()
    try:
        logging.disable(logging.CRITICAL)
        with redirect_stdout(log_buffer):
            from app import create_app

            app = create_app(role="web")
            app.config["TESTING"] = True
            response = app.test_client().get("/api/docs/openapi.json")
    finally:
        logging.disable(previous_disable_level)
    if response.status_code != 200:
        body = response.get_data(as_text=True)[:500]
        logs = log_buffer.getvalue()[-1000:]
        raise RuntimeError(f"/api/docs/openapi.json 返回 {response.status_code}: {body}\n{logs}")
    spec = response.get_json()
    if not isinstance(spec, dict):
        raise RuntimeError("/api/docs/openapi.json 未返回 JSON object")
    return spec


def validate_contract(
    spec: dict[str, Any],
    *,
    required_operations: list[tuple[str, str]] | tuple[tuple[str, str], ...] = CONTRACT_REQUIRED_OPERATIONS,
) -> list[str]:
    errors: list[str] = []

    if spec.get("openapi") != "3.0.3":
        errors.append("OpenAPI 版本必须是 3.0.3")
    if not spec.get("info", {}).get("title"):
        errors.append("info.title 不能为空")
    if "bearerAuth" not in spec.get("components", {}).get("securitySchemes", {}):
        errors.append("components.securitySchemes.bearerAuth 缺失")

    paths = spec.get("paths")
    if not isinstance(paths, dict) or not paths:
        errors.append("paths 不能为空")
        return errors

    operation_ids: dict[str, str] = {}
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method not in HTTP_METHODS or not isinstance(operation, dict):
                continue
            operation_id = operation.get("operationId")
            if not operation_id:
                errors.append(f"{method.upper()} {path} 缺少 operationId")
                continue
            location = f"{method.upper()} {path}"
            if operation_id in operation_ids:
                errors.append(f"operationId 重复: {operation_id} 出现在 {operation_ids[operation_id]} 和 {location}")
            operation_ids[operation_id] = location

    for path, method in required_operations:
        operation = paths.get(path, {}).get(method)
        location = f"{method.upper()} {path}"
        if operation is None:
            errors.append(f"核心 Agent 契约接口缺失: {location}")
            continue
        errors.extend(_validate_agent_operation(location, operation))

    return errors


def _validate_agent_operation(location: str, operation: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in AGENT_EXTENSION_KEYS:
        if key not in operation:
            errors.append(f"{location} 缺少 Agent 扩展字段 {key}")

    if "x-agent-safe" in operation and not isinstance(operation["x-agent-safe"], bool):
        errors.append(f"{location} x-agent-safe 必须是 boolean")
    if operation.get("x-side-effect") not in AGENT_SIDE_EFFECTS:
        errors.append(f"{location} x-side-effect 取值非法: {operation.get('x-side-effect')}")
    if operation.get("x-agent-risk") not in AGENT_RISK_LEVELS:
        errors.append(f"{location} x-agent-risk 取值非法: {operation.get('x-agent-risk')}")
    if "x-requires-confirmation" in operation and not isinstance(operation["x-requires-confirmation"], bool):
        errors.append(f"{location} x-requires-confirmation 必须是 boolean")
    if not isinstance(operation.get("x-permission-scope"), str) or not operation.get("x-permission-scope"):
        errors.append(f"{location} x-permission-scope 必须是非空字符串")

    responses = operation.get("responses", {})
    missing_statuses = REQUIRED_ERROR_STATUSES - set(responses)
    if missing_statuses:
        errors.append(f"{location} 缺少错误响应: {', '.join(sorted(missing_statuses))}")

    response_200 = responses.get("200")
    if not _has_concrete_data_schema(response_200):
        errors.append(f"{location} 200 响应缺少字段级 data schema")

    if location.startswith("POST "):
        request_body = operation.get("requestBody")
        if not _has_concrete_json_schema(request_body):
            errors.append(f"{location} POST 请求缺少字段级 requestBody schema")

    return errors


def _has_concrete_json_schema(container: dict[str, Any] | None) -> bool:
    if not isinstance(container, dict):
        return False
    schema = container.get("content", {}).get("application/json", {}).get("schema")
    if not isinstance(schema, dict):
        return False
    return bool(schema.get("properties") or schema.get("items") or schema.get("$ref"))


def _has_concrete_data_schema(response: dict[str, Any] | None) -> bool:
    if not isinstance(response, dict):
        return False
    schema = response.get("content", {}).get("application/json", {}).get("schema")
    if not isinstance(schema, dict):
        return False
    data_schema = schema.get("properties", {}).get("data")
    if not isinstance(data_schema, dict):
        return False
    return bool(data_schema.get("properties") or data_schema.get("items") or data_schema.get("$ref"))


def main() -> int:
    try:
        spec = build_openapi_spec()
        errors = validate_contract(spec)
    except Exception as exc:
        print(f"[layer2][contracts] OpenAPI 契约生成失败: {exc}", file=sys.stderr)
        return 1

    if errors:
        print("[layer2][contracts] OpenAPI Agent 契约校验失败:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("[layer2][contracts] OpenAPI Agent 契约校验通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
