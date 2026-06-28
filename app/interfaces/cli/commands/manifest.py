"""manifest 只读命令：show（active runtime manifest，已发布口径）。

底层：container.runtime_snapshot_service()。返回 dict 带 ok 标志：
未就绪（冷启动/未发布）返回 {ok: False, error_code: ...} → 退出码 EXIT_NOT_READY，不展开成功字段。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import EXIT_NOT_READY, fail, run


@click.group("manifest")
def manifest() -> None:
    """语义运行态 manifest（已发布口径，只读）。"""


@manifest.command("show", help="查看 active runtime manifest")
@click.option("--namespace", default="default", show_default=True, help="命名空间")
@click.option("--release", default=None, help="指定 release_id（默认看 active baseline）")
@click.pass_obj
def manifest_show(obj, namespace, release) -> None:
    def body(container):
        svc = container.runtime_snapshot_service()
        result = svc.get_manifest_for_release(release) if release else svc.get_active_manifest(namespace)
        if not (isinstance(result, dict) and result.get("ok")):
            reason = result.get("error_code") or result.get("error") or "semantic_runtime_not_ready"
            fail(reason, exit_code=EXIT_NOT_READY, details=result, output=obj.output)
        return result

    run(obj, body)
