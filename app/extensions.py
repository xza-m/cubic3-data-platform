import logging
import os
from apscheduler.schedulers.background import BackgroundScheduler
from flask_apscheduler import APScheduler
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()
scheduler = APScheduler(scheduler=BackgroundScheduler())


def configure_logging(level: str = "INFO") -> None:
    """配置应用日志
    
    推荐使用 app.shared.utils.logger.configure_root_logger() 代替此方法
    此方法保留用于向后兼容
    """
    # 使用新的结构化日志配置
    try:
        from app.shared.utils.logger import configure_root_logger
        
        # 判断是否使用 JSON 格式
        json_format = os.getenv('LOG_FORMAT', 'json').lower() == 'json'
        
        configure_root_logger(level=level, json_format=json_format)
    except ImportError:
        # 回退到旧的配置方式
        logging.basicConfig(
            level=getattr(logging, level.upper(), logging.INFO),
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )

