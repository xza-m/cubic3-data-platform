"""OpenAPI 文档与 Agent 契约集成测试。"""


def _response_data_schema(operation: dict, status: str = "200") -> dict:
    return (
        operation["responses"][status]["content"]["application/json"]["schema"]["properties"]["data"]
    )


def test_openapi_json_exposes_agent_ready_contracts(client):
    response = client.get("/api/docs/openapi.json")

    assert response.status_code == 200
    spec = response.get_json()
    assert spec["openapi"] == "3.0.3"
    assert spec["info"]["title"] == "CUBIC3 API"
    assert "bearerAuth" in spec["components"]["securitySchemes"]

    core_operations = {
        ("/api/v1/data-center/datasources", "get"): {
            "operationId": "DataSourcesList",
            "side_effect": "none",
            "risk": "low",
        },
        ("/api/v1/semantic-router/route", "post"): {
            "operationId": "SemanticRouterRoute",
            "side_effect": "preview",
            "risk": "low",
        },
        ("/api/v1/execution-compiler/compile-preview", "post"): {
            "operationId": "ExecutionCompilerCompilePreview",
            "side_effect": "preview",
            "risk": "medium",
        },
        ("/api/v1/semantic/health", "get"): {
            "operationId": "SemanticRuntimeHealthGet",
            "side_effect": "none",
            "risk": "low",
        },
        ("/api/v1/governance/audit-traces", "get"): {
            "operationId": "GovernanceAuditTraceList",
            "side_effect": "none",
            "risk": "low",
        },
        ("/api/v1/agent/semantic/execute", "post"): {
            "operationId": "AgentSemanticExecute",
            "side_effect": "execute",
            "risk": "high",
        },
    }

    for (path, method), expected in core_operations.items():
        operation = spec["paths"][path][method]
        assert operation["operationId"] == expected["operationId"]
        assert operation["x-agent-safe"] is True
        assert operation["x-side-effect"] == expected["side_effect"]
        assert operation["x-agent-risk"] == expected["risk"]
        assert operation["x-requires-confirmation"] is False
        assert operation["x-permission-scope"]
        assert {"401", "403", "422", "500"} <= set(operation["responses"])
        data_schema = _response_data_schema(operation)
        assert data_schema["type"] in {"object", "array"}
        assert data_schema.get("properties") or data_schema.get("items")

    compile_preview = spec["paths"]["/api/v1/execution-compiler/compile-preview"]["post"]
    assert "不会真实执行 SQL" in compile_preview["description"]
    assert "不会投递异步任务" in compile_preview["description"]


def test_openapi_agent_plan_is_stable_official_runtime_contract(client):
    response = client.get("/api/docs/openapi.json")
    assert response.status_code == 200
    spec = response.get_json()

    agent_operation = spec["paths"].get("/api/v1/agent/semantic/plan", {}).get("post")
    if agent_operation is None:
        return

    assert agent_operation["operationId"] == "AgentSemanticPlan"
    assert agent_operation["x-agent-contract-status"] == "stable"
    assert agent_operation["x-requires-confirmation"] is False
    assert "official" in agent_operation["description"]
    data_schema = _response_data_schema(agent_operation)
    properties = data_schema["properties"]
    assert {"runtime_mode", "business_intent", "projection_result", "resolved_bindings", "semantic_trace"} <= set(properties)


def test_openapi_agent_execute_and_query_execution_are_stable_contracts(client):
    response = client.get("/api/docs/openapi.json")
    assert response.status_code == 200
    spec = response.get_json()

    execute_operation = spec["paths"]["/api/v1/agent/semantic/execute"]["post"]
    assert execute_operation["operationId"] == "AgentSemanticExecute"
    assert execute_operation["x-agent-contract-status"] == "stable"
    assert execute_operation["x-side-effect"] == "execute"
    assert execute_operation["x-agent-risk"] == "high"
    assert execute_operation["x-requires-confirmation"] is False
    assert "dw-query-gateway" in execute_operation["description"]
    execute_properties = _response_data_schema(execute_operation)["properties"]
    assert {"status", "gateway_query_id", "gateway", "policy_decision"} <= set(execute_properties)

    assert "/api/v1/query-execution/jobs" not in spec["paths"]
    assert not any(path.startswith("/api/v1/query-execution/") for path in spec["paths"])


def test_openapi_query_execution_api_is_not_exposed(client):
    response = client.get("/api/docs/openapi.json")
    assert response.status_code == 200
    spec = response.get_json()

    assert "/api/v1/query-execution/jobs" not in spec["paths"]
    assert not any(path.startswith("/api/v1/query-execution/") for path in spec["paths"])
