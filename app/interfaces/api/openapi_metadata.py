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
    ("/api/v1/semantic/assets/radar", "get"),
    ("/api/v1/semantic/assets/tables", "get"),
    ("/api/v1/semantic/assets/tables/{table_id}", "get"),
    ("/api/v1/semantic/assets/tables/{table_id}/fields", "get"),
    ("/api/v1/semantic/assets/tables/{table_id}/evidence", "get"),
    ("/api/v1/semantic/assets/sync-runs", "get"),
    ("/api/v1/semantic/assets/sync-runs", "post"),
    ("/api/v1/semantic/assets/sync-runs/{sync_run_id}", "get"),
    ("/api/v1/semantic-router/route", "post"),
    ("/api/v1/execution-compiler/compile-preview", "post"),
    ("/api/v1/semantic/health", "get"),
    ("/api/v1/governance/audit-traces", "get"),
    ("/api/v1/governance/audit-traces/{trace_id}", "get"),
    ("/api/v1/agent/semantic/plan", "post"),
    ("/api/v1/agent/semantic/execute", "post"),
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
            "trace_id": nullable_schema({"type": "string", "description": "请求追踪 ID"}),
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


def nullable_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """OpenAPI 3.0 使用 nullable 表达空值，不使用 JSON Schema 的 type 数组。"""
    cloned = deepcopy(schema)
    cloned["nullable"] = True
    return cloned


def object_or_array_schema(description: str) -> dict[str, Any]:
    return {
        "oneOf": [
            {"type": "object", "additionalProperties": True},
            {"type": "array", "items": {"type": "object", "additionalProperties": True}},
        ],
        "description": description,
    }


DATASOURCE_ITEM_SCHEMA = object_schema(
    {
        "id": {"type": "integer", "description": "数据源 ID"},
        "name": {"type": "string", "description": "数据源名称"},
        "source_type": {
            "type": "string",
            "enum": ["maxcompute", "clickhouse", "postgresql", "mysql"],
            "description": "数据源类型",
        },
        "description": nullable_schema({"type": "string", "description": "描述"}),
        "is_active": {"type": "boolean", "description": "是否启用"},
        "connection_status": {"type": "string", "description": "连接状态"},
        "created_by": {"type": "string", "description": "创建人"},
        "created_at": {"type": "string", "format": "date-time", "description": "创建时间"},
        "updated_at": {"type": "string", "format": "date-time", "description": "更新时间"},
    }
)

DATA_ASSET_TABLE_SCHEMA = object_schema(
    {
        "id": {"type": "string", "description": "数据资产表 ID"},
        "source_id": {"type": "string", "description": "来源数据源 ID 或外部来源标识"},
        "database": {"type": "string", "description": "物理库 / 项目名"},
        "schema": nullable_schema({"type": "string", "description": "物理 schema"}),
        "name": {"type": "string", "description": "物理表名"},
        "title": nullable_schema({"type": "string", "description": "业务标题"}),
        "description": nullable_schema({"type": "string", "description": "表描述"}),
        "layer": nullable_schema({"type": "string", "description": "数仓分层，如 ods/dwd/dim/dws/ads"}),
        "owner": nullable_schema({"type": "string", "description": "负责人"}),
        "table_type": {"type": "string", "description": "表类型"},
        "lifecycle_status": {"type": "string", "description": "生命周期状态"},
        "row_count": nullable_schema({"type": "integer", "description": "行数估计"}),
        "partition_count": nullable_schema({"type": "integer", "description": "分区数"}),
        "field_count": {"type": "integer", "description": "字段数"},
        "profile_status": {"type": "string", "description": "画像状态"},
        "sync_status": {"type": "string", "description": "最近同步状态"},
        "last_synced_at": nullable_schema({"type": "string", "format": "date-time", "description": "最近同步时间"}),
        "last_profiled_at": nullable_schema({"type": "string", "format": "date-time", "description": "最近画像时间"}),
        "asset_key": {"type": "string", "description": "跨模块资产键"},
        "qualified_name": {"type": "string", "description": "库.schema.表限定名"},
        "extra": {"type": "object", "additionalProperties": True},
        "created_at": {"type": "string", "format": "date-time", "description": "创建时间"},
        "updated_at": {"type": "string", "format": "date-time", "description": "更新时间"},
    },
    required=["id", "source_id", "database", "name", "field_count", "asset_key", "qualified_name"],
)

DATA_ASSET_TABLE_LIST_SCHEMA = object_schema(
    {
        "items": array_schema(DATA_ASSET_TABLE_SCHEMA),
        "total": {"type": "integer"},
        "page": {"type": "integer"},
        "page_size": {"type": "integer"},
        "page_count": {"type": "integer"},
    },
    required=["items", "total"],
)

DATA_ASSET_FIELD_SCHEMA = object_schema(
    {
        "id": {"type": "string", "description": "字段资产 ID"},
        "table_id": {"type": "string", "description": "所属表 ID"},
        "source_id": {"type": "string", "description": "来源数据源 ID"},
        "database": {"type": "string", "description": "物理库 / 项目名"},
        "schema": nullable_schema({"type": "string", "description": "物理 schema"}),
        "table_name": {"type": "string", "description": "物理表名"},
        "name": {"type": "string", "description": "字段名"},
        "data_type": {"type": "string", "description": "字段类型"},
        "ordinal": {"type": "integer", "description": "字段顺序"},
        "nullable": {"type": "boolean", "description": "是否可为空"},
        "comment": nullable_schema({"type": "string", "description": "字段注释"}),
        "profile": {"type": "object", "additionalProperties": True},
        "sensitivity_level": nullable_schema({"type": "string", "description": "敏感等级"}),
        "asset_key": {"type": "string", "description": "跨模块字段资产键"},
        "qualified_name": {"type": "string", "description": "库.schema.表.字段限定名"},
    },
    required=["id", "table_id", "name", "data_type", "asset_key", "qualified_name"],
)

DATA_ASSET_FIELD_LIST_SCHEMA = object_schema(
    {
        "items": array_schema(DATA_ASSET_FIELD_SCHEMA),
        "total": {"type": "integer"},
    },
    required=["items", "total"],
)

DATA_ASSET_REF_SCHEMA = object_schema(
    {
        "asset_type": {"type": "string", "enum": ["table", "field", "dataset", "cube", "view"]},
        "source_id": {"type": "string"},
        "database": {"type": "string"},
        "schema": nullable_schema({"type": "string"}),
        "name": {"type": "string"},
        "field": nullable_schema({"type": "string"}),
        "snapshot_id": nullable_schema({"type": "string"}),
        "asset_id": nullable_schema({"type": "string"}),
        "qualified_name": {"type": "string"},
    }
)

DATA_ASSET_EVIDENCE_SCHEMA = object_schema(
    {
        "subject": {"type": "string"},
        "asset_refs": array_schema(DATA_ASSET_REF_SCHEMA),
        "schema_snapshot": {"type": "object", "additionalProperties": True},
        "sample_profile": {"type": "object", "additionalProperties": True},
        "usage_evidence": array_schema({"type": "object", "additionalProperties": True}),
        "lineage_evidence": array_schema({"type": "object", "additionalProperties": True}),
        "drift_evidence": {"type": "object", "additionalProperties": True},
        "projection_evidence": {"type": "object", "additionalProperties": True},
        "collected_at": {"type": "string", "format": "date-time"},
        "runtime_truth": {"type": "boolean", "description": "数据资产证据包不是语义运行时真相源"},
    },
    required=["subject", "asset_refs", "runtime_truth"],
)

DATA_ASSET_SYNC_RUN_SCHEMA = object_schema(
    {
        "id": {"type": "string", "description": "同步批次 ID"},
        "source_id": {"type": "string", "description": "来源数据源 ID 或外部来源标识"},
        "status": {"type": "string", "enum": ["running", "success", "failed"]},
        "started_at": {"type": "string", "format": "date-time"},
        "finished_at": nullable_schema({"type": "string", "format": "date-time"}),
        "error_message": nullable_schema({"type": "string"}),
        "stats": {"type": "object", "additionalProperties": True},
    },
    required=["id", "source_id", "status", "stats"],
)

DATA_ASSET_SYNC_RUN_LIST_SCHEMA = object_schema(
    {
        "items": array_schema(DATA_ASSET_SYNC_RUN_SCHEMA),
        "total": {"type": "integer"},
    },
    required=["items", "total"],
)

DATA_ASSET_RADAR_SCHEMA = object_schema(
    {
        "status": {"type": "string", "enum": ["ok", "warn", "error"]},
        "table_count": {"type": "integer"},
        "field_count": {"type": "integer"},
        "failed_sync_count": {"type": "integer"},
        "stale_profile_count": {"type": "integer"},
        "drift_risk_count": {"type": "integer"},
    }
)

DATA_ASSET_SYNC_REQUEST_SCHEMA = object_schema(
    {
        "source_id": {"type": "string", "description": "外部来源标识；可传数据源名称或数仓来源 ID"},
        "datasource_id": {"type": "integer", "description": "平台数据源 ID；未传 tables 时用于从已注册数据源拉取真实 schema"},
        "database": {"type": "string", "description": "默认库 / 项目名"},
        "schema": nullable_schema({"type": "string", "description": "默认物理 schema"}),
        "max_tables": {"type": "integer", "description": "从已注册数据源同步时的最大表数"},
        "tables": array_schema(
            object_schema(
                {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "database": {"type": "string"},
                    "schema": nullable_schema({"type": "string"}),
                    "layer": {"type": "string"},
                    "owner": {"type": "string"},
                    "row_count": {"type": "integer"},
                    "partition_count": {"type": "integer"},
                    "profile_status": {"type": "string"},
                    "sync_status": {"type": "string"},
                    "fields": array_schema(
                        object_schema(
                            {
                                "name": {"type": "string"},
                                "type": {"type": "string"},
                                "nullable": {"type": "boolean"},
                                "comment": {"type": "string"},
                                "profile": {"type": "object", "additionalProperties": True},
                            },
                            required=["name"],
                        )
                    ),
                    "usage": array_schema({"type": "object", "additionalProperties": True}),
                    "lineage": array_schema({"type": "object", "additionalProperties": True}),
                },
                required=["name"],
            )
        ),
    }
)

FIELD_SEMANTIC_CANDIDATES_REQUEST_SCHEMA = object_schema(
    {
        "fields": array_schema({"type": "object", "additionalProperties": True}),
    }
)

FIELD_SEMANTIC_CANDIDATES_RESPONSE_SCHEMA = object_schema(
    {
        "candidates": array_schema(
            object_schema(
                {
                    "field_name": {"type": "string"},
                    "semantic_role": {"type": "string", "description": "字段语义角色，如 metric/dimension/time"},
                    "data_type": {"type": "string"},
                    "confidence": {"type": "number"},
                    "reason": {"type": "string"},
                }
            )
        )
    },
    required=["candidates"],
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
        "logical_sql": nullable_schema({"type": "string", "description": "逻辑 SQL"}),
        "resource_set": object_or_array_schema("资源集合"),
        "sql_hash": nullable_schema({"type": "string", "description": "SQL 哈希"}),
        "data_level": nullable_schema({"type": "string", "description": "数据分级"}),
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
        "semantic_plan_id": nullable_schema({"type": "string", "description": "语义规划 ID"}),
        "sql_hash": nullable_schema({"type": "string", "description": "SQL 哈希"}),
        "decision": {"type": "string", "description": "治理决策"},
        "route_type": nullable_schema({"type": "string", "description": "路由类型"}),
        "policy": nullable_schema({"type": "string", "description": "策略名称"}),
        "created_at": {"type": "string", "format": "date-time", "description": "创建时间"},
    }
)

AGENT_PLAN_RESPONSE_SCHEMA = object_schema(
    {
        "semantic_plan_id": {"type": "string", "description": "语义规划 ID"},
        "runtime_mode": {"type": "string", "enum": ["official"], "description": "正式 Agent Runtime 模式"},
        "business_intent": {"type": "object", "additionalProperties": True, "description": "Ontology 命中的业务意图"},
        "route": SEMANTIC_ROUTE_RESPONSE_SCHEMA,
        "projection_result": nullable_schema({"type": "object", "additionalProperties": True, "description": "Ontology 到 Cube 的投影结果"}),
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
        "idempotency_key": nullable_schema({"type": "string", "description": "幂等键；不传时由服务端按语义计划生成"}),
    },
    required=["question"],
)

AGENT_EXECUTE_RESPONSE_SCHEMA = object_schema(
    {
        "status": {"type": "string", "description": "执行提交状态或阻断状态"},
        "semantic_plan_id": nullable_schema({"type": "string", "description": "语义规划 ID"}),
        "gateway_query_id": nullable_schema({"type": "string", "description": "dw-query-gateway 查询 ID"}),
        "gateway": nullable_schema({"type": "object", "additionalProperties": True, "description": "dw-query-gateway 提交响应"}),
        "policy_decision": POLICY_DECISION_SCHEMA,
        "approval_material": nullable_schema({"type": "object", "additionalProperties": True}),
        "semantic_trace": {"type": "object", "additionalProperties": True, "description": "业务语义、Binding、编译、治理和执行回溯"},
    }
)

COMPILE_PREVIEW_REQUEST_SCHEMA = object_schema(
    {
        "target_type": {
            "type": "string",
            "enum": ["sql", "retrieval", "tool"],
            "default": "sql",
            "description": "编译目标类型",
        },
        "metric_name": nullable_schema({"type": "string", "description": "指标名称"}),
        "retrieval_query": nullable_schema({"type": "string", "description": "检索问题"}),
        "retrieval_sources": array_schema({"type": "string"}),
        "tool_name": nullable_schema({"type": "string", "description": "工具名称"}),
        "tool_arguments": {"type": "object", "additionalProperties": True},
    }
)

OPENAPI_OPERATION_METADATA: dict[tuple[str, str], dict[str, Any]] = {
    ("/api/v1/semantic/assets/radar", "get"): {
        "operationId": "SemanticAssetsRadarGet",
        "tags": ["语义资产"],
        "summary": "获取数据资产雷达摘要",
        "description": "只读返回数据资产表、字段、同步失败、画像过期和漂移风险摘要；该接口不读取语义 Runtime 真相。",
        "responses": {"200": json_response(DATA_ASSET_RADAR_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/tables", "get"): {
        "operationId": "SemanticAssetsTablesList",
        "tags": ["语义资产"],
        "summary": "获取数据资产物理表列表",
        "description": "只读分页查询数据资产底座中的物理表事实，可按来源、库、schema、同步状态和生命周期状态过滤。",
        "parameters": [
            query_param("keyword", {"type": "string"}, "按表名、标题或描述搜索"),
            query_param("page", {"type": "integer", "default": 1}, "页码"),
            query_param("page_size", {"type": "integer", "default": 20, "maximum": 200}, "每页数量"),
            query_param("source_id", {"type": "string"}, "来源数据源 ID 或外部来源标识"),
            query_param("database", {"type": "string"}, "物理库 / 项目名"),
            query_param("schema", {"type": "string"}, "物理 schema"),
            query_param("sync_status", {"type": "string"}, "同步状态"),
            query_param("lifecycle_status", {"type": "string"}, "生命周期状态"),
        ],
        "responses": {"200": json_response(DATA_ASSET_TABLE_LIST_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/physical-tables", "get"): {
        "operationId": "SemanticAssetsPhysicalTablesList",
        "tags": ["语义资产"],
        "summary": "获取数据资产物理表列表（兼容别名）",
        "description": "兼容别名，语义等同于 /api/v1/semantic/assets/tables；新集成优先使用 tables。",
        "parameters": [
            query_param("keyword", {"type": "string"}, "按表名、标题或描述搜索"),
            query_param("page", {"type": "integer", "default": 1}, "页码"),
            query_param("page_size", {"type": "integer", "default": 20, "maximum": 200}, "每页数量"),
            query_param("source_id", {"type": "string"}, "来源数据源 ID 或外部来源标识"),
            query_param("database", {"type": "string"}, "物理库 / 项目名"),
            query_param("schema", {"type": "string"}, "物理 schema"),
            query_param("sync_status", {"type": "string"}, "同步状态"),
            query_param("lifecycle_status", {"type": "string"}, "生命周期状态"),
        ],
        "responses": {"200": json_response(DATA_ASSET_TABLE_LIST_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
        ),
    },
    ("/api/v1/semantic/assets/tables/{table_id}", "get"): {
        "operationId": "SemanticAssetsTableGet",
        "tags": ["语义资产"],
        "summary": "获取数据资产物理表详情",
        "description": "只读获取单个物理表事实；数据资产底座只提供建模证据，不是语义 Runtime 真相源。",
        "responses": {"200": json_response(DATA_ASSET_TABLE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/tables/{table_id}/fields", "get"): {
        "operationId": "SemanticAssetsTableFieldsList",
        "tags": ["语义资产"],
        "summary": "获取数据资产字段列表",
        "description": "只读获取单个物理表的字段事实和字段画像。",
        "responses": {"200": json_response(DATA_ASSET_FIELD_LIST_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/tables/{table_id}/evidence", "get"): {
        "operationId": "SemanticAssetsTableEvidenceGet",
        "tags": ["语义资产"],
        "summary": "获取数据资产建模证据包",
        "description": "只读获取表级 EvidenceBundle，包含 schema 快照、画像、使用和血缘证据；runtime_truth 固定为 false。",
        "responses": {"200": json_response(DATA_ASSET_EVIDENCE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/tables/{table_id}/field-semantic-candidates", "post"): {
        "operationId": "SemanticAssetsFieldSemanticCandidatesCreate",
        "tags": ["语义资产"],
        "summary": "生成字段语义候选",
        "description": "基于数据资产字段事实生成字段语义角色候选；该接口只返回候选建议，不写入正式语义资产。",
        "requestBody": request_body_schema(FIELD_SEMANTIC_CANDIDATES_REQUEST_SCHEMA, required=False),
        "responses": {"200": json_response(FIELD_SEMANTIC_CANDIDATES_RESPONSE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="preview",
            risk="medium",
            requires_confirmation=False,
            permission_scope="semantic-assets:field-candidates:preview",
        ),
    },
    ("/api/v1/semantic/assets/sync-runs", "get"): {
        "operationId": "SemanticAssetsSyncRunsList",
        "tags": ["语义资产"],
        "summary": "获取数据资产同步批次列表",
        "description": "只读查询最近的数据资产元数据同步批次。",
        "parameters": [
            query_param("limit", {"type": "integer", "default": 50, "maximum": 200}, "返回批次数量"),
        ],
        "responses": {"200": json_response(DATA_ASSET_SYNC_RUN_LIST_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:sync-runs:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/sync-runs/{sync_run_id}", "get"): {
        "operationId": "SemanticAssetsSyncRunGet",
        "tags": ["语义资产"],
        "summary": "获取数据资产同步批次详情",
        "description": "只读获取单个数据资产元数据同步批次状态、错误和统计信息。",
        "responses": {"200": json_response(DATA_ASSET_SYNC_RUN_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="semantic-assets:sync-runs:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/sync-runs", "post"): {
        "operationId": "SemanticAssetsSyncRunCreate",
        "summary": "创建数据资产元数据同步批次",
        "tags": ["语义资产"],
        "description": "写入数据资产底座元数据事实。传入 tables 时导入确定性 payload；未传 tables 时从已注册数据源读取真实物理 schema。",
        "requestBody": request_body_schema(DATA_ASSET_SYNC_REQUEST_SCHEMA),
        "responses": {"201": json_response(DATA_ASSET_SYNC_RUN_SCHEMA, description="同步批次已创建"), **standard_error_responses()},
        **agent_extensions(
            safe=False,
            side_effect="write",
            risk="medium",
            requires_confirmation=True,
            permission_scope="semantic-assets:sync-runs:write",
            contract_status="stable",
        ),
    },
    ("/api/v1/semantic/assets/metadata-sync", "post"): {
        "operationId": "SemanticAssetsMetadataSyncCreate",
        "summary": "创建数据资产元数据同步批次（兼容别名）",
        "tags": ["语义资产"],
        "description": "兼容别名，语义等同于 /api/v1/semantic/assets/sync-runs；新集成优先使用 sync-runs。",
        "requestBody": request_body_schema(DATA_ASSET_SYNC_REQUEST_SCHEMA),
        "responses": {"201": json_response(DATA_ASSET_SYNC_RUN_SCHEMA, description="同步批次已创建"), **standard_error_responses()},
        **agent_extensions(
            safe=False,
            side_effect="write",
            risk="medium",
            requires_confirmation=True,
            permission_scope="semantic-assets:sync-runs:write",
        ),
    },
    ("/api/v1/data-center/datasources", "get"): {
        "operationId": "DataSourcesList",
        "tags": ["数据源管理"],
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
        "tags": ["语义路由"],
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
        "tags": ["执行编译"],
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
        "tags": ["语义 Runtime"],
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
        "tags": ["治理与审计"],
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
            contract_status="stable",
        ),
    },
    ("/api/v1/governance/audit-traces/{trace_id}", "get"): {
        "operationId": "GovernanceAuditTraceGet",
        "tags": ["治理与审计"],
        "summary": "获取治理审计记录详情",
        "description": "只读获取单条治理审计 Trace，用于排查语义规划、策略决策和 SQL 提交流程。",
        "responses": {"200": json_response(GOVERNANCE_AUDIT_TRACE_SCHEMA), **standard_error_responses()},
        **agent_extensions(
            safe=True,
            side_effect="none",
            risk="low",
            requires_confirmation=False,
            permission_scope="governance:audit-traces:read",
            contract_status="stable",
        ),
    },
    ("/api/v1/agent/semantic/plan", "post"): {
        "operationId": "AgentSemanticPlan",
        "tags": ["Agent Runtime"],
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
        "tags": ["Agent Runtime"],
        "summary": "Agent-first 语义执行",
        "description": "正式 Agent Runtime 执行入口：固定 official 模式，先命中已发布 Ontology，再绑定 active Cube，并将受治理查询提交到 dw-query-gateway。",
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
}
