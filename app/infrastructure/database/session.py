"""
数据库会话管理
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.declarative import declarative_base
from flask import current_app, g

# 创建 Base 类（用于领域实体）
Base = declarative_base()


def get_db_engine():
    """
    获取数据库引擎
    
    Returns:
        SQLAlchemy Engine 实例
    """
    if 'db_engine' not in g:
        database_url = current_app.config['SQLALCHEMY_DATABASE_URI']
        g.db_engine = create_engine(
            database_url,
            pool_size=10,
            max_overflow=20,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True,
            echo=current_app.config.get('SQLALCHEMY_ECHO', False)
        )
    
    return g.db_engine


def get_db_session():
    """
    获取数据库会话（用于写操作）
    
    Returns:
        SQLAlchemy Session 实例
    """
    if 'db_session' not in g:
        engine = get_db_engine()
        session_factory = sessionmaker(bind=engine)
        g.db_session = scoped_session(session_factory)
    
    return g.db_session()


def close_db_session(e=None):
    """
    关闭数据库会话
    
    Args:
        e: 异常对象（如果有）
    """
    session = g.pop('db_session', None)
    
    if session is not None:
        session.close()


def init_db_session(app):
    """
    初始化数据库会话管理
    
    Args:
        app: Flask 应用实例
    """
    app.teardown_appcontext(close_db_session)
