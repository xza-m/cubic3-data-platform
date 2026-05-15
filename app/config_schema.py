"""
应用配置 Schema
使用 Pydantic 进行配置验证和类型检查
"""
from typing import Optional, Set
from pydantic import BaseModel, Field, HttpUrl, field_validator, ConfigDict
import os


class DatabaseConfig(BaseModel):
    """数据库配置"""
    uri: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/cubic3_data_platform",
        description="数据库连接 URI"
    )
    track_modifications: bool = Field(default=False, description="是否追踪修改")
    
    @field_validator('uri')
    @classmethod
    def validate_uri(cls, v: str) -> str:
        """验证数据库 URI"""
        if not v:
            raise ValueError("数据库 URI 不能为空")
        if not v.startswith(('postgresql://', 'postgresql+psycopg2://', 'sqlite:///')):
            raise ValueError("不支持的数据库类型，仅支持 PostgreSQL 和 SQLite")
        return v


class RedisConfig(BaseModel):
    """Redis 配置"""
    url: str = Field(default="redis://localhost:6379/0", description="Redis 连接 URL")
    
    @field_validator('url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        """验证 Redis URL"""
        if not v:
            raise ValueError("Redis URL 不能为空")
        if not v.startswith('redis://'):
            raise ValueError("Redis URL 必须以 redis:// 开头")
        return v


class SupersetConfig(BaseModel):
    """Superset 配置"""
    base_url: str = Field(default="", description="Superset 基础 URL")
    username: Optional[str] = Field(default=None, description="Superset 用户名")
    password: Optional[str] = Field(default=None, description="Superset 密码")
    jwt: Optional[str] = Field(default=None, description="Superset JWT Token")
    timeout: int = Field(default=20, ge=1, le=300, description="请求超时时间（秒）")
    retry_max: int = Field(default=3, ge=0, le=10, description="最大重试次数")
    retry_backoff: float = Field(default=1.5, ge=1.0, le=5.0, description="重试退避系数")
    screenshot_max_wait: int = Field(default=60, ge=10, le=600, description="截图最大等待时间（秒）")
    screenshot_poll_interval: float = Field(default=3.0, ge=0.5, le=10.0, description="截图轮询间隔（秒）")
    dashboard_url_template: str = Field(default="", description="Dashboard URL 模板")
    viewport_width: int = Field(default=1920, ge=800, le=3840, description="视口宽度")
    viewport_height: int = Field(default=1080, ge=600, le=2160, description="视口高度")
    
    @field_validator('base_url')
    @classmethod
    def validate_base_url(cls, v: str) -> str:
        """验证 Superset URL"""
        if v:
            v = v.rstrip('/')
            if not v.startswith(('http://', 'https://')):
                raise ValueError("Superset URL 必须以 http:// 或 https:// 开头")
        return v


class FeishuConfig(BaseModel):
    """飞书配置"""
    app_id: str = Field(default="", description="飞书应用 ID")
    app_secret: str = Field(default="", description="飞书应用密钥")
    chat_id: str = Field(default="", description="默认飞书群聊 ID")
    verification_token: str = Field(default="", description="飞书验证 Token")
    timeout: int = Field(default=10, ge=1, le=60, description="请求超时时间（秒）")
    retry_max: int = Field(default=3, ge=0, le=10, description="最大重试次数")
    retry_backoff: float = Field(default=1.5, ge=1.0, le=5.0, description="重试退避系数")


class OSSConfig(BaseModel):
    """阿里云 OSS 配置"""
    access_key_id: str = Field(default="", description="OSS Access Key ID")
    access_key_secret: str = Field(default="", description="OSS Access Key Secret")
    endpoint: str = Field(default="", description="OSS Endpoint")
    bucket_name: str = Field(default="", description="OSS Bucket 名称")
    
    def is_configured(self) -> bool:
        """检查 OSS 是否已配置"""
        return all([
            self.access_key_id,
            self.access_key_secret,
            self.endpoint,
            self.bucket_name
        ])


class LLMConfig(BaseModel):
    """LLM 配置"""
    provider: str = Field(default="openai", description="LLM 提供商")
    api_key: str = Field(default="", description="LLM API Key")
    api_base: str = Field(default="https://api.openai.com/v1", description="LLM API 基础 URL")
    model: str = Field(default="gpt-4o-mini", description="LLM 模型名称")
    timeout: int = Field(default=60, ge=10, le=300, description="请求超时时间（秒）")
    
    @field_validator('provider')
    @classmethod
    def validate_provider(cls, v: str) -> str:
        """验证 LLM 提供商"""
        allowed_providers = {'openai', 'azure', 'anthropic', 'custom'}
        if v not in allowed_providers:
            raise ValueError(f"不支持的 LLM 提供商: {v}，支持: {allowed_providers}")
        return v


class QueryGatewayConfig(BaseModel):
    """查询网关配置。"""

    base_url: str = Field(default="http://dw-query-gateway:8000", description="dw-query-gateway 基础 URL")
    platform_service_token: str = Field(default="", description="data-platform 调用 gateway 的服务令牌")
    timeout_seconds: int = Field(default=5, ge=1, le=60, description="网关请求超时时间（秒）")


class FileConfig(BaseModel):
    """文件上传配置"""
    upload_folder: str = Field(default="instance/uploads", description="上传文件夹路径")
    max_content_length: int = Field(default=50 * 1024 * 1024, description="最大文件大小（字节）")
    allowed_extensions: Set[str] = Field(default={'csv', 'xls', 'xlsx'}, description="允许的文件扩展名")
    extraction_result_dir: str = Field(default="instance/extraction_results", description="提取结果目录")


class AppConfig(BaseModel):
    """应用配置（完整）"""
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    # 核心配置
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    redis: RedisConfig = Field(default_factory=RedisConfig)
    
    # 外部服务
    superset: SupersetConfig = Field(default_factory=SupersetConfig)
    feishu: FeishuConfig = Field(default_factory=FeishuConfig)
    oss: OSSConfig = Field(default_factory=OSSConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    query_gateway: QueryGatewayConfig = Field(default_factory=QueryGatewayConfig)
    
    # 文件配置
    file: FileConfig = Field(default_factory=FileConfig)
    
    # 认证配置
    jwt_secret: str = Field(default="your-secret-key", description="JWT 签名密钥")
    jwt_expiration_hours: int = Field(default=24, ge=1, le=720, description="JWT 过期时间（小时）")
    admin_username: str = Field(default="", description="管理员用户名")
    admin_password: str = Field(default="", description="管理员密码")
    feishu_admin_open_ids: str = Field(default="", description="飞书管理员 open_id 列表（逗号分隔）")

    # 应用配置
    app_base_url: str = Field(default="http://localhost:5000", description="应用基础 URL")
    log_level: str = Field(default="INFO", description="日志级别")
    scheduler_api_enabled: bool = Field(default=True, description="是否启用调度器 API")
    enable_scheduler_jobs: bool = Field(default=True, description="是否启用定时任务注册")

    # B-back-2: App 实例 health 阈值（秒）
    health_degraded_seconds: int = Field(
        default=60, ge=1, description="超过此秒数未收到心跳则标记为 degraded"
    )
    health_unhealthy_seconds: int = Field(
        default=180, ge=1, description="超过此秒数未收到心跳则标记为 unhealthy"
    )
    
    @field_validator('log_level')
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """验证日志级别"""
        allowed_levels = {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}
        v = v.upper()
        if v not in allowed_levels:
            raise ValueError(f"不支持的日志级别: {v}，支持: {allowed_levels}")
        return v
    
    @classmethod
    def from_env(cls) -> 'AppConfig':
        """从环境变量加载配置"""
        return cls(
            database=DatabaseConfig(
                uri=os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:postgres@localhost:5432/cubic3_data_platform'),
                track_modifications=False
            ),
            redis=RedisConfig(
                url=os.getenv('REDIS_URL', 'redis://localhost:6379/0')
            ),
            superset=SupersetConfig(
                base_url=os.getenv('SUPERSET_BASE_URL', ''),
                username=os.getenv('SUPERSET_USERNAME'),
                password=os.getenv('SUPERSET_PASSWORD'),
                jwt=os.getenv('SUPERSET_JWT'),
                timeout=int(os.getenv('SUPERSET_TIMEOUT', '20')),
                retry_max=int(os.getenv('SUPERSET_RETRY_MAX', '3')),
                retry_backoff=float(os.getenv('SUPERSET_RETRY_BACKOFF', '1.5')),
                screenshot_max_wait=int(os.getenv('SUPERSET_SCREENSHOT_MAX_WAIT', '60')),
                screenshot_poll_interval=float(os.getenv('SUPERSET_SCREENSHOT_POLL_INTERVAL', '3')),
                dashboard_url_template=os.getenv('SUPERSET_DASHBOARD_URL_TEMPLATE', ''),
                viewport_width=int(os.getenv('SUPERSET_VIEWPORT_WIDTH', '1920')),
                viewport_height=int(os.getenv('SUPERSET_VIEWPORT_HEIGHT', '1080'))
            ),
            feishu=FeishuConfig(
                app_id=os.getenv('FEISHU_APP_ID', ''),
                app_secret=os.getenv('FEISHU_APP_SECRET', ''),
                chat_id=os.getenv('FEISHU_CHAT_ID', ''),
                verification_token=os.getenv('FEISHU_VERIFICATION_TOKEN', ''),
                timeout=int(os.getenv('FEISHU_TIMEOUT', '10')),
                retry_max=int(os.getenv('FEISHU_RETRY_MAX', '3')),
                retry_backoff=float(os.getenv('FEISHU_RETRY_BACKOFF', '1.5'))
            ),
            oss=OSSConfig(
                access_key_id=os.getenv('OSS_ACCESS_KEY_ID', ''),
                access_key_secret=os.getenv('OSS_ACCESS_KEY_SECRET', ''),
                endpoint=os.getenv('OSS_ENDPOINT', ''),
                bucket_name=os.getenv('OSS_BUCKET_NAME', '')
            ),
            llm=LLMConfig(
                provider=os.getenv('LLM_PROVIDER', 'openai'),
                api_key=os.getenv('LLM_API_KEY', ''),
                api_base=os.getenv('LLM_API_BASE', 'https://api.openai.com/v1'),
                model=os.getenv('LLM_MODEL', 'gpt-4o-mini'),
                timeout=int(os.getenv('LLM_TIMEOUT', '60'))
            ),
            query_gateway=QueryGatewayConfig(
                base_url=os.getenv('QUERY_GATEWAY_BASE_URL', 'http://dw-query-gateway:8000'),
                platform_service_token=os.getenv('QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN', ''),
                timeout_seconds=int(os.getenv('QUERY_GATEWAY_TIMEOUT_SECONDS', '5')),
            ),
            file=FileConfig(
                upload_folder=os.getenv('UPLOAD_FOLDER', 'instance/uploads'),
                max_content_length=int(os.getenv('MAX_CONTENT_LENGTH', str(50 * 1024 * 1024))),
                allowed_extensions=set(os.getenv('ALLOWED_EXTENSIONS', 'csv,xls,xlsx').split(',')),
                extraction_result_dir=os.getenv('EXTRACTION_RESULT_DIR', 'instance/extraction_results')
            ),
            jwt_secret=os.getenv('JWT_SECRET', 'your-secret-key'),
            jwt_expiration_hours=int(os.getenv('JWT_EXPIRATION_HOURS', '24')),
            admin_username=os.getenv('ADMIN_USERNAME', ''),
            admin_password=os.getenv('ADMIN_PASSWORD', ''),
            feishu_admin_open_ids=os.getenv('FEISHU_ADMIN_OPEN_IDS', ''),
            app_base_url=os.getenv('APP_BASE_URL', 'http://localhost:5000'),
            log_level=os.getenv('LOG_LEVEL', 'INFO'),
            scheduler_api_enabled=os.getenv('SCHEDULER_API_ENABLED', 'true').lower() == 'true',
            enable_scheduler_jobs=os.getenv('ENABLE_SCHEDULER_JOBS', 'true').lower() == 'true',
            health_degraded_seconds=int(os.getenv('HEALTH_DEGRADED_SECONDS', '60')),
            health_unhealthy_seconds=int(os.getenv('HEALTH_UNHEALTHY_SECONDS', '180')),
        )
    
    def to_flask_config(self) -> dict:
        """转换为 Flask 配置字典"""
        return {
            # 数据库
            'SQLALCHEMY_DATABASE_URI': self.database.uri,
            'SQLALCHEMY_TRACK_MODIFICATIONS': self.database.track_modifications,
            
            # Redis
            'REDIS_URL': self.redis.url,
            
            # Superset
            'SUPERSET_BASE_URL': self.superset.base_url,
            'SUPERSET_USERNAME': self.superset.username,
            'SUPERSET_PASSWORD': self.superset.password,
            'SUPERSET_JWT': self.superset.jwt,
            'SUPERSET_TIMEOUT': self.superset.timeout,
            'SUPERSET_RETRY_MAX': self.superset.retry_max,
            'SUPERSET_RETRY_BACKOFF': self.superset.retry_backoff,
            'SUPERSET_SCREENSHOT_MAX_WAIT': self.superset.screenshot_max_wait,
            'SUPERSET_SCREENSHOT_POLL_INTERVAL': self.superset.screenshot_poll_interval,
            'SUPERSET_DASHBOARD_URL_TEMPLATE': self.superset.dashboard_url_template,
            'SUPERSET_VIEWPORT_WIDTH': self.superset.viewport_width,
            'SUPERSET_VIEWPORT_HEIGHT': self.superset.viewport_height,
            
            # 飞书
            'FEISHU_APP_ID': self.feishu.app_id,
            'FEISHU_APP_SECRET': self.feishu.app_secret,
            'FEISHU_CHAT_ID': self.feishu.chat_id,
            'FEISHU_VERIFICATION_TOKEN': self.feishu.verification_token,
            'FEISHU_TIMEOUT': self.feishu.timeout,
            'FEISHU_RETRY_MAX': self.feishu.retry_max,
            'FEISHU_RETRY_BACKOFF': self.feishu.retry_backoff,
            
            # OSS
            'OSS_ACCESS_KEY_ID': self.oss.access_key_id,
            'OSS_ACCESS_KEY_SECRET': self.oss.access_key_secret,
            'OSS_ENDPOINT': self.oss.endpoint,
            'OSS_BUCKET_NAME': self.oss.bucket_name,
            
            # LLM
            'LLM_PROVIDER': self.llm.provider,
            'LLM_API_KEY': self.llm.api_key,
            'LLM_API_BASE': self.llm.api_base,
            'LLM_MODEL': self.llm.model,
            'LLM_TIMEOUT': self.llm.timeout,

            # 查询网关
            'QUERY_GATEWAY_BASE_URL': self.query_gateway.base_url,
            'QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN': self.query_gateway.platform_service_token,
            'QUERY_GATEWAY_TIMEOUT_SECONDS': self.query_gateway.timeout_seconds,
            
            # 文件
            'UPLOAD_FOLDER': self.file.upload_folder,
            'MAX_CONTENT_LENGTH': self.file.max_content_length,
            'ALLOWED_EXTENSIONS': self.file.allowed_extensions,
            'EXTRACTION_RESULT_DIR': self.file.extraction_result_dir,
            
            # 认证
            'JWT_SECRET': self.jwt_secret,
            'JWT_EXPIRATION_HOURS': self.jwt_expiration_hours,
            'ADMIN_USERNAME': self.admin_username,
            'ADMIN_PASSWORD': self.admin_password,
            'FEISHU_ADMIN_OPEN_IDS': self.feishu_admin_open_ids,

            # 应用
            'APP_BASE_URL': self.app_base_url,
            'LOG_LEVEL': self.log_level,
            'SCHEDULER_API_ENABLED': self.scheduler_api_enabled,
            'ENABLE_SCHEDULER_JOBS': self.enable_scheduler_jobs,
            # B-back-2
            'HEALTH_DEGRADED_SECONDS': self.health_degraded_seconds,
            'HEALTH_UNHEALTHY_SECONDS': self.health_unhealthy_seconds,
        }
