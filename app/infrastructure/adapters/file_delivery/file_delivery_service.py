"""
文件交付服务适配器（实现 IFileDeliveryPort 接口）
"""
import os
import csv
from datetime import datetime
from typing import List, Dict, Any
from flask import current_app
from app.domain.ports.external.file_delivery_port import IFileDeliveryPort
from app.shared.enums import DeliveryMethod
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class FileDeliveryService(IFileDeliveryPort):
    """
    文件交付服务实现
    
    职责：
    1. 保存查询结果为文件
    2. 根据策略智能选择交付方式
    3. 发送通知
    """
    
    # 文件大小阈值（MB）
    FEISHU_FILE_SIZE_LIMIT = 20
    
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
        # 获取结果目录
        result_dir = current_app.config.get('EXTRACTION_RESULT_DIR', 'instance/extraction_results')
        
        # 转换为绝对路径
        if not os.path.isabs(result_dir):
            base_dir = os.path.dirname(current_app.instance_path)
            result_dir = os.path.join(base_dir, result_dir)
        
        os.makedirs(result_dir, exist_ok=True)
        
        # 生成文件名
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        file_name = f"extraction_{run_id}_{timestamp}.{file_format}"
        file_path = os.path.join(result_dir, file_name)
        
        # 保存为 CSV
        if file_format == 'csv':
            with open(file_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=columns)
                writer.writeheader()
                writer.writerows(data)
        
        # TODO: 支持 Excel 格式（需要 openpyxl）
        
        # 获取文件大小
        file_size_bytes = os.path.getsize(file_path)
        file_size_mb = file_size_bytes / (1024 * 1024)
        
        logger.info(
            f"Query result saved",
            file_path=file_path,
            file_size_mb=file_size_mb,
            row_count=len(data)
        )
        
        return {
            'file_path': file_path,
            'file_size_mb': file_size_mb,
            'row_count': len(data)
        }
    
    def deliver_file(
        self,
        file_path: str,
        file_size_mb: float,
        subscription_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        根据策略智能交付文件
        
        策略：
        - 文件 < 20MB + 配置了飞书 → 上传到飞书
        - 文件 >= 20MB + 配置了 OSS → 上传到 OSS
        - 其他 → 本地下载
        
        Args:
            file_path: 文件路径
            file_size_mb: 文件大小（MB）
            subscription_config: 订阅配置
        
        Returns:
            交付结果字典
        """
        feishu_chat_id = subscription_config.get('feishu_chat_id')
        user_preference = subscription_config.get('delivery_method', 'auto')
        
        # 自动选择策略
        if user_preference == 'auto':
            if file_size_mb < self.FEISHU_FILE_SIZE_LIMIT and feishu_chat_id:
                delivery_method = DeliveryMethod.FEISHU_FILE
            elif file_size_mb >= self.FEISHU_FILE_SIZE_LIMIT:
                delivery_method = DeliveryMethod.OSS
            else:
                delivery_method = DeliveryMethod.LOCAL
        else:
            delivery_method = DeliveryMethod(user_preference)
        
        logger.info(
            f"Delivery method selected",
            method=delivery_method.value,
            file_size_mb=file_size_mb
        )
        
        # 执行交付
        if delivery_method == DeliveryMethod.FEISHU_FILE:
            return self.deliver_via_feishu(
                file_path=file_path,
                chat_id=feishu_chat_id,
                task_name=subscription_config.get('task_name', '数据提取')
            )
        
        elif delivery_method == DeliveryMethod.OSS:
            timestamp = datetime.now().strftime('%Y%m%d')
            object_name = f"extraction/{timestamp}/{os.path.basename(file_path)}"
            return self.deliver_via_oss(
                file_path=file_path,
                object_name=object_name,
                expiry_hours=24
            )
        
        else:
            # 本地下载
            return {
                'method': DeliveryMethod.LOCAL.value,
                'file_path': file_path,
                'message': '文件已保存，请登录平台下载'
            }
    
    def deliver_via_feishu(
        self,
        file_path: str,
        chat_id: str,
        task_name: str
    ) -> Dict[str, Any]:
        """通过飞书交付文件"""
        logger.info(f"Delivering via Feishu: {file_path}, chat_id: {chat_id}")
        
        try:
            from app.infrastructure.adapters.feishu.client import FeishuClient
            
            feishu_client = FeishuClient()
            
            # 1. 上传文件到飞书
            file_key = feishu_client.upload_file(file_path, file_type='stream')
            
            # 2. 发送文件消息
            file_name = os.path.basename(file_path)
            feishu_client.send_file_message(chat_id, file_key, file_name)
            
            # 3. 发送说明卡片
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            content = f"**任务名称**: {task_name}\n"
            content += f"**文件大小**: {file_size_mb:.2f}MB\n"
            content += f"**完成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            
            feishu_client.send_card_message(
                chat_id,
                title="📊 数据提取完成",
                content=content
            )
            
            logger.info(f"File delivered to Feishu successfully: {file_name}")
            
            return {
                'method': DeliveryMethod.FEISHU_FILE.value,
                'file_key': file_key,
                'chat_id': chat_id,
                'message': f'文件已推送到飞书群（{file_size_mb:.2f}MB）'
            }
        
        except Exception as e:
            logger.error(f"Feishu delivery failed: {e}", exc_info=True)
            return {
                'method': DeliveryMethod.FEISHU_FILE.value,
                'error': str(e),
                'message': f'飞书推送失败: {str(e)}'
            }
    
    def deliver_via_oss(
        self,
        file_path: str,
        object_name: str,
        expiry_hours: int = 24
    ) -> Dict[str, Any]:
        """通过 OSS 交付文件"""
        logger.info(f"Delivering via OSS: {file_path}, object: {object_name}")
        
        try:
            # 检查 OSS 配置
            oss_access_key = current_app.config.get('OSS_ACCESS_KEY_ID')
            oss_secret_key = current_app.config.get('OSS_ACCESS_KEY_SECRET')
            oss_endpoint = current_app.config.get('OSS_ENDPOINT')
            oss_bucket = current_app.config.get('OSS_BUCKET_NAME')
            
            if not all([oss_access_key, oss_secret_key, oss_endpoint, oss_bucket]):
                logger.warning("OSS not configured, falling back to local download")
                return {
                    'method': DeliveryMethod.LOCAL.value,
                    'file_path': file_path,
                    'message': 'OSS未配置，请使用本地下载'
                }
            
            try:
                import oss2
            except ImportError:
                logger.warning("oss2 library not installed, falling back to local download")
                return {
                    'method': DeliveryMethod.LOCAL.value,
                    'file_path': file_path,
                    'message': 'OSS库未安装，请使用本地下载'
                }
            
            # 1. 初始化 OSS 客户端
            auth = oss2.Auth(oss_access_key, oss_secret_key)
            bucket = oss2.Bucket(auth, oss_endpoint, oss_bucket)
            
            # 2. 上传文件到 OSS
            bucket.put_object_from_file(object_name, file_path)
            
            # 3. 生成预签名下载链接
            from datetime import timedelta
            expires_seconds = expiry_hours * 3600
            download_url = bucket.sign_url(
                'GET',
                object_name,
                expires_seconds,
                slash_safe=True
            )
            
            expires_at = datetime.now() + timedelta(hours=expiry_hours)
            
            logger.info(f"File uploaded to OSS: {object_name}, expires at {expires_at}")
            
            return {
                'method': DeliveryMethod.OSS.value,
                'download_url': download_url,
                'object_name': object_name,
                'expires_at': expires_at.isoformat(),
                'message': f'文件已上传至OSS，链接有效期{expiry_hours}小时'
            }
        
        except Exception as e:
            logger.error(f"OSS upload failed: {e}", exc_info=True)
            # OSS失败时fallback到本地下载
            return {
                'method': DeliveryMethod.LOCAL.value,
                'file_path': file_path,
                'error': str(e),
                'message': f'OSS上传失败，请使用本地下载: {str(e)}'
            }
    
    def upload_local_file(
        self,
        file_path: str,
        object_name: str,
        expiry_hours: int = 168,
    ) -> Dict[str, Any]:
        """
        上传一个已落盘的本地文件到 OSS，如 OSS 不可用回落为本地下载。
        专为异步数据导出等大文件场景设计，避免把内容先加载到内存。
        """
        file_size_bytes = os.path.getsize(file_path)

        # 优先走 OSS
        oss_result = self.deliver_via_oss(
            file_path=file_path,
            object_name=object_name,
            expiry_hours=expiry_hours,
        )
        oss_result['file_size_bytes'] = file_size_bytes
        oss_result['file_path'] = file_path

        if oss_result.get('method') != DeliveryMethod.OSS.value:
            # deliver_via_oss 已在 OSS 未配置时返回 local 回落
            oss_result.setdefault('method', DeliveryMethod.LOCAL.value)
            oss_result['object_name'] = object_name

        return oss_result

    def send_notification(
        self,
        chat_id: str,
        title: str,
        content: str,
        link: str = None
    ):
        """发送通知到飞书"""
        logger.info(f"Sending notification to chat {chat_id}")
        
        try:
            from app.infrastructure.adapters.feishu.client import FeishuClient
            
            feishu_client = FeishuClient()
            feishu_client.send_card_message(chat_id, title, content, link)
            
            logger.info(f"Notification sent to chat {chat_id} successfully")
        
        except Exception as e:
            logger.error(f"Failed to send notification: {e}", exc_info=True)
            # 通知失败不影响主流程，仅记录日志
