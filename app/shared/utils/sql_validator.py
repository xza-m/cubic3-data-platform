"""
SQL 校验工具
使用 sqlparse 提供标准的 SQL 语法校验
"""
import re
from typing import Tuple, List, Optional
import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import Keyword, DML

DEFAULT_QUERY_LIMIT = 100
MAX_QUERY_LIMIT = 50000


def validate_sql_query(sql: str) -> Tuple[bool, List[str]]:
    """
    使用 sqlparse 进行 SQL 校验
    
    支持的查询类型：
    - SELECT 查询
    - WITH (CTE) 查询
    
    安全限制：
    - 禁止 DDL 操作（DROP, CREATE, ALTER 等）
    - 禁止 DML 操作（DELETE, UPDATE, INSERT 等）
    
    Args:
        sql: SQL 查询语句
    
    Returns:
        (is_valid, errors): 校验结果和错误列表
    """
    errors = []
    
    # 1. 基础检查
    if not sql or not sql.strip():
        errors.append('SQL 查询不能为空')
        return False, errors
    
    # 2. 使用 sqlparse 解析 SQL
    try:
        parsed = sqlparse.parse(sql)
        parsed_statements = [
            stmt for stmt in parsed
            if stmt.token_first(skip_ws=True, skip_cm=True)
        ]
        if not parsed_statements:
            errors.append('无法解析 SQL 语句')
            return False, errors
        if len(parsed_statements) > 1:
            errors.append('仅支持单条 SQL 语句，不允许多语句执行')
            return False, errors
        
        stmt = parsed_statements[0]
        
        # 3. 获取第一个有效 token（跳过空白和注释）
        first_token = stmt.token_first(skip_ws=True, skip_cm=True)
        if not first_token:
            errors.append('SQL 语句为空（移除注释后）')
            return False, errors
        
        # 4. 检查是否为允许的查询类型
        token_value = first_token.value.upper().strip()
        
        # 支持 SELECT 和 WITH（CTE）
        if not (token_value.startswith('SELECT') or token_value.startswith('WITH')):
            errors.append(
                f'仅支持 SELECT 或 WITH (CTE) 查询，当前语句以 "{token_value[:20]}" 开头'
            )
        
        # 5. 检查危险关键字（DDL/DML）
        dangerous_keywords = [
            'DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE',
            'ALTER', 'CREATE', 'REPLACE', 'GRANT', 'REVOKE',
            'RENAME', 'MERGE'
        ]
        
        # 将整个 SQL 转为大写进行检查
        sql_upper = sql.upper()
        
        for keyword in dangerous_keywords:
            # 使用单词边界检查，避免误判（如 SELECT 中的 DELETE）
            if re.search(rf'\b{keyword}\b', sql_upper):
                # 额外检查：排除在字符串字面量中的关键字
                if _is_dangerous_keyword_usage(stmt, keyword):
                    errors.append(f'不允许使用 {keyword} 语句，仅支持只读查询')
        
        # 6. 检查括号匹配
        open_parens = sql.count('(')
        close_parens = sql.count(')')
        if open_parens != close_parens:
            errors.append(
                f'括号不匹配：{open_parens} 个左括号，{close_parens} 个右括号'
            )
        
    except Exception as e:
        errors.append(f'SQL 解析错误: {str(e)}')
        return False, errors
    
    return len(errors) == 0, errors


def _is_dangerous_keyword_usage(stmt: Statement, keyword: str) -> bool:
    """
    检查危险关键字是否真实使用（排除在字符串中的情况）
    
    Args:
        stmt: sqlparse 解析的语句对象
        keyword: 关键字
    
    Returns:
        True 如果关键字被真实使用，False 如果只是在字符串中
    """
    # 遍历所有 token，查找关键字
    for token in stmt.flatten():
        if token.ttype in (Keyword, DML, Keyword.DML, Keyword.DDL):
            if token.value.upper() == keyword:
                return True
    
    return False


def prepare_readonly_sql(sql: str, limit: Optional[int] = None) -> str:
    """
    预处理只读 SQL（校验 + 规范化 + 可选 LIMIT 注入）
    
    Args:
        sql: 原始 SQL
        limit: 可选限制行数，不传则不注入 LIMIT
    
    Returns:
        处理后的 SQL
    
    Raises:
        ValueError: SQL 非法或不满足只读约束
    """
    if not sql or not sql.strip():
        raise ValueError('SQL 查询不能为空')
    
    normalized_sql = sql.strip().rstrip(';').strip()
    
    is_valid, errors = validate_sql_query(normalized_sql)
    if not is_valid:
        raise ValueError('; '.join(errors))
    
    if limit is None:
        return normalized_sql
    
    normalized_limit = _normalize_limit(limit)
    if re.search(r'\blimit\b', normalized_sql, flags=re.IGNORECASE):
        return normalized_sql
    
    return f"{normalized_sql} LIMIT {normalized_limit}"


def _normalize_limit(limit: int) -> int:
    """规范化 LIMIT 参数，避免异常值造成资源压力"""
    if limit is None:
        return DEFAULT_QUERY_LIMIT
    
    try:
        limit_value = int(limit)
    except (ValueError, TypeError):
        return DEFAULT_QUERY_LIMIT
    
    if limit_value <= 0:
        return DEFAULT_QUERY_LIMIT
    
    return min(limit_value, MAX_QUERY_LIMIT)


def format_sql(sql: str, reindent: bool = True, keyword_case: str = 'upper') -> str:
    """
    格式化 SQL（可选功能）
    
    Args:
        sql: SQL 语句
        reindent: 是否重新缩进
        keyword_case: 关键字大小写 ('upper', 'lower', 'capitalize')
    
    Returns:
        格式化后的 SQL
    """
    try:
        formatted = sqlparse.format(
            sql,
            reindent=reindent,
            keyword_case=keyword_case,
            strip_comments=False
        )
        return formatted
    except Exception:
        # 格式化失败时返回原始 SQL
        return sql


def extract_table_names(sql: str) -> List[str]:
    """
    从 SQL 中提取表名（可选功能）
    
    Args:
        sql: SQL 语句
    
    Returns:
        表名列表
    """
    try:
        parsed = sqlparse.parse(sql)
        if not parsed:
            return []

        pattern = re.compile(
            r'\b(?:FROM|JOIN)\s+([`"]?[a-zA-Z_][a-zA-Z0-9_\.]*[`"]?)',
            flags=re.IGNORECASE,
        )
        tables = []
        for match in pattern.finditer(sql):
            table_name = match.group(1).strip('`"\'')
            if table_name:
                tables.append(table_name)

        return list(dict.fromkeys(tables))
    except Exception:
        return []
