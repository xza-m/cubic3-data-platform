"""query 命令：compile / plan / explain（编译/规划/解释，均 preview-only，零 gateway 执行）。

- compile <dsl>：裸 QueryDSL → SQL（`semantic_query_service.compile_query`，纯函数式，不碰
  principal/manifest/数据源，dev 可跑）。
- plan <question>：NL → 语义路由规划（`semantic_router_preview_service.plan`，含 planning_steps）。
- explain <question>：NL → 编译预览 SQL（`execute_plan_preview`，确认只 compile_preview、绝不调
  runtime_service.execute/gateway，dev 可跑）。

不做（标注原因）：run/execute（MaxCompute/gateway/RLS dev 阻断）、status（无现成方法）、
diagnose（写 semantic_diagnose_runs + 需新建聚合）。见 docs/architecture/semantic-platform-cli-plan.md。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import load_json_arg_or_fail, run


@click.group("query")
def query() -> None:
    """语义查询：编译 / 规划 / 解释（preview-only，不执行出数）。"""


@query.command("compile", help="裸 QueryDSL → SQL（纯编译零执行）。DSL：内联 JSON / @file / -(stdin)")
@click.argument("dsl")
@click.pass_obj
def query_compile(obj, dsl) -> None:
    dsl_dict = load_json_arg_or_fail(dsl, output=obj.output)  # 坏 DSL → usage exit 2（与 cubic3-dp 对齐）

    def body(container):
        result = container.semantic_query_service().compile_query(dsl_dict)
        return {
            "sql": result.sql,
            "primary_cube": result.primary_cube,
            "joined_cubes": result.joined_cubes,
            "scoped_table_refs": result.scoped_table_refs,
        }

    run(obj, body)


@query.command("plan", help="自然语言问题 → 语义路由规划（含 planning_steps，不执行）")
@click.argument("question")
@click.option("--runtime-mode", default="official", show_default=True, type=click.Choice(["official", "preview"]))
@click.pass_obj
def query_plan(obj, question, runtime_mode) -> None:
    def body(container):
        from app.interfaces.cli.principal import principal_context_or_none

        return container.semantic_router_preview_service().plan(
            question=question,
            principal_context=principal_context_or_none(obj.principal),
            runtime_mode=runtime_mode,
        )

    run(obj, body)


@query.command("explain", help="自然语言问题 → 编译预览 SQL（compiled_targets，preview-only 不出数）")
@click.argument("question")
@click.option("--runtime-mode", default="official", show_default=True, type=click.Choice(["official", "preview"]))
@click.pass_obj
def query_explain(obj, question, runtime_mode) -> None:
    def body(container):
        from app.interfaces.cli.principal import principal_context_or_none

        return container.semantic_router_preview_service().execute_plan_preview(
            question=question,
            principal_context=principal_context_or_none(obj.principal),
            runtime_mode=runtime_mode,
        )

    run(obj, body)
