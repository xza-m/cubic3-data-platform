"""
文件上传 API
"""
import os
import uuid
from datetime import datetime
from flask import Blueprint, request, current_app
from werkzeug.utils import secure_filename
from app.shared.exceptions import ValidationError
from app.shared.response import success, bad_request
from app.interfaces.api.middleware.auth import require_auth
from app.application.dataset.services.dataset_metadata_refresh_service import parse_tabular_file_metadata


bp = Blueprint('files', __name__, url_prefix='/api/v1/files')

DEFAULT_ALLOWED_EXTENSIONS = {'csv', 'xls', 'xlsx'}


def allowed_file(filename):
    """检查文件扩展名是否允许"""
    configured = set(current_app.config.get('ALLOWED_EXTENSIONS', DEFAULT_ALLOWED_EXTENSIONS) or DEFAULT_ALLOWED_EXTENSIONS)
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in (configured | DEFAULT_ALLOWED_EXTENSIONS)


def generate_unique_filename(original_filename):
    """生成唯一文件名"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(original_filename)[1]
    return f"{timestamp}_{file_id}{ext}", file_id


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
        return bad_request('只支持 CSV / Excel 文件')
    
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
    
    # 解析文件元数据
    metadata = parse_tabular_file_metadata(file_path)
    
    return success(data={
        "file_id": file_id,
        "file_name": original_filename,
        "file_path": file_path,
        "file_size": file_size,
        "uploaded_at": datetime.now().isoformat(),
        "preview": metadata.get("sample_rows", []),
        **metadata
    })
