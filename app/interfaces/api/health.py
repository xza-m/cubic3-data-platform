"""
健康检查 API
"""
from flask import Blueprint

from app.shared.response import success

bp = Blueprint("health", __name__)


@bp.get("")
def health():
    return success(data={"status": "ok"}, message="healthy")
