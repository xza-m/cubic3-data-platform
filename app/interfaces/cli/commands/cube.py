"""cube 只读命令：list / show / describe。

口径：cube = 【定义(repo)】口径（YAML 全集，含 draft/deprecated，回答"建模里定义了什么"），
与 manifest（已发布/active）口径不同。
- list / show：纯读（list_cubes 只读仓库），零写。
- describe：详情（dims/measures 类型 + diagnostics），底层 describe_cube 会对 semantic_registry
  做一次幂等 upsert+commit（内部缓存对账，非语义变更）——故单列为 describe，show 保持零写。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import (
    EXIT_NOT_READY,
    EXIT_USAGE,
    fail,
    load_json_arg_or_fail,
    not_found,
    run,
    to_jsonable,
    write_run,
)


@click.group("cube")
def cube() -> None:
    """语义 Cube 定义（只读）。"""


def _svc(container):
    return container.semantic_definition_service()


@cube.command("list", help="列出已定义 Cube（含 draft，定义口径）")
@click.option("--status", default=None, help="按状态筛选（如 active/draft）")
@click.pass_obj
def cube_list(obj, status) -> None:
    def body(container):
        cubes = _svc(container).list_cubes()
        if status:
            cubes = [c for c in cubes if c.get("status") == status]
        return {"items": cubes, "total": len(cubes)}

    run(obj, body)


@cube.command("show", help="查看 Cube 摘要（零写：取自 list_cubes）")
@click.argument("name")
@click.pass_obj
def cube_show(obj, name) -> None:
    def body(container):
        for c in _svc(container).list_cubes():
            if c.get("name") == name:
                return c
        not_found(f"未找到 Cube: {name}", obj.output)

    run(obj, body)


@cube.command("describe", help="查看 Cube 详情（dims/measures 类型 + diagnostics；会同步 registry）")
@click.argument("name")
@click.pass_obj
def cube_describe(obj, name) -> None:
    def body(container):
        result = _svc(container).describe_cube(name)
        if isinstance(result, dict) and result.get("error"):
            not_found(result["error"], obj.output)
        return result

    run(obj, body)


# ---- P3 写域：建模草稿 / 落 YAML --------------------------------------------------

@cube.command("draft", help="从缓存列生成 cube 草稿 payload（绕 MaxCompute；只读，输出供 review/落库）")
@click.option("--source-id", required=True, type=int, help="数据源 id（cube 的 source 绑定）")
@click.option("--database", required=True, help="物理库名")
@click.option("--table", required=True, help="物理表名")
@click.option("--columns-from", required=True, help="读取缓存列的资产 table_id（data_asset_fields）")
@click.option("--schema", default=None, help="schema 名（可选）")
@click.option("--partitions", default=None, help="分区字段，逗号分隔（如 ds）")
@click.option("--name", default=None, help="cube 名（默认按表名）")
@click.option("--title", default=None, help="cube 标题")
@click.pass_obj
def cube_draft(obj, source_id, database, table, columns_from, schema, partitions, name, title) -> None:
    def body(container):
        fields = container.data_asset_service().list_fields(columns_from)
        if fields is None:
            not_found(f"未找到资产表: {columns_from}", obj.output)
        columns = [
            {
                "name": f.get("name") or f.get("column_name"),
                "type": f.get("type") or f.get("data_type"),
                "comment": f.get("comment") or f.get("description"),
            }
            for f in (fields.get("items") or [])
        ]
        parts = [p.strip() for p in (partitions or "").split(",") if p.strip()] or None
        return container.cube_modeling_service().build_cube_draft_payload(
            source_id=source_id,
            database=database,
            schema=schema,
            table=table,
            columns=columns,
            partitions=parts,
            name=name,
            title=title,
        )

    run(obj, body)


@cube.command("create", help="把 cube 草稿 payload 落为 YAML 定义（draft 态）")
@click.argument("draft")
@click.option("--dry-run", is_flag=True, help="只回显将创建的 payload，不落库")
@click.option("--yes", is_flag=True, help="确认写入")
@click.pass_obj
def cube_create(obj, draft, dry_run, yes) -> None:
    payload = load_json_arg_or_fail(draft, output=obj.output)

    def body(container):
        return to_jsonable(container.cube_modeling_service().create_cube(payload))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"create cube '{payload.get('name')}'", preview=payload, fn=body)


@cube.command("update", help="更新已有 cube 定义（落 YAML，如 avg→sum 度量修正）")
@click.argument("name")
@click.argument("patch")
@click.option("--dry-run", is_flag=True, help="只回显将更新的 patch，不落库")
@click.option("--yes", is_flag=True, help="确认写入")
@click.pass_obj
def cube_update(obj, name, patch, dry_run, yes) -> None:
    payload = load_json_arg_or_fail(patch, output=obj.output)

    def body(container):
        return to_jsonable(container.cube_modeling_service().update_cube(name, payload))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"update cube '{name}'", preview=payload, fn=body)


# ---- P1 turnkey：一步把物理表建成可发布 cube -------------------------------------

def _read_cached_columns(container, columns_from, output):
    """读资产缓存列（绕 MaxCompute），归一为 [{name,type,comment}]；资产缺失 → not_found(4)。"""
    fields = container.data_asset_service().list_fields(columns_from)
    if fields is None:
        not_found(f"未找到资产表: {columns_from}", output)
    return [
        {
            "name": f.get("name") or f.get("column_name"),
            "type": f.get("type") or f.get("data_type"),
            "comment": f.get("comment") or f.get("description"),
        }
        for f in (fields.get("items") or [])
    ]


# 常见分区列名（按优先级）：turnkey 命令忘传 --partitions 时自动探，避免建出无时间维 cube
# → repair 注不进 time_dimension → metric_time_dimension_missing → validate 全挂的 footgun。
_PARTITION_HINTS = ("ds", "dt", "pt", "date")


def _auto_detect_partitions(columns):
    """从列名按常见分区命名探测分区字段；命中返回 [字段名]，否则 None（不显式传时的兜底）。"""
    names = {(c.get("name") or "").lower() for c in (columns or [])}
    for hint in _PARTITION_HINTS:
        if hint in names:
            return [hint]
    return None


def _onboard_overview(spec, validation, partitions_used=None):
    """从 spec + validate 结果抽 onboard 概况（ratio/sensitive/lifted/门结果），命令如实呈现。

    partitions_used 回传实际使用的分区字段（显式或自动探测），让用户知情。
    """
    cube = (spec or {}).get("cube") or {}
    measures = cube.get("measures") or {}
    ontology = (spec or {}).get("ontology") or {}
    governance = (spec or {}).get("governance") or {}
    matrix = (validation or {}).get("validation_matrix") or {}
    return {
        "proposal_id": validation.get("id"),
        "validate_status": validation.get("status"),
        "blockers": matrix.get("blockers") or [],
        "ratio_measures": [k for k, v in measures.items() if (v or {}).get("type") == "ratio"],
        "sensitive_fields": governance.get("sensitive_fields") or [],
        "lifted_metrics_count": len(ontology.get("metrics") or []),
        "partitions_used": partitions_used,
    }


@cube.command("onboard", help="把物理表一步建成可发布 cube（建cube+升度量为业务指标+可选发布）")
@click.option("--source-id", required=True, type=int, help="数据源 id（cube 的 source 绑定）")
@click.option("--database", required=True, help="物理库名")
@click.option("--table", required=True, help="物理表名")
@click.option("--columns-from", required=True, help="读取缓存列的资产 table_id（data_asset_fields）")
@click.option("--schema", default=None, help="schema 名（可选）")
@click.option("--partitions", default=None, help="分区字段，逗号分隔（如 ds）")
@click.option("--lift", default="all", help="升哪些度量为业务指标：all 或逗号分隔子集（默认 all）")
@click.option("--publish", is_flag=True, default=False, help="继续发布到 live manifest（默认否：只到 validated）")
@click.option("--dry-run", is_flag=True, help="--publish 段预览，不发布")
@click.option("--yes", is_flag=True, help="--publish 段确认写 live manifest")
@click.pass_obj
def cube_onboard(obj, source_id, database, table, columns_from, schema, partitions, lift, publish, dry_run, yes) -> None:
    """薄封装：读列 → build_onboard_spec → proposal create/update-spec/validate → 可选 publish。

    两级写门控：默认（无 --publish）只写 proposal 草稿、停在 validated（非消费级）；
    --publish 段经 write_run 二层护栏（缺 --yes 拒、--dry-run 预览）方写 live manifest。
    validate 未过 → 报 blockers + EXIT_NOT_READY，绝不 publish。
    """
    # 显式 --partitions 解析（命中则始终以显式为准）；未传则下面读列后自动探测，避免 footgun。
    explicit_parts = [p.strip() for p in (partitions or "").split(",") if p.strip()] or None

    def _build_validated(container):
        """读列 → onboard spec → proposal 管线（固定 agent_led 防 human_led 死锁）→ validate。

        返回 (proposal_service, proposal_id, spec, validation, partitions_used)。
        partitions：显式 --partitions 优先；未传则从列名自动探测分区字段（ds/dt/pt/date）。
        validate 不过在此 fail(NOT_READY)。
        """
        columns = _read_cached_columns(container, columns_from, obj.output)
        # turnkey 省心：未显式传 --partitions 时自动探，建出带时间维的 cube，避免 validate 全挂
        parts = explicit_parts if explicit_parts is not None else _auto_detect_partitions(columns)
        spec = container.onboard_spec_builder().build_onboard_spec(
            source_id=source_id,
            database=database,
            table=table,
            columns=columns,
            schema=schema,
            partitions=parts,
            lift=lift,
        )
        prop = container.semantic_modeling_proposal_service()
        created = prop.create_proposal(
            {
                "business_subject": (spec.get("business") or {}).get("subject") or table,
                "source_kind": "physical_table",
                "source_id": source_id,
                "database": database,
                "table": table,
                "source_mode": "agent_led",  # 固定，避免 human_led 缺机械字段死锁
            }
        )
        proposal_id = created["id"]
        prop.update_spec(proposal_id, {"spec": spec})
        validation = prop.validate(proposal_id)
        if validation.get("status") != "validated":
            matrix = validation.get("validation_matrix") or {}
            fail(
                f"cube '{table}' 校验未通过，停在 validate（未发布）",
                exit_code=EXIT_NOT_READY,
                details={"proposal_id": proposal_id, "blockers": matrix.get("blockers") or []},
                output=obj.output,
            )
        return prop, proposal_id, spec, validation, parts

    # 默认（无 --publish）：建模到 validated，输出概况 + 门结果，安全停（非消费级）
    if not publish:
        def _onboard_only(container):
            _prop, _pid, spec, validation, parts = _build_validated(container)
            return _onboard_overview(spec, validation, partitions_used=parts)

        run(obj, _onboard_only)
        return

    # --publish 段：先建到 validated（在 app_context 内），再经写门控发布到 live manifest。
    # 不复用 write_run（其内置 run 会再开一层 app_context）；门控语义在此手写，保持单层 context：
    #   --dry-run → 预览不发；缺 --yes → EXIT_USAGE 拒；--yes → approve→apply→publish 真写。
    def _onboard_and_maybe_publish(container):
        _prop, proposal_id, spec, validation, parts = _build_validated(container)
        overview = _onboard_overview(spec, validation, partitions_used=parts)
        action = f"publish cube '{table}' to live manifest"
        if dry_run:
            return {"dry_run": True, "action": action, "preview": {**overview, "will_publish": True}}
        if not yes:
            fail(
                f"{action} 是写操作，需加 --yes 确认（或 --dry-run 预览）",
                exit_code=EXIT_USAGE,
                output=obj.output,
            )
        _prop.approve(proposal_id)
        _prop.apply(proposal_id)
        published = _prop.publish(proposal_id)
        return {
            **overview,
            "publish_status": published.get("status"),
            "release_id": (published.get("publish_result") or {}).get("release_id"),
        }

    run(obj, _onboard_and_maybe_publish)
