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


def _build_validated_for_table(
    container,
    output,
    *,
    source_id,
    database,
    table,
    columns_from,
    schema,
    explicit_parts,
    lift,
):
    """读列 → onboard spec → proposal 管线（固定 agent_led 防 human_led 死锁）→ validate。

    单表/批量共用的核心编排（复用 onboard_spec_builder + proposal 服务，零新建领域逻辑）。
    partitions：显式优先；未传则从列名自动探测（ds/dt/pt/date），避免无时间维 footgun。
    返回 (proposal_service, proposal_id, spec, validation, partitions_used)；validate 不过不在此中断，
    由调用方决定（单表 fail NOT_READY；批量 mark+skip 继续整批）。
    """
    columns = _read_cached_columns(container, columns_from, output)
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
    return prop, proposal_id, spec, validation, parts


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
        """复用共享编排；单表语义：validate 不过 → fail(NOT_READY)、绝不 publish。"""
        prop, proposal_id, spec, validation, parts = _build_validated_for_table(
            container,
            obj.output,
            source_id=source_id,
            database=database,
            table=table,
            columns_from=columns_from,
            schema=schema,
            explicit_parts=explicit_parts,
            lift=lift,
        )
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


# ---- P2 turnkey 批量：一次把多张物理表建成可发布 cube -----------------------------

def _resolve_table_id(container, *, table, source_id, database, schema):
    """按表名经 data_asset_service.list_tables(keyword=table) 匹配 qualified_name 结尾，取 table_id。

    命中多张时取第一张（同库同表唯一）；找不到返回 None（批量按"未找到资产"标记跳过该表）。
    """
    page = container.data_asset_service().list_tables(
        keyword=table,
        source_id=str(source_id) if source_id is not None else None,
        database=database,
        schema=schema,
        page_size=50,
    )
    for item in page.get("items") or []:
        qn = (item.get("qualified_name") or "").lower()
        if qn.endswith(str(table).lower()):
            return item.get("id")
    return None


@cube.command("onboard-batch", help="批量把多张物理表建成可发布 cube（逐表 validate，单张失败只跳过）")
@click.option("--source-id", required=True, type=int, help="数据源 id（cube 的 source 绑定）")
@click.option("--database", required=True, help="物理库名")
@click.option("--tables", required=True, help="表名，逗号分隔（如 t1,t2,t3）")
@click.option("--schema", default=None, help="schema 名（可选）")
@click.option("--lift", default="all", help="升哪些度量为业务指标：all 或逗号分隔子集（默认 all）")
@click.option("--publish", is_flag=True, default=False, help="继续发布整批到 live manifest（默认否：只到 validated）")
@click.option("--dry-run", is_flag=True, help="--publish 段预览整批，不发布")
@click.option("--yes", is_flag=True, help="--publish 段确认写 live manifest")
@click.pass_obj
def cube_onboard_batch(obj, source_id, database, tables, schema, lift, publish, dry_run, yes) -> None:
    """逐表复用单表编排（build_onboard_spec + proposal create/update-spec/validate）。

    某张 validate 不过只标记跳过、不中断整批（per-table 门控）。
    --publish 段：批前记一次回滚锚点（active manifest release_id），同款写门控（缺 --yes 拒、--dry-run 预览），
    --yes 才对每张 validated 的逐张 approve→apply→publish。
    """
    table_names = [t.strip() for t in (tables or "").split(",") if t.strip()]
    if not table_names:
        fail("--tables 不能为空（逗号分隔表名）", exit_code=EXIT_USAGE, output=obj.output)

    def _onboard_one(container, table):
        """单表跑到 validate；返回 (per_table_report, proposal_or_none)。validate 不过不中断。"""
        table_id = _resolve_table_id(
            container, table=table, source_id=source_id, database=database, schema=schema
        )
        if table_id is None:
            return {"table": table, "validate_status": "skipped", "reason": "asset_not_found"}, None
        prop, proposal_id, spec, validation, parts = _build_validated_for_table(
            container,
            obj.output,
            source_id=source_id,
            database=database,
            table=table,
            columns_from=table_id,
            schema=schema,
            explicit_parts=None,  # 批量始终自动探分区（无逐表 --partitions）
            lift=lift,
        )
        report = {"table": table, **_onboard_overview(spec, validation, partitions_used=parts)}
        # validate 未过：标记跳过，不进发布；validated：附带 prop 供后续逐张发布
        return report, (prop, proposal_id) if validation.get("status") == "validated" else None

    # 默认（无 --publish）：逐表建到 validated，输出 per-table 概况，安全停（非消费级）
    if not publish:
        def _batch_validated(container):
            items = [_onboard_one(container, t)[0] for t in table_names]
            return {"items": items, "total": len(items)}

        run(obj, _batch_validated)
        return

    # --publish 段：批前记一次回滚锚点 → 同款写门控（缺 --yes 拒 / --dry-run 预览全批不发 / --yes 逐张发）
    def _batch_publish(container):
        manifest = container.runtime_snapshot_service().get_active_manifest()
        anchor_release_id = manifest.get("release_id") if isinstance(manifest, dict) else None

        results = [_onboard_one(container, t) for t in table_names]
        reports = [r for r, _ in results]
        publishable = [(r, p) for r, p in results if p is not None]
        action = f"publish {len(publishable)} cube(s) to live manifest"

        if dry_run:
            return {
                "dry_run": True,
                "action": action,
                "anchor_release_id": anchor_release_id,
                "preview": {"items": reports, "total": len(reports),
                            "will_publish_count": len(publishable), "will_publish": True},
            }
        if not yes:
            fail(
                f"{action} 是写操作，需加 --yes 确认（或 --dry-run 预览）",
                exit_code=EXIT_USAGE,
                output=obj.output,
            )

        published_by_table = {}
        new_release_id = anchor_release_id
        for _report, (prop, proposal_id) in publishable:
            prop.approve(proposal_id)
            prop.apply(proposal_id)
            published = prop.publish(proposal_id)
            release_id = (published.get("publish_result") or {}).get("release_id")
            published_by_table[proposal_id] = {
                "publish_status": published.get("status"),
                "release_id": release_id,
            }
            new_release_id = release_id or new_release_id

        # 把发布结果回填进对应 per-table 报告
        for report in reports:
            pub = published_by_table.get(report.get("proposal_id"))
            if pub is not None:
                report.update(pub)

        return {
            "items": reports,
            "total": len(reports),
            "anchor_release_id": anchor_release_id,
            "new_release_id": new_release_id,
            "published_count": len(published_by_table),
        }

    run(obj, _batch_publish)
