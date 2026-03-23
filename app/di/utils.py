"""
依赖注入工具函数
"""
from flask import current_app
from app.di.container import Container, get_container


def get_app_container() -> Container:
    """
    获取应用容器实例
    
    优先从 Flask current_app 获取，否则使用全局容器
    
    Returns:
        Container 实例
    """
    try:
        # 在 Flask 应用上下文中
        return current_app.container
    except RuntimeError:
        # 不在 Flask 上下文中（如测试、RQ Worker）
        return get_container()
