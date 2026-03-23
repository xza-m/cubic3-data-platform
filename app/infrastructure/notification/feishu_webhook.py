"""飞书群机器人 Webhook 通知

通过自定义机器人 webhook 发送消息，无需 tenant_access_token。
适用于 Schema Drift、定时任务告警等场景。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import requests

from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class FeishuWebhookNotifier:

    def __init__(self, webhook_url: str, timeout: int = 10):
        self._url = webhook_url
        self._timeout = timeout

    @property
    def is_configured(self) -> bool:
        return bool(self._url)

    def send_text(self, text: str) -> bool:
        return self._post({"msg_type": "text", "content": {"text": text}})

    def send_card(self, card: Dict[str, Any]) -> bool:
        return self._post({"msg_type": "interactive", "card": card})

    def send_schema_drift_report(
        self,
        total_cubes: int,
        checked_cubes: int,
        skipped_cubes: List[str],
        drifts: List[Dict[str, Any]],
    ) -> bool:
        """发送 Schema Drift 检测报告卡片"""
        if not drifts:
            return True

        drift_count = len(drifts)
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

        cube_drifts: Dict[str, List[Dict[str, Any]]] = {}
        for d in drifts:
            cube_drifts.setdefault(d["cube"], []).append(d)

        kind_labels = {
            "missing_in_physical": "物理表缺失",
            "missing_in_cube": "Cube 未引用",
            "type_mismatch": "类型不匹配",
        }

        lines: List[str] = []
        for cube_name, items in list(cube_drifts.items())[:10]:
            lines.append(f"**{cube_name}** ({items[0].get('table', '')})")
            for item in items[:5]:
                kind = kind_labels.get(item["kind"], item["kind"])
                lines.append(f"  · {kind}: `{item['column']}` {item.get('detail', '')}"[:100])
            if len(items) > 5:
                lines.append(f"  · ...等 {len(items)} 项")

        summary = f"检查 {checked_cubes}/{total_cubes} 个 Cube，发现 **{drift_count}** 项偏移"
        if skipped_cubes:
            summary += f"，{len(skipped_cubes)} 个 Cube 跳过"

        card = {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {"tag": "plain_text", "content": "⚠️ Schema Drift 检测报告"},
                "template": "orange",
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": f"**检测时间**：{now_str}\n{summary}",
                    },
                },
                {"tag": "hr"},
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": "\n".join(lines),
                    },
                },
                {
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": "语义层 Schema 同步检测 · 请及时修正 Cube YAML 或数仓表结构",
                        }
                    ],
                },
            ],
        }

        return self.send_card(card)

    def _post(self, payload: Dict[str, Any]) -> bool:
        if not self.is_configured:
            logger.warning("feishu_webhook_not_configured")
            return False
        try:
            resp = requests.post(
                self._url, json=payload, timeout=self._timeout
            )
            data = resp.json()
            if data.get("code") != 0 and data.get("StatusCode") != 0:
                logger.error(
                    "feishu_webhook_error",
                    code=data.get("code"),
                    msg=data.get("msg"),
                )
                return False
            logger.info("feishu_webhook_sent")
            return True
        except Exception as e:
            logger.error("feishu_webhook_exception", error=str(e))
            return False
