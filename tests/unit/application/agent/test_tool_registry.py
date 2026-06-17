"""
Tool Registry 单元测试

测试工具注册、过滤、执行
"""
import pytest
from unittest.mock import MagicMock, patch

from app.application.agent.services.tool_registry import (
    ToolRegistry,
    ToolExecutor,
    ToolDef,
    BUILTIN_TOOLS,
)


# ============================================================================
# ToolRegistry
# ============================================================================


class TestToolRegistry:
    def test_init_stores_tools(self):
        """初始化时加载内置工具"""
        registry = ToolRegistry()
        assert len(registry._tools) == len(BUILTIN_TOOLS)

    def test_for_context_filters_by_channel(self):
        """根据信道过滤工具"""
        registry = ToolRegistry()
        mock_adapter = MagicMock()

        tool_defs, executor = registry.for_context("feishu", mock_adapter, database="proj")

        # feishu 信道应包含 feishu 工具
        names = [t["name"] for t in tool_defs]
        assert "search_knowledge" in names
        assert "execute_sql" in names
        assert "list_cubes" in names

    def test_for_context_datachat_has_execute_sql(self):
        """datachat 信道包含 execute_sql"""
        registry = ToolRegistry()
        mock_adapter = MagicMock()

        tool_defs, executor = registry.for_context("datachat", mock_adapter)

        names = [t["name"] for t in tool_defs]
        assert "execute_sql" in names
        # datachat 信道工具较少
        assert len(tool_defs) < len(BUILTIN_TOOLS)

    def test_for_context_returns_executor(self):
        """返回绑定的执行器"""
        registry = ToolRegistry()
        mock_adapter = MagicMock()

        _, executor = registry.for_context("feishu", mock_adapter, database="db1")

        assert isinstance(executor, ToolExecutor)
        assert executor._adapter is mock_adapter
        assert executor._database == "db1"

    def test_for_context_with_knowledge_service(self):
        """传入知识服务时绑定到执行器"""
        mock_knowledge = MagicMock()
        registry = ToolRegistry(knowledge_service=mock_knowledge)
        mock_adapter = MagicMock()

        _, executor = registry.for_context("feishu", mock_adapter)

        assert executor._knowledge is mock_knowledge


# ============================================================================
# ToolExecutor
# ============================================================================


class TestToolExecutor:
    def test_execute_unknown_tool_returns_error(self):
        """未知工具返回错误"""
        executor = ToolExecutor(tool_defs=[], adapter=MagicMock())
        result = executor.execute("unknown_tool", {})
        assert "error" in result
        assert "未知工具" in result["error"]

    def test_execute_list_tables_success(self):
        """list_tables 成功"""
        tool_def = ToolDef(
            name="list_tables",
            description="List tables",
            parameters={},
            channels=["feishu"],
            handler="list_tables",
        )
        mock_adapter = MagicMock()
        mock_adapter.list_tables.return_value = [{"name": "t1"}, {"name": "t2"}]
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=mock_adapter,
            database="proj",
        )

        result = executor.execute("list_tables", {"database": "proj"})

        assert "tables" in result
        assert len(result["tables"]) == 2
        mock_adapter.list_tables.assert_called_once_with("proj")

    def test_execute_list_tables_no_database_returns_error(self):
        """未指定数据库时返回错误"""
        tool_def = ToolDef(
            name="list_tables",
            description="List tables",
            parameters={},
            channels=["feishu"],
            handler="list_tables",
        )
        executor = ToolExecutor(tool_defs=[tool_def], adapter=MagicMock(), database=None)

        result = executor.execute("list_tables", {})

        assert "error" in result
        assert "未指定数据库" in result["error"]

    def test_execute_describe_table_success(self):
        """describe_table 成功"""
        tool_def = ToolDef(
            name="describe_table",
            description="Describe table",
            parameters={},
            channels=["feishu"],
            handler="describe_table",
        )
        mock_adapter = MagicMock()
        mock_adapter.get_table_schema.return_value = {
            "table_name": "users",
            "columns": [{"name": "id", "type": "int"}],
        }
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=mock_adapter,
            database="proj",
        )

        result = executor.execute("describe_table", {"table_name": "users"})

        assert "schema" in result
        assert result["schema"]["table_name"] == "users"

    def test_execute_execute_sql_success(self):
        """execute_sql 成功"""
        tool_def = ToolDef(
            name="execute_sql",
            description="Execute SQL",
            parameters={},
            channels=["feishu"],
            handler="execute_sql",
        )
        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {
            "columns": ["a", "b"],
            "data": [[1, 2], [3, 4]],
            "rows": [[1, 2], [3, 4]],
            "execution_time_ms": 10,
        }
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=mock_adapter,
        )

        with patch(
            "app.application.agent.services.tool_registry.prepare_readonly_sql",
            return_value="SELECT 1",
        ):
            result = executor.execute("execute_sql", {"sql": "SELECT 1"})

        assert "data" in result
        assert result["row_count"] == 2

    def test_execute_search_knowledge_no_service_returns_error(self):
        """知识服务未配置时返回错误"""
        tool_def = ToolDef(
            name="search_knowledge",
            description="Search",
            parameters={},
            channels=["feishu"],
            handler="search_knowledge",
        )
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=MagicMock(),
            knowledge_service=None,
        )

        result = executor.execute("search_knowledge", {"query": "test"})

        assert "error" in result
        assert "知识服务未配置" in result["error"]

    def test_execute_search_knowledge_success(self):
        """search_knowledge 成功"""
        tool_def = ToolDef(
            name="search_knowledge",
            description="Search",
            parameters={},
            channels=["feishu"],
            handler="search_knowledge",
        )
        mock_knowledge = MagicMock()
        mock_knowledge.search.return_value = [{"path": "a.md", "snippet": "..."}]
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=MagicMock(),
            knowledge_service=mock_knowledge,
        )

        result = executor.execute("search_knowledge", {"query": "test", "max_results": 5})

        assert "results" in result
        assert len(result["results"]) == 1
        mock_knowledge.search.assert_called_once_with("test", max_results=5)

    def test_execute_list_cubes_no_semantic_returns_error(self):
        """语义层未配置时 list_cubes 返回错误"""
        tool_def = ToolDef(
            name="list_cubes",
            description="List cubes",
            parameters={},
            channels=["feishu"],
            handler="list_cubes",
        )
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=MagicMock(),
            semantic_service=None,
        )

        result = executor.execute("list_cubes", {})

        assert "error" in result
        assert "语义层服务未配置" in result["error"]

    def test_execute_list_cubes_success(self):
        """list_cubes 成功"""
        tool_def = ToolDef(
            name="list_cubes",
            description="List cubes",
            parameters={},
            channels=["feishu"],
            handler="list_cubes",
        )
        mock_semantic = MagicMock()
        mock_semantic.list_cubes.return_value = [{"name": "cube1"}]
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=MagicMock(),
            semantic_service=mock_semantic,
        )

        result = executor.execute("list_cubes", {})

        assert "cubes" in result
        assert result["total"] == 1

    def test_execute_handler_exception_returns_error(self):
        """处理器异常时返回错误"""
        tool_def = ToolDef(
            name="list_tables",
            description="List tables",
            parameters={},
            channels=["feishu"],
            handler="list_tables",
        )
        mock_adapter = MagicMock()
        mock_adapter.list_tables.side_effect = Exception("DB connection failed")
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=mock_adapter,
            database="proj",
        )

        result = executor.execute("list_tables", {})

        assert "error" in result
        assert "DB connection failed" in result["error"]

    def test_execute_handler_missing_returns_error(self):
        tool_def = ToolDef(
            name="broken",
            description="Broken",
            parameters={},
            channels=["feishu"],
            handler="broken_handler",
        )
        executor = ToolExecutor(tool_defs=[tool_def], adapter=MagicMock())

        result = executor.execute("broken", {})

        assert result == {"error": "工具处理器未实现: broken_handler"}

    def test_execute_read_knowledge_supports_prefix_and_missing_file(self):
        tool_def = ToolDef(
            name="read_knowledge",
            description="Read",
            parameters={},
            channels=["feishu"],
            handler="read_knowledge",
        )
        knowledge = MagicMock()
        knowledge.read.side_effect = ["# 内容", FileNotFoundError("missing.md")]
        executor = ToolExecutor(
            tool_defs=[tool_def],
            adapter=MagicMock(),
            knowledge_service=knowledge,
        )

        success = executor.execute("read_knowledge", {"path": "knowledge/docs/a.md"})
        failed = executor.execute("read_knowledge", {"path": "missing.md"})

        assert success == {"content": "# 内容"}
        assert failed == {"error": "missing.md"}
        assert knowledge.read.call_args_list[0].args == ("docs/a.md",)

    def test_execute_read_knowledge_without_service_returns_error(self):
        tool_def = ToolDef(
            name="read_knowledge",
            description="Read",
            parameters={},
            channels=["feishu"],
            handler="read_knowledge",
        )
        executor = ToolExecutor(tool_defs=[tool_def], adapter=MagicMock())

        result = executor.execute("read_knowledge", {"path": "docs/a.md"})

        assert result == {"error": "知识服务未配置"}

    def test_execute_list_tables_supports_prefix_filter(self):
        tool_def = ToolDef(
            name="list_tables",
            description="List tables",
            parameters={},
            channels=["feishu"],
            handler="list_tables",
        )
        adapter = MagicMock()
        adapter.list_tables.return_value = [
            {"name": "ods_orders"},
            {"name": "dwd_orders"},
            {"name": "ods_users"},
        ]
        executor = ToolExecutor(tool_defs=[tool_def], adapter=adapter, database="dw")

        result = executor.execute("list_tables", {"prefix": "ods_"})

        assert result["tables"] == [{"name": "ods_orders"}, {"name": "ods_users"}]

    def test_execute_describe_table_without_database_returns_error(self):
        tool_def = ToolDef(
            name="describe_table",
            description="Describe table",
            parameters={},
            channels=["feishu"],
            handler="describe_table",
        )
        executor = ToolExecutor(tool_defs=[tool_def], adapter=MagicMock())

        result = executor.execute("describe_table", {"table_name": "orders"})

        assert result == {"error": "未指定数据库名称"}

    def test_execute_sql_empty_result_returns_message(self):
        tool_def = ToolDef(
            name="execute_sql",
            description="Execute SQL",
            parameters={},
            channels=["feishu"],
            handler="execute_sql",
        )
        adapter = MagicMock()
        adapter.execute_query.return_value = {"columns": ["id"], "rows": [], "execution_time_ms": 12}
        executor = ToolExecutor(tool_defs=[tool_def], adapter=adapter)

        with patch(
            "app.application.agent.services.tool_registry.prepare_readonly_sql",
            return_value="SELECT * FROM demo",
        ):
            result = executor.execute("execute_sql", {"sql": "SELECT * FROM demo"})

        assert result["row_count"] == 0
        assert "结果为空" in result["message"]

    def test_execute_list_cubes_filters_inactive_items(self):
        tool_def = ToolDef(
            name="list_cubes",
            description="List cubes",
            parameters={},
            channels=["feishu"],
            handler="list_cubes",
        )
        semantic = MagicMock()
        semantic.list_cubes.return_value = [
            {"name": "orders", "status": "active"},
            {"name": "legacy", "status": "inactive"},
            {"name": "users"},
        ]
        executor = ToolExecutor(tool_defs=[tool_def], adapter=MagicMock(), semantic_service=semantic)

        result = executor.execute("list_cubes", {})

        assert [cube["name"] for cube in result["cubes"]] == ["orders", "users"]
        assert result["total"] == 2

    def test_execute_describe_cube_and_query_paths(self):
        describe_tool = ToolDef(
            name="describe_cube",
            description="Describe cube",
            parameters={},
            channels=["feishu"],
            handler="describe_cube",
        )
        query_tool = ToolDef(
            name="query",
            description="Query",
            parameters={},
            channels=["feishu"],
            handler="query",
        )
        semantic = MagicMock()
        semantic.describe_cube.return_value = {"name": "orders"}
        semantic.compile_and_execute.return_value = {"data": [{"cnt": 1}]}
        adapter = MagicMock()
        executor = ToolExecutor(
            tool_defs=[describe_tool, query_tool],
            adapter=adapter,
            semantic_service=semantic,
        )

        assert executor.execute("describe_cube", {"cube_name": "orders"}) == {"name": "orders"}
        assert executor.execute("query", {"dsl": {"measures": ["orders.count"]}}) == {"data": [{"cnt": 1}]}
        semantic.compile_and_execute.assert_called_once_with({"measures": ["orders.count"]}, adapter)

    def test_execute_describe_cube_and_query_without_semantic_service(self):
        describe_tool = ToolDef(
            name="describe_cube",
            description="Describe cube",
            parameters={},
            channels=["feishu"],
            handler="describe_cube",
        )
        query_tool = ToolDef(
            name="query",
            description="Query",
            parameters={},
            channels=["feishu"],
            handler="query",
        )
        executor = ToolExecutor(tool_defs=[describe_tool, query_tool], adapter=MagicMock())

        assert executor.execute("describe_cube", {"cube_name": "orders"}) == {"error": "语义层服务未配置"}
        assert executor.execute("query", {"dsl": {}}) == {"error": "语义层服务未配置"}

    def test_list_cubes_and_describe_cube_pass_through_metadata_visibility(self):
        """§6.2：list_cubes 走 discover 过滤，describe_cube 走 describe 脱敏"""
        list_tool = ToolDef(
            name="list_cubes",
            description="List cubes",
            parameters={},
            channels=["feishu"],
            handler="list_cubes",
        )
        describe_tool = ToolDef(
            name="describe_cube",
            description="Describe cube",
            parameters={},
            channels=["feishu"],
            handler="describe_cube",
        )
        semantic = MagicMock()
        semantic.list_cubes.return_value = [
            {"name": "orders", "status": "active"},
            {"name": "comment_reports", "status": "active"},
        ]
        semantic.describe_cube.return_value = {"name": "comment_reports", "table": "dw.dwd_x"}
        visibility = MagicMock()
        visibility.filter_discoverable_cubes.return_value = [{"name": "orders", "status": "active"}]
        visibility.redact_cube_payload.return_value = {"name": "comment_reports", "table": None}
        executor = ToolExecutor(
            tool_defs=[list_tool, describe_tool],
            adapter=MagicMock(),
            semantic_service=semantic,
            metadata_visibility_service=visibility,
        )

        listed = executor.execute("list_cubes", {})
        assert [cube["name"] for cube in listed["cubes"]] == ["orders"]
        assert listed["total"] == 1
        visibility.filter_discoverable_cubes.assert_called_once()

        described = executor.execute("describe_cube", {"cube_name": "comment_reports"})
        assert described["table"] is None
        visibility.redact_cube_payload.assert_called_once()


# ============================================================================
# free SQL 收口（§6.3 resource_set 同链裁决）
# ============================================================================


class TestExecuteSqlGovernance:
    def _executor(self, guard, adapter=None):
        tool_def = ToolDef(
            name="execute_sql",
            description="Execute SQL",
            parameters={},
            channels=["feishu"],
            handler="execute_sql",
        )
        return ToolExecutor(
            tool_defs=[tool_def],
            adapter=adapter or MagicMock(),
            free_sql_guard=guard,
            agent_context=MagicMock(channel="datachat", user_id="internal:local:admin"),
        )

    def test_execute_sql_denied_by_guard_does_not_execute(self):
        guard = MagicMock()
        guard.adjudicate.return_value = {
            "decision": "deny",
            "reason": "未命中可用数据访问权限或访问规则",
            "reason_code": "data_policy_not_matched",
        }
        adapter = MagicMock()
        executor = self._executor(guard, adapter)

        result = executor.execute("execute_sql", {"sql": "SELECT * FROM dwd_orders"})

        adapter.execute_query.assert_not_called()
        assert result["error_code"] == "data_policy_not_matched"
        assert result["governance"]["decision"] == "deny"

    def test_execute_sql_allowed_by_guard_carries_governance_evidence(self):
        guard = MagicMock()
        guard.adjudicate.return_value = {
            "decision": "allow",
            "reason_code": "data_policy_allowed",
            "data_level": "M2",
            "sql_hash": "sha256:abc",
            "resource_tables": ["dwd_orders"],
        }
        adapter = MagicMock()
        adapter.execute_query.return_value = {
            "columns": ["id"],
            "data": [[1]],
            "execution_time_ms": 5,
        }
        executor = self._executor(guard, adapter)

        result = executor.execute("execute_sql", {"sql": "SELECT id FROM dwd_orders"})

        assert result["row_count"] == 1
        assert result["governance"]["sql_hash"] == "sha256:abc"
        guard.adjudicate.assert_called_once()

    def test_execute_sql_without_guard_keeps_legacy_behavior(self):
        adapter = MagicMock()
        adapter.execute_query.return_value = {"columns": ["id"], "data": [[1]], "execution_time_ms": 5}
        tool_def = ToolDef(
            name="execute_sql",
            description="Execute SQL",
            parameters={},
            channels=["feishu"],
            handler="execute_sql",
        )
        executor = ToolExecutor(tool_defs=[tool_def], adapter=adapter)

        result = executor.execute("execute_sql", {"sql": "SELECT id FROM dwd_orders"})

        assert result["row_count"] == 1
        assert "governance" not in result


# ============================================================================
# ToolDef
# ============================================================================


class TestToolDef:
    def test_tool_def_dataclass(self):
        """ToolDef 数据类"""
        td = ToolDef(
            name="test_tool",
            description="Test",
            parameters={"type": "object"},
            channels=["feishu"],
            handler="test_handler",
        )
        assert td.name == "test_tool"
        assert td.handler == "test_handler"
