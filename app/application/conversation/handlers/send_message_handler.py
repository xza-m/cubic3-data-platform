"""
发送消息处理器

通过 DataChatChannel → AgentService 处理用户消息。
保留原有 API 响应格式兼容。
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Dict, Any

from app.application.conversation.commands.send_message import SendMessageCommand
from app.domain.entities.conversation import Message
from app.domain.ports.repositories.conversation_repository import IConversationRepository, IMessageRepository
from app.infrastructure.repositories.dataset_repository import DatasetRepository
from app.infrastructure.llm.openai_service import OpenAIService
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SendMessageHandler:
    """发送消息处理器"""

    def __init__(
        self,
        conversation_repository: IConversationRepository,
        message_repository: IMessageRepository,
        dataset_repository: DatasetRepository,
        llm_service: OpenAIService,
        semantic_router_service=None,
    ):
        self.conversation_repository = conversation_repository
        self.message_repository = message_repository
        self.dataset_repository = dataset_repository
        self.llm_service = llm_service
        self.semantic_router_service = semantic_router_service

    def handle(self, command: SendMessageCommand) -> Dict[str, Any]:
        """
        处理发送消息命令

        优先使用 AgentService（DataChat 信道），若不可用则回退到传统 LLM 调用。
        """
        logger.info(
            "Processing user message",
            conversation_id=command.conversation_id,
            user_id=command.user_id
        )

        # 1. 保存用户消息
        conversation = self.conversation_repository.find_by_id(command.conversation_id)
        if not conversation:
            raise ApplicationException(f"对话不存在: {command.conversation_id}")
        if conversation.user_id != command.user_id:
            raise ApplicationException("无权访问此对话")

        user_message = Message(
            conversation_id=command.conversation_id,
            role='user',
            content=command.content,
            created_at=utcnow()
        )
        user_message = self.message_repository.create(user_message)

        try:
            # 2. 尝试通过双层语义主链处理
            try:
                result = self._handle_via_semantic_router(command, conversation, user_message)
                if result:
                    return result
            except Exception as e:
                logger.warning("Semantic Router 不可用，继续回退到 Agent", error=str(e))

            # 3. 尝试通过 AgentService 处理
            try:
                result = self._handle_via_agent(command, conversation, user_message)
                if result:
                    return result
            except Exception as e:
                logger.warning("AgentService 不可用，回退到传统 LLM", error=str(e))

            # 4. 回退：传统 LLM 调用
            return self._handle_via_legacy_llm(command, conversation, user_message)
        finally:
            # 仓储绑定容器 scoped_session（非 Flask db.session），消息/会话写入必须在该 session 提交
            self.conversation_repository.commit()

    def _handle_via_semantic_router(self, command, conversation, user_message) -> Dict[str, Any] | None:
        """优先走双层语义 Router/Planner 主链。"""
        if self.semantic_router_service is None:
            return None
        # D1（Phase 8）：全局问数读 active manifest（runtime official），只消费已发布 cube。
        # 语义来源见 CONTEXT D1 / docs/architecture/semantic-binding-and-rls.md §1.4：
        # 单一事实源——只有发布进 active manifest 的 cube 才可被 DataChat 消费。
        # 兜底（在 _build_blocked_route_message 固化，不扩行为）：
        #   - 无 active 快照 → reason=semantic_runtime_not_ready → 诚实回「语义运行时尚未就绪」；
        #   - 未命中已发布业务语义（reason 以「未命中」开头）→ 返 None → legacy 诚实兜底「未能找到口径」。
        # 决策 4（08.1-02）：透传真实治理主体上下文（access_role_bindings 权威源），不再写死空角色。
        # 治理裁决已在下游 runtime_service.execute 链路（真实角色裁决并强制 deny），handler 不重复实现治理管线。
        plan_result = self.semantic_router_service.execute_plan(
            question=command.content,
            principal_context=command.principal_context,
            viewer_roles=command.viewer_roles or [],
            runtime_mode="official",
        )
        # 分析型 Data Agent 层 MVP（Phase 8.4）：可回答性门控前置短路。
        # 域内但所需维度未建（out_of_coverage，如"按学校"但无学校维度）/ 根本不在语义层（out_of_scope）
        # → 直接诚实告知缺口，不返回可能错粒度的执行结果（避免静默答非所问）。L1 关时门控为 None，不触发（零回归）。
        gap_message = self._answerability_gap_message(plan_result)
        if gap_message:
            return self._build_unanswerable_fallback(
                command, conversation, user_message, reason="coverage_gap", message=gap_message,
            )

        execution_results = plan_result.get("execution_results") or []
        if not execution_results:
            # 路由级阻断(权限/运行时未就绪)有明确原因时诚实回传,不伪装成"找不到口径";
            # 纯未命中实体(reason 以"未命中"开头)交给统一诚实兜底（决策 5）。
            blocked = self._build_blocked_route_message(plan_result)
            if blocked is None:
                return self._build_unanswerable_fallback(
                    command,
                    conversation,
                    user_message,
                    reason=(plan_result.get("route") or {}).get("reason")
                    or plan_result.get("reason")
                    or "未命中已发布语义资产",
                )
            ai_message = self.message_repository.create(Message(
                conversation_id=command.conversation_id,
                role='assistant',
                content=blocked["content"],
                generated_sql=None,
                query_result=None,
                visualization_config=None,
                error=blocked["reason"],
                source='semantic',
                created_at=utcnow(),
            ))
            self._record_query_log(
                command,
                source='semantic_router',
                response=blocked["content"],
                sql=None,
                status='blocked',
            )
            return {
                'user_message': user_message.to_dict(),
                'ai_message': ai_message.to_dict(),
            }

        primary_result = execution_results[0]
        # 决策 5（08.1-02）：下游治理裁决 deny → execute 返 status=='blocked'（runtime_service.py:126）。
        # 治理 deny 不伪造出数，统一收敛到诚实兜底（不落 source='semantic'）。
        if primary_result.get("status") == "blocked":
            return self._build_unanswerable_fallback(
                command,
                conversation,
                user_message,
                reason=primary_result.get("reason") or "访问策略未命中",
            )
        primary_traceability = primary_result.get("traceability") or {}
        ai_content = self._build_semantic_router_response(plan_result)
        generated_sql = self._extract_generated_sql(primary_result)
        ai_message = Message(
            conversation_id=command.conversation_id,
            role='assistant',
            content=ai_content,
            generated_sql=generated_sql,
            query_result=self._extract_query_result(primary_result),
            visualization_config=None,
            error=primary_result.get("reason") if primary_result.get("status") == "blocked" else None,
            source='semantic',
            created_at=utcnow()
        )
        ai_message = self.message_repository.create(ai_message)

        conversation.updated_at = utcnow()
        context = dict(conversation.context or {})
        context["semantic_plan"] = {
            "route": plan_result.get("route", {}),
            "traceability": plan_result.get("traceability", {}),
            "primary_traceability": primary_traceability,
        }
        conversation.update_context(context)
        self.conversation_repository.update(conversation)

        # Phase 5：semantic 路径同样写入 AgentQueryLog，保证三层全部可追踪
        self._record_query_log(
            command,
            source='semantic_router',
            response=ai_content,
            sql=generated_sql,
            status='success',
        )

        return {
            'user_message': user_message.to_dict(),
            'ai_message': ai_message.to_dict()
        }

    @staticmethod
    def _build_blocked_route_message(plan_result) -> Dict[str, str] | None:
        """路由级阻断（权限/运行时未就绪）有明确原因时构造诚实回复；纯未命中实体返回 None 交 legacy。

        D1（Phase 8）official 兜底两条路径在此固化，行为不扩：
        - 无 active 快照：preview_service._blocked_runtime_route 返
          route_type="blocked"、reason="semantic_runtime_not_ready" → 命中下方
          ("runtime","not_ready","manifest","运行清单","未就绪") 关键词分支 →
          诚实回「语义运行时尚未就绪」（不 500、不伪造）。
        - 未命中已发布业务语义：reason 以「未命中」开头 → 返 None → 交 legacy；
          全局问数（dataset_id is None）落 _handle_via_legacy_llm 的诚实兜底「未能找到口径」。
        """
        route = plan_result.get("route") or {}
        if route.get("route_type") != "blocked":
            return None
        reason = route.get("reason") or plan_result.get("reason")
        if not reason:
            return None
        reason_str = str(reason)
        if reason_str.startswith("未命中"):
            return None  # 未命中业务实体 → legacy 的"找不到口径"本就诚实
        if any(k in reason_str for k in ("runtime", "not_ready", "manifest", "运行清单", "未就绪")):
            content = "语义运行时尚未就绪，暂时无法回答；请稍后重试或联系管理员发布语义运行时。"
        else:
            content = f"该问题命中了语义资产，但被访问策略或运行时限制阻断：{reason_str}"
        return {"content": content, "reason": reason_str}

    def _handle_via_agent(self, command, conversation, user_message) -> Dict[str, Any] | None:
        """通过 DataChatChannel + AgentService 处理"""
        # 决策 2/5（08.1-02）：全局问数会话（dataset_id is None）不走 agent 第 2 层物理直表旁路。
        # 在建 adapter / 写 running AgentQueryLog 前短路，消除"建 adapter→抛错被吞→残留 running log"死路径；
        # 全局会话由 semantic 主链处理，未命中落统一诚实兜底。
        if conversation.dataset_id is None:
            return None
        import time
        from app.di.container import get_container
        from app.interfaces.channels.datachat_channel import DataChatChannel
        from app.application.agent.agent_factory import get_data_agent_service
        from app.domain.entities.agent_query_log import AgentQueryLog
        from app.extensions import db

        container = get_container()

        agent_service = get_data_agent_service(
            loop=container.agent_loop_service(),
            prompt_builder=container.prompt_builder(),
            tool_registry=container.tool_registry(),
        )
        if not agent_service:
            return None

        channel = DataChatChannel(
            conversation_repository=self.conversation_repository,
            message_repository=self.message_repository,
            dataset_repository=self.dataset_repository,
        )

        raw_input = {
            "conversation_id": command.conversation_id,
            "user_id": command.user_id,
            "content": command.content,
        }
        agent_request, schema_info, adapter = channel.to_agent_request(raw_input)

        # 创建查询日志
        log_entry = AgentQueryLog(
            channel="datachat",
            channel_ref=str(command.conversation_id),
            user_id=command.user_id,
            user_message=command.content,
            status="running",
        )
        db.session.add(log_entry)
        db.session.commit()

        t0 = time.monotonic()
        try:
            response = agent_service.run(
                agent_request,
                adapter=adapter,
                schema_info=schema_info,
            )

            duration = int((time.monotonic() - t0) * 1000)
            log_entry.mark_success(
                response=response.text,
                sql=response.sql,
                usage=response.usage,
                duration=duration,
                tool_trace=response.tool_trace_evidence(),
            )
            db.session.commit()

            result = channel.deliver_response(
                response,
                conversation_id=command.conversation_id,
                user_message=user_message,
            )
            return result
        except Exception as e:
            duration = int((time.monotonic() - t0) * 1000)
            log_entry.mark_error(str(e), duration=duration)
            db.session.commit()
            raise
        finally:
            if hasattr(adapter, 'close'):
                adapter.close()

    def _record_query_log(
        self,
        command,
        source: str,
        response: str | None = None,
        sql: str | None = None,
        status: str = 'success',
        duration: int | None = None,
    ) -> None:
        """补写 AgentQueryLog（semantic / legacy 路径），失败不阻断主流程。"""
        try:
            from app.domain.entities.agent_query_log import AgentQueryLog
            from app.extensions import db

            log_entry = AgentQueryLog(
                channel="datachat",
                channel_ref=str(command.conversation_id),
                user_id=command.user_id,
                user_message=command.content,
                status=status,
                llm_provider=source,
                agent_response=response,
                sql_executed=sql,
                duration_ms=duration,
            )
            db.session.add(log_entry)
            db.session.commit()
        except Exception as exc:
            logger.warning("agent_query_log write failed", source=source, error=str(exc))

    def _handle_via_legacy_llm(self, command, conversation, user_message) -> Dict[str, Any]:
        """三层回退终点（决策 2/5，08.1-02）：物理直表旁路已彻底删除。

        semantic 主链 / agent 第 2 层均未能作答时（dataset_id is None 全局会话或 dataset 有值会话），
        统一收敛到诚实兜底 _build_unanswerable_fallback（source='fallback'），不再退回直连 LLM 扫物理表产 SQL。
        本方法是 handle() 终点（-> Dict 非 Optional），两条路径（None / 有值）都必须显式 return，不能落空。
        """
        if conversation.dataset_id is None:
            # 全局问数会话无绑定数据集：未命中已发布语义资产 → 诚实兜底。
            return self._build_unanswerable_fallback(
                command, conversation, user_message, reason="未命中已发布语义资产"
            )
        # dataset 有值会话：物理直表旁路已删，主链未作答同样落统一诚实兜底（不扫物理表）。
        return self._build_unanswerable_fallback(
            command, conversation, user_message, reason="未命中已发布语义资产"
        )

    @staticmethod
    def _answerability_gap_message(plan_result) -> str | None:
        """分析型 Data Agent 层（8.4）：覆盖缺口（out_of_coverage）/ 库外（out_of_scope）→ 返回具体诚实告知文案；否则 None。

        L1（8.2）关闭时 business_intent.answerability 为 None → 返回 None，不改变兜底行为（零回归）。
        """
        answerability = ((plan_result or {}).get("business_intent") or {}).get("answerability") or {}
        if answerability.get("state") in ("out_of_coverage", "out_of_scope"):
            return answerability.get("message") or None
        return None

    def _build_unanswerable_fallback(
        self,
        command,
        conversation,
        user_message,
        *,
        reason: str | None = None,
        message: str | None = None,
    ) -> Dict[str, Any]:
        """统一诚实兜底（决策 5，08.1-02）：三类答不出（治理 deny / 未命中 / agent 软失败）统一收敛。

        落 Message(source='fallback')（to_dict()['via_semantic_layer'] is False，conversation.py:192），
        AgentQueryLog status='unanswerable'；不产 SQL、不碰物理表。
        message 非空时优先使用（分析型 Data Agent 层 8.4：覆盖缺口/库外的具体诚实告知文案）。
        """
        ai_content = message or (
            "未能在已发布的语义资产中找到可回答该问题的口径。"
            "请换种问法，或确认相关 Cube / 指标已发布到语义中心。"
        )
        ai_message = Message(
            conversation_id=command.conversation_id,
            role='assistant',
            content=ai_content,
            error=reason,
            source='fallback',
            created_at=utcnow(),
        )
        ai_message = self.message_repository.create(ai_message)
        conversation.updated_at = utcnow()
        self.conversation_repository.update(conversation)
        self._record_query_log(
            command,
            source='semantic_router',
            response=ai_content,
            sql=None,
            status='unanswerable',
        )
        return {
            'user_message': user_message.to_dict(),
            'ai_message': ai_message.to_dict(),
        }

    def _build_semantic_router_response(self, plan_result: Dict[str, Any]) -> str:
        route_type = (plan_result.get("route") or {}).get("route_type") or "unknown"
        execution_results = plan_result.get("execution_results") or []
        primary = execution_results[0] if execution_results else {}
        status = primary.get("status") or "unknown"
        traceability = primary.get("traceability") or {}
        business_metric = traceability.get("business_metric") or {}
        measure = traceability.get("analysis_measure") or {}
        if status == "blocked":
            return f"该问题已命中语义权限限制，当前无法执行。原因：{primary.get('reason') or '未授权'}。"
        if primary.get("target_type") == "sql":
            title = business_metric.get("title") or business_metric.get("name") or "业务指标"
            cube_name = measure.get("cube_name") or "分析实体"
            return f"已通过语义路由执行 `{title}` 查询，当前命中分析实体 `{cube_name}`。"
        if primary.get("target_type") == "retrieval":
            return "已通过语义路由完成业务口径检索，可继续追问明细解释。"
        if primary.get("target_type") == "tool":
            return "已通过语义路由执行只读工具链，结果已返回。"
        return f"已通过语义路由完成 `{route_type}` 路径执行。"

    @staticmethod
    def _extract_generated_sql(primary_result: Dict[str, Any]) -> str | None:
        if primary_result.get("target_type") != "sql":
            return None
        execution_request = primary_result.get("execution_request") or {}
        sql = execution_request.get("sql_query")
        return str(sql) if sql else None

    @staticmethod
    def _extract_query_result(primary_result: Dict[str, Any]) -> Dict[str, Any] | None:
        if primary_result.get("target_type") != "sql":
            return None
        result = primary_result.get("result")
        return result if isinstance(result, dict) else None
