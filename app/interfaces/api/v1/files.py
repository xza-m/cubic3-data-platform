"""
文件上传 API
"""
import os
import uuid
from datetime import datetime
from flask import Blueprint, request, current_app
from werkzeug.utils import secure_filename
import pandas as pd

from app.shared.exceptions import ValidationError
from app.shared.response import success, bad_request
from app.domain.services.field_identifier import FieldIdentifier
from app.interfaces.api.middleware.auth import require_auth


bp = Blueprint('files', __name__, url_prefix='/api/v1/files')


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in current_app.config.get('ALLOWED_EXTENSIONS', {'csv'})


def generate_unique_filename(original_filename):
    """生成唯一文件名"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(original_filename)[1]
    return f"{timestamp}_{file_id}{ext}", file_id


def parse_csv_metadata(file_path):
    """解析 CSV 元数据并进行字段智能识别"""
    try:
        # 读取前10行用于预览
        df_preview = pd.read_csv(file_path, nrows=10)
        
        # 计算总行数
        df_full = pd.read_csv(file_path)
        row_count = len(df_full)
        
        # 解析列信息
        columns = []
        fields_to_identify = []
        
        for col in df_preview.columns:
            col_data = df_preview[col]
            dtype_str = str(col_data.dtype)
            
            columns.append({
                "name": str(col),
                "type": dtype_str,
                "sample_values": col_data.dropna().tolist()[:3]
            })
            
            # 准备字段识别数据
            fields_to_identify.append({
                'name': str(col),
                'type': dtype_str,
                'comment': '',
                'is_partition': False
            })
        
        # 调用 FieldIdentifier 进行智能识别
        identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
        statistics = FieldIdentifier.get_statistics(identified_fields)
        
        # 预览数据
        preview = df_preview.to_dict('records')
        
        return {
            "columns": columns,
            "fields": identified_fields,  # 统一字段名为 fields（与物理表一致）
            "statistics": statistics,
            "preview": preview,
            "row_count": row_count
        }
    except Exception as e:
        raise ValidationError(f"CSV 解析失败: {str(e)}")


@bp.route('/upload', methods=['POST'])
@require_auth
def upload_file():
    """
    上传 CSV 文件
    
    Request:
        - file: CSV 文件（multipart/form-data）
        
    Response:
        {
            "file_id": "uuid",
            "file_name": "data.csv",
            "file_path": "instance/uploads/xxx.csv",
            "file_size": 1024000,
            "row_count": 10000,
            "columns": [...],
            "preview": [...]
        }
    """
    # 检查是否有文件
    if 'file' not in request.files:
        return bad_request('请上传文件')
    
    file = request.files['file']
    
    # 检查文件名
    if file.filename == '':
        return bad_request('文件名为空')
    
    if not allowed_file(file.filename):
        return bad_request('只支持 CSV 文件')
    
    # 生成唯一文件名
    original_filename = secure_filename(file.filename)
    unique_filename, file_id = generate_unique_filename(original_filename)
    
    # 保存文件
    upload_folder = current_app.config.get('UPLOAD_FOLDER', 'instance/uploads')
    os.makedirs(upload_folder, exist_ok=True)
    
    file_path = os.path.join(upload_folder, unique_filename)
    file.save(file_path)
    
    # 获取文件大小
    file_size = os.path.getsize(file_path)
    
    # 解析 CSV 元数据
    metadata = parse_csv_metadata(file_path)
    
    return success(data={
        "file_id": file_id,
        "file_name": original_filename,
        "file_path": file_path,
        "file_size": file_size,
        "uploaded_at": datetime.now().isoformat(),
        **metadata
    })
