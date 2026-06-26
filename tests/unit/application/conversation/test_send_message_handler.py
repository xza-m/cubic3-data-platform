"""
Send Message Handler 单元测试

测试发送消息处理器：成功路径、错误路径、Agent 回退
"""
import pytest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

from app.application.conversation.handlers.send_message_handler import SendMessageHandler
from app.application.conversation.commands.send_message import SendMessageCommand
from app.domain.entities.conversation import Conversation, Message
from app.shared.exceptions import ApplicationException


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_repos():
    """Mock 仓储"""
    conv_repo = MagicMock()
    msg_repo = MagicMock()
    dataset_repo = MagicMock()
    llm_service = MagicMock()
    return conv_repo, msg_repo, dataset_repo, llm_service


@pytest.fixture
def handler(mock_repos):
    """创建处理器"""
    conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
    return SendMessageHandler(
        conversation_repository=conv_repo,
        message_repository=msg_repo,
        dataset_repository=dataset_repo,
        llm_service=llm_service,
    )


@pytest.fixture
def command():
    """发送消息命令"""
    return SendMessageCommand(
        conversation_id=1,
        user_id="user_123",
        content="查询销售额",
    )


# ============================================================================
# 对话不存在 / 无权访问
# ============================================================================


class TestSendMessageHandlerErrors:
    def test_conversation_not_found_raises(self, handler, command, mock_repos):
        """对话不存在时抛出 ApplicationException"""
        conv_repo, msg_repo, _, _ = mock_repos
        conv_repo.find_by_id.return_value = None

        with pytest.raises(ApplicationException, match="对话不存在"):
            handler.handle(command)

        conv_repo.find_by_id.assert_called_once_with(1)

    def test_unauthorized_user_raises(self, handler, command, mock_repos):
        """用户无权访问对话时抛出"""
        conv_repo, msg_repo, _, _ = mock_repos
        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "other_user"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        with pytest.raises(ApplicationException, match="无权访问"):
            handler.handle(command)


# ============================================================================
# 传统 LLM 路径（Agent 不可用时回退）
# ============================================================================


class TestSendMessageHandlerLegacyTerminal:
    """三层回退终点（08.1-02 决策 2/5）：物理直表旁路已删，未作答统一落诚实兜底 source='fallback'。"""

    def test_dataset_session_unmatched_falls_back(self, handler, command, mock_repos):
        """dataset 有值会话：semantic/agent 未作答 → 统一诚实兜底，不扫物理表、不调直连 LLM。

        替代原 test_legacy_llm_success / test_legacy_llm_dataset_not_found_raises /
        test_legacy_llm_error_creates_error_message——物理 legacy 路（_handle_via_legacy_llm 物理分支 +
        _execute_query + LEGACY_DISCLAIMER）随决策 2 删除，dataset 有值会话现走 _build_unanswerable_fallback。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conversation.updated_at = None
        conv_repo.find_by_id.return_value = conversation

        # 真实 Message 实体（带 source/to_dict），create 原样回写——便于断言 source
        msg_repo.create.side_effect = lambda message: message

        # semantic_router 不可用（handler 无 router）、agent 不可用 → 落 _handle_via_legacy_llm 终点
        with patch(
            "app.application.agent.agent_factory.get_data_agent_service",
            return_value=None,
        ):
            result = handler.handle(command)

        ai_entity = msg_repo.create.call_args_list[-1][0][0]
        # 决策 5：统一诚实兜底 source='fallback'，via_semantic_layer is False
        assert ai_entity.source == "fallback"
        assert ai_entity.to_dict()["via_semantic_layer"] is False
        # 物理直表旁路已删：不扫物理表（不取 dataset）、不调直连 LLM
        llm_service.generate_sql.assert_not_called()
        dataset_repo.find_by_id.assert_not_called()


class TestSendMessageHandlerAgent:
    def test_semantic_router_success_short_circuits_agent_and_legacy(self, mock_repos):
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        semantic_router_service = MagicMock()
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
            semantic_router_service=semantic_router_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询销售额"}
        ai_message = MagicMock()
        ai_message.to_dict.return_value = {"id": 2, "role": "assistant", "content": "语义路由回答"}
        msg_repo.create.side_effect = [user_message, ai_message]

        semantic_router_service.execute_plan.return_value = {
            "route": {"route_type": "cube"},
            "execution_results": [
                {
                    "status": "executed",
                    "target_type": "sql",
                    "result": {"columns": [{"name": "gmv", "type": "number"}], "data": [{"gmv": 100}], "row_count": 1},
                    "traceability": {
                        "business_metric": {"title": "GMV"},
                        "analysis_measure": {"cube_name": "orders"},
                    },
                }
            ],
            "traceability": {"ontology": {"matched_entities": [{"entity_type": "metric", "name": "gmv"}]}},
        }

        result = handler.handle(SendMessageCommand(conversation_id=1, user_id="user_123", content="查询销售额"))

        assert result["ai_message"]["content"] == "语义路由回答"
        semantic_router_service.execute_plan.assert_called_once()
        llm_service.generate_sql.assert_not_called()

        # Phase 5 可信标注：semantic 路径 AI 消息标注 source='semantic'
        ai_message_entity = msg_repo.create.call_args_list[1][0][0]
        assert ai_message_entity.source == "semantic"

    def test_semantic_router_called_with_official_runtime_mode(self, mock_repos):
        """Phase 8 D1（RED）：DataChat 全局问数必须以 official 运行时调 execute_plan。

        当前 _handle_via_semantic_router 只传 question/viewer_roles、不传 runtime_mode，
        故 call_args.kwargs 无 runtime_mode → 断言失败（RED）。Wave 2 改 handler 后转 GREEN。
        execute_plan 的 runtime_mode 为 keyword-only（preview_service.py:582），故读 call_args.kwargs。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        semantic_router_service = MagicMock()
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
            semantic_router_service=semantic_router_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "学生答题统计 总数"}
        ai_message = MagicMock()
        ai_message.to_dict.return_value = {"id": 2, "role": "assistant", "content": "语义路由回答"}
        msg_repo.create.side_effect = [user_message, ai_message]

        semantic_router_service.execute_plan.return_value = {
            "route": {"route_type": "cube"},
            "execution_results": [
                {
                    "status": "executed",
                    "target_type": "sql",
                    "result": {"columns": [], "data": [], "row_count": 1},
                    "traceability": {},
                }
            ],
            "traceability": {},
        }

        handler.handle(
            SendMessageCommand(conversation_id=1, user_id="user_123", content="学生答题统计 总数")
        )

        semantic_router_service.execute_plan.assert_called_once()
        call_kwargs = semantic_router_service.execute_plan.call_args.kwargs
        # 锚定问法（实测 official 下命中 student_total_count）
        assert call_kwargs.get("question") == "学生答题统计 总数"
        # 核心断言（当前 RED）：handler 必须以 official 运行时调用语义执行
        assert call_kwargs.get("runtime_mode") == "official"

    def test_semantic_router_path_records_agent_query_log(self, mock_repos):
        """Phase 5：semantic 路径补写 AgentQueryLog，llm_provider=semantic_router。"""
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        semantic_router_service = MagicMock()
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
            semantic_router_service=semantic_router_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1}
        ai_message = MagicMock()
        ai_message.to_dict.return_value = {"id": 2}
        msg_repo.create.side_effect = [user_message, ai_message]

        semantic_router_service.execute_plan.return_value = {
            "route": {"route_type": "cube"},
            "execution_results": [
                {
                    "status": "executed",
                    "target_type": "sql",
                    "execution_request": {"sql_query": "SELECT 1"},
                    "result": {"columns": [], "data": [], "row_count": 0},
                    "traceability": {},
                }
            ],
            "traceability": {},
        }

        log_entry = MagicMock()
        mock_db = SimpleNamespace(session=MagicMock())
        with patch("app.domain.entities.agent_query_log.AgentQueryLog", return_value=log_entry) as log_cls:
            with patch("app.extensions.db", mock_db):
                handler.handle(SendMessageCommand(conversation_id=1, user_id="user_123", content="查询销售额"))

        log_kwargs = log_cls.call_args.kwargs
        assert log_kwargs["llm_provider"] == "semantic_router"
        assert log_kwargs["status"] == "success"
        assert log_kwargs["sql_executed"] == "SELECT 1"
        mock_db.session.add.assert_called_once_with(log_entry)

    def test_agent_success_returns_channel_response(self, handler, command, mock_repos):
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询销售额"}
        msg_repo.create.return_value = user_message

        container = MagicMock()
        adapter = MagicMock()
        channel_instance = MagicMock()
        channel_instance.to_agent_request.return_value = ("req", {"table": "sales"}, adapter)
        channel_instance.deliver_response.return_value = {"mode": "agent", "ok": True}
        agent_service = MagicMock()
        agent_service.run.return_value = SimpleNamespace(
            text="答复",
            sql="SELECT 1",
            usage={"tokens": 3},
            tool_trace_evidence=lambda: {"trace": [], "degradation": None},
        )
        log_entry = MagicMock()
        mock_db = SimpleNamespace(session=MagicMock())

        with patch("app.di.container.get_container", return_value=container):
            with patch("app.application.agent.agent_factory.get_data_agent_service", return_value=agent_service):
                with patch("app.interfaces.channels.datachat_channel.DataChatChannel", return_value=channel_instance):
                    with patch("app.domain.entities.agent_query_log.AgentQueryLog", return_value=log_entry):
                        with patch("app.extensions.db", mock_db):
                            with patch("time.monotonic", side_effect=[1.0, 1.25]):
                                result = handler.handle(command)

        assert result == {"mode": "agent", "ok": True}
        agent_service.run.assert_called_once_with("req", adapter=adapter, schema_info={"table": "sales"})
        log_entry.mark_success.assert_called_once()
        adapter.close.assert_called_once()
        llm_service.generate_sql.assert_not_called()
        # 消息写入走容器 scoped_session，handler 返回前必须在同一 session 提交
        conv_repo.commit.assert_called_once()

    def test_agent_failure_falls_back_to_honest_fallback(self, handler, command, mock_repos):
        """Phase 8.1（RED，决策 5）：agent 软失败 → 统一诚实兜底，不退 legacy 物理出数。

        坐实「兜底不统一」缺陷：当前 agent 失败会回落 _handle_via_legacy_llm 物理分支，
        调 llm_service.generate_sql + legacy_adapter.execute_query 真出物理表数（source='legacy_llm'）。
        GREEN（08.1-02）后应统一收敛到 _build_unanswerable_fallback（source='fallback'），
        不产 SQL、不碰物理表。本用例对当前代码 RED（当前 source=='legacy_llm' 且 generate_sql 被调）。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conversation.updated_at = None
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询"}
        # 真实 Message 实体（带 source/to_dict），create 原样回写——便于断言 source 而非 mock 占位
        msg_repo.create.side_effect = lambda message: message

        dataset = MagicMock()
        dataset.physical_table = "sales"
        dataset.source = MagicMock()
        dataset.source.source_type = "mysql"
        dataset.source.connection_config = {}
        dataset.fields = MagicMock()
        dataset.fields.all.return_value = [MagicMock(physical_name="amount", data_type="decimal", description="金额")]
        dataset_repo.find_by_id.return_value = dataset

        legacy_adapter = MagicMock()
        llm_service.generate_sql.return_value = {
            "sql": "SELECT amount FROM sales",
            "explanation": "已回退到传统 LLM",
        }

        container = MagicMock()
        agent_adapter = MagicMock()
        channel_instance = MagicMock()
        channel_instance.to_agent_request.return_value = ("req", {"table": "sales"}, agent_adapter)
        agent_service = MagicMock()
        agent_service.run.side_effect = RuntimeError("agent down")
        log_entry = MagicMock()
        mock_db = SimpleNamespace(session=MagicMock())

        with patch("app.di.container.get_container", return_value=container):
            with patch("app.application.agent.agent_factory.get_data_agent_service", return_value=agent_service):
                with patch("app.interfaces.channels.datachat_channel.DataChatChannel", return_value=channel_instance):
                    with patch("app.domain.entities.agent_query_log.AgentQueryLog", return_value=log_entry):
                        with patch("app.extensions.db", mock_db):
                            with patch("time.monotonic", side_effect=[2.0, 2.4, 3.0, 3.5]):
                                with patch(
                                    "app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter",
                                    return_value=legacy_adapter,
                                ):
                                    result = handler.handle(command)

        # GREEN 目标：agent 软失败 → 统一诚实兜底，source=='fallback'、不出物理表数
        ai_entity = msg_repo.create.call_args_list[-1][0][0]
        assert ai_entity.source == "fallback"
        assert ai_entity.to_dict()["via_semantic_layer"] is False
        # 兜底不产 SQL、不碰物理表（当前 RED：回退 legacy 时这两者都被调）
        llm_service.generate_sql.assert_not_called()
        legacy_adapter.execute_query.assert_not_called()

    def test_unanswerable_fallback_via_semantic_layer_false(self, mock_repos):
        """Phase 8.1（RED，决策 5）：全局会话答不出 → 统一诚实兜底 source=='fallback'。

        坐实「兜底不统一」：当前全局会话（dataset_id is None）走 _handle_via_legacy_llm 诚实
        兜底块落 source='legacy_llm'（send_message_handler.py:313-325）。GREEN 后应统一为
        source='fallback'（决策 5），且 to_dict()['via_semantic_layer'] is False（防回归把 fallback
        误判为经语义层，conversation.py:192）。本用例对当前代码 RED（当前 source=='legacy_llm'）。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        semantic_router_service = MagicMock()
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
            semantic_router_service=semantic_router_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = None  # 全局问数会话：无绑定数据集
        conversation.updated_at = None
        conversation.context = {}
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询销售额"}
        # 真实 Message 实体（带 source/to_dict），create 原样回写
        msg_repo.create.side_effect = lambda message: message

        # semantic 主链未命中（execution_results 为空且非 blocked）→ 返 None 交兜底
        semantic_router_service.execute_plan.return_value = {
            "route": {"route_type": "blocked", "reason": "未命中已发布业务语义"},
            "execution_results": [],
            "traceability": {},
        }

        result = handler.handle(
            SendMessageCommand(conversation_id=1, user_id="user_123", content="查询销售额")
        )

        ai_entity = msg_repo.create.call_args_list[-1][0][0]
        # GREEN 目标：统一诚实兜底 source=='fallback'，via_semantic_layer is False
        assert ai_entity.source == "fallback"
        assert ai_entity.to_dict()["via_semantic_layer"] is False
        # 兜底不调直连 LLM、不出物理表数
        llm_service.generate_sql.assert_not_called()

    def test_agent_global_session_short_circuits(self, mock_repos):
        """Phase 8.1（RED，决策 5）：全局会话（dataset_id is None）agent 第 2 层短路。

        坐实「agent 第 2 层物理直表旁路」死路径：当前 _handle_via_agent 对全局会话不短路——
        调 DataChatChannel.to_agent_request（取物理 schema + 建物理 adapter）并 db.session.add
        一条 running AgentQueryLog，随后抛错被吞，残留 running log。GREEN（08.1-02）后应 return None
        短路、不调 to_agent_request、不建 log。本用例对当前代码 RED（当前会建 adapter/log）。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = None  # 全局问数会话
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "查询销售额"}

        container = MagicMock()
        adapter = MagicMock()
        channel_instance = MagicMock()
        channel_instance.to_agent_request.return_value = ("req", {"table": "sales"}, adapter)
        agent_service = MagicMock()
        log_entry = MagicMock()
        mock_db = SimpleNamespace(session=MagicMock())

        with patch("app.di.container.get_container", return_value=container):
            with patch("app.application.agent.agent_factory.get_data_agent_service", return_value=agent_service):
                with patch("app.interfaces.channels.datachat_channel.DataChatChannel", return_value=channel_instance):
                    with patch("app.domain.entities.agent_query_log.AgentQueryLog", return_value=log_entry):
                        with patch("app.extensions.db", mock_db):
                            with patch("time.monotonic", side_effect=[1.0, 1.25]):
                                result = handler._handle_via_agent(
                                    SendMessageCommand(
                                        conversation_id=1, user_id="user_123", content="查询销售额"
                                    ),
                                    conversation,
                                    user_message,
                                )

        # GREEN 目标：全局会话 agent 第 2 层短路 → return None，不取物理 schema、不建 running log
        assert result is None
        channel_instance.to_agent_request.assert_not_called()
        mock_db.session.add.assert_not_called()

    def test_semantic_router_should_receive_principal_context(self, mock_repos):
        """Phase 8.1（RED/xfail，决策 4）：principal 透传命门——execute_plan 应收 principal_context。

        治理命门重述（对账实测）：DataChat execute_plan → runtime_service.execute 的 post_compile
        治理已在链路（runtime_service.py:113/126，decision!=allow → blocked），命门不是「无治理管线」
        而是「handler 写死 viewer_roles=[]、零 principal_context → 真实角色到不了治理引擎 → 即便主体持
        data_m1_reader 也 deny」。RED 坐实当前未透传：execute_plan 被调用时 principal_context is None
        且 viewer_roles==[]；GREEN（08.1-02）后 handler 应透传 command.principal_context → 转绿。

        当前 SendMessageCommand 无 principal_context 字段（决策 4 在 08.1-02 新增），故本 RED 用
        SimpleNamespace 模拟带 principal_context 的 command 表达 GREEN 期望。
        """
        conv_repo, msg_repo, dataset_repo, llm_service = mock_repos
        semantic_router_service = MagicMock()
        handler = SendMessageHandler(
            conversation_repository=conv_repo,
            message_repository=msg_repo,
            dataset_repository=dataset_repo,
            llm_service=llm_service,
            semantic_router_service=semantic_router_service,
        )

        conversation = MagicMock()
        conversation.id = 1
        conversation.user_id = "user_123"
        conversation.dataset_id = 10
        conv_repo.find_by_id.return_value = conversation

        user_message = MagicMock()
        user_message.to_dict.return_value = {"id": 1, "role": "user", "content": "学生答题统计 总数"}
        ai_message = MagicMock()
        ai_message.to_dict.return_value = {"id": 2, "role": "assistant", "content": "语义路由回答"}
        msg_repo.create.side_effect = [user_message, ai_message]

        semantic_router_service.execute_plan.return_value = {
            "route": {"route_type": "cube"},
            "execution_results": [
                {
                    "status": "executed",
                    "target_type": "sql",
                    "result": {"columns": [], "data": [], "row_count": 1},
                    "traceability": {},
                }
            ],
            "traceability": {},
        }

        # GREEN（08.1-02 决策 4）：command 带 principal_context/viewer_roles（Command 新增可选字段）
        principal_context = {"principal_id": "p", "roles": ["data_m1_reader"]}
        command = SimpleNamespace(
            conversation_id=1,
            user_id="user_123",
            content="学生答题统计 总数",
            principal_context=principal_context,
            viewer_roles=["data_m1_reader"],
        )

        handler.handle(command)

        semantic_router_service.execute_plan.assert_called_once()
        call_kwargs = semantic_router_service.execute_plan.call_args.kwargs
        # 核心断言（GREEN）：handler 必须把 command.principal_context 透传给治理引擎
        assert call_kwargs.get("principal_context") == principal_context
