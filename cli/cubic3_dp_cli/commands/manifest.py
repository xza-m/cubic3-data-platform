"""manifest 命令（http-client，T1 读）：active runtime manifest。

对应 semctl `manifest show`，打 GET /api/v1/semantic/manifest（转调 runtime_snapshot_service）。
未就绪 data.ok=false → exit 5，与 semctl 同口径。
"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.envelope import call_and_emit


app = typer.Typer(help="语义运行态 manifest（已发布口径，只读）", no_args_is_help=True)


@app.command("show", help="查看 active runtime manifest")
def show(
    ctx: typer.Context,
    namespace: Annotated[str, typer.Option("--namespace", help="命名空间")] = "default",
    release: Annotated[str | None, typer.Option("--release", help="指定 release_id（默认 active）")] = None,
) -> None:
    call_and_emit(
        ctx,
        "GET",
        "/api/v1/semantic/manifest",
        params={"namespace": namespace, "release": release},
        not_ready=True,
    )
