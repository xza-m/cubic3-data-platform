from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.runtime import emit_result, runtime


app = typer.Typer(help="治理与审计命令", no_args_is_help=True)
audit_app = typer.Typer(help="治理审计 Trace", no_args_is_help=True)
app.add_typer(audit_app, name="audit")


@audit_app.command("list", help="列出治理审计 Trace")
def list_audit_traces(
    ctx: typer.Context,
    policy: Annotated[str | None, typer.Option("--policy", help="策略名称")] = None,
    target_type: Annotated[str | None, typer.Option("--target-type", help="治理目标类型")] = None,
    target_name: Annotated[str | None, typer.Option("--target-name", help="治理目标名称")] = None,
    decision: Annotated[str | None, typer.Option("--decision", help="决策结果")] = None,
    route_type: Annotated[str | None, typer.Option("--route-type", help="路由类型")] = None,
    principal_id: Annotated[str | None, typer.Option("--principal-id", help="调用主体 ID")] = None,
    semantic_plan_id: Annotated[str | None, typer.Option("--semantic-plan-id", help="语义规划 ID")] = None,
    sql_hash: Annotated[str | None, typer.Option("--sql-hash", help="SQL 哈希")] = None,
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get(
            "/api/v1/governance/audit-traces",
            params={
                "policy": policy,
                "target_type": target_type,
                "target_name": target_name,
                "decision": decision,
                "route_type": route_type,
                "principal_id": principal_id,
                "semantic_plan_id": semantic_plan_id,
                "sql_hash": sql_hash,
            },
        ),
    )


@audit_app.command("get", help="获取治理审计 Trace 详情")
def get_audit_trace(
    ctx: typer.Context,
    trace_id: Annotated[str, typer.Argument(help="治理审计 Trace ID")],
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get(f"/api/v1/governance/audit-traces/{encode_segment(trace_id)}"),
    )
