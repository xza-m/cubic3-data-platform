"""
数据库类型兼容层

提供在 PostgreSQL（JSONB/ARRAY）与 SQLite（JSON/TEXT）之间自动切换的类型装饰器，
使模型在测试环境（SQLite 内存库）中无需修改即可正常工作。
"""
import json
from sqlalchemy import JSON, String, Text
from sqlalchemy.types import TypeDecorator


class JsonType(TypeDecorator):
    """通用 JSON 类型：PostgreSQL 使用 JSONB，其他数据库使用 JSON。"""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            from sqlalchemy.dialects.postgresql import JSONB
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())


class ArrayOfString(TypeDecorator):
    """字符串数组类型：PostgreSQL 使用 ARRAY(String)，其他数据库用 JSON 模拟。

    在 SQLite 下，值以 JSON 数组字符串存储；读取时自动反序列化为 list。
    """

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            from sqlalchemy.dialects.postgresql import ARRAY
            return dialect.type_descriptor(ARRAY(String()))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if dialect.name == 'postgresql':
            return value
        if value is None:
            return '[]'
        return json.dumps(value, ensure_ascii=False)

    def process_result_value(self, value, dialect):
        if dialect.name == 'postgresql':
            return value
        if value is None:
            return []
        if isinstance(value, list):
            return value
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return []
