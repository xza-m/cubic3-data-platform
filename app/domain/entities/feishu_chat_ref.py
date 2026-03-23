"""
飞书群聊引用实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from app.extensions import db


class FeishuChatRef(db.Model):
    __tablename__ = "feishu_chat_ref"

    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.String(128), unique=True, nullable=False)
    chat_name = db.Column(db.String(256))
    added_via = db.Column(db.String(32))  # event | sync
    active = db.Column(db.Boolean, default=True)
    last_seen_at = db.Column(db.DateTime, default=utcnow)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(
        db.DateTime, default=utcnow, onupdate=utcnow
    )
