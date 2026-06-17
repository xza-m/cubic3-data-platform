"""
飞书信道适配器

处理飞书应用单聊（P2P）场景：
- 将飞书消息事件转换为 AgentRequest
- 将 AgentResponse 格式化为飞书卡片（小数据量）或 CSV 文件（大数据量）
- 管理"思考中"临时卡片和渐进式更新
"""
from __future__ import annotations

import csv
import io
import json
from typing import Any

from app.domain.agent.entities import AgentContext, AgentRequest, AgentResponse, AgentStep
from app.infrastructure.adapters.feishu.client import FeishuClient
from app.interfaces.channels.base_channel import ChannelAdapter
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

CSV_ROW_THRESHOLD = 20
MAX_CSV_BYTES = 25 * 1024 * 1024  # 25MB 安全余量（飞书 IM 文件上限 30MB）


class FeishuChannel(ChannelAdapter):
    """飞书应用单聊信道"""

    def __init__(self, feishu_client: FeishuClient):
        self._client = feishu_client

    def to_agent_request(self, raw_input: dict[str, Any]) -> AgentRequest:
        """
        从飞书 P2P 消息事件提取 AgentRequest

        Args:
            raw_input: 飞书 im.message.receive_v1 事件的 event 字段

        Returns:
            AgentRequest
        """
        message = raw_input.get("message", {})
        sender = raw_input.get("sender", {})

        content_raw = message.get("content", "{}")
        try:
            content_obj = json.loads(content_raw)
            text = content_obj.get("text", "").strip()
        except (json.JSONDecodeError, AttributeError):
            text = str(content_raw).strip()

        open_id = sender.get("sender_id", {}).get("open_id")
        tenant_key = sender.get("tenant_key") or raw_input.get("tenant_key")
        chat_id = message.get("chat_id")
        message_id = message.get("message_id")

        return AgentRequest(
            message=text,
            context=AgentContext(
                channel="feishu",
                user_id=open_id,
                open_id=open_id,
                chat_id=chat_id,
                message_id=message_id,
                tenant_key=tenant_key,
            ),
        )

    def deliver_response(self, response: AgentResponse, **kwargs: Any) -> Any:
        """
        将 AgentResponse 发送为飞书卡片或 CSV 文件

        - ≤20 行：飞书卡片 Markdown 表格
        - >20 行：导出 CSV 文件 + 摘要卡片

        kwargs:
            chat_id: P2P 会话 ID
            card_message_id: 待替换的临时卡片 message_id（可选）
            query_id: AgentQueryLog ID，用于反馈按钮关联
        """
        chat_id = kwargs.get("chat_id")
        card_message_id = kwargs.get("card_message_id")
        query_id = kwargs.get("query_id")

        if not chat_id:
            logger.error("deliver_response 缺少 chat_id")
            return

        row_count = len(response.data) if response.data else 0
        is_large = row_count > CSV_ROW_THRESHOLD and response.columns

        if is_large:
            self._deliver_csv(response, chat_id, card_message_id, query_id)
        else:
            card = self._build_result_card(response, query_id=query_id)
            if card_message_id:
                try:
                    self._client.update_message(card_message_id, card)
                    return
                except Exception as e:
                    logger.warning("更新卡片失败，回退为新发送", error=str(e))
            self._client.send_interactive_card(chat_id, card)

    def _deliver_csv(
        self,
        response: AgentResponse,
        chat_id: str,
        card_message_id: str | None,
        query_id: int | None,
    ) -> None:
        """大数据量：生成 CSV → 上传 → 发送文件 + 摘要卡片"""
        csv_bytes, actual_rows, truncated = self._generate_csv(
            response.columns, response.data
        )
        total_rows = len(response.data)

        try:
            file_key = self._client.upload_file_bytes(
                csv_bytes, "query_result.csv", file_type="stream"
            )
            self._client.send_file_message(chat_id, file_key, "query_result.csv")
        except Exception as e:
            logger.error("CSV 文件上传/发送失败", error=str(e))
            card = self._build_result_card(response, query_id=query_id)
            self._send_or_update_card(chat_id, card, card_message_id)
            return

        summary_card = self._build_csv_summary_card(
            response, total_rows, actual_rows, truncated, query_id
        )
        self._send_or_update_card(chat_id, summary_card, card_message_id)

    def _send_or_update_card(
        self, chat_id: str, card: dict, card_message_id: str | None
    ) -> None:
        if card_message_id:
            try:
                self._client.update_message(card_message_id, card)
                return
            except Exception as e:
                logger.warning("更新卡片失败，回退为新发送", error=str(e))
        self._client.send_interactive_card(chat_id, card)

    def send_thinking_card(self, chat_id: str) -> str:
        """
        发送"思考中"临时卡片

        Returns:
            message_id（用于后续更新/替换）
        """
        card = {
            "schema": "2.0",
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "🔍 CUBIC3"},
                "template": "blue",
            },
            "body": {
                "direction": "vertical",
                "elements": [
                    {"tag": "markdown", "content": "🔍 正在理解您的问题..."},
                ],
            },
        }
        return self._client.send_interactive_card(chat_id, card)

    def update_progress_card(self, message_id: str, step: AgentStep) -> None:
        """更新卡片进度（渐进式反馈）"""
        card = {
            "schema": "2.0",
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "🔍 CUBIC3"},
                "template": "blue",
            },
            "body": {
                "direction": "vertical",
                "elements": [
                    {"tag": "markdown", "content": step.summary},
                ],
            },
        }
        try:
            self._client.update_message(message_id, card)
        except Exception as e:
            logger.warning("更新进度卡片失败", message_id=message_id, error=str(e))

    def _build_result_card(
        self,
        response: AgentResponse,
        query_id: int | None = None,
    ) -> dict[str, Any]:
        """构建最终结果卡片（含折叠 SQL 和反馈按钮）— v2 格式"""
        elements: list[dict[str, Any]] = []

        elements.append({"tag": "markdown", "content": response.text})

        if response.data and response.columns:
            table_md = self._build_markdown_table(response.columns, response.data, max_rows=20)
            elements.append({"tag": "markdown", "content": table_md})

        if response.sql:
            elements.append({
                "tag": "collapsible_panel",
                "expanded": False,
                "header": {"title": {"tag": "plain_text", "content": "查看 SQL"}},
                "vertical_spacing": "8px",
                "background_color": "grey",
                "elements": [
                    {"tag": "markdown", "content": f"```sql\n{response.sql}\n```"},
                ],
            })

        if response.error:
            elements.append({"tag": "markdown", "content": f"⚠️ {response.error}"})

        if query_id:
            elements.append({"tag": "hr"})
            elements.append(self._build_feedback_buttons(query_id))

        return {
            "schema": "2.0",
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "📊 CUBIC3"},
                "template": "green" if not response.error else "red",
            },
            "body": {
                "direction": "vertical",
                "elements": elements,
            },
        }

    @staticmethod
    def _build_feedback_buttons(query_id: int) -> dict[str, Any]:
        """v2 兼容的反馈按钮组（用 column_set 替代 v1 action 容器）"""
        def _btn(emoji: str, feedback: str) -> dict[str, Any]:
            return {
                "tag": "column",
                "width": "auto",
                "elements": [{
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": emoji},
                    "type": "default",
                    "value": {"feedback": feedback, "query_id": str(query_id)},
                }],
            }

        return {
            "tag": "column_set",
            "flex_mode": "none",
            "horizontal_spacing": "default",
            "columns": [
                _btn("👍", "positive"),
                _btn("👎", "negative"),
            ],
        }

    @staticmethod
    def _build_markdown_table(columns: list[str], data: list[list[Any]], max_rows: int = 20) -> str:
        """构建 Markdown 表格（飞书卡片支持）"""
        if not columns or not data:
            return ""

        rows = data[:max_rows]
        header = "| " + " | ".join(str(c) for c in columns) + " |"
        separator = "| " + " | ".join("---" for _ in columns) + " |"
        body_lines = []
        for row in rows:
            cells = [str(v) if v is not None else "" for v in row]
            body_lines.append("| " + " | ".join(cells) + " |")

        table = "\n".join([header, separator] + body_lines)

        if len(data) > max_rows:
            table += f"\n\n*（共 {len(data)} 行，仅展示前 {max_rows} 行）*"

        return table

    @staticmethod
    def _generate_csv(
        columns: list[str], data: list[list[Any]]
    ) -> tuple[bytes, int, bool]:
        """
        生成 CSV 字节流，超过 MAX_CSV_BYTES 时自动截断。

        Returns:
            (csv_bytes, actual_row_count, was_truncated)
        """
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns)

        actual_rows = 0
        truncated = False

        for row in data:
            writer.writerow([v if v is not None else "" for v in row])
            actual_rows += 1
            if buf.tell() > MAX_CSV_BYTES:
                truncated = True
                break

        csv_bytes = buf.getvalue().encode("utf-8-sig")  # BOM 头兼容 Excel
        return csv_bytes, actual_rows, truncated

    def _build_csv_summary_card(
        self,
        response: AgentResponse,
        total_rows: int,
        actual_rows: int,
        truncated: bool,
        query_id: int | None,
    ) -> dict[str, Any]:
        """构建 CSV 文件发送后的摘要卡片 — v2 格式"""
        elements: list[dict[str, Any]] = []

        elements.append({"tag": "markdown", "content": response.text})

        summary = f"📎 已导出 CSV 文件（共 **{total_rows}** 行）"
        if truncated:
            summary += f"\n⚠️ 数据量超出文件大小限制，已截取前 **{actual_rows}** 行"
        elements.append({"tag": "markdown", "content": summary})

        if response.sql:
            elements.append({
                "tag": "collapsible_panel",
                "expanded": False,
                "header": {"title": {"tag": "plain_text", "content": "查看 SQL"}},
                "vertical_spacing": "8px",
                "background_color": "grey",
                "elements": [
                    {"tag": "markdown", "content": f"```sql\n{response.sql}\n```"},
                ],
            })

        if query_id:
            elements.append({"tag": "hr"})
            elements.append(self._build_feedback_buttons(query_id))

        return {
            "schema": "2.0",
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "📊 CUBIC3"},
                "template": "green",
            },
            "body": {
                "direction": "vertical",
                "elements": elements,
            },
        }
