import time
import json
from typing import Optional
import requests
from flask import current_app


class FeishuClient:
    def __init__(self):
        self.timeout = current_app.config["FEISHU_TIMEOUT"]
        self.retry_max = current_app.config["FEISHU_RETRY_MAX"]
        self.backoff = current_app.config["FEISHU_RETRY_BACKOFF"]
        self.app_id = current_app.config.get("FEISHU_APP_ID") or ""
        self.app_secret = current_app.config.get("FEISHU_APP_SECRET") or ""
        self._tenant_token_value = None
        self._tenant_token_expire_at = 0

    def _post_with_retry(self, url: str, **kwargs):
        last_exc = None
        for attempt in range(self.retry_max):
            try:
                resp = requests.post(url, timeout=self.timeout, **kwargs)
                if resp.status_code == 200:
                    return resp
                if 400 <= resp.status_code < 500:
                    resp.raise_for_status()
            except Exception as exc:
                last_exc = exc
            time.sleep(self.backoff ** attempt)
        if last_exc:
            raise last_exc
        raise RuntimeError("Feishu request failed without exception detail")

    def _get_tenant_token(self) -> str:
        now = time.time()
        if self._tenant_token_value and now < self._tenant_token_expire_at - 60:
            return self._tenant_token_value
        url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
        resp = requests.post(
            url,
            json={"app_id": self.app_id, "app_secret": self.app_secret},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu token failed: {data}")
        self._tenant_token_value = data["tenant_access_token"]
        self._tenant_token_expire_at = now + data.get("expire", 7100)
        return self._tenant_token_value

    def get_bot_info(self) -> dict:
        token = self._get_tenant_token()
        url = "https://open.feishu.cn/open-apis/bot/v3/info"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu bot info failed: {data}")
        return data.get("bot", {})

    def get_chat_info(self, chat_id: str) -> Optional[dict]:
        """获取群信息（需要 im:chat:readonly 权限）"""
        try:
            token = self._get_tenant_token()
            url = f"https://open.feishu.cn/open-apis/im/v1/chats/{chat_id}"
            headers = {"Authorization": f"Bearer {token}"}
            resp = requests.get(url, headers=headers, timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") == 0:
                return data.get("data", {}).get("chat", {})
        except Exception as e:
            # 如果权限不足或失败，返回 None
            pass
        return None

    def upload_image(self, image_bytes: bytes) -> str:
        token = self._get_tenant_token()
        url = "https://open.feishu.cn/open-apis/im/v1/images"
        headers = {"Authorization": f"Bearer {token}"}
        files = {"image": ("dashboard.png", image_bytes)}
        data = {"image_type": "message"}
        resp = self._post_with_retry(url, headers=headers, files=files, data=data)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu upload failed: {data}")
        return data["data"]["image_key"]

    def upload_file(self, file_path: str, file_type: str = "stream") -> str:
        """
        上传本地文件到飞书
        
        Args:
            file_path: 本地文件路径
            file_type: 文件类型，默认为stream
        
        Returns:
            file_key: 飞书文件key
        """
        token = self._get_tenant_token()
        url = "https://open.feishu.cn/open-apis/im/v1/files"
        headers = {"Authorization": f"Bearer {token}"}
        
        with open(file_path, 'rb') as f:
            files = {
                'file': (file_path.split('/')[-1], f, 'application/octet-stream')
            }
            data = {
                'file_type': file_type
            }
            resp = self._post_with_retry(url, headers=headers, files=files, data=data)
        
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu file upload failed: {data}")
        
        return data["data"]["file_key"]

    def upload_file_bytes(self, file_bytes: bytes, file_name: str, file_type: str = "stream") -> str:
        """
        上传内存字节流到飞书（无需落盘临时文件）

        Args:
            file_bytes: 文件内容字节
            file_name: 文件名（含扩展名）
            file_type: 文件类型，默认为 stream

        Returns:
            file_key
        """
        token = self._get_tenant_token()
        url = "https://open.feishu.cn/open-apis/im/v1/files"
        headers = {"Authorization": f"Bearer {token}"}
        files = {
            'file': (file_name, file_bytes, 'application/octet-stream')
        }
        data = {'file_type': file_type}
        resp = self._post_with_retry(url, headers=headers, files=files, data=data)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu file upload failed: {data}")
        return data["data"]["file_key"]
    
    def send_file_message(self, chat_id: str, file_key: str, file_name: str = "数据文件"):
        """
        发送文件消息到飞书群
        
        Args:
            chat_id: 群组ID
            file_key: 文件key（通过upload_file获取）
            file_name: 文件名称
        """
        token = self._get_tenant_token()
        payload = {
            "receive_id": chat_id,
            "msg_type": "file",
            "content": json.dumps({
                "file_key": file_key
            }, ensure_ascii=False)
        }
        url = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu send file message failed: {data}")
    
    def send_text_message(self, chat_id: str, text: str):
        """
        发送文本消息到飞书群
        
        Args:
            chat_id: 群组ID
            text: 文本内容
        """
        token = self._get_tenant_token()
        payload = {
            "receive_id": chat_id,
            "msg_type": "text",
            "content": json.dumps({
                "text": text
            }, ensure_ascii=False)
        }
        url = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu send text message failed: {data}")
    
    def update_message(self, message_id: str, card: dict) -> None:
        """
        更新已发送的交互式卡片消息内容

        Args:
            message_id: 待更新的消息 ID
            card: 新的卡片对象
        """
        token = self._get_tenant_token()
        url = f"https://open.feishu.cn/open-apis/im/v1/messages/{message_id}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        }
        payload = {
            "msg_type": "interactive",
            "content": json.dumps(card, ensure_ascii=False),
        }
        resp = requests.patch(url, headers=headers, json=payload, timeout=self.timeout)
        if resp.status_code != 200:
            raise RuntimeError(f"Feishu update message failed: {resp.status_code} {resp.text}")
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu update message error: {data}")

    def send_interactive_card(self, chat_id: str, card: dict) -> str:
        """
        发送自定义交互式卡片消息
        
        Args:
            chat_id: 群组ID
            card: 完整的飞书卡片对象
        
        Returns:
            message_id: 消息ID
        """
        token = self._get_tenant_token()
        
        payload = {
            "receive_id": chat_id,
            "msg_type": "interactive",
            "content": json.dumps(card, ensure_ascii=False)
        }
        
        url = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu send interactive card failed: {data}")
        return data["data"]["message_id"]
    
    def send_card_message(self, chat_id: str, title: str = None, content: str = None, link: Optional[str] = None, card: dict = None):
        """
        发送卡片消息到飞书群
        
        Args:
            chat_id: 群组ID
            title: 卡片标题（如果提供card参数则忽略）
            content: 卡片内容（如果提供card参数则忽略）
            link: 可选的跳转链接（如果提供card参数则忽略）
            card: 完整的飞书卡片对象（可选，如果提供则直接使用）
        
        Returns:
            message_id: 消息ID
        """
        # 如果直接提供了 card 对象，使用 send_interactive_card
        if card:
            return self.send_interactive_card(chat_id, card)
        token = self._get_tenant_token()
        
        elements = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": content
                }
            }
        ]
        
        if link:
            elements.append({
                "tag": "action",
                "actions": [{
                    "tag": "button",
                    "text": {
                        "tag": "plain_text",
                        "content": "查看详情"
                    },
                    "type": "primary",
                    "url": link
                }]
            })
        
        card = {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": title
                },
                "template": "blue"
            },
            "elements": elements
        }
        
        payload = {
            "receive_id": chat_id,
            "msg_type": "interactive",
            "content": json.dumps(card, ensure_ascii=False)
        }
        
        url = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu send card message failed: {data}")
    
    def send_dashboard(
        self,
        chat_id: str,
        image_bytes: bytes,
        title: str,
        link: Optional[str],
        trace_id: Optional[str],
    ):
        image_key = self.upload_image(image_bytes)
        token = self._get_tenant_token()
        text_lines = [title]
        if trace_id:
            text_lines.append(f"trace_id: {trace_id}")
        if link:
            text_lines.append(f"查看详情: {link}")
        card = {
            "config": {"wide_screen_mode": True},
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(text_lines)}},
                {"tag": "img", "img_key": image_key, "alt": {"tag": "plain_text", "content": title}},
            ],
        }
        payload = {
            "receive_id": chat_id,
            "msg_type": "interactive",
            # 飞书要求 content 为 JSON 字符串；这里直接传 card 顶层（不再嵌套一层 card）
            "content": json.dumps(card, ensure_ascii=False),
        }
        url = "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id"
        headers = {"Authorization": f"Bearer {token}"}
        resp = self._post_with_retry(url, headers=headers, json=payload)
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Feishu send failed: {data}")
