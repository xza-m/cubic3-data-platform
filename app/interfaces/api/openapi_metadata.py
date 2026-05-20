"""OpenAPI 显式契约元数据。

本模块只补充 Flask 路由自动扫描无法稳定推断的机器可读契约：
请求/响应 schema、稳定 operationId、Agent 风险扩展和权限语义。
它不注册路由，也不替代现有 Blueprint。
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any


AGENT_SIDE_EFFECTS = {"none", "preview", "write", "execute", "delete", "publish"}
AGENT_RISK_LEVELS = {"low", "medium", "high"}
AGENT_EXTENSION_KEYS = (
    "x-agent-safe",
    "x-side-effect",
    "x-agent-risk",
    "x-requires-confirmation",
    "x-permission-scope",
)

CONTRACT_REQUIRED_OPERATIONS = (
    ("/api/v1/data-center/datasources", "get"),
    ("/api/v1/semantic-router/route", "post"),
    ("/api/v1/execution-compiler/compile-preview", "post"),
    ("/api/v1/governance/audit-traces", "get"),
    ("/api/v1/agent/semantic/execute", "post"),
    ("/api/v1/query-execution/jobs", "post"),
    ("/api/v1/query-execution/jobs/{query_id}", "get"),
)

_EXTRA_OPERATION_METADATA: dict[tuple[str, str], dict[str, Any]] = {}


def register_openapi_metadata(endpoint: str, method: str, metadata: dict[str, Any]) -> None:
    """注册测试或局部路由用的额外契约元数据。"""
    _EXTRA_OPERATION_METADATA[(endpoint, method.upper())] = deepcopy(metadata)


def clear_extra_openapi_metadata() -> None:
    """清理测试注册的额外契约元数据。"""
    _EXTRA_OPERATION_METADATA.clear()


def get_openapi_metadata(endpoint: str, method: str, path: str) -> dict[str, Any] | None:
    """按 endpoint 优先、path 兜底查找显式契约元数据。"""
    method_upper = method.upper()
    metadata = _EXTRA_OPERATION_METADATA.get((endpoint, method_upper))
    if metadata is not None:
        return deepcopy(metadata)
    metadata = OPENAPI_OPERATION_METADATA.get((path, method.lower()))
    if metadata is not None:
        return deepcopy(metadata)
    return None


def merge_operation_metadata(operation: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    """把显式元数据合并到自动扫描结果。"""
    merged = deepcopy(operation)
    for key, value in metadata.items():
        if key == "responses":
            responses = deepcopy(merged.get("responses", {}))
            responses.update(value)
            merged["responses"] = responses
            continue
        if key == "parameters":
            merged["parameters"] = _merge_parameters(merged.get("parameters", []), value)
            continue
        merged[key] = value
    return merged


def _merge_parameters(base: list[dict[str, Any]], explicit: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged = deepcopy(base)
    existing = {(param.get("name"), param.get("in")) for param in merged}
    for param in explicit:
        key = (param.get("name"), param.get("in"))
        if key not in existing:
            merged.append(deepcopy(param))
            existing.add(key)
    return merged


def api_response_schema(data_schema: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "object",
        "required": ["code", "message", "data"],
        "properties": {
            "code": {"type": "integer", "description": "状态码，0 表示成功"},
            "message": {"type": "string", "description": "响应消息"},
            "data": data_schema,
            "trace_id": {"type": ["string", "null"], "description": "请求追踪 ID"},
        },
    }


def request_body_schema(schema: dict[str, Any], *, required: bool = True) -> dict[str, Any]:
    return {"required": required, "content": {"application/json": {"schema": schema}}}


def json_response(data_schema: dict[str, Any], description: str = "请求成功") -> dict[str, Any]:
    return {
        "description": description,
        "content": {"application/json": {"schema": api_response_schema(data_schema)}},
    }


def error_response(description: str) -> dict[str, Any]:
    return {
        "description": description,
        "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}},
    }


def standard_error_responses() -> dict[str, Any]:
    return {
        "400": error_response("请求参数错误"),
        "401": error_response("未认证或 Token 无效"),
        "403": error_response("已认证但无权限访问"),
        "404": error_response("资源不存在"),
        "422": error_response("请求语义合法性校验失败"),
        "500": error_response("服务器内部错误"),
    }


def agent_extensions(
    *,
    safe: bool,
    side_effect: str,
    risk: str,
    requires_confirmation: bool,
    permission_scope: str,
    contract_status: str = "active",
) -> dict[str, Any]:
    return {
        "x-agent-safe": safe,
        "x-side-effect": side_effect,
        "x-agent-risk": risk,
        "x-requires-confirmation": requires_confirmation,
        "x-permission-scope": permission_scope,
        "x-agent-contract-status": contract_status,
    }


def query_param(name: str, schema: dict[str, Any], description: str) -> dict[str, Any]:
    return {"name": name, "in": "query", "required": False, "schema": schema, "description": description}


def object_schema(properties: dict[str, Any], *, required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


def array_schema(item_schema: dict[str, Any]) -> dict[str, Any]:
    return {"type": "array", "items": item_schema}


DATASOURCE_ITEM_SCHEMA = object_schema(
    {
        "id": {"type": "integer", "description": "数据源 ID"},
        "name": {"type": "string", "description": "数据源名称"},
        "source_type": {
            "type": "string",
            "enum": ["maxcompute", "clickhouse", "postgresql", "mysql"],
            "description": "数据源类型",
        },
        "description": {"type": ["string", "null"], "description": "描述"},
        "is_active": {"type": "boolean", "description": "是否启用"},
        "connection_status": {"type": "string", "description": "连接状态"},
        "created_by": {"type": "string", "description": "创建人"},
        "created_at": {"type": "string", "format": "date-time", "description": "创建时间"},
        "updated_at": {"type": "string", "format": "date-time", "description": "更新时间"},
    }
)

PRINCIPAL_CONTEXT_SCHEMA = object_schema(
    {
        "principal_id": {"type": "string", "description": "调用主体 ID"},
        "principal_type": {"type": "string", "description": "调用主体类型"},
        "roles": array_schema({"type": "string"}),
        "metadata": {"type": "object", "additionalProperties": True},
    }
)

POLICY_DECISION_SCHEMA = object_schema(
    {
        "decision": {"type": "string", "description": "策略决策结果"},
        "policy": {"type": "string", "description": "命中的策略名称"},
        "reason": {"type": "string", "description": "决策原因"},
        "policy_epoch": {"type": "integer", "description": "全局策略纪元，用于 gateway 判断策略新旧"},
        "execution_permit": {"type": "object", "additionalProperties": True, "description": "权限判定预览上下文，不包含 gateway 可执行凭证或真实 RAM 凭据"},
    }
)

SEMANTIC_ROUTE_RESPONSE_SCHEMA = object_schema(
    {
        "runtime_mode": {"type": "string", "enum": ["official", "preview"], "description": "运行模式"},
        "route_type": {"type": "string", "description": "路由类型"},
        "target_type": {"type": "string", "description": "目标类型"},
        "target_name": {"type": "string", "description": "目标名称"},
        "confidence": {"type": "number", "description": "匹配置信度"},
        "business_intent": {"type": "object", "additionalProperties": True, "description": "业务语义命中结果"},
        "projection_result": {"type": "object", "additionalProperties": True, "description": "投影和 Binding 结果"},
        "resolved_bindings": array_schema({"type": "object", "additionalProperties": True}),
        "policy_decision": POLICY_DECISION_SCHEMA,
        "planning_mode": {"type": "string", "description": "规划模式"},
        "matches": array_schema({"type": "object", "additionalProperties": True}),
    }
)

EXECUTION_COMPILE_RESPONSE_SCHEMA = object_schema(
    {
        "status": {"type": "string", "description": "编译状态"},
        "target_type": {"type": "string", "description": "编译目标类型"},
        "logical_sql": {"type": ["string", "null"], "description": "逻辑 SQL"},
        "resource_set": {"type": ["object", "array"], "additionalProperties": True},
        "sql_hash": {"type": ["string", "null"], "description": "SQL 哈希"},
        "data_level": {"type": ["string", "null"], "description": "数据分级"},
        "bindings": {"type": "object", "additionalProperties": True},
        "traceability": {"type": "object", "additionalProperties": True},
        "policy_decision": POLICY_DECISION_SCHEMA,
        "ticket_material": {"type": "object", "additionalProperties": True},
    }
)

SEMANTIC_HEALTH_RESPONSE_SCHEMA = object_schema(
    {
        "status": {"type": "string", "description": "语义 Runtime 健康状态"},
        "runtime": {
            "type": "object",
            "additionalProperties": True,
            "description": "active snapshot、release version pin、资产和策略计数",
        },
    },
    required=["status", "runtime"],
)

GOVERNANCE_AUDIT_TRACE_SCHEMA = object_schema(
    {
        "id": {"type": "string", "description": "审计记录 ID"},
        "principal_id": {"type": "string", "description": "调用主体 ID"},
        "semantic_plan_id": {"type": ["string", "null"], "description": "语义规划 ID"},
        "sql_hash": {"type": ["string", "null"], "description": "SQL 哈希"},
        "decision": {"type": "string", "description": "治理决策"},
        "route_type": {"type": ["string", "null"], "description": "路由类型"},
        "policy": {"type": ["string", "null"], "description": "策略名称"},
        "created_at": {"type": "string", "format": "date-time", "description": "创建时间"},
    }
)

AGENT_PLAN_RESPONSE_SCHEMA = object_schema(
    {
        "semantic_plan_id": {"type": "string", "description": "语义规划 ID"},
        "runtime_mode": {"type": "string", "enum": ["official"], "description": "正式 Agent Runtime 模式"},
        "business_intent": {"type": "object", "additionalProperties": True, "description": "Ontology 命中的业务意图"},
        "route": SEMANTIC_ROUTE_RESPONSE_SCHEMA,
        "projection_result": {"type": ["object", "null"], "additionalProperties": True, "description": "Ontology 到 Cube 的投影结果"},
        "resolved_bindings": array_schema({"type": "object", "additionalProperties": True}),
        "compiled_targets": array_schema(EXECUTION_COMPILE_RESPONSE_SCHEMA),
        "policy_decision": POLICY_DECISION_SCHEMA,
        "ticket_preview": {"type": "object", "additionalProperties": True},
        "semantic_trace": {"type": "object", "additionalProperties": True, "description": "业务语义、Binding、编译和治理回溯"},
    }
)

QUESTION_REQUEST_SCHEMA = object_schema(
    {
        "question": {"type": "string", "minLength": 1, "description": "自然语言问题"},
        "runtime_options": {"type": "object", "additionalProperties": True},
    },
    required=["question"],
)

AGENT_EXECUTE_REQUEST_SCHEMA = object_schema(
    {
        "question": {"type": "string", "minLength": 1, "description": "自然语言问题"},
        "viewer_roles": array_schema({"type": "string"}),
        "principal_context": PRINCIPAL_CONTEXT_SCHEMA,
        "runtime_options": {"type": "object", "additionalProperties": True},
        "idempotency_key": {"type": ["string", "null"], "description": "幂等键；不传时由服务端按语义计划生成"},
    },
    required=["question"],
)

AGENT_EXECUTE_RESPONSE_SCHEMA = object_schema(
    {
        "status": {"type": "string", "description": "执行提交状态或阻断状态"},
        "semantic_plan_id": {"type": ["string", "null"], "description": "语义规划 ID"},
        "query_id": {"type": ["string", "null"], "description": "查询执行任务 ID"},
        "poll_url": {"type": ["string", "null"], "description": "查询任务状态轮询 URL"},
        "result_url": {"type": ["string", "null"], "description": "查询结果读取 URL"},
        "policy_decision": POLICY_DECISION_SCHEMA,
        "approval_material": {"type": ["object", "null"], "additionalProperties": True},
        "semantic_trace": {"type": "object", "additionalProperties": True, "description": "业务语义、Binding、编译、治理和执行回溯"},
    }
)

QUERY_EXECUTION_SUBMIT_REQUEST_SCHEMA = object_schema(
    {
        "source_id": {"type": "integer", "minimum": 1, "description": "数据源 ID"},
        "sql_query": {"type": "string", "minLength": 1, "description": "待执行 SQL"},
        "route_type": {"type": "string", "default": "manual_sql", "description": "提交来源类型"},
        "semantic_plan_id": {"type": ["string", "null"], "description": "语义规划 ID"},
        "resource_set": {"type": ["object", "array"], "additionalProperties": True},
        "sql_hash": {"type": ["string", "null"], "description": "调用方已计算的 SQL 哈希；缺省时服务端计算"},
        "data_level": {"type": "string", "default": "M1", "description": "数据分级"},
        "project_name": {"type": ["string", "null"], "description": "数仓项目名"},
        "governance_snapshot": {"type": ["object", "null"], "additionalProperties": True},
        "idempotency_key": {"type": ["string", "null"], "description": "客户端幂等键"},
        "result_mode": {"type": "string", "default": "preview", "description": "结果模式"},
    },
    required=["source_id", "sql_query"],
)

QUERY_EXECUTION_SUBMIT_RESPONSE_SCHEMA = object_schema(
    {
        "query_id": {"type": "string", "description": "查询执行任务 ID"},
        "status": {"type": "string", "description": "任务状态"},
        "poll_url": {"type": "string", "description": "状态轮询 URL"},
        "result_url": {"type": "string", "description": "结果读取 URL"},
        "trace_id": {"type": "string", "description": "执行链路追踪 ID"},
    },
    required=["query_id", "status", "poll_url", "result_url", "trace_id"],
)

QUERY_EXECUTION_JOB_SCHEMA = object_schema(
    {
        "id": {"type": "string", "description": "查询执行任务 ID，兼容旧字段"},
        "query_id": {"type": "string", "description": "查询执行任务 ID"},
        "trace_id": {"type": "string", "description": "执行链路追踪 ID"},
        "principal_id": {"type": "string", "description": "调用主体 ID"},
        "route_type": {"type": "string", "description": "提交来源类型"},
        "semantic_plan_id": {"type": ["string", "null"], "description": "语义规划 ID"},
        "source_id": {"type": "integer", "description": "数据源 ID"},
        "project_name": {"type": ["string", "null"], "description": "数仓项目名"},
        "logical_sql": {"type": "string", "description": "逻辑 SQL"},
        "validated_sql": {"type": "string", "description": "最终执行 SQL"},
        "sql_hash": {"type": "string", "description": "SQL 哈希"},
        "resource_set": {"type": ["object", "array"], "additionalProperties": True},
        "data_level": {"type": "string", "description": "数据分级"},
        "status": {"type": "string", "description": "任务状态"},
        "engine_query_id": {"type": ["string", "null"], "description": "执行引擎查询 ID"},
        "cancel_requested": {"type": "boolean", "description": "是否已请求取消"},
        "error_code": {"type": ["string", "null"], "description": "错误码"},
        "error_message": {"type": ["string", "null"], "description": "错误信息"},
        "created_at": {"type": ["string", "null"], "format": "date-time"},
        "updated_at": {"type": ["string", "null"], "format": "date-time"},
        "finished_at": {"type": ["string", "null"], "format": "date-time"},
    },
    required=["query_id", "status", "route_type", "sql_hash"],
)

QUERY_EXECUTION_EVENTS_SCHEMA = object_schema(
    {
        "items": array_schema(
            object_schema(
                {
                    "id": {"type": "integer"},
                    "query_id": {"type": "string"},
                    "event_type": {"type": "string"},
                    "from_status": {"type": ["string", "null"]},
                    "to_status": {"type": ["string", "null"]},
                    "payload": {"type": "object", "additionalProperties": True},
                    "created_at": {"type": ["string", "null"], "format": "date-time"},
                }
            )
        )
    },
    required=["items"],
)

QUERY_EXECUTION_RESULT_SCHEMA = object_schema(
    {
        "query_id": {"type": "string"},
        "status": {"type": "string"},
        "storage_type": {"type": "string"},
        "content_type": {"type": "string"},
        "row_count": {"type": "integer"},
        "byte_size": {"type": "integer"},
        "sha256": {"type": "string"},
        "preview": {"type": "object", "additionalProperties": True},
        "expires_at": {"type": ["string", "null"], "format": "date-time"},
        "ready_at": {"type": ["string", "null"], "format": "date-time"},
    },
    required=["query_id", "status", "storage_type"],
)

QUERY_EXECUTION_CANCEL_SCHEMA = object_schema(
    {
        "query_id": {"type": "string"},
        "status": {"type": "string"},
        "cancel_requested": {"type": "boolean"},
    },
    required=["query_id", "status", "cancel_requested"],
)

COMPILE_PREVIEW_REQUEST_SCHEMA = object_schema(
    {
        "target_type": {
            "type": "string",
            "enum": ["sql", "retrieval", "tool"],
            "default": "sql",
            "description": "编译目标类型",
        },
        "metric_name": {"type": ["string", "null"], "description": "指标名称"},
        "retrieval_query": {"type": ["string", "null"], "description": "检索问题"},
        "retrieval_sources": array_schema({"type": "string"}),
        "tool_name": {"type": ["string", "null"], "description": "工具名称"},
        "tool_arguments": {"type": "object", "additionalProperties": True},
    }
)

OPENAPI_OPERATION_METADATA: dict[tuple[str, str], dict[str, Any]] = {
    ("/api/v1/data-center/datasources", "get"): {
        "operationId": "DataSourcesList",
        "summary": "获取数据源列表",
        "description": "只读查询数据源列表，供前端和 Agent 发现可用数据源。敏感连接配置应由服务端脱敏。",
        "parameters": [
            query_param("source_type", {"type": "string"}, "按数据源类型筛选"),
            query_param("is_active", {"type": "boolean"}, "按启用状态筛选"),
            query_param("search", {"type": "string"}, "搜索关键词"),
            query_param("page", {"type": "integer", "default": 1}, "页码"),
            query_param("page_size", {"type": "integer", "default": 20}, "每页数量"),
        ],
        "responses": {
            "200": json_response(
                object_schema(
                    {
                        "items": array_schema(DATASOURCE_ITEM_SCHEMA),
                        "total": {"type": "integer"},
                        "page": {"type": "integer"},
                        "page_size": {"type": "integer"},
                        "total_pages": {"type": "integer"},
                    },
                    required=["items", "total", "page", "page_size", "total_pages"],
                )
            ),
            **standard_error_responses(),
        },
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="datasources:read",
        ),
    },
    ("/api/v1/semantic-router/route", "post"): {
        "operationId": "SemanticRouterRoute",
        "summary": "语义路由预演",
        "description": "根据自然语言问题生成语义路由预演结果；该接口只做规划预览，不执行 SQL。",
        "requestBody": request_body_schema(QUESTION_REQUEST_SCHEMA),
        "responses": {"200": json_response(SEMANTIC_ROUTE_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="preview",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-router:preview",
        ),
    },
    ("/api/v1/execution-compiler/compile-preview", "post"): {
        "operationId": "ExecutionCompilerCompilePreview",
        "summary": "执行编译预览",
        "description": "生成执行编译预览，返回 logical_sql、resource_set、sql_hash 与治理材料；不会真实执行 SQL，也不会投递异步任务。",
        "requestBody": request_body_schema(COMPILE_PREVIEW_REQUEST_SCHEMA),
        "responses": {"200": json_response(EXECUTION_COMPILE_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="preview",
            risk="medium",
            requires_confirmation=False,
            permission_scope="execution-compiler:preview",
        ),
    },
    ("/api/v1/semantic/health", "get"): {
        "operationId": "SemanticRuntimeHealthGet",
        "summary": "语义 Runtime 健康检查",
        "description": "只读检查 active Runtime snapshot 是否可用，并返回发布版本钉住、资产数、Binding 数和策略数。",
        "responses": {"200": json_response(SEMANTIC_HEALTH_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic:health:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/governance/audit-traces", "get"): {
        "operationId": "GovernanceAuditTraceList",
        "summary": "查询治理审计记录",
        "description": "只读查询治理审计记录，支持按主体、策略、SQL 哈希和决策结果过滤。",
        "parameters": [
            query_param("policy", {"type": "string"}, "策略名称"),
            query_param("target_type", {"type": "string"}, "治理目标类型"),
            query_param("target_name", {"type": "string"}, "治理目标名称"),
            query_param("decision", {"type": "string"}, "决策结果"),
            query_param("route_type", {"type": "string"}, "路由类型"),
            query_param("principal_id", {"type": "string"}, "调用主体 ID"),
            query_param("semantic_plan_id", {"type": "string"}, "语义规划 ID"),
            query_param("sql_hash", {"type": "string"}, "SQL 哈希"),
        ],
        "responses": {
            "200": json_response(
                object_schema(
                    {"items": array_schema(GOVERNANCE_AUDIT_TRACE_SCHEMA), "total": {"type": "integer"}},
                    required=["items", "total"],
                )
            ),
            **standard_error_responses(),
        },
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="governance:audit-traces:read",
        ),
    },
    ("/api/v1/agent/semantic/plan", "post"): {
        "operationId": "AgentSemanticPlan",
        "summary": "Agent-first 语义规划",
        "description": "正式 Agent Runtime 入口：固定 official 模式，只读取已发布 Ontology 与已发布 Cube，返回 business intent、binding、compiled targets、policy decision 与 preview-only ticket。",
        "requestBody": request_body_schema(QUESTION_REQUEST_SCHEMA),
        "responses": {"200": json_response(AGENT_PLAN_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="preview",
            risk="medium",
            requires_confirmation=False,
            permission_scope="agent:semantic-plan:preview",
            contract_status="stable",
        ),
    },
    ("/api/v1/agent/semantic/execute", "post"): {
        "operationId": "AgentSemanticExecute",
        "summary": "Agent-first 语义执行",
        "description": "正式 Agent Runtime 执行入口：固定 official 模式，先命中已发布 Ontology，再绑定 active Cube，生成执行票据并提交真实查询执行任务。",
        "requestBody": request_body_schema(AGENT_EXECUTE_REQUEST_SCHEMA),
        "responses": {"200": json_response(AGENT_EXECUTE_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="execute",
            risk="high",
            requires_confirmation=False,
            permission_scope="agent:semantic-execute:execute",
            contract_status="stable",
        ),
    },
    ("/api/v1/query-execution/jobs", "post"): {
        "operationId": "QueryExecutionJobSubmit",
        "summary": "提交查询执行任务",
        "description": "提交已治理的 SQL 查询任务。Agent Runtime 正式执行路径必须携带治理快照和执行票据；数据开发手工 SQL 仍需通过只读 SQL Guard。",
        "requestBody": request_body_schema(QUERY_EXECUTION_SUBMIT_REQUEST_SCHEMA),
        "responses": {
            "200": json_response(QUERY_EXECUTION_SUBMIT_RESPONSE_SCHEMA),
            "201": json_response(QUERY_EXECUTION_SUBMIT_RESPONSE_SCHEMA, description="任务已创建"),
            **standard_error_responses(),
        },
        **agent_extensions(
            safe=True,
            side_effect="execute",
            risk="high",
            requires_confirmation=False,
            permission_scope="query-execution:jobs:create",
            contract_status="stable",
        ),
    },
    ("/api/v1/query-execution/jobs/{query_id}", "get"): {
        "operationId": "QueryExecutionJobGet",
        "summary": "查询执行任务状态",
        "description": "读取当前主体可见的查询执行任务状态、SQL 哈希、资源集合和错误信息。",
        "responses": {"200": json_response(QUERY_EXECUTION_JOB_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="medium",
            requires_confirmation=False,
            permission_scope="query-execution:jobs:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/query-execution/jobs/{query_id}/events", "get"): {
        "operationId": "QueryExecutionJobEventsList",
        "summary": "查询执行事件列表",
        "description": "读取查询执行任务的状态转换和关键执行事件，用于 Agent trace 与人工排障。",
        "responses": {"200": json_response(QUERY_EXECUTION_EVENTS_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="medium",
            requires_confirmation=False,
            permission_scope="query-execution:jobs:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/query-execution/jobs/{query_id}/results", "get"): {
        "operationId": "QueryExecutionJobResultGet",
        "summary": "查询执行结果元数据",
        "description": "读取查询结果对象元数据与预览，不直接暴露本地 spool 物理路径。",
        "responses": {"200": json_response(QUERY_EXECUTION_RESULT_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="medium",
            requires_confirmation=False,
            permission_scope="query-execution:results:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/query-execution/jobs/{query_id}/cancel", "post"): {
        "operationId": "QueryExecutionJobCancel",
        "summary": "取消查询执行任务",
        "description": "请求取消尚未终止的查询执行任务；Worker 会在执行循环中下沉 cancel 到执行引擎。",
        "responses": {"200": json_response(QUERY_EXECUTION_CANCEL_SCHEMA), "409": error_response("任务当前状态不可取消"), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="execute",
            risk="medium",
            requires_confirmation=False,
            permission_scope="query-execution:jobs:cancel",
            contract_status="stable",
        ),
    },
}
