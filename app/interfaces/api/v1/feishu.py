"""
飞书事件与群列表 API（新架构 v1）

支持：
- 群聊事件：bot 加入/移除群、群消息 → 群组 upsert/deactivate
- P2P 单聊：CUBIC3 智能问数（消息驱动，异步 RQ 任务）
- 卡片回调：反馈按钮点击处理
"""
import json as json_module
import logging
import threading
from flask import Blueprint, current_app, jsonify, request
from app.di.container import get_container
from app.shared.response import success, bad_request, not_found, error, server_error
from app.shared.utils.security import generate_trace_id
from app.interfaces.api.middleware.auth import require_auth

bp = Blueprint("feishu_api_v1", __name__, url_prefix="/api/v1/feishu")
logger = logging.getLogger(__name__)


def _get_chat_repository():
    """获取飞书群组仓储（用于事件回调的后台线程）"""
    return get_container().feishu_chat_repository()


@bp.post("/events")
def events():
    """飞书事件回调（无需认证，由飞书平台调用）"""
    trace_id = generate_trace_id()
    try:
        logger.info("Received request - Method: %s, Content-Type: %s, Data length: %s",
                    request.method, request.content_type, len(request.data) if request.data else 0)

        data = {}
        try:
            if request.is_json:
                data = request.get_json(silent=True) or {}
            elif request.data:
                import json
                raw_data = request.data.decode('utf-8')
                logger.info("Raw request data: %s", raw_data[:500])
                data = json.loads(raw_data)
        except Exception as parse_error:
            logger.error("Failed to parse request JSON: %s, Raw data: %s", parse_error,
                         request.data.decode('utf-8', errors='ignore')[:200] if request.data else "empty")
            # 飞书要求返回 200，否则会重试；使用统一 helper 但保持 200 状态
            return error(message='parse_error', status=200, details={"status": "ok"})

        logger.info("Parsed data keys: %s", list(data.keys()) if data else "empty")

        # challenge response（飞书验证回调 URL，必须返回原始 challenge 字段，不能包装）
        if "challenge" in data:
            challenge = data.get("challenge", "")
            if not isinstance(challenge, str):
                challenge = str(challenge)
            logger.info("Responding to challenge: %s", challenge)
            response = jsonify({"challenge": challenge})
            response.headers['Content-Type'] = 'application/json; charset=utf-8'
            return response

        import json as json_module
        logger.info("Received Feishu event (full data): %s", json_module.dumps(data, ensure_ascii=False, indent=2))

        verify_token = current_app.config.get("FEISHU_VERIFICATION_TOKEN", "")
        token_in_req = data.get("token") or data.get("header", {}).get("token")
        if verify_token and token_in_req and verify_token != token_in_req:
            logger.warning("Invalid verification token")
            return error(message='invalid token', status=401)

        event = data.get("event") or {}
        header_event_type = data.get("header", {}).get("event_type")
        event_type = (
            header_event_type or
            event.get("type") or
            data.get("event_type") or
            data.get("type")
        )
        logger.info(
            "Event type resolved: %s (raw.type=%s, header.event_type=%s, event.type=%s, data.event_type=%s)",
            event_type, data.get("type"), header_event_type, event.get("type"), data.get("event_type")
        )

        # DataAgent P2P 单聊分支
        if event_type == "im.message.receive_v1":
            message = event.get("message", {})
            chat_type = message.get("chat_type", "")
            if chat_type == "p2p":
                return _handle_p2p_agent(event, data)
            # 群聊消息继续走下方 upsert 逻辑

        # 提取 chat_id / chat_name
        chat_id = None
        chat_name = None

        if event.get("chat_id"):
            chat_id = event["chat_id"]
            chat_name = event.get("name") or event.get("chat_name")
        elif event.get("message") and event["message"].get("chat_id"):
            chat_id = event["message"]["chat_id"]
            chat_name = (
                event["message"].get("chat_name") or
                event.get("chat_name") or
                event.get("name") or
                data.get("chat_name")
            )
        elif data.get("chat_id"):
            chat_id = data["chat_id"]
            chat_name = data.get("chat_name") or data.get("name")

        if chat_id and not chat_name:
            fallback_chat_name = next(
                (
                    candidate for candidate in [
                        event.get("chat", {}).get("name"),
                        event.get("chat", {}).get("chat_name"),
                        event.get("chat", {}).get("i18n_names", {}).get("zh_cn"),
                        event.get("chat", {}).get("i18n_names", {}).get("en_us"),
                        event.get("message", {}).get("chat_name"),
                        event.get("chat_name"),
                        event.get("name"),
                        data.get("chat_name"),
                        data.get("name"),
                    ]
                    if candidate
                ),
                None,
            )
            if fallback_chat_name:
                chat_name = fallback_chat_name

        logger.info("Final extracted - Chat ID: %s, Chat Name: %s", chat_id, chat_name)

        if chat_id:
            if event_type == "im.chat.member.bot.deleted_v1":
                app_obj = current_app._get_current_object()

                def async_deactivate():
                    try:
                        with app_obj.app_context():
                            repo = _get_chat_repository()
                            existed = repo.deactivate(chat_id)
                            logger.info("Deactivate chat %s result: %s", chat_id, "found" if existed else "not_found")
                    except Exception as e:
                        logger.error("Failed to deactivate chat: %s, Error: %s", chat_id, e, exc_info=True)

                thread = threading.Thread(target=async_deactivate)
                thread.daemon = True
                thread.start()
            else:
                should_save = (
                    event_type in {"im.chat.member.bot.added_v1", "im.message.receive_v1"} or
                    (not event_type and chat_id)
                )
                if should_save:
                    logger.info("Processing chat_id: %s for event_type: %s", chat_id, event_type)
                    app_obj = current_app._get_current_object()

                    def async_upsert():
                        try:
                            with app_obj.app_context():
                                final_chat_name = chat_name
                                if not final_chat_name:
                                    try:
                                        from app.infrastructure.adapters.feishu.client import FeishuClient
                                        client = FeishuClient()
                                        chat_info = client.get_chat_info(chat_id)
                                        if chat_info:
                                            final_chat_name = chat_info.get("name")
                                    except Exception as api_error:
                                        logger.debug("Failed to fetch chat name from API: %s", api_error)
                                repo = _get_chat_repository()
                                repo.upsert(chat_id, final_chat_name, added_via="event")
                                logger.info("Successfully upserted chat: %s (name: %s)", chat_id, final_chat_name)
                        except Exception as e:
                            logger.error("Failed to upsert chat: %s, Error: %s", chat_id, e, exc_info=True)

                    thread = threading.Thread(target=async_upsert)
                    thread.daemon = True
                    thread.start()
                else:
                    logger.info("Skipping chat_id %s - event_type %s not in handled types", chat_id, event_type)
        else:
            logger.warning("No chat_id found in event. Event type: %s, Event keys: %s",
                           event_type, list(event.keys()) if event else "no event")

        return success(data={"status": "ok"})

    except Exception as e:
        logger.error("Error processing Feishu event: %s", e, exc_info=True)
        return server_error(message=str(e))


@bp.get("/chats")
@require_auth
def list_chats():
    """查询活跃群组列表"""
    container = get_container()
    handler = container.list_chats_handler()
    items = handler.handle(active_only=True)
    return success(data=items)


@bp.get("/chats/all")
@require_auth
def list_chats_all():
    """查询所有群组列表"""
    container = get_container()
    handler = container.list_chats_handler()
    items = handler.handle(active_only=False)
    return success(data=items)


@bp.patch("/chats/<chat_id>")
@require_auth
def update_chat(chat_id: str):
    """更新群组状态"""
    data = request.get_json(silent=True) or {}
    if "active" not in data:
        return bad_request('缺少 active 参数')
    
    container = get_container()
    handler = container.update_chat_handler()
    result = handler.handle(chat_id, active=bool(data["active"]))
    
    if not result:
        return not_found(f'群组不存在: {chat_id}')
    
    return success(data=result)


# ============================================================================
# CUBIC3 P2P 单聊处理
# ============================================================================

def _handle_p2p_agent(event: dict, full_data: dict):
    """
    处理 P2P 单聊消息 → CUBIC3

    立即返回 200，异步执行 Agent 任务。
    """
    sender = event.get("sender", {})
    open_id = sender.get("sender_id", {}).get("open_id", "")
    message = event.get("message", {})
    chat_id = message.get("chat_id", "")

    # 加载 CUBIC3 配置
    from app.application.agent.agent_factory import get_data_agent_config
    config = get_data_agent_config()
    if not config:
        logger.info("CUBIC3 未启用，忽略 P2P 消息")
        return success(data={"status": "ok"})

    # 授权校验
    allowed_users = config.get("allowed_user_ids", [])
    if allowed_users and open_id not in allowed_users:
        logger.info("用户不在 CUBIC3 白名单中: open_id=%s", open_id)
        return success(data={"status": "ok"})

    # 频率限制（每分钟 10 次）
    try:
        from app.shared.utils.rate_limiter import check_rate_limit
        redis_client = get_container().redis_client()
        allowed, info = check_rate_limit(
            redis_client,
            f"agent:rate:{open_id}",
            max_requests=10,
            window_seconds=60,
        )
        if not allowed:
            logger.info(
                "用户查询频率超限: open_id=%s, current=%s",
                open_id, info["current"],
            )
            from app.infrastructure.adapters.feishu.client import FeishuClient
            try:
                FeishuClient().send_text_message(
                    chat_id,
                    f"查询频率过高，请 {info['retry_after']} 秒后再试。",
                )
            except Exception:
                pass
            return success(data={"status": "ok"})
    except Exception as e:
        logger.warning("频率限制模块异常，默认放行: %s", e)

    # /reset 指令：清除对话上下文
    content_raw = message.get("content", "{}")
    try:
        import json as _json
        user_text = _json.loads(content_raw).get("text", "").strip()
    except Exception:
        user_text = ""
    if user_text in ("/reset", "重置对话"):
        try:
            from app.application.agent.services.conversation_memory import ConversationMemory
            memory = ConversationMemory(get_container().redis_client())
            memory.clear(chat_id)
            from app.infrastructure.adapters.feishu.client import FeishuClient
            FeishuClient().send_text_message(chat_id, "对话已重置，可以开始新的查询。")
        except Exception as e:
            logger.warning("重置对话失败: %s", e)
        return success(data={"status": "ok"})

    # 立即返回 200，后台线程处理
    app_obj = current_app._get_current_object()

    def async_agent_task():
        try:
            with app_obj.app_context():
                _run_feishu_agent(event, config)
        except Exception as e:
            logger.error("CUBIC3 P2P 处理异常: %s", e, exc_info=True)

    thread = threading.Thread(target=async_agent_task)
    thread.daemon = True
    thread.start()

    return success(data={"status": "ok"})


def _run_feishu_agent(event: dict, config: dict):
    """在后台线程中执行 CUBIC3"""
    import time
    from app.infrastructure.adapters.feishu.client import FeishuClient
    from app.interfaces.channels.feishu_channel import FeishuChannel
    from app.application.agent.agent_factory import get_data_agent_service
    from app.application.agent.services.conversation_memory import ConversationMemory
    from app.domain.entities.agent_query_log import AgentQueryLog
    from app.extensions import db

    container = get_container()
    feishu_client = FeishuClient()
    channel = FeishuChannel(feishu_client=feishu_client)

    agent_request = channel.to_agent_request(event)
    chat_id = agent_request.context.chat_id

    # 加载对话历史（Redis，30 分钟滑动窗口）
    memory = ConversationMemory(container.redis_client())
    history = memory.load(chat_id)
    if history:
        agent_request.history = history

    # 创建查询日志
    log_entry = AgentQueryLog(
        channel="feishu",
        channel_ref=chat_id,
        user_id=agent_request.context.open_id,
        user_message=agent_request.message,
        status="pending",
    )
    db.session.add(log_entry)
    db.session.commit()
    query_id = log_entry.id

    # 发送"思考中"卡片
    card_message_id = None
    if chat_id:
        try:
            card_message_id = channel.send_thinking_card(chat_id)
        except Exception as e:
            logger.warning("发送思考卡片失败: %s", e)

    # 创建 AgentService
    agent_service = get_data_agent_service(
        loop=container.agent_loop_service(),
        prompt_builder=container.prompt_builder(),
        tool_registry=container.tool_registry(),
    )
    if not agent_service:
        log_entry.mark_error("CUBIC3 智能问数尚未配置")
        db.session.commit()
        if chat_id:
            feishu_client.send_text_message(chat_id, "CUBIC3 智能问数尚未配置，请联系管理员。")
        return

    # 进度回调：更新飞书卡片
    def on_progress(step):
        if card_message_id:
            channel.update_progress_card(card_message_id, step)

    # 执行 Agent
    log_entry.mark_running()
    db.session.commit()
    t0 = time.monotonic()

    try:
        response = agent_service.run(agent_request, on_progress=on_progress)
        duration = int((time.monotonic() - t0) * 1000)
        log_entry.mark_success(
            response=response.text,
            sql=response.sql,
            usage=response.usage,
            duration=duration,
        )
        db.session.commit()

        # 存入对话记忆（user + assistant）
        memory.append(chat_id, [
            {"role": "user", "content": agent_request.message},
            {"role": "assistant", "content": response.text},
        ])
    except Exception as e:
        duration = int((time.monotonic() - t0) * 1000)
        log_entry.mark_error(str(e), duration=duration)
        db.session.commit()
        logger.error("CUBIC3 执行异常: %s", e, exc_info=True)
        if chat_id:
            feishu_client.send_text_message(chat_id, "抱歉，处理您的问题时遇到了错误。")
        return

    # 发送最终结果（含反馈按钮）
    if chat_id:
        channel.deliver_response(
            response,
            chat_id=chat_id,
            card_message_id=card_message_id,
            query_id=query_id,
        )


@bp.post("/card_action")
def card_action():
    """
    飞书卡片交互回调

    处理结果卡片上的反馈按钮点击（👍/❌）。
    飞书后台"卡片请求网址"需指向此端点。
    """
    data = request.get_json(silent=True) or {}

    action = data.get("action", {})
    action_value = action.get("value", {})
    feedback = action_value.get("feedback")
    query_id = action_value.get("query_id")

    if not feedback:
        return jsonify({"toast": {"type": "info", "content": "无效操作"}})

    logger.info("收到飞书反馈: feedback=%s, query_id=%s", feedback, query_id)

    # 写入 agent_query_log
    if query_id:
        try:
            from app.domain.entities.agent_query_log import AgentQueryLog
            from app.extensions import db
            log_entry = db.session.query(AgentQueryLog).filter_by(id=int(query_id)).first()
            if log_entry:
                log_entry.set_feedback(feedback)
                db.session.commit()
        except Exception as e:
            logger.warning("写入反馈失败: %s", e)

    toast_text = "感谢反馈！已记录。" if feedback == "positive" else "感谢反馈！我们会持续改进。"
    return jsonify({"toast": {"type": "success", "content": toast_text}})
