"""
工具注册与执行

将 DataSourceAdapter 的方法包装为 LLM function calling 格式的工具，
并根据信道过滤可用工具集。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import prepare_readonly_sql

logger = get_logger(__name__)


@dataclass
class ToolDef:
    """单个工具定义"""

    name: str
    description: str
    parameters: dict[str, Any]
    channels: list[str]
    handler: str                                    # ToolExecutor 中对应的方法名


class ToolExecutor:
    """
    绑定了数据源和知识服务的工具执行器

    每次请求创建一个实例，持有当次请求的 DataSourceAdapter 和 KnowledgeService。
    """

    def __init__(
        self,
        tool_defs: list[ToolDef],
        adapter: Any,
        knowledge_service: Any | None = None,
        database: str | None = None,
        semantic_service: Any | None = None,
    ):
        self._tools = {t.name: t for t in tool_defs}
        self._adapter = adapter
        self._knowledge = knowledge_service
        self._database = database
        self._semantic = semantic_service

    def execute(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """
        执行工具调用

        Args:
            tool_name: 工具名称
            arguments: 工具参数

        Returns:
            执行结果字典
        """
        td = self._tools.get(tool_name)
        if not td:
            return {"error": f"未知工具: {tool_name}"}

        handler = getattr(self, f"_handle_{td.handler}", None)
        if not handler:
            return {"error": f"工具处理器未实现: {td.handler}"}

        try:
            return handler(**arguments)
        except Exception as e:
            logger.error("工具执行异常", tool=tool_name, error=str(e))
            return {"error": f"工具执行失败: {str(e)}"}

    # ========================================================================
    # 工具处理器实现
    # ========================================================================

    def _handle_search_knowledge(
        self, query: str, max_results: int = 5,
    ) -> dict[str, Any]:
        if not self._knowledge:
            return {"error": "知识服务未配置"}
        results = self._knowledge.search(query, max_results=max_results)
        return {"results": results, "total": len(results)}

    def _handle_read_knowledge(self, path: str) -> dict[str, Any]:
        if not self._knowledge:
            return {"error": "知识服务未配置"}
        # 兼容 SKILL.md 中带 knowledge/ 前缀的路径
        if path.startswith("knowledge/"):
            path = path[len("knowledge/"):]
        try:
            content = self._knowledge.read(path)
            return {"content": content}
        except FileNotFoundError as e:
            return {"error": str(e)}

    def _handle_list_tables(
        self, prefix: str | None = None, database: str | None = None,
    ) -> dict[str, Any]:
        db = database or self._database
        if not db:
            return {"error": "未指定数据库名称"}
        tables = self._adapter.list_tables(db)
        if prefix:
            tables = [t for t in tables if t.get("name", "").startswith(prefix)]
        return {"tables": tables}

    def _handle_describe_table(
        self, table_name: str, database: str | None = None,
    ) -> dict[str, Any]:
        db = database or self._database
        if not db:
            return {"error": "未指定数据库名称"}
        schema = self._adapter.get_table_schema(db, table_name)
        return {"schema": schema}

    def _handle_execute_sql(
        self, sql: str, wait_for_completion: bool = True,
    ) -> dict[str, Any]:
        safe_sql = prepare_readonly_sql(sql, limit=50000)
        result = self._adapter.execute_query(safe_sql, limit=50000)

        data = result.get("data") or result.get("rows") or []
        row_count = len(data) if data else 0

        resp: dict[str, Any] = {
            "columns": result.get("columns", []),
            "data": data,
            "row_count": row_count,
            "execution_time_ms": result.get("execution_time_ms", 0),
        }

        if row_count == 0:
            resp["message"] = "查询成功，结果为空（0 行）。符合条件的数据不存在。"

        return resp

    # ── 语义层工具 ──

    def _handle_list_cubes(self) -> dict[str, Any]:
        if not self._semantic:
            return {"error": "语义层服务未配置"}
        cubes = [
            cube for cube in self._semantic.list_cubes()
            if cube.get("status", "active") == "active"
        ]
        return {"cubes": cubes, "total": len(cubes)}

    def _handle_describe_cube(self, cube_name: str) -> dict[str, Any]:
        if not self._semantic:
            return {"error": "语义层服务未配置"}
        return self._semantic.describe_cube(cube_name)

    def _handle_query(self, dsl: dict[str, Any]) -> dict[str, Any]:
        if not self._semantic:
            return {"error": "语义层服务未配置"}
        return self._semantic.compile_and_execute(dsl, self._adapter)


# ============================================================================
# 工具定义（JSON Schema 格式，兼容 OpenAI function calling）
# ============================================================================

BUILTIN_TOOLS: list[ToolDef] = [
    ToolDef(
        name="search_knowledge",
        description="在数仓知识库中搜索关键词，返回匹配的文档路径和上下文片段。用于快速定位相关的表文档、查询模板和业务规则。",
        parameters={
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索关键词，多个词用空格分隔（如 '学生 答题'）",
                },
                "max_results": {
                    "type": "integer",
                    "description": "最大返回文档数（默认 5）",
                },
            },
        },
        channels=["feishu"],
        handler="search_knowledge",
    ),
    ToolDef(
        name="read_knowledge",
        description="读取数仓知识文档。根据路由表中的路径读取对应的业务域文档、指标定义或查询规范。",
        parameters={
            "type": "object",
            "required": ["path"],
            "properties": {
                "path": {
                    "type": "string",
                    "description": "知识文档相对路径，如 knowledge/domains/study/dwd-answer-records.md",
                },
            },
        },
        channels=["feishu"],
        handler="read_knowledge",
    ),
    ToolDef(
        name="list_tables",
        description="列出数据库中的所有可用数据表。可通过前缀过滤。",
        parameters={
            "type": "object",
            "properties": {
                "prefix": {
                    "type": "string",
                    "description": "表名前缀，用于过滤（可选）",
                },
                "database": {
                    "type": "string",
                    "description": "数据库/项目名称（可选，使用默认数据库时省略）",
                },
            },
        },
        channels=["feishu"],
        handler="list_tables",
    ),
    ToolDef(
        name="describe_table",
        description="获取指定表的结构信息，包括字段名、类型、注释和分区信息。",
        parameters={
            "type": "object",
            "required": ["table_name"],
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "表名",
                },
                "database": {
                    "type": "string",
                    "description": "数据库/项目名称（可选，使用默认数据库时省略）",
                },
            },
        },
        channels=["feishu"],
        handler="describe_table",
    ),
    ToolDef(
        name="execute_sql",
        description="执行 SQL 查询并返回结果。只允许 SELECT 查询，自动注入安全校验和行数限制。",
        parameters={
            "type": "object",
            "required": ["sql"],
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "SQL SELECT 查询语句",
                },
            },
        },
        channels=["feishu", "datachat"],
        handler="execute_sql",
    ),

    # ── 语义层工具 ──

    ToolDef(
        name="list_cubes",
        description="列出语义层中所有可用的 Cube（数据实体），包含名称、标题、维度列表和指标列表。用于了解可查询的业务实体。",
        parameters={
            "type": "object",
            "properties": {},
        },
        channels=["feishu"],
        handler="list_cubes",
    ),
    ToolDef(
        name="describe_cube",
        description="获取指定 Cube 的详细信息：维度（含枚举值）、指标、关联关系、默认过滤、分区信息，以及相关查询示例（Recipe）。用于构造查询 DSL 前了解字段语义。",
        parameters={
            "type": "object",
            "required": ["cube_name"],
            "properties": {
                "cube_name": {
                    "type": "string",
                    "description": "Cube 名称，如 'answer_records'、'student'",
                },
            },
        },
        channels=["feishu"],
        handler="describe_cube",
    ),
    ToolDef(
        name="query",
        description=(
            "通过语义层 DSL 查询数据。DSL 会被自动编译为 SQL 执行。\n"
            "DSL 格式：{measures: ['cube.measure'], dimensions: ['cube.dim'], "
            "filters: [{dimension: 'cube.dim', operator: 'equals', values: [...]}], "
            "time_dimensions: [{dimension: 'cube.time_dim', date_range: ['yyyy-MM-dd','yyyy-MM-dd']}], "
            "order: [['cube.field', 'asc']], limit: 1000}"
        ),
        parameters={
            "type": "object",
            "required": ["dsl"],
            "properties": {
                "dsl": {
                    "type": "object",
                    "description": "查询 DSL 对象",
                    "properties": {
                        "measures": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "指标引用列表，格式 'cube_name.measure_name'",
                        },
                        "dimensions": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "维度引用列表，格式 'cube_name.dimension_name'",
                        },
                        "filters": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "过滤条件",
                        },
                        "time_dimensions": {
                            "type": "array",
                            "items": {"type": "object"},
                            "description": "时间维度条件",
                        },
                        "segments": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "order": {
                            "type": "array",
                            "items": {"type": "array"},
                        },
                        "limit": {"type": "integer"},
                    },
                },
            },
        },
        channels=["feishu"],
        handler="query",
    ),
]


class ToolRegistry:
    """
    工具注册中心

    管理所有内置工具，根据信道过滤可用工具列表，并创建绑定上下文的执行器。
    """

    def __init__(
        self,
        knowledge_service: Any | None = None,
        semantic_service: Any | None = None,
    ):
        self._tools = list(BUILTIN_TOOLS)
        self._knowledge = knowledge_service
        self._semantic = semantic_service

    def for_context(
        self,
        channel: str,
        adapter: Any,
        database: str | None = None,
    ) -> tuple[list[dict[str, Any]], ToolExecutor]:
        """
        根据信道过滤工具列表，并绑定数据源适配器和知识服务到执行上下文

        Args:
            channel: 信道标识 ("feishu" | "datachat")
            adapter: DataSourceAdapter 实例
            database: 默认数据库名（飞书信道为 MaxCompute project）

        Returns:
            (tool_defs, executor) — 工具定义 JSON 列表和绑定的执行器
        """
        filtered = [t for t in self._tools if channel in t.channels]

        tool_defs = [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
            for t in filtered
        ]

        executor = ToolExecutor(
            tool_defs=filtered,
            adapter=adapter,
            knowledge_service=self._knowledge,
            database=database,
            semantic_service=self._semantic,
        )

        return tool_defs, executor
