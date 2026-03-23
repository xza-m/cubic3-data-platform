"""
应用定义实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List, Dict, Any
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db


class AppDefinition(db.Model):
    """
    应用定义实体
    
    职责：
    1. 管理应用类型和元数据
    2. 提供配置模板（JSON Schema）
    3. 统计应用使用情况
    """
    __tablename__ = 'app_definitions'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)  # 应用唯一标识
    name = Column(String(100), nullable=False)  # 应用名称
    category = Column(String(50), nullable=False)  # 分类
    description = Column(Text)  # 应用描述
    config_schema = Column(JsonType)  # JSON Schema（用于生成表单）
    icon = Column(String(50))  # 图标名称
    author = Column(String(100))  # 作者
    version = Column(String(20))  # 版本号
    enabled = Column(Boolean, default=True)  # 是否启用
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    instances = relationship('AppInstance', back_populates='app_definition', lazy='dynamic')
    
    # ========================================================================
    # 领域事件方法
    # ========================================================================
    
    def collect_domain_events(self) -> List:
        """收集领域事件"""
        events = self._domain_events
        self._domain_events = []
        return events
    
    # ========================================================================
    # 业务逻辑方法
    # ========================================================================
    
    def get_instance_count(self) -> int:
        """获取实例数量"""
        return self.instances.count()
    
    def get_active_instance_count(self) -> int:
        """获取启用的实例数量"""
        return self.instances.filter_by(enabled=True).count()
    
    def get_total_execution_count(self) -> int:
        """获取总执行次数"""
        from app.domain.entities.app_execution import AppExecution
        from app.domain.entities.app_instance import AppInstance
        return db.session.query(AppExecution).join(
            AppInstance, AppExecution.instance_id == AppInstance.id
        ).filter(AppInstance.app_code == self.code).count()
    
    def validate_config(self, config: Dict[str, Any]) -> tuple[bool, List[str]]:
        """
        验证配置是否符合 JSON Schema
        
        Args:
            config: 配置参数
        
        Returns:
            (is_valid, errors): 是否有效和错误列表
        """
        # TODO: 使用 jsonschema 库进行验证
        # 这里简化处理，仅检查必填字段
        if not self.config_schema:
            return True, []
        
        errors = []
        required_fields = self.config_schema.get('required', [])
        
        for field in required_fields:
            if field not in config:
                errors.append(f"缺少必填字段: {field}")
        
        return len(errors) == 0, errors
    
    def is_available(self) -> bool:
        """应用是否可用"""
        return self.enabled
    
    # ========================================================================
    # 辅助方法
    # ========================================================================
    
    def to_dict(self, include_stats: bool = False) -> Dict[str, Any]:
        """
        转换为字典
        
        Args:
            include_stats: 是否包含统计信息
        """
        result = {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'category': self.category,
            'description': self.description,
            'config_schema': self.config_schema,
            'icon': self.icon,
            'author': self.author,
            'version': self.version,
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_stats:
            # 将统计数据直接放在顶层（前端期望的格式）
            result['instance_count'] = self.get_instance_count()
            result['active_instance_count'] = self.get_active_instance_count()
            result['total_execution_count'] = self.get_total_execution_count()
        else:
            # 如果不包含统计，设置为 None
            result['instance_count'] = None
            result['active_instance_count'] = None
            result['total_execution_count'] = None
        
        return result
    
    def __repr__(self):
        return f'<AppDefinition {self.code}>'
