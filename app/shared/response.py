"""
统一 API 响应格式

所有 API 端点应使用本模块的函数构造响应，确保格式一致：
    成功: {'code': 0, 'message': '...', 'data': ...}
    失败: {'code': -1, 'message': '...', 'details': ...}
"""
from flask import jsonify, g, has_request_context


def _get_trace_id():
    """获取请求追踪 ID（与请求上下文中的 request_id 对齐）"""
    if not has_request_context():
        return None
    return getattr(g, 'request_id', None) or getattr(g, 'trace_id', None)


def success(data=None, message='success', status=200):
    """
    构造成功响应

    Args:
        data: 返回的业务数据
        message: 成功消息
        status: HTTP 状态码，默认 200
    """
    payload = {
        'code': 0,
        'message': message,
        'data': data,
        'trace_id': _get_trace_id()
    }
    return jsonify(payload), status


def error(message='error', status=400, details=None):
    """
    构造错误响应

    Args:
        message: 错误消息
        status: HTTP 状态码，默认 400
        details: 可选的错误详情
    """
    payload = {
        'code': -1,
        'message': message,
        'trace_id': _get_trace_id()
    }
    if details is not None:
        payload['details'] = details
    return jsonify(payload), status


def created(data=None, message='created'):
    """构造 201 Created 响应"""
    return success(data=data, message=message, status=201)


def not_found(message='资源不存在'):
    """构造 404 响应"""
    return error(message=message, status=404)


def bad_request(message='请求参数错误', details=None):
    """构造 400 响应"""
    return error(message=message, status=400, details=details)


def server_error(message='服务器内部错误'):
    """构造 500 响应"""
    return error(message=message, status=500)
