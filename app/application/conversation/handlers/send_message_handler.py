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
        plan_result = self.semantic_router_service.execute_plan(
            question=command.content,
            viewer_roles=[],
        )
        execution_results = plan_result.get("execution_results") or []
        if not execution_results:
            return None

        primary_result = execution_results[0]
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

    def _handle_via_agent(self, command, conversation, user_message) -> Dict[str, Any] | None:
        """通过 DataChatChannel + AgentService 处理"""
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

    # legacy 回退路径回答的前置提示（Phase 5 可信标注）
    LEGACY_DISCLAIMER = "【未经语义层验证】本回答由直连 LLM 根据物理表结构生成，未经语义层口径校验，请谨慎采信。"

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
        """传统 LLM 调用（回退路径）——回答显式标注未经语义层验证"""
        dataset = self.dataset_repository.find_by_id(conversation.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {conversation.dataset_id}")

        fields = dataset.fields.all()
        schema = {
            'table_name': dataset.physical_table,
            'source_type': dataset.source.source_type if dataset.source else 'unknown',
            'fields': [
                {
                    'physical_name': f.physical_name,
                    'data_type': f.data_type,
                    'description': f.comment or ''
                }
                for f in fields
            ]
        }

        import time
        t0 = time.monotonic()
        try:
            logger.info("Calling legacy LLM to generate SQL", conversation_id=command.conversation_id)
            llm_result = self.llm_service.generate_sql(
                question=command.content,
                schema=schema
            )

            generated_sql = llm_result['sql']
            explanation = llm_result['explanation']
            visualization_config = llm_result.get('visualization_suggestion', {})

            query_result = self._execute_query(dataset, generated_sql)

            ai_content = f"{self.LEGACY_DISCLAIMER}\n\n{explanation or '已为您生成查询并执行。'}"
            ai_message = Message(
                conversation_id=command.conversation_id,
                role='assistant',
                content=ai_content,
                generated_sql=generated_sql,
                query_result=query_result,
                visualization_config=visualization_config,
                source='legacy_llm',
                created_at=utcnow()
            )
            ai_message = self.message_repository.create(ai_message)

            conversation.updated_at = utcnow()
            self.conversation_repository.update(conversation)

            self._record_query_log(
                command,
                source='legacy_llm',
                response=ai_content,
                sql=generated_sql,
                status='success',
                duration=int((time.monotonic() - t0) * 1000),
            )

            return {
                'user_message': user_message.to_dict(),
                'ai_message': ai_message.to_dict()
            }

        except Exception as e:
            logger.error(f"Failed to process message: {e}", conversation_id=command.conversation_id)
            error_message = Message(
                conversation_id=command.conversation_id,
                role='assistant',
                content="抱歉，处理您的问题时遇到了错误。",
                error=str(e),
                source='legacy_llm',
                created_at=utcnow()
            )
            error_message = self.message_repository.create(error_message)
            self._record_query_log(
                command,
                source='legacy_llm',
                response=str(e),
                status='error',
                duration=int((time.monotonic() - t0) * 1000),
            )
            return {
                'user_message': user_message.to_dict(),
                'ai_message': error_message.to_dict()
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

    def _execute_query(self, dataset, sql: str) -> Dict[str, Any]:
        """执行 SQL 查询（传统路径）"""
        from app.infrastructure.adapters.datasources.factory import AdapterFactory

        sql_upper = sql.strip().upper()
        if not sql_upper.startswith('SELECT'):
            raise ApplicationException("仅支持 SELECT 查询")
        if 'LIMIT' not in sql_upper:
            sql += ' LIMIT 1000'

        adapter = AdapterFactory.create_adapter(
            dataset.source.source_type,
            dataset.source.connection_config
        )

        try:
            result = adapter.execute_query(sql)
            return result
        finally:
            adapter.close()
