"""
提取模板实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from app.extensions import db
from app.shared.db_types import JsonType


class ExtractionTemplate(db.Model):
    """提取模板模型"""
    __tablename__ = 'extraction_templates'

    id = db.Column(db.BigInteger, primary_key=True)
    template_name = db.Column(db.String(200), nullable=False)
    dataset_id = db.Column(db.BigInteger, db.ForeignKey('datasets.id', ondelete='CASCADE'))

    # 模板配置
    select_fields = db.Column(JsonType)
    filter_template = db.Column(JsonType)

    # 使用统计
    use_count = db.Column(db.Integer, default=0)
    last_used_at = db.Column(db.DateTime)

    # 标签
    tags = db.Column(JsonType, default=[])

    is_public = db.Column(db.Boolean, default=False)
    created_by = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # 关系
    dataset = db.relationship('Dataset', back_populates='templates')

    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'template_name': self.template_name,
            'dataset_id': self.dataset_id,
            'select_fields': self.select_fields,
            'filter_template': self.filter_template,
            'use_count': self.use_count,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'tags': self.tags,
            'is_public': self.is_public,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f'<ExtractionTemplate {self.template_name}>'
