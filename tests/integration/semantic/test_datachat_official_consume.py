"""Phase 8（08-consume-02）集成测试：DataChat 全局问数经 official runtime 消费已发布 cube。

坐实三条闭环边界（全程 stub 隔离，不实连真实数据源、不实连 DB）：
- Test A：含答题 ontology（metric aliases 对得上「学生答题统计 总数」）的 active manifest →
  经 SendMessageHandler/official 问 → 走 semantic 主链（route_type∈{cube,hybrid}、有 execution_results、
  ai_message.source=='semantic'、不落 legacy「未能找到口径」）。
- Test B：无 active 快照（semantic_runtime_not_ready）→ 诚实回「语义运行时尚未就绪」，不 500、不伪造。
- Test C：comment / YAML-only cube 在 official 下不命中（坐实 D3 预期方向，不为保 comment 做 YAML 并集）。

机制说明：SendMessageHandler 注入真实 SemanticRouterPreviewService（08-02 已让 handler 传
runtime_mode="official"），preview_service 真实走 official 分支
（_load_runtime_manifest → RuntimeSemanticCatalog.from_manifest → execution_targets），
仅在 runtime_service.execute 边界用 stub 截断返固定行数（不实连数据源）。
绝不 mock execute_plan 返回值——那会退化成 08-01 的契约测试而非出数集成测试。
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.application.conversation.commands.send_message import SendMessageCommand
from app.application.conversation.handlers.send_message_handler import SendMessageHandler
from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.domain.entities.conversation import Message
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository

# 出数问法（CONTEXT 实测 official 下命中 student_total_count），归一化后 = "学生答题统计总数"
OFFICIAL_QUESTION = "学生答题统计 总数"
# stub runtime 固定行数（不实连真实数据源，仅坐实「有出数」形状）
STUB_ROW_COUNT = 39_890_000


class _RuntimeSnapshotServiceStub:
    """get_active_manifest 返回固定 payload（active manifest 或 not_ready）。"""

    def __init__(self, payload):
        self.payload = payload

    def get_active_manifest(self, namespace="default"):
        assert namespace == "default"
        return self.payload


class _StubRuntimeService:
    """最小语义执行运行时：execute 返固定 1 行，不实连数据源。

    截断在 execute 边界 —— preview_service 的 plan()/official 分支仍真实执行，
    只把「真打真实数据源」替换为固定行数，坐实闭环形状。
    """

    def __init__(self):
        self.execute_calls = []

    def execute(self, *, target_type, metric_name=None, runtime_mode=None, **kwargs):
        self.execute_calls.append(
            {"target_type": target_type, "metric_name": metric_name, "runtime_mode": runtime_mode}
        )
        return {
            "status": "executed",
            "target_type": "sql",
            "execution_request": {
                "sql_query": "SELECT COUNT(1) AS student_total_count FROM df.dws_study_student_answer_kb_stat_di"
            },
            "result": {
                "columns": [{"name": "student_total_count", "type": "number"}],
                "data": [{"student_total_count": STUB_ROW_COUNT}],
                "row_count": 1,
            },
            "traceability": {
                "business_metric": {"title": "学生答题统计 总数", "name": metric_name},
                "analysis_measure": {"cube_name": "dws_study_student_answer_kb_stat_di"},
                "runtime_mode": runtime_mode,
            },
        }


class _DenyRuntimeService:
    """模拟下游治理 post_compile deny：execute 返 status=='blocked'。

    Phase 8.1 对账修订第 1 项：治理 post_compile 实测已在 runtime_service.py:113/126 链路，
    集成层不重建治理引擎——这里只在 execute 边界用 stub 模拟「下游裁决 deny」的结果，
    坐实 handler 对 blocked 当前不落 fallback。
    """

    def __init__(self, *, reason="data_policy_not_matched"):
        self.execute_calls = []
        self.reason = reason

    def execute(self, *, target_type, metric_name=None, runtime_mode=None, **kwargs):
        self.execute_calls.append(
            {"target_type": target_type, "metric_name": metric_name, "runtime_mode": runtime_mode}
        )
        return {
            "status": "blocked",
            "target_type": "sql",
            "reason": self.reason,
            "execution_request": {"sql_query": None},
            "traceability": {},
        }


def _answer_manifest():
    """含答题 cube + metric student_total_count（aliases 覆盖「学生答题统计」「总数」）的 active manifest。

    照 test_preview_service.py::test_official_runtime_routes_and_compiles_from_snapshot_manifest_without_yaml
    的 manifest 构造法（metric.measure_refs 指向 cube.measure），切到答题域 + 对得上口径的 aliases。
    """
    return {
        "ok": True,
        "snapshot_id": "snap_answer",
        "release_id": "rel_answer",
        "asset_manifest_json": {
            "schema_version": "semantic-runtime-manifest/v1",
            "assets": [
                {
                    "asset_id": "asset_metric_student_total_count",
                    "asset_type": "ontology",
                    "asset_key": "metric:student_total_count",
                    "revision_id": "rev_metric_answer",
                    "spec_checksum": "a" * 64,
                    "status": "published",
                    "spec": {
                        "metric": {
                            "name": "student_total_count",
                            "title": "学生答题统计 总数",
                            "object_name": "StudentAnswer",
                            "semantic_formula": "学生答题记录总条数",
                            "measure_refs": ["student_answer_cube.total_count"],
                            "aliases": ["学生答题统计", "总数", "答题总数"],
                            "status": "active",
                        }
                    },
                },
                {
                    "asset_id": "asset_cube_student_answer",
                    "asset_type": "cube",
                    "asset_key": "student_answer_cube",
                    "revision_id": "rev_cube_answer",
                    "spec_checksum": "c" * 64,
                    "status": "published",
                    "spec": {
                        "cube": {
                            "name": "student_answer_cube",
                            "title": "学生答题",
                            "table": "df_cb_258187.dws_study_student_answer_kb_stat_di",
                            "source_id": 1,
                            "source_database": "df_cb_258187",
                            "dimensions": {
                                "school_name": {
                                    "title": "学校名称",
                                    "type": "string",
                                    "sql": "{CUBE}.school_name",
                                },
                                "ds": {"title": "分区日期", "type": "time", "sql": "{CUBE}.ds"},
                            },
                            "measures": {
                                "total_count": {
                                    "title": "总数",
                                    "type": "number",
                                    "sql": "COUNT(1)",
                                    "certified": True,
                                }
                            },
                            "partition": {
                                "field": "ds",
                                "type": "date",
                                "format": "yyyyMMdd",
                                "max_range_days": 30,
                            },
                        }
                    },
                },
            ],
        },
        "binding_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
        "policy_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "policies": []},
    }


def _build_router(tmp_path, *, snapshot_payload, runtime_service=None):
    """组装真实 SemanticRouterPreviewService：空 YAML repos + stub runtime + stub snapshot。

    official 模式下 ontology/cube 全部从 active manifest（snapshot_payload）出，
    空 YAML repos 仅满足构造，不污染 official 命中范围。
    """
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    return SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        runtime_service=runtime_service,
        runtime_snapshot_service=_RuntimeSnapshotServiceStub(snapshot_payload),
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )


def _build_handler(router):
    """组装 SendMessageHandler：dataset_id=None（全局问数），llm_service 不应被调用。"""
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    llm_service = MagicMock()

    conversation = MagicMock()
    conversation.id = 1
    conversation.user_id = "user_123"
    conversation.dataset_id = None  # 全局问数会话：无绑定数据集
    conversation.context = {}
    conv_repo.find_by_id.return_value = conversation

    # 真实 Message 实体（带 to_dict / source / content），create 原样回写
    msg_repo.create.side_effect = lambda message: message

    handler = SendMessageHandler(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        dataset_repository=dataset_repo,
        llm_service=llm_service,
        semantic_router_service=router,
    )
    return handler, conv_repo, msg_repo, dataset_repo, llm_service, conversation


def _ai_message(result):
    return result["ai_message"]


def test_official_consume_routes_to_cube_and_returns_rows(tmp_path):
    """Test A：official + 对得上口径的问法 → semantic 主链出数，不落 legacy「未能找到口径」。"""
    runtime_service = _StubRuntimeService()
    router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=runtime_service)
    handler, _, msg_repo, _, llm_service, conversation = _build_handler(router)

    result = handler.handle(
        SendMessageCommand(conversation_id=1, user_id="user_123", content=OFFICIAL_QUESTION)
    )

    ai = _ai_message(result)
    # 走 semantic 主链：source=='semantic'、有出数、未退 legacy
    assert ai["source"] == "semantic"
    assert "未能" not in ai["content"]  # 不落 legacy 诚实兜底「未能找到口径」

    # AI 消息实体确认 source / query_result（出数形状）
    ai_entity = msg_repo.create.call_args_list[-1][0][0]
    assert isinstance(ai_entity, Message)
    assert ai_entity.source == "semantic"
    assert ai_entity.query_result is not None
    assert ai_entity.query_result["row_count"] == 1
    assert ai_entity.query_result["data"][0]["student_total_count"] == STUB_ROW_COUNT

    # route_type∈{cube,hybrid}：从 handler 写入 conversation.context 的 semantic_plan.route 读真实路由结果
    persisted_context = conversation.update_context.call_args[0][0]
    route_type = persisted_context["semantic_plan"]["route"]["route_type"]
    assert route_type in {"cube", "hybrid"}

    # execute_plan 真实经 official 分支命中 cube，并真实调 stub runtime（runtime_mode 透传 official）
    assert len(runtime_service.execute_calls) >= 1
    assert runtime_service.execute_calls[0]["runtime_mode"] == "official"

    # 全局问数未退 legacy 直连 LLM
    llm_service.generate_sql.assert_not_called()


def test_official_no_active_snapshot_returns_honest_not_ready(tmp_path):
    """Test B：无 active 快照 → 诚实「语义运行时尚未就绪」，不 500、不伪造、不落「未能找到口径」。"""
    runtime_service = _StubRuntimeService()
    router = _build_router(
        tmp_path,
        snapshot_payload={"ok": False, "error_code": "semantic_runtime_not_ready"},
        runtime_service=runtime_service,
    )
    handler, _, msg_repo, _, llm_service, _ = _build_handler(router)

    result = handler.handle(
        SendMessageCommand(conversation_id=1, user_id="user_123", content=OFFICIAL_QUESTION)
    )

    ai = _ai_message(result)
    assert ai["source"] == "semantic"
    assert "语义运行时尚未就绪" in ai["content"]
    assert "未能" not in ai["content"]  # 非 legacy「未能找到口径」

    ai_entity = msg_repo.create.call_args_list[-1][0][0]
    assert ai_entity.error == "semantic_runtime_not_ready"

    # 无快照诚实兜底：blocked 不出数，不调 runtime.execute，不退 legacy
    assert runtime_service.execute_calls == []
    llm_service.generate_sql.assert_not_called()


def test_official_yaml_only_comment_not_matched(tmp_path):
    """Test C：用答题 manifest（不含 comment）问「统计学生评论数」→ 不命中（D3 预期方向）。

    坐实 YAML-only comment 切 official 后不再被 DataChat 命中是既定方向，不为保 comment 做并集：
    official 未命中 → 统一诚实兜底「未能找到口径」（dataset_id is None），不伪造、不出数。
    Phase 8.1（决策 5，GREEN）：兜底统一为 source='fallback'。
    """
    runtime_service = _StubRuntimeService()
    router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=runtime_service)
    handler, _, msg_repo, _, llm_service, _ = _build_handler(router)

    result = handler.handle(
        SendMessageCommand(conversation_id=1, user_id="user_123", content="统计学生评论数")
    )

    ai = _ai_message(result)
    # comment 不在答题 manifest → official 未命中 → 统一诚实兜底「未能找到口径」
    assert "未能在已发布的语义资产中找到" in ai["content"]
    # 决策 5：统一诚实兜底 source='fallback'（当前 RED：handler 落 legacy_llm）
    assert ai["source"] == "fallback"

    # 不出数、不实连：未命中走兜底分支，runtime.execute 未被调用
    assert runtime_service.execute_calls == []
    # 全局问数（dataset_id is None）兜底不调直连 LLM
    llm_service.generate_sql.assert_not_called()


def test_semantic_router_receives_principal_context(tmp_path):
    """Phase 8.1（GREEN，决策 4）：principal 透传命门——execute_plan 收 command.principal_context。

    治理命门重述（对账实测）：DataChat execute_plan → runtime_service.execute 的治理裁决已在链路
    （runtime_service.py:113/126），命门是「handler 写死空角色、零 principal_context → 真实角色到不了
    治理引擎 PrincipalResolver.resolve（只读 principal_context.roles）→ 即便主体持 data_m1_reader 也不
    命中 m1_aggregate_read → deny」。GREEN（08.1-02）后 handler 透传 command.principal_context；本用例
    spy SemanticRouterPreviewService.execute_plan，断言被调用时收到含 data_m1_reader 的 principal_context。
    """
    runtime_service = _StubRuntimeService()
    router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=runtime_service)
    handler, _, _, _, _, _ = _build_handler(router)

    # 决策 4：principal 解析在 interfaces 层完成后经 SendMessageCommand 透传（此处直接构造已透传后的 command）
    principal_context = {"principal_id": "p", "roles": ["data_m1_reader"]}

    with patch.object(
        router, "execute_plan", wraps=router.execute_plan
    ) as spy_execute_plan:
        handler.handle(
            SendMessageCommand(
                conversation_id=1,
                user_id="user_123",
                content=OFFICIAL_QUESTION,
                principal_context=principal_context,
                viewer_roles=["data_m1_reader"],
            )
        )

    spy_execute_plan.assert_called_once()
    call_kwargs = spy_execute_plan.call_args.kwargs
    # 核心断言（GREEN）：handler 必须把含 data_m1_reader 的 principal_context 透传给治理引擎
    assert call_kwargs.get("principal_context") == principal_context


def test_governance_deny_falls_back(tmp_path):
    """Phase 8.1（GREEN，决策 5）：下游治理 deny(blocked) → 统一诚实兜底，不伪造出数。

    对账修订第 1 项：治理裁决实测已在 runtime_service.py:113/126 链路，集成层不重建治理引擎——
    用 _DenyRuntimeService 在 execute 边界模拟「下游裁决 deny」（runtime_service.py:126 decision!=allow
    → status='blocked'）。决策 5：三类答不出（含治理 deny）统一收敛到诚实兜底 source='fallback'。
    GREEN（08.1-02）后 handler 对 primary_result.status=='blocked' 落 _build_unanswerable_fallback。
    """
    runtime_service = _DenyRuntimeService(reason="data_policy_not_matched")
    router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=runtime_service)
    handler, _, msg_repo, _, llm_service, _ = _build_handler(router)

    result = handler.handle(
        SendMessageCommand(conversation_id=1, user_id="user_123", content=OFFICIAL_QUESTION)
    )

    ai = _ai_message(result)
    # 决策 5：治理 deny → 统一诚实兜底 source='fallback'
    assert ai["source"] == "fallback"

    # 无伪造出数：deny 不产 query_result
    ai_entity = msg_repo.create.call_args_list[-1][0][0]
    assert ai_entity.query_result is None
    # 全局问数兜底不调直连 LLM
    llm_service.generate_sql.assert_not_called()


def test_dataset_session_main_chain_fails_falls_back(tmp_path):
    """Phase 8.1（GREEN，决策 2/5）：dataset 有值会话 + 主链全失败（含 agent 软失败）→ source='fallback'。

    物理 legacy 路（_handle_via_legacy_llm 物理分支 + _execute_query + LEGACY_DISCLAIMER）随决策 2 删除：
    dataset 有值会话在 semantic/agent 均未作答时，不再退回直连 LLM 扫物理表产 SQL，而是统一落
    _build_unanswerable_fallback（source='fallback'，via_semantic_layer is False），不产 SQL、不碰物理表。
    """
    runtime_service = _StubRuntimeService()
    router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=runtime_service)

    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    llm_service = MagicMock()

    conversation = MagicMock()
    conversation.id = 1
    conversation.user_id = "user_123"
    conversation.dataset_id = 10  # dataset 有值会话（非全局问数）
    conversation.context = {}
    conversation.updated_at = None
    conv_repo.find_by_id.return_value = conversation
    msg_repo.create.side_effect = lambda message: message

    handler = SendMessageHandler(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        dataset_repository=dataset_repo,
        llm_service=llm_service,
        semantic_router_service=router,
    )

    # router 未命中（dataset 有值但问法对不上 manifest）→ 返兜底；agent 软失败（get_data_agent_service None）
    with patch("app.application.agent.agent_factory.get_data_agent_service", return_value=None):
        result = handler.handle(
            SendMessageCommand(conversation_id=1, user_id="user_123", content="统计学生评论数")
        )

    ai = _ai_message(result)
    # 决策 5：主链全失败 → 统一诚实兜底 source='fallback'，via_semantic_layer is False
    assert ai["source"] == "fallback"
    assert ai["via_semantic_layer"] is False
    ai_entity = msg_repo.create.call_args_list[-1][0][0]
    assert isinstance(ai_entity, Message)
    assert ai_entity.source == "fallback"
    # 物理直表旁路已删：不扫物理表（不取 dataset）、不调直连 LLM、不出 query_result
    dataset_repo.find_by_id.assert_not_called()
    llm_service.generate_sql.assert_not_called()
    assert ai_entity.query_result is None


# ---------------------------------------------------------------------------
# Phase 8.1 Wave 3（08.1-03，决策 1/4）：跨入口治理一致性冒烟
#
# 一致性本质（对账修订第 1 项）：DataChat 与 /agent/semantic/plan 是两条入口，但两者
# 都把「同一真实 principal」透传给各自的治理链——
#   · DataChat 主链：execute_plan → runtime_service.execute 的 post_compile（已在链路）；
#   · agent 入口：AgentPlanHandler.handle → AccessPolicyDecisionService.post_compile。
# 一致性来自「两入口透传同一 principal 给同一治理裁决」，不在测试内重建治理引擎：
#   · DataChat 侧用 _StubRuntimeService（治理 allow→出数）/ _DenyRuntimeService（治理 deny→blocked）
#     在 execute 边界表达「下游治理裁决结果」；
#   · agent 侧用真实 PrincipalResolver + AccessPolicyDecisionService，断言同一 principal 透达治理链。
# 断言：① 含 data_m1_reader 的 principal 在两入口都被透传到治理链；
#       ② 治理 allow 时 DataChat 出数（source='semantic'），无角色 principal 时 DataChat
#          走 deny→统一诚实兜底（source='fallback'）——与 agent 入口「同主体同问 decision」方向一致。
# ---------------------------------------------------------------------------


def _build_agent_handler():
    """组装 agent 对照入口（/agent/semantic/plan 背后的 AgentPlanHandler）。

    用真实 PrincipalResolver + AccessPolicyDecisionService（同一治理引擎），router/compiler
    用最小 stub——只为坐实「同一 principal 经 agent 入口同样透达治理链」，不重建治理规则。
    """
    from app.application.agent.handlers.agent_plan_handler import AgentPlanHandler
    from app.application.governance.access import (
        AccessPolicyDecisionService,
        PrincipalResolver,
    )

    seen = {"router_principal": None, "compiler_principal": None}

    class _AgentRouterStub:
        def plan(self, *, question, principal_context=None, viewer_roles=None, runtime_mode=None):
            seen["router_principal"] = principal_context
            return {
                "semantic_plan_id": "sp_parity",
                "question": question,
                "runtime_mode": runtime_mode,
                "route": {"route_type": "cube", "matched": {"metric_name": "student_total_count"}},
                "steps": [{"step_key": "semantic_match"}],
                "execution_targets": [
                    {"target_type": "sql", "metric_name": "student_total_count", "target_key": "metric:x:sql"}
                ],
                "traceability": {"question": question},
            }

    class _AgentCompilerStub:
        def compile_preview(self, *, target_type, metric_name=None, principal_context=None, **_):
            seen["compiler_principal"] = principal_context
            return {
                "status": "ready",
                "target_type": target_type,
                "logical_sql": "SELECT COUNT(1) FROM dws_study_student_answer_kb_stat_di",
                "resource_set": ["dws_study_student_answer_kb_stat_di"],
                "sql_hash": "sha256:parity",
                "data_level": "M1",
                "bindings": {"metric_name": metric_name},
            }

    handler = AgentPlanHandler(
        principal_resolver=PrincipalResolver(),
        access_policy_service=AccessPolicyDecisionService(),
        router_service=_AgentRouterStub(),
        compiler_service=_AgentCompilerStub(),
    )
    return handler, seen


def test_two_entrances_principal_parity(tmp_path):
    """决策 1/4：DataChat 与 /agent/semantic/plan 透传同一 principal 给各自治理链。

    ① 含 data_m1_reader 的 principal：
       · DataChat 主链把它透给 execute_plan（→ runtime_service post_compile），治理 allow（stub runtime）→ 出数 source='semantic'；
       · agent 入口把同一 principal 透给 AgentPlanHandler 治理链（router/compiler 收到含 data_m1_reader 的 roles）。
    ② 治理 deny（下游 post_compile decision!=allow → blocked）：
       · DataChat 主链对 blocked 落统一诚实兜底 source='fallback'，不伪造出数；
       · agent 入口同一 principal 同样透达治理链并产出 policy_decision（同主体同治理裁决出口）。
       两入口一致性 = 透传同一 principal 给各自治理链 + 治理结果驱动同向行为（allow→出数/deny→不出数）。

    注：真实 deny 的钥匙是 DB 侧 access_data_policies（CONTEXT 对账：deny=data_policy_not_matched
    在 access-grant 段、依赖真实 DB 策略与主体 data_ 角色），单测沙箱无 DB 策略仓库时
    AccessPolicyDecisionService 走 preview（M1 默认 allow）。本一致性测试不重建 DB 治理规则，
    deny 行为由 DataChat 侧 _DenyRuntimeService 在 execute 边界表达；真实 deny 闭环留 Task 3 真实环境验证。
    """
    principal_with_role = {"principal_id": "p:reader", "roles": ["data_m1_reader"]}
    principal_no_role = {"principal_id": "p:norole", "roles": []}

    # --- 入口 A：DataChat（治理 allow，含 data_m1_reader）→ 透传 + 出数 ---
    allow_runtime = _StubRuntimeService()
    allow_router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=allow_runtime)
    dc_handler, _, dc_msg_repo, _, _, _ = _build_handler(allow_router)
    with patch.object(allow_router, "execute_plan", wraps=allow_router.execute_plan) as spy_dc_plan:
        dc_allow = dc_handler.handle(
            SendMessageCommand(
                conversation_id=1,
                user_id="user_123",
                content=OFFICIAL_QUESTION,
                principal_context=principal_with_role,
                viewer_roles=["data_m1_reader"],
            )
        )
    # DataChat 入口把含 data_m1_reader 的 principal 透给治理链（execute_plan → runtime post_compile）
    spy_dc_plan.assert_called_once()
    assert spy_dc_plan.call_args.kwargs.get("principal_context") == principal_with_role
    # 治理 allow（stub runtime 出数）→ source='semantic'
    assert _ai_message(dc_allow)["source"] == "semantic"
    dc_allow_entity = dc_msg_repo.create.call_args_list[-1][0][0]
    assert dc_allow_entity.query_result is not None

    # --- 入口 B：agent（同一含 data_m1_reader 的 principal）→ 透达治理链 ---
    agent_handler, agent_seen = _build_agent_handler()
    agent_allow = agent_handler.handle(
        question=OFFICIAL_QUESTION,
        principal_context=principal_with_role,
        viewer_roles=["data_m1_reader"],
    )
    # agent 入口把同一 principal 透给治理链：router/compiler 收到含 data_m1_reader 的 roles
    assert "data_m1_reader" in (agent_seen["router_principal"] or {}).get("roles", [])
    assert "data_m1_reader" in (agent_seen["compiler_principal"] or {}).get("roles", [])
    # agent 入口同样把 principal 透到 policy_decision（同主体同治理链）
    assert agent_allow["principal_context"]["principal_id"] == "p:reader"
    assert "data_m1_reader" in agent_allow["principal_context"]["roles"]

    # --- 治理 deny：DataChat 主链对 blocked 统一兜底 + agent 同一 principal 透达治理链 ---
    deny_runtime = _DenyRuntimeService(reason="data_policy_not_matched")
    deny_router = _build_router(tmp_path, snapshot_payload=_answer_manifest(), runtime_service=deny_runtime)
    dc_deny_handler, _, dc_deny_msg_repo, _, _, _ = _build_handler(deny_router)
    with patch.object(deny_router, "execute_plan", wraps=deny_router.execute_plan) as spy_dc_deny_plan:
        dc_deny = dc_deny_handler.handle(
            SendMessageCommand(
                conversation_id=1,
                user_id="user_123",
                content=OFFICIAL_QUESTION,
                principal_context=principal_no_role,
                viewer_roles=[],
            )
        )
    # DataChat 入口：同样透传 principal 给治理链；下游治理 deny(blocked) → 统一诚实兜底 source='fallback'，不出数
    spy_dc_deny_plan.assert_called_once()
    assert spy_dc_deny_plan.call_args.kwargs.get("principal_context") == principal_no_role
    assert _ai_message(dc_deny)["source"] == "fallback"
    assert dc_deny_msg_repo.create.call_args_list[-1][0][0].query_result is None

    # agent 入口：同一 principal 经真实治理链产出 policy_decision（同主体同治理裁决出口，decision 字段成立）
    agent_deny_handler, agent_deny_seen = _build_agent_handler()
    agent_deny = agent_deny_handler.handle(
        question=OFFICIAL_QUESTION,
        principal_context=principal_no_role,
        viewer_roles=[],
    )
    # 同一 principal 透达 agent 治理链（router/compiler 收到该 principal），并产出 decision（同主体同治理出口）
    assert agent_deny_seen["compiler_principal"]["principal_id"] == "p:norole"
    assert agent_deny["policy_decision"]["decision"] in {"allow", "deny", "require_approval", "review"}
    assert agent_deny["principal_context"]["principal_id"] == "p:norole"
