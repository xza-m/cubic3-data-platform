"""proposal 命令：建模提案管线（7 步门控写域）。

薄封装 `semantic_modeling_proposal_service`（_uses_sql_registry=True）。硬顺序门：
  create → (confirm-source) → update-spec/draft → validate → approve(须 validated) → apply(→registry) → publish(→live manifest)
update-spec 注入整份 spec 可绕过 draft 的 MaxCompute。gap 为只读看门。
所有写步 --dry-run/--yes；publish 写 live active manifest（最高风险，回滚见 `release rollback`）。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import load_json_arg, run, to_jsonable, write_run


@click.group("proposal")
def proposal() -> None:
    """建模提案管线（7 步门控写域）。"""


def _svc(container):
    return container.semantic_modeling_proposal_service()


@proposal.command("create", help="创建提案（payload: business_subject/source_id/database/table 等）")
@click.option("--payload", required=True, help="提案 payload JSON（内联 / @file / -）")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_create(obj, payload, dry_run, yes) -> None:
    data = load_json_arg(payload)

    def body(container):
        return to_jsonable(_svc(container).create_proposal(data))

    write_run(obj, dry_run=dry_run, yes=yes, action="create proposal", preview=data, fn=body)


@proposal.command("confirm-source", help="确认建模源（source_id/database/table/dataset_id 之一必填）")
@click.argument("proposal_id")
@click.option("--source", required=True, help="source patch JSON")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_confirm_source(obj, proposal_id, source, dry_run, yes) -> None:
    data = load_json_arg(source)

    def body(container):
        return to_jsonable(_svc(container).confirm_source(proposal_id, data))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"confirm-source {proposal_id}", preview=data, fn=body)


@proposal.command("update-spec", help="注入/合并 spec（整份 spec 可绕过 draft 的 MaxCompute）")
@click.argument("proposal_id")
@click.option("--spec", required=True, help="整份 cube+ontology+governance spec JSON")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_update_spec(obj, proposal_id, spec, dry_run, yes) -> None:
    spec_dict = load_json_arg(spec)

    def body(container):
        return to_jsonable(_svc(container).update_spec(proposal_id, {"spec": spec_dict}))

    write_run(
        obj, dry_run=dry_run, yes=yes, action=f"update-spec {proposal_id}",
        preview={"spec_keys": list(spec_dict.keys()) if isinstance(spec_dict, dict) else None}, fn=body,
    )


@proposal.command("draft", help="生成草稿（默认会打 MaxCompute；已 update-spec 时无需此步）")
@click.argument("proposal_id")
@click.option("--allow-live", is_flag=True, help="允许走 live 路径（会打 MaxCompute，dev 易挂）")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_draft(obj, proposal_id, allow_live, dry_run, yes) -> None:
    if not allow_live and not dry_run:
        from app.interfaces.cli.output import EXIT_USAGE, fail

        fail(
            "draft 默认会打 MaxCompute（dev 易挂）。已用 update-spec 注入 spec 时无需 draft；"
            "确需 live draft 请加 --allow-live --yes。",
            exit_code=EXIT_USAGE, output=obj.output,
        )

    def body(container):
        return to_jsonable(_svc(container).draft(proposal_id))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"draft {proposal_id}", preview={"proposal_id": proposal_id}, fn=body)


@proposal.command("validate", help="校验 spec（结构门控，输出 blockers/warnings；approve 前必跑）")
@click.argument("proposal_id")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_validate(obj, proposal_id, dry_run, yes) -> None:
    def body(container):
        return to_jsonable(_svc(container).validate(proposal_id))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"validate {proposal_id}", preview={"proposal_id": proposal_id}, fn=body)


@proposal.command("gap", help="看门（只读）：coverage/gaps/validation/primary_action 下一步动作")
@click.argument("proposal_id")
@click.pass_obj
def proposal_gap(obj, proposal_id) -> None:
    def body(container):
        return to_jsonable(_svc(container).get_gap_view(proposal_id))

    run(obj, body)


@proposal.command("approve", help="审批（硬前置：status 须 validated）")
@click.argument("proposal_id")
@click.option("--approved-by", default=None, help="审批人（默认 --principal 或 semantic_owner）")
@click.option("--review-type", default="single_owner", show_default=True)
@click.option("--comment", default=None)
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_approve(obj, proposal_id, approved_by, review_type, comment, dry_run, yes) -> None:
    payload = {
        "approved_by": approved_by or obj.principal or "semantic_owner",
        "review_type": review_type,
        "comment": comment,
    }

    def body(container):
        return to_jsonable(_svc(container).approve(proposal_id, payload))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"approve {proposal_id}", preview=payload, fn=body)


@proposal.command("apply", help="应用（写 SQL asset registry：upsert asset + append revision）")
@click.argument("proposal_id")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_apply(obj, proposal_id, dry_run, yes) -> None:
    def body(container):
        return to_jsonable(_svc(container).apply(proposal_id))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"apply {proposal_id}", preview={"proposal_id": proposal_id}, fn=body)


@proposal.command("publish", help="发布到 live active manifest（binding-matrix 门；回滚见 release rollback）")
@click.argument("proposal_id")
@click.option("--dry-run", is_flag=True)
@click.option("--yes", is_flag=True)
@click.pass_obj
def proposal_publish(obj, proposal_id, dry_run, yes) -> None:
    def body(container):
        return to_jsonable(_svc(container).publish(proposal_id))

    write_run(
        obj, dry_run=dry_run, yes=yes,
        action=f"publish {proposal_id} → live active manifest", preview={"proposal_id": proposal_id}, fn=body,
    )
