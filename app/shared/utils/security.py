"""
安全工具
提供 SQL 防注入、输入验证等安全功能
"""
import re
from typing import Any, List


# SQL 危险关键字（用于防注入）
DANGEROUS_SQL_KEYWORDS = [
    'DROP', 'DELETE', 'TRUNCATE', 'UPDATE', 'INSERT',
    'EXEC', 'EXECUTE', 'SCRIPT', 'JAVASCRIPT', 'EVAL',
    'ALTER', 'CREATE', 'REPLACE', 'RENAME', 'GRANT', 'REVOKE'
]

# SQL 注释符号
DANGEROUS_SQL_PATTERNS = [
    r'--',           # SQL单行注释
    r'/\*',          # SQL多行注释开始
    r'\*/',          # SQL多行注释结束
    r';',            # SQL语句分隔符
    r'\bxp_\w+',     # SQL Server扩展存储过程
    r'\bsp_\w+',     # SQL Server系统存储过程
]


def escape_sql_value(value: Any) -> str:
    """
    转义 SQL 值，防止 SQL 注入
    
    Args:
        value: 要转义的值
    
    Returns:
        转义后的值（带引号）
    
    Raises:
        ValueError: 如果检测到SQL注入风险
    """
    if value is None:
        return "NULL"
    
    if isinstance(value, (int, float)):
        return str(value)
    
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    
    if isinstance(value, str):
        # 检查危险关键字
        for keyword in DANGEROUS_SQL_KEYWORDS:
            if re.search(rf'\b{keyword}\b', value, re.IGNORECASE):
                raise ValueError(f"Detected potential SQL injection: {keyword}")
        
        # 检查危险模式
        for pattern in DANGEROUS_SQL_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                raise ValueError(f"Detected potential SQL injection pattern: {pattern}")
        
        # 转义单引号
        escaped = value.replace("'", "''")
        
        return f"'{escaped}'"
    
    # 其他类型转换为字符串
    return f"'{str(value)}'"


def validate_identifier(identifier: str, allow_dot: bool = True) -> bool:
    """
    验证 SQL 标识符（表名、字段名）是否合法
    
    Args:
        identifier: 标识符字符串
        allow_dot: 是否允许点号（用于 schema.table 格式）
    
    Returns:
        是否合法
    """
    if not identifier:
        return False
    
    # 基本规则：字母、数字、下划线
    pattern = r'^[a-zA-Z_][a-zA-Z0-9_]*$'
    
    # 如果允许点号，支持 schema.table 格式
    if allow_dot:
        pattern = r'^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$'
    
    return bool(re.match(pattern, identifier))


def sanitize_table_name(table_name: str) -> str:
    """
    清理表名，移除潜在危险字符
    
    Args:
        table_name: 原始表名
    
    Returns:
        清理后的表名
    
    Raises:
        ValueError: 如果表名不合法
    """
    if not validate_identifier(table_name, allow_dot=True):
        raise ValueError(f"Invalid table name: {table_name}")
    
    return table_name


def sanitize_field_name(field_name: str) -> str:
    """
    清理字段名，移除潜在危险字符
    
    Args:
        field_name: 原始字段名
    
    Returns:
        清理后的字段名
    
    Raises:
        ValueError: 如果字段名不合法
    """
    if not validate_identifier(field_name, allow_dot=False):
        raise ValueError(f"Invalid field name: {field_name}")
    
    return field_name


def validate_operator(operator: str, allowed_operators: List[str]) -> bool:
    """
    验证操作符是否在白名单中
    
    Args:
        operator: 操作符
        allowed_operators: 允许的操作符列表
    
    Returns:
        是否合法
    """
    return operator in allowed_operators


def mask_sensitive_data(value: str, mask_type: str = 'mobile') -> str:
    """
    脱敏敏感数据
    
    Args:
        value: 原始值
        mask_type: 脱敏类型 (mobile, email, id_card, name)
    
    Returns:
        脱敏后的值
    """
    if not value:
        return value
    
    if mask_type == 'mobile':
        # 手机号：138****5678
        if len(value) >= 11:
            return f"{value[:3]}****{value[-4:]}"
    
    elif mask_type == 'email':
        # 邮箱：joh***@example.com
        if '@' in value:
            local, domain = value.split('@', 1)
            if len(local) > 3:
                return f"{local[:3]}***@{domain}"
            else:
                return f"{local[0]}***@{domain}"
    
    elif mask_type == 'id_card':
        # 身份证：110101********1234
        if len(value) >= 18:
            return f"{value[:6]}********{value[-4:]}"
    
    elif mask_type == 'name':
        # 姓名：张**
        if len(value) >= 2:
            return f"{value[0]}{'*' * (len(value) - 1)}"
    
    # 默认完全脱敏
    return '***'


def generate_trace_id() -> str:
    """
    生成追踪 ID（用于日志追踪）
    
    Returns:
        UUID 格式的追踪 ID
    """
    import uuid
    return str(uuid.uuid4())
