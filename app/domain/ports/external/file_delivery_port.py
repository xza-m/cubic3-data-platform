"""
文件交付端口接口
定义文件交付的契约
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List


class IFileDeliveryPort(ABC):
    """
    文件交付端口接口
    
    职责：
    1. 保存查询结果为文件
    2. 根据策略选择交付方式（本地/飞书/OSS）
    3. 发送通知
    
    实现：由基础设施层的适配器实现
    """
    
    @abstractmethod
    def save_query_result(
        self,
        data: List[Dict[str, Any]],
        columns: List[str],
        run_id: int,
        file_format: str = 'csv'
    ) -> Dict[str, Any]:
        """
        保存查询结果为文件
        
        Args:
            data: 查询结果数据
            columns: 列名列表
            run_id: 执行记录ID
            file_format: 文件格式（csv/excel）
        
        Returns:
            {
                'file_path': str,
                'file_size_mb': float,
                'row_count': int
            }
        """
        pass
    
    @abstractmethod
    def deliver_file(
        self,
        file_path: str,
        file_size_mb: float,
        subscription_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        根据策略交付文件
        
        策略：
        - 文件 < 20MB + 配置了飞书 → 上传到飞书
        - 文件 >= 20MB + 配置了 OSS → 上传到 OSS，生成预签名链接
        - 其他 → 本地下载
        
        Args:
            file_path: 文件路径
            file_size_mb: 文件大小（MB）
            subscription_config: 订阅配置
        
        Returns:
            {
                'method': str,  # local, feishu_file, oss
                'download_url': str (optional),
                'expires_at': str (optional),
                'file_key': str (optional)
            }
        """
        pass
    
    @abstractmethod
    def deliver_via_feishu(
        self,
        file_path: str,
        chat_id: str,
        task_name: str
    ) -> Dict[str, Any]:
        """
        通过飞书交付文件
        
        Args:
            file_path: 文件路径
            chat_id: 飞书群组ID
            task_name: 任务名称
        
        Returns:
            {
                'method': 'feishu_file',
                'file_key': str,
                'message_id': str
            }
        """
        pass
    
    @abstractmethod
    def deliver_via_oss(
        self,
        file_path: str,
        object_name: str,
        expiry_hours: int = 24
    ) -> Dict[str, Any]:
        """
        通过 OSS 交付文件（生成预签名链接）
        
        Args:
            file_path: 文件路径
            object_name: OSS 对象名
            expiry_hours: 链接有效期（小时）
        
        Returns:
            {
                'method': 'oss',
                'download_url': str,
                'expires_at': str,
                'object_name': str
            }
        """
        pass
    
    @abstractmethod
    def send_notification(
        self,
        chat_id: str,
        title: str,
        content: str,
        link: str = None
    ):
        """
        发送通知到飞书
        
        Args:
            chat_id: 飞书群组ID
            title: 通知标题
            content: 通知内容
            link: 跳转链接（可选）
        """
        pass
