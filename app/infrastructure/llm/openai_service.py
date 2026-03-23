"""
OpenAI LLM 服务实现
"""
import json
import requests
from typing import List, Dict, Any, Optional
from app.infrastructure.llm.base_llm import BaseLLMService
from app.shared.utils.logger import get_logger
from app.shared.exceptions import ApplicationException

logger = get_logger(__name__)


class OpenAIService(BaseLLMService):
    """
    OpenAI LLM 服务
    
    支持：
    - OpenAI 官方 API
    - OpenRouter (兼容 OpenAI 格式)
    """
    
    def __init__(
        self,
        api_key: str,
        api_base: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        timeout: int = 60
    ):
        """
        初始化
        
        Args:
            api_key: API Key
            api_base: API 基础URL（OpenRouter: https://openrouter.ai/api/v1）
            model: 模型名称
            timeout: 超时时间（秒）
        """
        self.api_key = api_key
        self.api_base = api_base.rstrip('/')
        self.model = model
        self.timeout = timeout
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """聊天补全"""
        url = f"{self.api_base}/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        # OpenRouter 需要额外的 header
        if "openrouter.ai" in self.api_base:
            headers["HTTP-Referer"] = kwargs.get("site_url", "http://localhost")
            headers["X-Title"] = kwargs.get("site_name", "BI Data Platform")
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=self.timeout
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(
                    f"LLM API error: {response.status_code}",
                    error=error_text
                )
                raise ApplicationException(f"LLM API 调用失败: {error_text}")
            
            result = response.json()
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "usage": result.get("usage", {})
            }
        
        except requests.RequestException as e:
            logger.error(f"LLM API connection error: {e}")
            raise ApplicationException(f"LLM API 连接失败: {str(e)}")
        except Exception as e:
            if isinstance(e, ApplicationException):
                raise
            logger.error(f"LLM API unexpected error: {e}")
            raise ApplicationException(f"LLM API 调用异常: {str(e)}")
    
    def generate_sql(
        self,
        question: str,
        schema: Dict[str, Any],
        **kwargs
    ) -> Dict[str, Any]:
        """
        生成 SQL

        .. deprecated::
            SQL 生成已迁移至 AgentService 的 tool_use 机制。
            DataChat 的 SendMessageHandler 会优先使用 AgentService，
            本方法仅作为回退路径保留。
        """
        
        # 构建 prompt
        system_prompt = self._build_sql_system_prompt()
        user_prompt = self._build_sql_user_prompt(question, schema)
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        # 调用 LLM
        response = self.chat_completion(
            messages=messages,
            temperature=0.1,  # 低温度以获得更确定的结果
            **kwargs
        )
        
        # 解析响应
        try:
            content = response["content"]
            
            # 尝试解析 JSON 格式响应
            if content.strip().startswith('{'):
                result = json.loads(content)
            else:
                # 如果不是 JSON，尝试提取 SQL
                result = self._extract_sql_from_text(content)
            
            return {
                "sql": result.get("sql", ""),
                "explanation": result.get("explanation", ""),
                "visualization_suggestion": result.get("visualization", {}),
                "usage": response["usage"]
            }
        
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {e}", content=content)
            raise ApplicationException(f"解析 LLM 响应失败: {str(e)}")
    
    def _build_sql_system_prompt(self) -> str:
        """构建 SQL 生成的系统提示词"""
        return """你是一个专业的数据分析助手，擅长根据用户问题生成准确的 SQL 查询。

你的职责：
1. 理解用户的数据分析需求
2. 根据提供的数据集 schema 生成正确的 SQL 查询
3. 提供 SQL 的解释说明
4. 建议合适的数据可视化方式

响应格式（JSON）：
{
  "sql": "SELECT ... FROM ...",
  "explanation": "SQL 解释说明",
  "visualization": {
    "type": "bar|line|pie|table|number",
    "config": {
      "x_field": "字段名",
      "y_field": "字段名",
      "title": "图表标题"
    }
  }
}

注意事项：
- SQL 必须符合提供的 schema
- 只使用 schema 中存在的表和字段
- 对于聚合查询，选择合适的图表类型
- 对于趋势分析，推荐 line 图表
- 对于比较分析，推荐 bar 图表
- 对于占比分析，推荐 pie 图表
- 对于单值指标，推荐 number 卡片
"""
    
    def _build_sql_user_prompt(self, question: str, schema: Dict[str, Any]) -> str:
        """构建用户提示词"""
        
        # 格式化 schema 信息
        schema_text = f"""
数据集信息：
- 表名：{schema.get('table_name', 'unknown')}
- 数据库类型：{schema.get('source_type', 'unknown')}

字段列表：
"""
        
        for field in schema.get('fields', []):
            schema_text += f"- {field.get('physical_name')} ({field.get('data_type')})"
            if field.get('description'):
                schema_text += f": {field['description']}"
            schema_text += "\n"
        
        return f"""{schema_text}

用户问题：{question}

请生成 SQL 查询并推荐可视化方式。"""
    
    def _extract_sql_from_text(self, text: str) -> Dict[str, Any]:
        """从文本中提取 SQL（如果 LLM 没有返回 JSON）"""
        import re
        
        # 尝试提取 SQL（在代码块中）
        sql_match = re.search(r'```sql\n(.*?)\n```', text, re.DOTALL | re.IGNORECASE)
        if not sql_match:
            sql_match = re.search(r'```\n(.*?)\n```', text, re.DOTALL)
        
        sql = sql_match.group(1).strip() if sql_match else text.strip()
        
        return {
            "sql": sql,
            "explanation": "SQL 已生成",
            "visualization": {"type": "table"}
        }
