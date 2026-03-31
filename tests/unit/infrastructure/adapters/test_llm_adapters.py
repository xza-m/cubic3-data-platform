"""
LLM 适配器测试
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from httpx import Request, Response
from openai import APIConnectionError, APITimeoutError, APIStatusError

from app.infrastructure.adapters.llm.base_llm_adapter import BaseLLMAdapter
from app.infrastructure.adapters.llm.openai_compatible import OpenAICompatibleAdapter
from app.shared.exceptions import ApplicationException


class DummyLLMAdapter(BaseLLMAdapter):
    def chat(self, messages, tools=None, temperature=0.0):
        return {'messages': messages, 'tools': tools, 'temperature': temperature}


class TestBaseLLMAdapter:
    def test_init_normalizes_api_base(self):
        adapter = DummyLLMAdapter(
            api_key='sk-demo',
            api_base='https://example.com/v1/',
            model='demo-model',
            timeout=30,
        )

        assert adapter.api_base == 'https://example.com/v1'
        assert adapter.timeout == 30

    def test_repr_contains_model_and_api_base(self):
        adapter = DummyLLMAdapter(
            api_key='sk-demo',
            api_base='https://example.com/v1/',
            model='demo-model',
        )

        assert repr(adapter) == "DummyLLMAdapter(model='demo-model', api_base='https://example.com/v1')"


class TestOpenAICompatibleAdapter:
    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_init_constructs_openai_client(self, mock_openai):
        adapter = OpenAICompatibleAdapter(
            api_key='sk-demo',
            api_base='https://example.com/v1/',
            model='gpt-demo',
            timeout=12,
        )

        mock_openai.assert_called_once_with(
            api_key='sk-demo',
            base_url='https://example.com/v1/',
            timeout=12,
        )
        assert adapter.api_base == 'https://example.com/v1'

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_returns_plain_text_response(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content='hello', tool_calls=None),
                )
            ],
            usage=SimpleNamespace(prompt_tokens=1, completion_tokens=2, total_tokens=3),
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo')
        result = adapter.chat([{'role': 'user', 'content': 'hi'}], temperature=0.2)

        assert result.content == 'hello'
        assert result.stop_reason == 'end_turn'
        assert result.tool_calls == []
        assert result.usage == {'prompt_tokens': 1, 'completion_tokens': 2, 'total_tokens': 3}
        mock_client.chat.completions.create.assert_called_once_with(
            model='gpt-4o-mini',
            messages=[{'role': 'user', 'content': 'hi'}],
            temperature=0.2,
        )

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_wraps_tools_and_parses_tool_calls(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=None,
                        tool_calls=[
                            SimpleNamespace(
                                id='call_1',
                                function=SimpleNamespace(name='search', arguments='{"q":"demo"}'),
                            )
                        ],
                    ),
                )
            ],
            usage=None,
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo')
        result = adapter.chat(
            [{'role': 'user', 'content': 'hi'}],
            tools=[{'name': 'search', 'parameters': {'type': 'object'}}],
        )

        assert result.stop_reason == 'tool_use'
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0].name == 'search'
        assert result.tool_calls[0].arguments == {'q': 'demo'}

        called_kwargs = mock_client.chat.completions.create.call_args.kwargs
        assert called_kwargs['tool_choice'] == 'auto'
        assert called_kwargs['tools'] == [{'type': 'function', 'function': {'name': 'search', 'parameters': {'type': 'object'}}}]

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_preserves_raw_tool_arguments_when_json_invalid(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=None,
                        tool_calls=[
                            SimpleNamespace(
                                id='call_1',
                                function=SimpleNamespace(name='search', arguments='{bad json'),
                            )
                        ],
                    ),
                )
            ],
            usage=None,
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo')
        result = adapter.chat([{'role': 'user', 'content': 'hi'}])

        assert result.tool_calls[0].arguments == {'raw': '{bad json'}

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_maps_timeout_error_to_application_exception(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = APITimeoutError(
            Request('POST', 'https://example.com/v1/chat/completions')
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo', timeout=9)
        with pytest.raises(ApplicationException, match='LLM 请求超时'):
            adapter.chat([{'role': 'user', 'content': 'hi'}])

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_maps_connection_error_to_application_exception(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.side_effect = APIConnectionError(
            message='network down',
            request=Request('POST', 'https://example.com/v1/chat/completions'),
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo')
        with pytest.raises(ApplicationException, match='LLM 连接失败'):
            adapter.chat([{'role': 'user', 'content': 'hi'}])

    @patch('app.infrastructure.adapters.llm.openai_compatible.OpenAI')
    def test_chat_maps_api_status_error_to_application_exception(self, mock_openai):
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        request = Request('POST', 'https://example.com/v1/chat/completions')
        response = Response(429, request=request)
        mock_client.chat.completions.create.side_effect = APIStatusError(
            'quota exceeded',
            response=response,
            body={'error': {'message': 'quota exceeded'}},
        )

        adapter = OpenAICompatibleAdapter(api_key='sk-demo')
        with pytest.raises(ApplicationException, match='LLM API 错误'):
            adapter.chat([{'role': 'user', 'content': 'hi'}])
