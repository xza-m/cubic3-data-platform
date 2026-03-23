"""
应用实例服务

负责应用实例的创建、更新、删除和查询
"""
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.domain.entities import AppInstance, AppDefinition
from app.domain.app_center import ExecutorFactory
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.infrastructure.repositories.app_definition_repository import AppDefinitionRepository
from app.shared.exceptions import ValidationError, NotFoundError, AuthorizationError


class AppInstanceService:
    """应用实例服务"""
    
    def __init__(
        self,
        app_instance_repository: AppInstanceRepository,
        app_definition_repository: AppDefinitionRepository,
        scheduler_service=None
    ):
        """
        初始化
        
        Args:
            app_instance_repository: 应用实例仓储
            app_definition_repository: 应用定义仓储
            scheduler_service: 调度服务（通过 DI 注入）
        """
        self.app_instance_repository = app_instance_repository
        self.app_definition_repository = app_definition_repository
        self.scheduler_service = scheduler_service
    
    def create_instance(
        self,
        app_code: str,
        name: str,
        config: Dict[str, Any],
        schedule_type: str,
        owner: str,
        description: Optional[str] = None,
        schedule_config: Optional[Dict[str, Any]] = None,
        enabled: bool = False
    ) -> Dict[str, Any]:
        """
        创建应用实例
        
        Args:
            app_code: 应用代码
            name: 实例名称
            config: 配置参数
            schedule_type: 调度类型（cron/event/manual）
            owner: 所有者
            description: 实例描述
            schedule_config: 调度配置
            enabled: 是否启用
        
        Returns:
            创建的实例信息
        
        Raises:
            NotFoundError: 应用不存在
            ValidationError: 配置验证失败
        """
        # 1. 检查应用是否存在
        app_def = self.app_definition_repository.find_by_code(app_code)
        if not app_def:
            raise NotFoundError(f"应用 {app_code} 不存在")
        
        # 2. 验证配置
        executor = ExecutorFactory.create(app_code)
        if executor:
            validation_result = executor.validate_config(config)
            if not validation_result.is_valid:
                raise ValidationError("配置验证失败", details={'errors': validation_result.errors})
        
        # 2.1 验证事件触发配置
        if schedule_type == 'event':
            trigger_config = config.get('trigger_on_event', {})
            if not trigger_config.get('enabled'):
                raise ValidationError("事件触发类型需要启用 trigger_on_event 配置")
            if not trigger_config.get('event_types'):
                raise ValidationError("事件触发配置需要指定 event_types")
        
        # 验证 trigger_on_event 配置格式（如果存在）
        trigger_on_event = config.get('trigger_on_event')
        if trigger_on_event:
            validation_errors = self._validate_trigger_on_event_config(trigger_on_event)
            if validation_errors:
                raise ValidationError("事件触发配置验证失败", details={'errors': validation_errors})
        
        # 3. 创建实例
        instance = AppInstance(
            app_code=app_code,
            name=name,
            description=description,
            config=config,
            schedule_type=schedule_type,
            schedule_config=schedule_config,
            owner=owner,
            enabled=enabled
        )
        
        instance = self.app_instance_repository.save(instance)
        
        # 4. 如果启用且为定时调度，注册调度任务
        if enabled and schedule_type == 'cron' and self.scheduler_service:
            self.scheduler_service.add_schedule(instance)
        
        return instance.to_dict(include_app_info=True)
    
    def update_instance(
        self,
        instance_id: int,
        user: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        schedule_type: Optional[str] = None,
        schedule_config: Optional[Dict[str, Any]] = None,
        roles: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        更新应用实例
        
        Args:
            instance_id: 实例 ID
            user: 当前用户
            name: 实例名称
            description: 实例描述
            config: 配置参数
            schedule_type: 调度类型
            schedule_config: 调度配置
        
        Returns:
            更新后的实例信息
        
        Raises:
            NotFoundError: 实例不存在
            AuthorizationError: 无权限
            ValidationError: 配置验证失败
        """
        # 1. 查询实例
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            raise NotFoundError(f"实例 {instance_id} 不存在")
        
        # 2. 检查权限
        if not instance.is_owned_by(user, roles=roles):
            raise AuthorizationError("无权限修改此实例")
        
        # 3. 更新字段
        if name is not None:
            instance.name = name
        if description is not None:
            instance.description = description
        
        # 4. 如果更新配置，先验证
        if config is not None:
            executor = ExecutorFactory.create(instance.app_code)
            if executor:
                validation_result = executor.validate_config(config)
                if not validation_result.is_valid:
                    raise ValidationError("配置验证失败", details={'errors': validation_result.errors})
            
            instance.update_config(config)
        
        # 5. 如果更新调度配置
        if schedule_type is not None or schedule_config is not None:
            new_schedule_type = schedule_type if schedule_type is not None else instance.schedule_type
            new_schedule_config = schedule_config if schedule_config is not None else instance.schedule_config
            
            instance.update_schedule(new_schedule_type, new_schedule_config)
            
            # 重新注册调度任务
            if instance.enabled and new_schedule_type == 'cron' and self.scheduler_service:
                self.scheduler_service.remove_schedule(instance.id)
                self.scheduler_service.add_schedule(instance)
        
        self.app_instance_repository.commit()
        
        return instance.to_dict(include_app_info=True)
    
    def delete_instance(self, instance_id: int, user: str, roles: Optional[List[str]] = None):
        """
        删除应用实例
        
        Args:
            instance_id: 实例 ID
            user: 当前用户
        
        Raises:
            NotFoundError: 实例不存在
            AuthorizationError: 无权限
        """
        # 1. 查询实例
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            raise NotFoundError(f"实例 {instance_id} 不存在")
        
        # 2. 检查权限
        if not instance.is_owned_by(user, roles=roles):
            raise AuthorizationError("无权限删除此实例")
        
        # 3. 取消调度任务
        if instance.schedule_type == 'cron' and self.scheduler_service:
            self.scheduler_service.remove_schedule(instance.id)
        
        # 4. 删除实例（执行记录会级联删除）
        self.app_instance_repository.delete(instance)
    
    def enable_instance(self, instance_id: int, user: str, roles: Optional[List[str]] = None) -> Dict[str, Any]:
        """启用应用实例"""
        instance = self._get_instance_with_permission(instance_id, user, roles=roles)
        
        instance.enable()
        
        # 注册调度任务
        if instance.schedule_type == 'cron' and self.scheduler_service:
            self.scheduler_service.add_schedule(instance)
        
        self.app_instance_repository.commit()
        
        return instance.to_dict(include_app_info=True)
    
    def disable_instance(self, instance_id: int, user: str, roles: Optional[List[str]] = None) -> Dict[str, Any]:
        """禁用应用实例"""
        instance = self._get_instance_with_permission(instance_id, user, roles=roles)
        
        instance.disable()
        
        # 取消调度任务
        if instance.schedule_type == 'cron' and self.scheduler_service:
            self.scheduler_service.remove_schedule(instance.id)
        
        self.app_instance_repository.commit()
        
        return instance.to_dict(include_app_info=True)
    
    def get_instance(self, instance_id: int, include_stats: bool = False) -> Optional[Dict[str, Any]]:
        """获取应用实例详情"""
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            return None
        
        return instance.to_dict(include_app_info=True, include_stats=include_stats)
    
    def list_instances(
        self,
        app_code: Optional[str] = None,
        owner: Optional[str] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        查询应用实例列表
        
        Args:
            app_code: 应用代码筛选
            owner: 所有者筛选
            enabled: 启用状态筛选
            page: 页码
            page_size: 每页大小
        
        Returns:
            分页结果
        """
        instances, total = self.app_instance_repository.find_all(
            app_code=app_code,
            owner=owner,
            enabled=enabled,
            page=page,
            page_size=page_size
        )
        
        return {
            'items': [inst.to_dict(include_app_info=True) for inst in instances],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size
        }
    
    def _get_instance_with_permission(self, instance_id: int, user: str, roles: Optional[List[str]] = None) -> AppInstance:
        """获取实例并检查权限"""
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            raise NotFoundError(f"实例 {instance_id} 不存在")
        
        if not instance.is_owned_by(user, roles=roles):
            raise AuthorizationError("无权限操作此实例")
        
        return instance
    
    def _validate_trigger_on_event_config(self, config: Dict[str, Any]) -> List[str]:
        """
        验证 trigger_on_event 配置
        
        Args:
            config: trigger_on_event 配置字典
        
        Returns:
            错误信息列表，空列表表示验证通过
        """
        errors = []
        
        # 验证 enabled
        if 'enabled' in config and not isinstance(config['enabled'], bool):
            errors.append("enabled 必须是布尔值")
        
        # 验证 event_types
        if 'event_types' in config:
            event_types = config['event_types']
            if not isinstance(event_types, list):
                errors.append("event_types 必须是数组")
            else:
                valid_types = [
                    'app.execution.started',
                    'app.execution.completed',
                    'app.execution.failed',
                    'extraction.completed',
                    'extraction.failed'
                ]
                for et in event_types:
                    if et not in valid_types:
                        errors.append(f"无效的事件类型: {et}")
        
        # 验证 conditions
        if 'conditions' in config:
            conditions = config['conditions']
            if not isinstance(conditions, dict):
                errors.append("conditions 必须是对象")
        
        # 验证 delay_seconds
        if 'delay_seconds' in config:
            delay = config['delay_seconds']
            if not isinstance(delay, int):
                errors.append("delay_seconds 必须是整数")
            elif delay < 0 or delay > 3600:
                errors.append("delay_seconds 必须在 0-3600 范围内")
        
        return errors
