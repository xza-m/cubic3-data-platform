"""proposal 命令（http-client）：建模发布管线是写域，**本地引擎 semctl 专属**。

这里只放 local_only stub，给 agent 清晰指引（而非"未知命令"）。真实执行走：
  python -m app.interfaces.cli proposal <step> ...（exec 进部署）
原因：proposal publish 写 DataChat 在消费的 live manifest，信任边界是 exec，不对远程 token 开放。
"""
from __future__ import annotations

import typer

from cubic3_dp_cli.envelope import emit_local_only


app = typer.Typer(help="建模发布管线（写域，本地引擎 semctl 专属）", no_args_is_help=True)

_STEPS = ["create", "confirm-source", "update-spec", "draft", "validate", "gap", "approve", "apply", "publish"]


def _make_stub(step: str):
    def _stub(ctx: typer.Context) -> None:
        emit_local_only(ctx, f"proposal {step}")

    return _stub


for _step in _STEPS:
    app.command(_step, help=f"[local-only] proposal {_step}（走 semctl）")(_make_stub(_step))
