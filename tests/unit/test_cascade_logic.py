"""
级联逻辑单元测试

测试事件级联的条件匹配、循环检测等核心逻辑
"""
import pytest
from app.infrastructure.events.handlers.app_handler import (
    _match_event_type,
    _check_conditions,
    _check_cascade_loop
)


class TestEventTypeMatching:
    """事件类型匹配测试"""
    
    def test_match_single_event_type(self):
        """测试单个事件类型匹配"""
        assert _match_event_type(
            "app.execution.completed",
            ["app.execution.completed"]
        ) == True
    
    def test_match_multiple_event_types(self):
        """测试多个事件类型匹配"""
        assert _match_event_type(
            "app.execution.completed",
            ["app.execution.started", "app.execution.completed", "app.execution.failed"]
        ) == True
    
    def test_no_match_event_type(self):
        """测试事件类型不匹配"""
        assert _match_event_type(
            "app.execution.completed",
            ["app.execution.started", "app.execution.failed"]
        ) == False
    
    def test_empty_allowed_types(self):
        """测试空的允许类型列表"""
        assert _match_event_type(
            "app.execution.completed",
            []
        ) == False


class TestConditionMatching:
    """条件匹配测试"""
    
    def test_match_single_condition(self):
        """测试单个条件匹配"""
        event_dict = {
            "data": {
                "app_code": "bi_dashboard_push",
                "instance_id": 123
            }
        }
        
        conditions = {"app_code": "bi_dashboard_push"}
        assert _check_conditions(event_dict, conditions) == True
    
    def test_match_multiple_conditions(self):
        """测试多个条件匹配（AND关系）"""
        event_dict = {
            "data": {
                "app_code": "bi_dashboard_push",
                "instance_id": 123,
                "trigger_type": "manual"
            }
        }
        
        conditions = {
            "app_code": "bi_dashboard_push",
            "instance_id": 123
        }
        assert _check_conditions(event_dict, conditions) == True
    
    def test_no_match_condition(self):
        """测试条件不匹配"""
        event_dict = {
            "data": {
                "app_code": "bi_dashboard_push",
                "instance_id": 123
            }
        }
        
        conditions = {"app_code": "dataset_card_push"}
        assert _check_conditions(event_dict, conditions) == False
    
    def test_partial_match_fails(self):
        """测试部分匹配应该失败"""
        event_dict = {
            "data": {
                "app_code": "bi_dashboard_push",
                "instance_id": 123
            }
        }
        
        conditions = {
            "app_code": "bi_dashboard_push",
            "instance_id": 999  # 不匹配
        }
        assert _check_conditions(event_dict, conditions) == False
    
    def test_empty_conditions_match(self):
        """测试空条件应该匹配"""
        event_dict = {"data": {"app_code": "test"}}
        assert _check_conditions(event_dict, {}) == True
    
    def test_missing_field_no_match(self):
        """测试缺失字段不匹配"""
        event_dict = {"data": {"app_code": "test"}}
        conditions = {"instance_id": 123}
        assert _check_conditions(event_dict, conditions) == False


class TestCascadeLoopDetection:
    """循环检测测试"""
    
    def test_no_loop_empty_chain(self):
        """测试空调用链无循环"""
        event_dict = {"metadata": {}}
        assert _check_cascade_loop(1, event_dict) == False
    
    def test_no_loop_different_instance(self):
        """测试不同实例且深度未超限时无循环（chain 长度 < max_depth=3）"""
        event_dict = {
            "metadata": {
                "cascade_chain": [2]  # 长度 1 < max_depth 3，且 1 不在链中
            }
        }
        assert _check_cascade_loop(1, event_dict) == False
    
    def test_direct_loop_detected(self):
        """测试检测到直接循环"""
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2, 3]
            }
        }
        assert _check_cascade_loop(1, event_dict) == True
    
    def test_loop_in_middle_of_chain(self):
        """测试检测到调用链中间的循环"""
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2, 3]
            }
        }
        assert _check_cascade_loop(2, event_dict) == True
    
    def test_depth_limit_default(self):
        """测试默认深度限制（3层）"""
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2, 3]  # 已经3层
            }
        }
        # 第4层应该被阻止
        assert _check_cascade_loop(4, event_dict, max_depth=3) == True
    
    def test_depth_limit_custom(self):
        """测试自定义深度限制"""
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2]  # 2层
            }
        }
        # 第3层，限制为2层，应该被阻止
        assert _check_cascade_loop(3, event_dict, max_depth=2) == True
    
    def test_depth_within_limit(self):
        """测试深度在限制内"""
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2]  # 2层
            }
        }
        # 第3层，限制为3层，应该允许
        assert _check_cascade_loop(3, event_dict, max_depth=3) == False


class TestCascadeIntegration:
    """级联逻辑集成测试"""
    
    def test_cascade_scenario_success(self):
        """测试成功的级联场景"""
        # 应用A完成 → 触发应用B
        event_dict = {
            "event_type": "app.execution.completed",
            "data": {
                "instance_id": 1,
                "app_code": "bi_dashboard_push"
            },
            "metadata": {
                "cascade_chain": [1]
            }
        }
        
        # 应用B的配置
        trigger_config = {
            "enabled": True,
            "event_types": ["app.execution.completed"],
            "conditions": {"instance_id": 1}
        }
        
        # 验证所有条件
        assert _match_event_type(event_dict["event_type"], trigger_config["event_types"]) == True
        assert _check_conditions(event_dict, trigger_config["conditions"]) == True
        assert _check_cascade_loop(2, event_dict) == False  # 应用B ID=2
    
    def test_cascade_scenario_loop_prevention(self):
        """测试循环阻止场景"""
        # 应用A → B → A 的循环
        event_dict = {
            "metadata": {
                "cascade_chain": [1, 2]  # A → B
            }
        }
        
        # 尝试触发应用A（循环）
        assert _check_cascade_loop(1, event_dict) == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
