"""
字段识别服务
基于启发式规则自动识别字段类型：分区字段、维度字段、度量字段、敏感字段
"""
import re
from typing import Dict, List, Any, Tuple


class FieldIdentifier:
    """字段智能识别器"""
    
    # 分区字段关键词（通常是时间相关）
    PARTITION_KEYWORDS = [
        'ds', 'dt', 'date', 'day', 'partition', 
        'year', 'month', 'week', 'hour',
        '分区', '日期'
    ]
    
    # 敏感字段关键词
    SENSITIVE_KEYWORDS = {
        'pii': ['mobile', 'phone', 'id_card', 'email', 'address', 'real_name', 
                'password', 'id_no', 'card_no', 'account',
                '手机', '电话', '身份证', '邮箱', '地址', '姓名', '密码', '账号'],
        'internal': ['salary', 'income', 'revenue', 'cost', 'profit',
                    '薪资', '工资', '收入', '成本', '利润'],
        'confidential': ['secret', 'token', 'key', 'credential',
                        '密钥', '凭证', '秘密']
    }
    
    # 度量字段后缀
    MEASURE_SUFFIXES = [
        '_amt', '_amount', '_cnt', '_count', '_sum', '_total', 
        '_num', '_number', '_price', '_rate', '_ratio', '_pct', '_percent',
        '_quantity', '_volume', '_value'
    ]
    
    # 度量字段关键词
    MEASURE_KEYWORDS = [
        'amount', 'count', 'sum', 'total', 'number', 'price', 'rate',
        'quantity', 'volume', 'value', 'score', 'weight',
        '金额', '数量', '总计', '次数', '价格', '比例', '得分', '权重'
    ]
    
    # 数值类型（可能是度量）
    NUMERIC_TYPES = [
        # 标准类型
        'bigint', 'int', 'integer', 'smallint', 'tinyint', 'mediumint',
        'float', 'double', 'decimal', 'numeric', 'money',
        'int64', 'int32', 'int16', 'int8',
        'float64', 'float32', 'number',
        # 变体类型（兼容不同数据库）
        'longlong', 'long', 'short', 'tiny',  # MySQL cursor 类型码
        'uint8', 'uint16', 'uint32', 'uint64',  # ClickHouse 无符号整数
        'real'  # PostgreSQL
    ]
    
    # 主外键字段模式（用于识别维度）
    DIMENSION_ID_PATTERNS = [
        'id',       # 包含 id 即可（user_id, id_user, userid）
        'key',      # 包含 key（user_key, key_user）
        'code',     # 包含 code（order_code, product_code）
    ]
    
    # 允许作为主外键的数据类型
    DIMENSION_ID_TYPES = [
        # 数值类型
        'bigint', 'int', 'integer', 'smallint', 'tinyint', 'mediumint',
        'int64', 'int32', 'int16', 'int8',
        'longlong', 'long', 'short', 'tiny',  # MySQL cursor 类型码
        'uint8', 'uint16', 'uint32', 'uint64',  # ClickHouse 无符号整数
        # 字符串类型
        'varchar', 'string', 'char', 'text'
    ]
    
    @classmethod
    def identify_field(cls, field_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        识别单个字段的类型和属性
        
        Args:
            field_info: {
                'name': str,           # 字段名
                'type': str,           # 数据类型
                'comment': str,        # 字段注释
                'is_partition': bool   # 是否为分区字段（从表结构获取）
            }
        
        Returns:
            {
                'field_name': str,
                'data_type': str,
                'business_type': str,         # dimension, measure, partition_key
                'sensitivity_level': str,     # public, internal, pii, confidential
                'mask_rule': str,             # 脱敏规则
                'is_partition': bool,
                'is_measure': bool,
                'is_sensitive': bool,
                'confidence_score': float,    # 识别置信度 0-1
                'matched_rules': List[str],   # 匹配的规则列表
                'display_name': str,          # 业务显示名（优先使用comment）
                'comment': str
            }
        """
        field_name = field_info.get('name', '').lower()
        data_type = field_info.get('type', '').lower()
        comment = field_info.get('comment', '')
        is_partition_from_schema = field_info.get('is_partition', False)
        
        result = {
            'field_name': field_info.get('name'),
            'data_type': field_info.get('type'),
            'comment': comment,
            'display_name': comment if comment else field_info.get('name'),
            'business_type': 'dimension',  # 默认为维度
            'sensitivity_level': 'public',
            'mask_rule': None,
            'confidence_score': 0.0,
            'matched_rules': [],
            # 布尔字段在方法最后从枚举值动态计算，这里先占位
            'is_partition': False,
            'is_measure': False,
            'is_sensitive': False,
        }
        
        # 1. 识别分区字段（最高优先级）
        if is_partition_from_schema:
            result['business_type'] = 'partition'
            result['confidence_score'] = 1.0
            result['matched_rules'].append('从表结构直接获取')
        else:
            # 基于名称判断
            for keyword in cls.PARTITION_KEYWORDS:
                if keyword in field_name:
                    result['business_type'] = 'partition'
                    result['confidence_score'] = 0.8
                    result['matched_rules'].append(f'字段名包含分区关键词: {keyword}')
                    break
        
        # 2. 识别敏感字段
        sensitivity_info = cls._identify_sensitivity(field_name, comment)
        if sensitivity_info['is_sensitive']:
            result['sensitivity_level'] = sensitivity_info['level']
            result['mask_rule'] = sensitivity_info['mask_rule']
            result['matched_rules'].extend(sensitivity_info['matched_rules'])
            # 敏感字段置信度加成
            result['confidence_score'] = max(result['confidence_score'], sensitivity_info['confidence'])
        
        # 3. 识别度量字段（如果不是分区字段）
        if result['business_type'] != 'partition':
            measure_info = cls._identify_measure(field_name, data_type, comment)
            if measure_info['is_measure']:
                result['business_type'] = 'metric'
                result['matched_rules'].extend(measure_info['matched_rules'])
                result['confidence_score'] = max(result['confidence_score'], measure_info['confidence'])
        
        # 4. 从枚举值动态计算布尔字段（确保一致性，避免冗余维护）
        result['is_partition'] = result['business_type'] == 'partition'
        result['is_measure'] = result['business_type'] == 'metric'
        result['is_sensitive'] = result['sensitivity_level'] != 'public'
        
        return result
    
    @classmethod
    def _identify_sensitivity(cls, field_name: str, comment: str) -> Dict[str, Any]:
        """
        识别敏感字段
        
        Returns:
            {
                'is_sensitive': bool,
                'level': str,  # public, internal, pii, confidential
                'mask_rule': str,
                'confidence': float,
                'matched_rules': List[str]
            }
        """
        result = {
            'is_sensitive': False,
            'level': 'public',
            'mask_rule': None,
            'confidence': 0.0,
            'matched_rules': []
        }
        
        text_to_check = (field_name + ' ' + (comment or '')).lower()
        
        # 检查PII级别
        for keyword in cls.SENSITIVE_KEYWORDS['pii']:
            if keyword in text_to_check:
                result['is_sensitive'] = True
                result['level'] = 'pii'
                result['confidence'] = 0.9
                result['matched_rules'].append(f'PII关键词匹配: {keyword}')
                
                # 根据字段类型推荐脱敏规则
                if any(k in text_to_check for k in ['mobile', 'phone', '手机', '电话']):
                    result['mask_rule'] = 'mobile'
                elif any(k in text_to_check for k in ['id_card', 'id_no', '身份证']):
                    result['mask_rule'] = 'id_card'
                elif any(k in text_to_check for k in ['email', '邮箱']):
                    result['mask_rule'] = 'email'
                elif any(k in text_to_check for k in ['name', '姓名']):
                    result['mask_rule'] = 'name'
                else:
                    result['mask_rule'] = 'full_mask'
                
                return result
        
        # 检查机密级别
        for keyword in cls.SENSITIVE_KEYWORDS['confidential']:
            if keyword in text_to_check:
                result['is_sensitive'] = True
                result['level'] = 'confidential'
                result['mask_rule'] = 'full_mask'
                result['confidence'] = 0.95
                result['matched_rules'].append(f'机密关键词匹配: {keyword}')
                return result
        
        # 检查内部级别
        for keyword in cls.SENSITIVE_KEYWORDS['internal']:
            if keyword in text_to_check:
                result['is_sensitive'] = True
                result['level'] = 'internal'
                result['mask_rule'] = 'amount'
                result['confidence'] = 0.8
                result['matched_rules'].append(f'内部关键词匹配: {keyword}')
                return result
        
        return result
    
    @classmethod
    def _identify_measure(cls, field_name: str, data_type: str, comment: str) -> Dict[str, Any]:
        """
        识别度量字段
        
        Returns:
            {
                'is_measure': bool,
                'confidence': float,
                'matched_rules': List[str]
            }
        """
        result = {
            'is_measure': False,
            'confidence': 0.0,
            'matched_rules': []
        }
        
        # 规则0：主外键字段排除（优先级最高）
        # 如果字段名包含 id/key/code 且数据类型符合，则不是度量字段
        for pattern in cls.DIMENSION_ID_PATTERNS:
            if pattern in field_name:
                # 检查数据类型是否符合主外键类型
                if any(id_type in data_type for id_type in cls.DIMENSION_ID_TYPES):
                    # 不是度量字段，直接返回
                    return result
        
        # 规则A：数值类型优先
        is_numeric = any(num_type in data_type for num_type in cls.NUMERIC_TYPES)
        
        if not is_numeric:
            return result  # 非数值类型不可能是度量
        
        # 规则B：字段名后缀特征
        for suffix in cls.MEASURE_SUFFIXES:
            if field_name.endswith(suffix):
                result['is_measure'] = True
                result['confidence'] = 0.9
                result['matched_rules'].append(f'字段名后缀匹配: {suffix}')
                return result
        
        # 规则C：字段名关键词
        text_to_check = (field_name + ' ' + (comment or '')).lower()
        for keyword in cls.MEASURE_KEYWORDS:
            if keyword in text_to_check:
                result['is_measure'] = True
                result['confidence'] = 0.7
                result['matched_rules'].append(f'度量关键词匹配: {keyword}')
                return result
        
        # 规则D：如果是数值类型但没有明确特征，保持默认维度
        # 注释理由：没有明确特征的数值字段应保持默认的 dimension（维度），而不是低置信度的度量
        # if is_numeric:
        #     result['is_measure'] = True
        #     result['confidence'] = 0.3
        #     result['matched_rules'].append('数值类型（低置信度）')
        
        return result
    
    @classmethod
    def identify_fields_batch(cls, fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        批量识别字段
        
        Args:
            fields: 字段信息列表
        
        Returns:
            识别结果列表
        """
        return [cls.identify_field(field) for field in fields]
    
    @classmethod
    def get_statistics(cls, identified_fields: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        获取字段识别统计信息
        
        Args:
            identified_fields: 已识别的字段列表
        
        Returns:
            统计信息
        """
        total = len(identified_fields)
        partition_count = sum(1 for f in identified_fields if f['business_type'] == 'partition')
        measure_count = sum(1 for f in identified_fields if f['business_type'] == 'metric')
        dimension_count = sum(1 for f in identified_fields if f['business_type'] == 'dimension')
        sensitive_count = sum(1 for f in identified_fields if f['is_sensitive'])
        
        # 按敏感级别统计
        sensitivity_stats = {}
        for field in identified_fields:
            if field['is_sensitive']:
                level = field['sensitivity_level']
                sensitivity_stats[level] = sensitivity_stats.get(level, 0) + 1
        
        return {
            'total_fields': total,
            'partition_fields': partition_count,
            'measure_fields': measure_count,
            'dimension_fields': dimension_count,
            'sensitive_fields': sensitive_count,
            'sensitivity_breakdown': sensitivity_stats,
            'avg_confidence': sum(f['confidence_score'] for f in identified_fields) / total if total > 0 else 0
        }
