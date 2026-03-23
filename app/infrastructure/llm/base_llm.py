"""
大模型服务基类
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class BaseLLMService(ABC):
    """
    大模型服务抽象基类
    
    职责：
    1. 定义 LLM 调用接口
    2. 统一错误处理
    """
    
    @abstractmethod
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        聊天补全
        
        Args:
            messages: 消息列表 [{"role": "user", "content": "..."}]
            temperature: 温度参数
            max_tokens: 最大token数
            **kwargs: 其他参数
        
        Returns:
            {
                "content": "回复内容",
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            }
        """
        pass
    
    @abstractmethod
    def generate_sql(
        self,
        question: str,
        schema: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成 SQL

        .. deprecated::
            SQL 生成已迁移至 AgentService 的 tool_use 机制，本方法仅作为回退路径保留。
        
        Args:
            question: 用户问题
            schema: 数据集 schema 信息
            **kwargs: 其他参数
        
        Returns:
            {
                "sql": "生成的SQL",
                "explanation": "SQL解释",
                "visualization_suggestion": {...}
            }
        """
        pass
