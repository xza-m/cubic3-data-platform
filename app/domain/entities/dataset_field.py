"""
数据集字段实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, Integer, ForeignKey, UniqueConstraint
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db
from app.shared.enums import FieldCategory, SensitivityLevel, MaskRule


class DatasetField(db.Model):
    """
    数据集字段实体
    
    职责：
    1. 存储字段元数据
    2. 管理敏感字段脱敏规则
    3. 提供字段级别的业务逻辑
    """
    __tablename__ = 'dataset_fields'
    __table_args__ = {'extend_existing': True}
    __table_args__ = (
        UniqueConstraint('dataset_id', 'physical_name', name='uk_dataset_field'),
    )
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    dataset_id = Column(BigInteger, ForeignKey('datasets.id', ondelete='CASCADE'))
    
    # 物理字段信息
    physical_name = Column(String(100), nullable=False)
    data_type = Column(String(50), nullable=False)
    is_nullable = Column(Boolean, default=True)
    default_value = Column(Text)
    comment = Column(Text)
    
    # 业务字段信息
    display_name = Column(String(100))
    business_type = Column(String(20), default=FieldCategory.DIMENSION.value)
    
    # 敏感度与脱敏
    sensitivity_level = Column(String(20), default=SensitivityLevel.PUBLIC.value)
    mask_rule = Column(String(50))
    
    # 字段特征
    field_tags = Column(JsonType, default={})
    sample_values = Column(JsonType, default=[])
    
    # 排序
    field_order = Column(Integer)
    
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    dataset = relationship('Dataset', back_populates='fields')
    
    # ========================================================================
    # 业务方法
    # ========================================================================
    
    def is_sensitive(self) -> bool:
        """
        判断是否为敏感字段
        
        Returns:
            是否敏感
        """
        return self.sensitivity_level in [
            SensitivityLevel.PII.value,
            SensitivityLevel.CONFIDENTIAL.value,
            SensitivityLevel.SECRET.value
        ]
    
    def is_partition_key(self) -> bool:
        """
        判断是否为分区键
        
        Returns:
            是否为分区键
        """
        return self.business_type == FieldCategory.PARTITION.value
    
    def is_measure(self) -> bool:
        """
        判断是否为度量字段
        
        Returns:
            是否为度量
        """
        return self.business_type == FieldCategory.METRIC.value
    
    def get_masked_select_expression(self) -> str:
        """
        获取脱敏后的 SELECT 表达式
        
        Returns:
            SQL 表达式字符串
        """
        if not self.is_sensitive() or not self.mask_rule:
            return self.physical_name
        
        # 根据脱敏规则生成 SQL 表达式
        mask_expressions = {
            MaskRule.MOBILE.value: f"REGEXP_REPLACE({self.physical_name}, '(\\d{{3}})\\d{{4}}(\\d{{4}})', '$1****$2')",
            MaskRule.EMAIL.value: f"REGEXP_REPLACE({self.physical_name}, '(\\w{{1,3}})\\w+(@.*)', '$1***$2')",
            MaskRule.ID_CARD.value: f"REGEXP_REPLACE({self.physical_name}, '(\\d{{6}})\\d{{8}}(\\d{{4}})', '$1********$2')",
            MaskRule.NAME.value: f"CONCAT(SUBSTR({self.physical_name}, 1, 1), '**')",
            MaskRule.AMOUNT.value: f"CASE WHEN {self.physical_name} > 0 THEN '***' ELSE NULL END",
            MaskRule.FULL_MASK.value: "'***'"
        }
        
        expression = mask_expressions.get(self.mask_rule, self.physical_name)
        return f"{expression} AS {self.physical_name}"
    
    def mark_as_sensitive(self, level: str, mask_rule: str = None):
        """
        标记为敏感字段
        
        Args:
            level: 敏感级别
            mask_rule: 脱敏规则（可选）
        """
        self.sensitivity_level = level
        if mask_rule:
            self.mask_rule = mask_rule
        self.updated_at = utcnow()
    
    def update_display_name(self, display_name: str):
        """
        更新显示名称
        
        Args:
            display_name: 显示名称
        """
        self.display_name = display_name
        self.updated_at = utcnow()
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'dataset_id': self.dataset_id,
            'physical_name': self.physical_name,
            'data_type': self.data_type,
            'is_nullable': self.is_nullable,
            'default_value': self.default_value,
            'comment': self.comment,
            'display_name': self.display_name,
            'business_type': self.business_type,
            'sensitivity_level': self.sensitivity_level,
            'mask_rule': self.mask_rule,
            'field_tags': self.field_tags,
            'sample_values': self.sample_values,
            'field_order': self.field_order,
            'is_sensitive': self.is_sensitive(),
            'is_partition_key': self.is_partition_key()
        }
    
    def __repr__(self):
        return f'<DatasetField {self.physical_name} ({self.business_type})>'
