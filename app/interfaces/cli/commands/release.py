"""release 命令：list / show / rollback（语义发布读 + 回滚安全网）。

薄封装 `semantic_release_service`。list/show 只读；rollback 是消费级写（改 live active manifest，
把 active 恢复到指定历史健康 release）——三件套 + 必填 idempotency_key。
低层 `release publish`（手塞 gate_result 绕门）不暴露：新 cube 发布走 `proposal publish`（跑 binding 门）。
"""
from __future__ import annotations

import uuid

import click

from app.interfaces.cli.output import not_found, run, to_jsonable, write_run


@click.group("release")
def release() -> None:
    """语义发布（读 + 回滚）。"""


def _svc(container):
    return container.semantic_release_service()


@release.command("list", help="列出语义发布（状态机：draft/active/superseded/...）")
@click.option("--namespace", default="default", show_default=True)
@click.option("--status", default=None, help="按状态过滤")
@click.option("--limit", default=50, type=int, show_default=True)
@click.option("--offset", default=0, type=int, show_default=True)
@click.pass_obj
def release_list(obj, namespace, status, limit, offset) -> None:
    def body(container):
        return _svc(container).list_releases(namespace=namespace, status=status, limit=limit, offset=offset)

    run(obj, body)


@release.command("show", help="查看单个发布详情")
@click.argument("release_id")
@click.pass_obj
def release_show(obj, release_id) -> None:
    def body(container):
        result = _svc(container).get_release_detail(release_id)
        if result is None:
            not_found(f"未找到 release: {release_id}", obj.output)
        return result

    run(obj, body)


@release.command("rollback", help="回滚 active 到指定历史健康 release（消费级写，改 live manifest）")
@click.argument("release_id")
@click.option("--namespace", default="default", show_default=True)
@click.option("--actor", default=None, help="操作者（默认 --principal）")
@click.option("--idempotency-key", default=None, help="幂等键（默认每次生成唯一键；显式传同键可去重重试）")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def release_rollback(obj, release_id, namespace, actor, idempotency_key, dry_run, yes) -> None:
    # 默认键须每次唯一：静态 rollback:<id> 会让同一锚点二次回滚命中 publish_with_snapshot 的
    # (namespace,key) 短路而静默 no-op（回滚安全网失效）。需去重重试时显式传 --idempotency-key。
    key = idempotency_key or f"rollback:{release_id}:{uuid.uuid4().hex[:12]}"
    resolved_actor = actor or obj.principal

    def body(container):
        return to_jsonable(
            _svc(container).rollback_to(
                namespace=namespace, release_id=release_id, actor=resolved_actor, idempotency_key=key
            )
        )

    write_run(
        obj, dry_run=dry_run, yes=yes,
        action=f"rollback active → {release_id}",
        preview={"namespace": namespace, "release_id": release_id, "actor": resolved_actor, "idempotency_key": key},
        fn=body,
    )
