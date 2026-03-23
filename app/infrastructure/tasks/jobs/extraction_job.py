"""
数据提取异步任务（RQ Job）
"""

import pandas as pd
from datetime import datetime
from rq import get_current_job
from app.infrastructure.database.session import get_db_session
from app.domain.entities.extraction_run import ExtractionRun
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.adapters.file_delivery.file_delivery_service import FileDeliveryService
from app.shared.utils.logger import get_logger
from app.shared.enums import DatasetType

logger = get_logger(__name__)


def execute_extraction_job(run_id: int):
    """
    执行数据提取任务（RQ 异步任务）
    
    执行流程：
    1. 加载执行记录
    2. 执行 SQL 查询（asyncio）
    3. 保存结果文件
    4. 智能交付（飞书/OSS/本地）
    5. 更新执行记录状态
    
    Args:
        run_id: 执行记录ID
    
    Returns:
        执行结果字典
    
    Raises:
        Exception: 任何执行失败都会抛出异常，由 RQ 自动重试
    """
    current_job = get_current_job()
    session = get_db_session()
    
    logger.info(
        f"Starting extraction job",
        run_id=run_id,
        job_id=current_job.id if current_job else None
    )
    
    try:
        # 1. 加载执行记录
        run = session.query(ExtractionRun).filter_by(id=run_id).first()
        if not run:
            raise ValueError(f"Run {run_id} not found")
        
        task = run.task
        if not task:
            raise ValueError(f"Task for run {run_id} not found")
        
        dataset = task.dataset
        if not dataset:
            raise ValueError(f"Dataset for task {task.id} not found")
        
        datasource = dataset.source
        if not datasource:
            raise ValueError(f"DataSource for dataset {dataset.id} not found")
        
        # 标记为运行中
        run.start()
        session.commit()
        
        # 2. 执行查询（根据数据集类型）
        logger.info(f"Executing query for run {run_id}, dataset_type: {dataset.dataset_type}")
        
        if dataset.dataset_type == DatasetType.FILE.value:
            # 文件数据集：直接读取 CSV 文件
            file_path = dataset.file_metadata.get('file_path')
            if not file_path:
                raise ValueError("文件数据集缺少 file_path")
            
            logger.info(f"Reading CSV file: {file_path}")
            df = pd.read_csv(file_path)
            
            # TODO: 应用过滤条件（如果有）
            # 这里可以根据 task 的过滤条件来过滤 dataframe
            
            # 应用行数限制
            if task.row_limit and task.row_limit > 0:
                df = df.head(task.row_limit)
            
            query_result = {
                'columns': df.columns.tolist(),
                'data': df.values.tolist()
            }
            
        else:
            # 物理数据集和虚拟数据集：使用数据源适配器查询
            adapter = AdapterFactory.create_adapter(
                datasource.source_type,
                datasource.connection_config
            )
            
            # 运行异步查询
            query_result = adapter.execute_query(run.generated_sql, limit=task.row_limit)
        
        logger.info(
            f"Query completed",
            run_id=run_id,
            row_count=len(query_result.get('data', []))
        )
        
        # 3. 保存结果文件
        file_service = FileDeliveryService()
        
        file_info = file_service.save_query_result(
            data=query_result.get('data', []),
            columns=query_result.get('columns', []),
            run_id=run_id,
            file_format='csv'
        )
        
        logger.info(
            f"Result file saved",
            run_id=run_id,
            file_path=file_info['file_path'],
            file_size_mb=file_info['file_size_mb']
        )
        
        # 4. 智能交付
        # 构建订阅配置，包含任务名称用于飞书通知
        subscription_config = task.subscription_config or {}
        subscription_config['task_name'] = task.task_name
        
        delivery_result = file_service.deliver_file(
            file_path=file_info['file_path'],
            file_size_mb=file_info['file_size_mb'],
            subscription_config=subscription_config
        )
        
        logger.info(
            f"File delivered",
            run_id=run_id,
            delivery_method=delivery_result.get('method')
        )
        
        # 5. 如果是OSS交付且配置了飞书，发送OSS链接通知
        if delivery_result.get('method') == 'oss' and subscription_config.get('feishu_chat_id'):
            try:
                file_service.send_notification(
                    chat_id=subscription_config['feishu_chat_id'],
                    title="📊 数据提取完成（OSS）",
                    content=f"**任务名称**: {task.task_name}\n"
                            f"**文件大小**: {file_info['file_size_mb']:.2f}MB\n"
                            f"**完成时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                            f"**下载链接**: [点击下载]({delivery_result.get('download_url')})\n"
                            f"**链接有效期**: {delivery_result.get('expires_at', '24小时')}",
                    link=delivery_result.get('download_url')
                )
                logger.info(f"OSS download link sent to Feishu", run_id=run_id)
            except Exception as e:
                logger.warning(f"Failed to send OSS notification: {e}")
        
        # 6. 更新执行记录（成功）
        run.mark_as_success({
            'row_count': len(query_result.get('data', [])),
            'file_path': file_info['file_path'],
            'file_size_mb': file_info['file_size_mb'],
            'delivery_method': delivery_result.get('method'),
            'delivery_info': delivery_result
        })
        
        # 更新任务最后执行信息
        task.update_last_run_info(run.status, run.end_time)
        
        session.commit()
        
        logger.info(
            f"Extraction job completed successfully",
            run_id=run_id,
            duration_ms=run.duration_ms
        )
        
        return {
            'status': 'success',
            'run_id': run_id,
            'row_count': run.row_count,
            'file_size_mb': run.result_size_mb,
            'delivery_method': run.delivery_method
        }
    
    except Exception as e:
        logger.error(
            f"Extraction job failed",
            run_id=run_id,
            error=str(e),
            exc_info=True
        )
        
        # 更新执行记录（失败）
        if run:
            run.mark_as_failed(str(e))
            
            # 更新任务最后执行信息
            if task:
                task.update_last_run_info(run.status, run.end_time)
            
            session.commit()
        
        # 抛出异常，让 RQ 自动重试
        raise
    
    finally:
        session.close()
