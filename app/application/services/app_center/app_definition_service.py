"""
应用定义服务

负责应用定义的查询和管理
"""
from typing import List, Optional, Dict, Any

from app.domain.entities import AppDefinition
from app.domain.app_center import ExecutorFactory
from app.infrastructure.repositories.app_definition_repository import AppDefinitionRepository


class AppDefinitionService:
    """应用定义服务"""
    
    def __init__(self, app_definition_repository: AppDefinitionRepository):
        """
        初始化
        
        Args:
            app_definition_repository: 应用定义仓储
        """
        self.app_definition_repository = app_definition_repository
    
    def get_all_apps(
        self, 
        category: Optional[str] = None,
        enabled_only: bool = True,
        include_stats: bool = False
    ) -> List[Dict[str, Any]]:
        """
        获取所有应用定义
        
        Args:
            category: 分类筛选
            enabled_only: 仅返回启用的应用
            include_stats: 是否包含统计信息
        
        Returns:
            应用定义列表
        """
        apps = self.app_definition_repository.find_all(
            category=category,
            enabled_only=enabled_only
        )
        return [app.to_dict(include_stats=include_stats) for app in apps]
    
    def get_app_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        """
        根据应用代码获取应用定义
        
        Args:
            code: 应用代码
        
        Returns:
            应用定义字典，不存在则返回 None
        """
        app = self.app_definition_repository.find_by_code(code)
        if not app:
            return None
        
        return app.to_dict(include_stats=True)
    
    def get_config_schema(self, code: str) -> Optional[Dict[str, Any]]:
        """
        获取应用的配置表单 JSON Schema
        
        Args:
            code: 应用代码
        
        Returns:
            JSON Schema，不存在则返回 None
        """
        app = self.app_definition_repository.find_by_code(code)
        if not app:
            return None
        
        # 优先返回数据库中的 config_schema
        if app.config_schema:
            return app.config_schema
        
        # 如果数据库中没有，尝试从执行器获取
        executor = ExecutorFactory.create(code)
        if executor:
            return executor.get_config_schema()
        
        return None
    
    def get_categories(self) -> List[Dict[str, Any]]:
        """
        获取所有应用分类及统计
        
        Returns:
            分类列表，包含分类名称和应用数量
        """
        result = self.app_definition_repository.get_categories_with_count()
        
        return [
            {
                'category': row.category,
                'app_count': row.app_count,
                'display_name': self._get_category_display_name(row.category)
            }
            for row in result
        ]
    
    def validate_app_config(
        self, 
        code: str, 
        config: Dict[str, Any]
    ) -> tuple[bool, List[str]]:
        """
        验证应用配置
        
        Args:
            code: 应用代码
            config: 配置参数
        
        Returns:
            (is_valid, errors): 是否有效和错误列表
        """
        # 1. 检查应用是否存在
        app = self.app_definition_repository.find_by_code(code)
        if not app:
            return False, [f"应用 {code} 不存在"]
        
        # 2. 检查应用是否启用
        if not app.enabled:
            return False, [f"应用 {code} 已禁用"]
        
        # 3. 使用执行器验证配置
        executor = ExecutorFactory.create(code)
        if not executor:
            return False, [f"未找到应用 {code} 的执行器"]
        
        validation_result = executor.validate_config(config)
        
        if not validation_result.is_valid:
            # 格式化错误信息
            errors = []
            for field, messages in validation_result.errors.items():
                for msg in messages:
                    errors.append(f"{field}: {msg}")
            return False, errors
        
        return True, []
    
    def _get_category_display_name(self, category: str) -> str:
        """获取分类显示名称"""
        names = {
            'bi_integration': 'BI 集成',
            'data_notification': '数据通知',
            'data_report': '数据报告',
            'data_alert': '数据告警'
        }
        return names.get(category, category)
