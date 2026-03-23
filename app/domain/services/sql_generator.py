"""
SQL 生成领域服务
负责将查询条件转换为安全的 SQL 语句
"""
from typing import List, Dict, Any
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.shared.exceptions import SQLGenerationError, InvalidFieldsError
from app.shared.enums import FilterOperator, LogicOperator, DatasetType
from app.shared.utils.security import escape_sql_value, sanitize_field_name, sanitize_table_name


class SQLGeneratorService:
    """
    SQL 生成领域服务
    
    职责：
    1. 将过滤条件转换为 SQL WHERE 子句
    2. 应用字段脱敏规则
    3. 防止 SQL 注入
    4. 注入行级权限（如需要）
    """
    
    def generate_sql(
        self,
        dataset: Dataset,
        select_fields: List[str],
        filter_conditions: Dict[str, Any],
        limit: int = 10,
        apply_masking: bool = True
    ) -> str:
        """
        生成 SQL 查询语句
        
        Args:
            dataset: 数据集实体
            select_fields: 选择的字段列表（物理字段名）
            filter_conditions: 过滤条件 DSL
            limit: 行数限制
            apply_masking: 是否应用脱敏规则
        
        Returns:
            SQL 语句字符串
        
        Raises:
            SQLGenerationError: SQL 生成失败
            InvalidFieldsError: 字段无效
        """
        try:
            # 1. 验证字段
            self._validate_fields(select_fields, dataset)
            
            # 2. 构建 SELECT 子句
            select_clause = self._build_select_clause(
                select_fields, 
                dataset, 
                apply_masking
            )
            
            # 3. 构建 FROM 子句
            from_clause = self._build_from_clause(dataset)
            
            # 4. 构建 WHERE 子句
            # ⚠️ 对于虚拟数据集，不添加外层 WHERE（MaxCompute 限制）
            if dataset.dataset_type == DatasetType.VIRTUAL.value:
                # 虚拟数据集：外层不能有 WHERE（避免 WHERE + LIMIT 冲突）
                if filter_conditions and filter_conditions.get('filters'):
                    raise SQLGenerationError(
                        "虚拟数据集不支持外层过滤条件。"
                        "请在创建虚拟数据集时将所有过滤条件包含在 SQL 查询定义中。"
                    )
                where_clause = ""
            else:
                where_clause = self._build_where_clause(
                    filter_conditions,
                    dataset
                )
            
            # 5. 组装 SQL
            sql_parts = [f"SELECT {select_clause}", f"FROM {from_clause}"]
            
            if where_clause:
                sql_parts.append(f"WHERE {where_clause}")
            
            if limit and limit > 0:
                sql_parts.append(f"LIMIT {limit}")
            
            sql = "\n".join(sql_parts)
            
            return sql
            
        except Exception as e:
            raise SQLGenerationError(f"Failed to generate SQL: {str(e)}")
    
    def _validate_fields(self, select_fields: List[str], dataset: Dataset):
        """
        验证字段是否存在于数据集中
        
        Args:
            select_fields: 字段列表（空数组表示选择所有字段）
            dataset: 数据集实体
        
        Raises:
            InvalidFieldsError: 字段无效
        """
        # 空数组表示选择所有字段，不需要验证
        if not select_fields or len(select_fields) == 0:
            return
        
        valid_fields = {f.physical_name for f in dataset.fields.all()}
        invalid_fields = set(select_fields) - valid_fields
        
        if invalid_fields:
            raise InvalidFieldsError(list(invalid_fields))
    
    def _build_select_clause(
        self, 
        select_fields: List[str], 
        dataset: Dataset,
        apply_masking: bool
    ) -> str:
        """
        构建 SELECT 子句
        
        Args:
            select_fields: 字段列表
            dataset: 数据集
            apply_masking: 是否应用脱敏
        
        Returns:
            SELECT 子句字符串
        """
        if not select_fields:
            return "*"
        
        field_map = {f.physical_name: f for f in dataset.fields.all()}
        select_items = []
        
        for field_name in select_fields:
            field = field_map.get(field_name)
            
            if not field:
                continue
            
            # 应用脱敏规则
            if apply_masking and field.is_sensitive():
                select_items.append(field.get_masked_select_expression())
            else:
                select_items.append(sanitize_field_name(field.physical_name))
        
        return ", ".join(select_items)
    
    def _build_from_clause(self, dataset: Dataset) -> str:
        """
        构建 FROM 子句
        
        根据数据集类型：
        - PHYSICAL: 直接使用物理表名
        - VIRTUAL: 将 sql_query 封装为子查询
        - FILE: 使用物理表名（如果有）
        
        Args:
            dataset: 数据集
        
        Returns:
            FROM 子句字符串
        
        Raises:
            SQLGenerationError: 缺少必要的表名或 SQL 查询定义
        """
        if dataset.dataset_type == DatasetType.VIRTUAL.value:
            # 虚拟数据集：封装 SQL 查询为子查询
            if not dataset.sql_query:
                raise SQLGenerationError("虚拟数据集缺少 SQL 查询定义")
            
            # 清理 SQL：去除首尾空白和尾部分号
            cleaned_sql = dataset.sql_query.strip()
            if cleaned_sql.endswith(';'):
                cleaned_sql = cleaned_sql[:-1].rstrip()
            
            # 去除子查询中的 LIMIT 子句（外层会添加新的 LIMIT）
            cleaned_sql = self._remove_limit_clause(cleaned_sql)
            
            # 封装为子查询
            return f"(\n{cleaned_sql}\n) AS virtual_dataset"
        else:
            # 物理数据集或文件数据集：使用物理表名
            if not dataset.physical_table:
                raise SQLGenerationError(f"{dataset.dataset_type} 数据集缺少物理表名")
            return sanitize_table_name(dataset.physical_table)
    
    def _build_where_clause(
        self, 
        filter_conditions: Dict[str, Any],
        dataset: Dataset
    ) -> str:
        """
        构建 WHERE 子句
        
        Args:
            filter_conditions: {
                "logic": "AND" | "OR",
                "filters": [
                    {"field": "ds", "operator": "=", "value": "20231201"},
                    {"field": "city", "operator": "IN", "value": ["Beijing", "Shanghai"]}
                ],
                "groups": [...]  # 嵌套分组
            }
            dataset: 数据集
        
        Returns:
            WHERE 子句字符串
        """
        if not filter_conditions or not filter_conditions.get('filters'):
            return ""
        
        logic = filter_conditions.get('logic', LogicOperator.AND.value)
        filters = filter_conditions.get('filters', [])
        groups = filter_conditions.get('groups', [])
        
        conditions = []
        
        # 处理直接过滤条件
        for f in filters:
            field = f.get('field')
            operator = f.get('operator')
            value = f.get('value')
            
            if not field or not operator:
                continue
            
            condition = self._build_condition(field, operator, value, dataset)
            if condition:
                conditions.append(condition)
        
        # 处理分组条件（递归）
        for group in groups:
            group_clause = self._build_where_clause(group, dataset)
            if group_clause:
                conditions.append(f"({group_clause})")
        
        if not conditions:
            return ""
        
        return f" {logic} ".join(conditions)
    
    def _build_condition(
        self,
        field: str,
        operator: str,
        value: Any,
        dataset: Dataset
    ) -> str:
        """
        构建单个过滤条件
        
        Args:
            field: 字段名
            operator: 操作符
            value: 值
            dataset: 数据集
        
        Returns:
            条件字符串
        """
        # 验证字段
        field_name = sanitize_field_name(field)
        
        # 构建条件表达式
        if operator in ['=', '!=', '>', '<', '>=', '<=']:
            return f"{field_name} {operator} {escape_sql_value(value)}"
        
        elif operator == FilterOperator.IN.value:
            if not isinstance(value, list):
                value = [value]
            values_str = ", ".join([escape_sql_value(v) for v in value])
            return f"{field_name} IN ({values_str})"
        
        elif operator == FilterOperator.NOT_IN.value:
            if not isinstance(value, list):
                value = [value]
            values_str = ", ".join([escape_sql_value(v) for v in value])
            return f"{field_name} NOT IN ({values_str})"
        
        elif operator == FilterOperator.LIKE.value:
            return f"{field_name} LIKE {escape_sql_value(f'%{value}%')}"
        
        elif operator == FilterOperator.BETWEEN.value:
            if isinstance(value, list) and len(value) == 2:
                v1 = escape_sql_value(value[0])
                v2 = escape_sql_value(value[1])
                return f"{field_name} BETWEEN {v1} AND {v2}"
        
        elif operator == FilterOperator.IS_NULL.value:
            return f"{field_name} IS NULL"
        
        elif operator == FilterOperator.IS_NOT_NULL.value:
            return f"{field_name} IS NOT NULL"
        
        return ""
    
    def _remove_limit_clause(self, sql: str) -> str:
        """
        移除 SQL 尾部的 LIMIT 子句
        
        用于虚拟数据集：避免子查询中的 LIMIT 与外层 LIMIT 冲突
        
        处理情况：
        - LIMIT 100
        - LIMIT 100 OFFSET 10
        
        Args:
            sql: 原始 SQL 语句
        
        Returns:
            移除 LIMIT 后的 SQL
        """
        import re
        # 匹配行尾的 LIMIT 子句（大小写不敏感）
        # 模式：LIMIT 数字 [OFFSET 数字]（在行尾）
        pattern = r'\s+LIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$'
        cleaned = re.sub(pattern, '', sql, flags=re.IGNORECASE)
        return cleaned.rstrip()