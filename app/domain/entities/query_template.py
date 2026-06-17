"""
查询模板实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, DateTime, Text, Integer
from app.shared.db_types import JsonType
from app.extensions import db


class QueryTemplate(db.Model):
    """
    查询模板
    
    职责：
    1. 提供预设查询模板
    2. 支持参数化占位符
    3. 记录使用统计
    """
    __tablename__ = 'query_templates'
    __table_args__ = {'extend_existing': True}
    
    id = Column(BigInteger, primary_key=True)
    template_name = Column(String(200), nullable=False)
    template_description = Column(Text)
    
    # 模板内容
    sql_template = Column(Text, nullable=False)  # 支持 {{param}} 占位符
    parameters = Column(JsonType, default=list)  # [{"name": "start_date", "type": "date", "default": "2024-01-01", "label": "开始日期"}]
    
    # 分类与统计
    category = Column(String(50), index=True)  # 用户分析/销售分析/产品分析
    tags = Column(JsonType, default=list)
    use_count = Column(Integer, default=0)
    
    # 审计字段
    created_by = Column(String(191), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    
    def increment_use_count(self):
        """增加使用次数"""
        self.use_count += 1
    
    def __repr__(self):
        return f"<QueryTemplate id={self.id} name={self.template_name} category={self.category}>"
