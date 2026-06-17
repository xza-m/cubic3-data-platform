"""
Route Scanner 单元测试

测试 scan_routes_to_openapi 及辅助函数
"""
import pytest
from flask import Flask

from app.interfaces.api.route_scanner import (
    scan_routes_to_openapi,
    _parse_docstring,
    _get_tag_for_path,
    _generate_operation,
    _generate_parameters,
    _generate_request_body,
    _generate_responses,
)
from app.interfaces.api.openapi_metadata import (
    clear_extra_openapi_metadata,
    register_openapi_metadata,
)


# ============================================================================
# _parse_docstring
# ============================================================================


class TestParseDocstring:
    def test_empty_docstring_returns_default(self):
        """空文档字符串返回默认摘要"""
        summary, desc = _parse_docstring("", "default_endpoint")
        assert summary == "default_endpoint"
        assert desc == ""

    def test_single_line_docstring(self):
        """单行文档字符串"""
        summary, desc = _parse_docstring("获取用户列表", "list_users")
        assert summary == "获取用户列表"
        assert desc == ""

    def test_multi_line_with_description(self):
        """多行文档字符串，含描述"""
        doc = """获取用户列表

        返回系统中所有用户，支持分页。
        """
        summary, desc = _parse_docstring(doc, "list_users")
        assert summary == "获取用户列表"
        assert "返回系统中所有用户" in desc

    def test_stops_at_args_section(self):
        """遇到 Args: 时停止描述解析"""
        doc = """创建用户

        创建新用户。

        Args:
            name: 用户名
        """
        summary, desc = _parse_docstring(doc, "create_user")
        assert summary == "创建用户"
        assert "Args:" not in desc
        assert "name" not in desc


# ============================================================================
# _get_tag_for_path
# ============================================================================


class TestGetTagForPath:
    def test_datasources_tag(self):
        assert _get_tag_for_path("/api/datasources") == "数据源管理"
        assert _get_tag_for_path("/api/datasources/1") == "数据源管理"

    def test_datasets_tag(self):
        assert _get_tag_for_path("/api/datasets") == "数据集管理"

    def test_conversations_tag(self):
        assert _get_tag_for_path("/api/conversations") == "对话中心"

    def test_queries_tag(self):
        assert _get_tag_for_path("/api/queries") == "查询中心"

    def test_feishu_tag(self):
        assert _get_tag_for_path("/api/feishu/webhook") == "飞书集成"

    def test_health_tag(self):
        assert _get_tag_for_path("/health") == "健康检查"

    def test_unknown_path_returns_other(self):
        assert _get_tag_for_path("/api/unknown") == "其他"

    def test_semantic_and_agent_tags(self):
        assert _get_tag_for_path("/api/v1/semantic/assets/tables") == "语义资产"
        assert _get_tag_for_path("/api/v1/semantic-router/route") == "语义路由"
        assert _get_tag_for_path("/api/v1/agent/semantic/plan") == "Agent Runtime"
        assert _get_tag_for_path("/api/v1/governance/audit-traces") == "治理与审计"


# ============================================================================
# _generate_parameters
# ============================================================================


class TestGenerateParameters:
    def test_path_params_added(self):
        """路径参数被正确添加"""
        params = _generate_parameters(["id", "table_id"], "")
        assert len(params) == 2
        assert params[0]["name"] == "id"
        assert params[0]["in"] == "path"
        assert params[0]["required"] is True
        assert params[0]["schema"]["type"] == "integer"
        assert params[1]["name"] == "table_id"
        assert params[1]["schema"]["type"] == "integer"

    def test_path_param_string_type(self):
        """非 id 后缀的路径参数为 string"""
        params = _generate_parameters(["table"], "")
        assert params[0]["schema"]["type"] == "string"

    def test_query_params_from_docstring(self):
        """从文档字符串提取查询参数"""
        doc = "List items. Query Parameters: page, page_size"
        params = _generate_parameters([], doc)
        names = [p["name"] for p in params if p["in"] == "query"]
        assert "page" in names
        assert "page_size" in names


# ============================================================================
# _generate_operation, _generate_request_body, _generate_responses
# ============================================================================


class TestGenerateOperation:
    def test_operation_structure(self):
        """生成的操作结构正确"""
        op = _generate_operation(
            method="GET",
            tag="数据源管理",
            summary="获取列表",
            description="返回数据源列表",
            endpoint="list_datasources",
            path_params=[],
            docstring="",
        )
        assert op["tags"] == ["数据源管理"]
        assert op["summary"] == "获取列表"
        assert op["operationId"] == "list_datasources_get"
        assert "parameters" in op
        assert "responses" in op

    def test_post_adds_request_body(self):
        """POST 方法添加 requestBody"""
        op = _generate_operation(
            method="POST",
            tag="数据源管理",
            summary="创建",
            description="",
            endpoint="create",
            path_params=[],
            docstring="",
        )
        assert "requestBody" in op
        assert op["requestBody"]["required"] is True


class TestGenerateRequestBody:
    def test_returns_required_json_schema(self):
        body = _generate_request_body("")
        assert body["required"] is True
        assert "application/json" in body["content"]


class TestGenerateResponses:
    def test_returns_standard_responses(self):
        resp = _generate_responses()
        assert "200" in resp
        assert "201" in resp
        assert "400" in resp
        assert "401" in resp
        assert "404" in resp
        assert "500" in resp


# ============================================================================
# scan_routes_to_openapi（集成）
# ============================================================================


class TestScanRoutesToOpenapi:
    def test_scan_empty_app_returns_empty_paths(self):
        """无路由的 Flask 应用返回空 paths"""
        app = Flask(__name__)
        paths = scan_routes_to_openapi(app)
        assert paths == {}

    def test_scan_skips_non_api_routes(self):
        """跳过非 /api/ 和 /health 的路由"""
        app = Flask(__name__)

        @app.route("/")
        def index():
            return "ok"

        @app.route("/api/users")
        def list_users():
            """获取用户列表"""
            return ""

        paths = scan_routes_to_openapi(app)
        assert "/" not in paths
        assert "/api/users" in paths

    def test_scan_includes_health(self):
        """包含 /health 路由"""
        app = Flask(__name__)

        @app.route("/health")
        def health():
            return "ok"

        paths = scan_routes_to_openapi(app)
        assert "/health" in paths

    def test_scan_skips_docs_routes(self):
        """跳过 /api/docs/ 路由"""
        app = Flask(__name__)

        @app.route("/api/docs/")
        def docs():
            return ""

        paths = scan_routes_to_openapi(app)
        assert "/api/docs/" not in paths

    def test_scan_converts_path_params(self):
        """转换 Flask 路径参数为 OpenAPI 格式"""
        app = Flask(__name__)

        @app.route("/api/datasources/<int:id>")
        def get_datasource(id):
            return ""

        paths = scan_routes_to_openapi(app)
        assert "/api/datasources/{id}" in paths

    def test_scan_generates_methods(self):
        """为每个 HTTP 方法生成文档"""
        app = Flask(__name__)

        @app.route("/api/users", methods=["GET", "POST"])
        def users():
            """用户列表"""
            return ""

        paths = scan_routes_to_openapi(app)
        assert "/api/users" in paths
        op = paths["/api/users"]
        assert "get" in op
        assert "post" in op
        assert "head" not in op
        assert "options" not in op

    def test_scan_merges_explicit_metadata(self):
        """显式 OpenAPI 元数据会覆盖自动扫描的泛化契约。"""
        app = Flask(__name__)

        @app.route("/api/items", methods=["POST"])
        def create_item():
            """创建条目"""
            return ""

        register_openapi_metadata(
            endpoint="create_item",
            method="POST",
            metadata={
                "operationId": "CreateItemForAgent",
                "summary": "创建条目（测试）",
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["name"],
                                "properties": {"name": {"type": "string"}},
                            }
                        }
                    },
                },
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
                                            "properties": {"id": {"type": "integer"}},
                                        },
                                    },
                                }
                            }
                        },
                    }
                },
                "x-agent-safe": False,
                "x-side-effect": "write",
                "x-agent-risk": "medium",
                "x-requires-confirmation": True,
                "x-permission-scope": "items:write",
            },
        )

        try:
            paths = scan_routes_to_openapi(app)
        finally:
            clear_extra_openapi_metadata()

        op = paths["/api/items"]["post"]
        assert op["operationId"] == "CreateItemForAgent"
        assert op["summary"] == "创建条目（测试）"
        assert op["requestBody"]["content"]["application/json"]["schema"]["required"] == ["name"]
        assert op["responses"]["200"]["content"]["application/json"]["schema"]["properties"]["data"]["properties"]["id"]["type"] == "integer"
        assert op["x-agent-safe"] is False
        assert op["x-side-effect"] == "write"
        assert op["x-agent-risk"] == "medium"
        assert op["x-requires-confirmation"] is True
        assert op["x-permission-scope"] == "items:write"
