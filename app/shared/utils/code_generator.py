"""
数据集编码生成工具
"""
from datetime import datetime
from typing import Optional
from app.shared.enums import DataSourceType


# 数据源类型前缀映射
SOURCE_TYPE_PREFIX = {
    DataSourceType.POSTGRESQL: 'pg',
    DataSourceType.MYSQL: 'mysql',
    DataSourceType.MAXCOMPUTE: 'mc',
    DataSourceType.CLICKHOUSE: 'ch',
    DataSourceType.HIVE: 'hive'
}


def generate_dataset_code(
    source_type: str, 
    physical_table: Optional[str], 
    add_timestamp: bool = False,
    fallback_name: Optional[str] = None
) -> str:
    """
    生成数据集编码
    
    生成规则：
    - 格式：{数据源类型前缀}_{表名}[_{timestamp}]
    - 表名从 physical_table 的最后一个点后提取
    - 默认追加毫秒时间戳后3位以避免冲突
    - 如果 add_timestamp=True，使用完整的 HHmmss 格式
    
    Args:
        source_type: 数据源类型（如 'postgresql'）
        physical_table: 物理表名（如 'db.schema.table' 或 'project.table'），可为 None
        add_timestamp: 是否使用完整时间戳格式
        fallback_name: 当 physical_table 为空时使用的备用名称
        
    Returns:
        生成的编码（如 'pg_table_123' 或 'pg_table_155823'）
        
    Examples:
        >>> generate_dataset_code('postgresql', 'exam_db.public.exams')
        'pg_exams_456'  # 默认追加毫秒后3位
        
        >>> generate_dataset_code('maxcompute', 'project.user_orders')
        'mc_user_orders_789'
        
        >>> generate_dataset_code('postgresql', 'db.schema.exams', add_timestamp=True)
        'pg_exams_155823'  # 完整时间戳
        
        >>> generate_dataset_code('postgresql', None, fallback_name='my_query')
        'pg_my_query_123'  # 虚拟表使用 fallback_name
    """
    # 1. 提取表名（最后一个点后的部分，转为小写）
    if physical_table:
        table_name = physical_table.split('.')[-1].lower()
    elif fallback_name:
        table_name = fallback_name.lower()
    else:
        # 无表名时使用时间戳作为名称
        table_name = 'dataset'
    
    # 2. 清理表名中的特殊字符，只保留字母、数字和下划线
    table_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in table_name)
    
    # 3. 获取数据源类型前缀
    prefix = SOURCE_TYPE_PREFIX.get(source_type, source_type[:4].lower())
    
    # 4. 生成基础编码
    code = f"{prefix}_{table_name}"
    
    # 5. 添加时间戳后缀（默认加毫秒后3位，冲突时用完整时间戳）
    now = datetime.now()
    if add_timestamp:
        # 完整时间戳格式：HHmmss
        timestamp = now.strftime('%H%M%S')
    else:
        # 默认使用毫秒后3位（基本避免冲突）
        timestamp = str(now.microsecond)[-3:]
    
    code = f"{code}_{timestamp}"
    
    # 6. 确保长度不超过100字符（数据库字段限制）
    if len(code) > 100:
        # 如果超长，截断表名部分但保留前缀和时间戳
        timestamp_len = 6 if add_timestamp else 3
        max_table_len = 100 - len(prefix) - timestamp_len - 2  # 2个下划线
        table_name = table_name[:max_table_len]
        code = f"{prefix}_{table_name}_{timestamp}"
    
    return code
