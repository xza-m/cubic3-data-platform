"""
飞书长连接（WebSocket）事件接收器

通过 lark-oapi SDK 建立与飞书的 WebSocket 长连接，
直接接收 im.message.receive_v1 和 card.action.trigger 等事件，无需公网 webhook。

启动方式：在 Flask 应用启动时调用 start_feishu_ws(app)。
"""
from __future__ import annotations

import json
import logging
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask

logger = logging.getLogger(__name__)

_ws_client = None
_ws_lock = threading.Lock()


# ============================================================================
# 启动入口
# ============================================================================

def start_feishu_ws(app: Flask) -> None:
    """
    在后台线程启动飞书长连接客户端。

    该函数是幂等的——多次调用不会创建多个连接。
    """
    global _ws_client

    app_id = app.config.get("FEISHU_APP_ID", "")
    app_secret = app.config.get("FEISHU_APP_SECRET", "")

    if not app_id or not app_secret:
        logger.info("FEISHU_APP_ID / FEISHU_APP_SECRET 未配置，跳过飞书长连接")
        return

    with _ws_lock:
        if _ws_client is not None:
            logger.debug("飞书长连接已存在，跳过重复启动")
            return

        try:
            import lark_oapi as lark
            from lark_oapi.api.im.v1 import P2ImMessageReceiveV1
            from lark_oapi.event.callback.model.p2_card_action_trigger import (
                P2CardActionTrigger,
                P2CardActionTriggerResponse,
            )
        except ImportError:
            logger.warning("lark-oapi 未安装，无法启动飞书长连接。pip install lark-oapi")
            return

        # ---- P2P 消息回调 ----

        def _on_p2p_message(data: P2ImMessageReceiveV1):
            try:
                event_dict = _sdk_event_to_dict(data)
                message = event_dict.get("message", {})
                chat_type = message.get("chat_type", "")

                if chat_type != "p2p":
                    logger.debug("忽略非 P2P 消息: chat_type=%s", chat_type)
                    return

                logger.info(
                    "飞书长连接收到 P2P 消息: chat_id=%s, open_id=%s",
                    message.get("chat_id"),
                    event_dict.get("sender", {}).get("sender_id", {}).get("open_id"),
                )

                _process_agent_message(app, event_dict)
            except Exception:
                logger.error("飞书长连接消息处理异常", exc_info=True)

        # ---- 卡片交互回调 (card.action.trigger) ----

        def _on_card_action(data: P2CardActionTrigger) -> P2CardActionTriggerResponse:
            logger.info("长连接收到卡片交互回调")
            try:
                event = data.event
                if event is None:
                    return P2CardActionTriggerResponse({"toast": {"type": "info", "content": "无效操作"}})

                action = event.action
                value = action.value if action and action.value else {}
                feedback = value.get("feedback")
                query_id = value.get("query_id")

                logger.info("卡片反馈: feedback=%s, query_id=%s", feedback, query_id)

                if not feedback:
                    return P2CardActionTriggerResponse({"toast": {"type": "info", "content": "无效操作"}})

                if query_id:
                    try:
                        with app.app_context():
                            from app.domain.entities.agent_query_log import AgentQueryLog
                            from app.extensions import db
                            log_entry = db.session.query(AgentQueryLog).filter_by(id=int(query_id)).first()
                            if log_entry:
                                log_entry.set_feedback(feedback)
                                db.session.commit()
                    except Exception as e:
                        logger.warning("写入卡片反馈失败: %s", e)

                toast_text = "感谢反馈！已记录。" if feedback == "positive" else "感谢反馈！我们会持续改进。"
                return P2CardActionTriggerResponse({"toast": {"type": "success", "content": toast_text}})
            except Exception:
                logger.error("处理卡片回调异常", exc_info=True)
                return P2CardActionTriggerResponse({"toast": {"type": "error", "content": "处理失败"}})

        # ---- 构建 EventDispatcherHandler，同时注册消息和卡片回调 ----

        event_handler = (
            lark.EventDispatcherHandler
            .builder("", "")
            .register_p2_im_message_receive_v1(_on_p2p_message)
            .register_p2_card_action_trigger(_on_card_action)
            .build()
        )

        cli = lark.ws.Client(
            app_id,
            app_secret,
            event_handler=event_handler,
            log_level=lark.LogLevel.DEBUG,
        )

        def _run():
            logger.info("飞书长连接启动中... app_id=%s", app_id)
            try:
                cli.start()
            except Exception:
                logger.error("飞书长连接启动失败", exc_info=True)

        t = threading.Thread(target=_run, name="feishu-ws", daemon=True)
        t.start()
        _ws_client = cli
        logger.info("飞书长连接线程已启动（含卡片回调支持）")


# ============================================================================
# 辅助函数
# ============================================================================

def _sdk_event_to_dict(data) -> dict:
    """
    将 lark-oapi P2ImMessageReceiveV1 事件对象转换为
    与 webhook 回调相同格式的 dict，以便复用 _run_feishu_agent。
    """
    try:
        import lark_oapi as lark
        raw = lark.JSON.marshal(data)
        full = json.loads(raw) if isinstance(raw, str) else raw
        return full.get("event", full)
    except Exception:
        logger.warning("SDK event 序列化失败，尝试手动提取", exc_info=True)

    event = data.event if hasattr(data, "event") else data
    result = {}

    if hasattr(event, "sender") and event.sender:
        sender = event.sender
        sender_id = {}
        if hasattr(sender, "sender_id") and sender.sender_id:
            sid = sender.sender_id
            sender_id = {
                "open_id": getattr(sid, "open_id", ""),
                "user_id": getattr(sid, "user_id", ""),
                "union_id": getattr(sid, "union_id", ""),
            }
        result["sender"] = {
            "sender_id": sender_id,
            "sender_type": getattr(sender, "sender_type", "user"),
        }

    if hasattr(event, "message") and event.message:
        msg = event.message
        result["message"] = {
            "message_id": getattr(msg, "message_id", ""),
            "chat_id": getattr(msg, "chat_id", ""),
            "chat_type": getattr(msg, "chat_type", ""),
            "message_type": getattr(msg, "message_type", ""),
            "content": getattr(msg, "content", "{}"),
        }

    return result


def _process_agent_message(app: Flask, event_dict: dict) -> None:
    """
    在后台线程中处理 Agent 消息（复用 feishu.py 中的 _run_feishu_agent）。

    SDK 回调须 3 秒内返回，因此使用 threading 异步处理。
    """

    def _worker():
        try:
            with app.app_context():
                from app.application.agent.agent_factory import get_data_agent_config
                from app.interfaces.api.v1.feishu import _run_feishu_agent

                config = get_data_agent_config()
                if not config:
                    logger.info("DataAgent 未启用，忽略长连接 P2P 消息")
                    return

                sender = event_dict.get("sender", {})
                open_id = sender.get("sender_id", {}).get("open_id", "")

                allowed_users = config.get("allowed_user_ids", [])
                if allowed_users and open_id not in allowed_users:
                    logger.info("用户不在 DataAgent 白名单: open_id=%s", open_id)
                    return

                _run_feishu_agent(event_dict, config)
        except Exception:
            logger.error("长连接 Agent 任务异常", exc_info=True)

    t = threading.Thread(target=_worker, name="feishu-ws-agent", daemon=True)
    t.start()
