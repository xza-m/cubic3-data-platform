"""OpenAPI 契约校验脚本单元测试。"""

from scripts.checks.openapi_contracts import validate_contract


def _valid_operation(operation_id: str) -> dict:
    return {
        "operationId": operation_id,
        "x-agent-safe": True,
        "x-side-effect": "none",
        "x-agent-risk": "low",
        "x-requires-confirmation": False,
        "x-permission-scope": "demo:read",
        "responses": {
            "200": {
                "description": "请求成功",
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "code": {"type": "integer"},
                                "message": {"type": "string"},
                                "data": {
                                    "type": "object",
                                    "properties": {"items": {"type": "array"}},
                                },
                                "trace_id": {"type": "string"},
                            },
                        }
                    }
                },
            },
            "401": {"description": "未认证"},
            "403": {"description": "无权限"},
            "422": {"description": "参数语义错误"},
            "500": {"description": "服务器错误"},
        },
    }


def _spec_with(operation: dict) -> dict:
    return {
        "openapi": "3.0.3",
        "info": {"title": "CUBIC3 API", "version": "1.0.0"},
        "components": {"securitySchemes": {"bearerAuth": {"type": "http"}}},
        "paths": {"/api/v1/demo": {"get": operation}},
    }


def test_validate_contract_accepts_agent_ready_operation():
    errors = validate_contract(
        _spec_with(_valid_operation("DemoList")),
        required_operations=[("/api/v1/demo", "get")],
    )

    assert errors == []


def test_validate_contract_rejects_missing_agent_extensions():
    operation = _valid_operation("DemoList")
    operation.pop("x-agent-safe")

    errors = validate_contract(
        _spec_with(operation),
        required_operations=[("/api/v1/demo", "get")],
    )

    assert any("x-agent-safe" in error for error in errors)


def test_validate_contract_rejects_duplicate_operation_ids():
    spec = _spec_with(_valid_operation("DuplicateOperation"))
    spec["paths"]["/api/v1/other"] = {"get": _valid_operation("DuplicateOperation")}

    errors = validate_contract(
        spec,
        required_operations=[("/api/v1/demo", "get")],
    )

    assert any("DuplicateOperation" in error for error in errors)


def test_validate_contract_rejects_json_schema_type_arrays_for_openapi30():
    spec = _spec_with(_valid_operation("DemoList"))
    operation = spec["paths"]["/api/v1/demo"]["get"]
    operation["responses"]["200"]["content"]["application/json"]["schema"]["properties"]["data"]["properties"][
        "optional_name"
    ] = {"type": ["string", "null"]}

    errors = validate_contract(
        spec,
        required_operations=[("/api/v1/demo", "get")],
    )

    assert any("数组型 type" in error for error in errors)
