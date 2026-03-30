import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import JSON, Text

from app.shared.db_types import ArrayOfString, JsonType
from app.shared.exceptions import (
    BaseAppException,
    DataSourceConnectionError,
    InvalidFieldsError,
    TaskNotFoundError,
)
from app.shared.response import bad_request, created, error, not_found, server_error, success
from app.shared.utils.code_generator import generate_dataset_code
from app.shared.utils.rate_limiter import check_rate_limit
from app.shared.utils.security import (
    escape_sql_value,
    generate_trace_id,
    mask_sensitive_data,
    sanitize_field_name,
    sanitize_table_name,
    validate_identifier,
    validate_operator,
)


class _FakeNow:
    microsecond = 123456

    def strftime(self, fmt):
        assert fmt == '%H%M%S'
        return '155823'


class _FakeDialect:
    def __init__(self, name):
        self.name = name

    def type_descriptor(self, typ):
        return typ


class TestCodeGenerator:
    @patch('app.shared.utils.code_generator.datetime')
    def test_generate_dataset_code_uses_table_name_and_microseconds(self, mock_datetime):
        mock_datetime.now.return_value = _FakeNow()

        code = generate_dataset_code('postgresql', 'dw.public.Order-Items')

        assert code == 'pg_order_items_456'

    @patch('app.shared.utils.code_generator.datetime')
    def test_generate_dataset_code_supports_fallback_unknown_prefix_and_full_timestamp(self, mock_datetime):
        mock_datetime.now.return_value = _FakeNow()

        code = generate_dataset_code('sqlite', None, add_timestamp=True, fallback_name='My Query')

        assert code == 'sqli_my_query_155823'

    @patch('app.shared.utils.code_generator.datetime')
    def test_generate_dataset_code_truncates_when_too_long(self, mock_datetime):
        mock_datetime.now.return_value = _FakeNow()

        code = generate_dataset_code('postgresql', 'schema.' + 'a' * 120)

        assert code.startswith('pg_')
        assert code.endswith('_456')
        assert len(code) == 100

    @patch('app.shared.utils.code_generator.datetime')
    def test_generate_dataset_code_uses_dataset_when_table_and_fallback_missing(self, mock_datetime):
        mock_datetime.now.return_value = _FakeNow()

        code = generate_dataset_code('mysql', None)

        assert code == 'mysql_dataset_456'


class TestRateLimiter:
    def test_check_rate_limit_allows_first_request_and_sets_expire(self):
        raw = MagicMock()
        raw.incr.return_value = 1
        raw.ttl.return_value = 60
        redis_client = MagicMock(client=raw)

        allowed, info = check_rate_limit(redis_client, 'agent:test', max_requests=10, window_seconds=60)

        assert allowed is True
        assert info == {'current': 1, 'limit': 10, 'retry_after': 0}
        raw.expire.assert_called_once_with('agent:test', 60)

    def test_check_rate_limit_recovers_missing_ttl_and_returns_retry_after(self):
        raw = MagicMock()
        raw.incr.return_value = 11
        raw.ttl.return_value = -1
        redis_client = MagicMock(client=raw)

        allowed, info = check_rate_limit(redis_client, 'agent:test', max_requests=10, window_seconds=30)

        assert allowed is False
        assert info == {'current': 11, 'limit': 10, 'retry_after': 30}
        raw.expire.assert_called_once_with('agent:test', 30)

    def test_check_rate_limit_fails_open_on_redis_error(self):
        raw = MagicMock()
        raw.incr.side_effect = RuntimeError('redis unavailable')
        redis_client = MagicMock(client=raw)

        allowed, info = check_rate_limit(redis_client, 'agent:test', max_requests=5, window_seconds=10)

        assert allowed is True
        assert info == {'current': 0, 'limit': 5, 'retry_after': 0}


class TestSecurity:
    def test_escape_sql_value_covers_scalar_and_string_paths(self):
        assert escape_sql_value(None) == 'NULL'
        assert escape_sql_value(42) == '42'
        assert escape_sql_value(3.14) == '3.14'
        assert escape_sql_value(True) == 'TRUE'
        assert escape_sql_value(False) == 'FALSE'
        assert escape_sql_value("O'Hara") == "'O''Hara'"
        assert escape_sql_value({'a': 1}) == "'{'a': 1}'"

    @pytest.mark.parametrize('value', ['DROP TABLE users', 'abc; SELECT 1', 'name -- comment'])
    def test_escape_sql_value_rejects_dangerous_patterns(self, value):
        with pytest.raises(ValueError, match='Detected potential SQL injection'):
            escape_sql_value(value)

    def test_validate_and_sanitize_identifier_paths(self):
        assert validate_identifier('schema.table') is True
        assert validate_identifier('field_name', allow_dot=False) is True
        assert validate_identifier('') is False
        assert validate_identifier('1bad') is False
        assert sanitize_table_name('ods.orders') == 'ods.orders'
        assert sanitize_field_name('user_id') == 'user_id'

        with pytest.raises(ValueError, match='Invalid table name'):
            sanitize_table_name('bad-name')
        with pytest.raises(ValueError, match='Invalid field name'):
            sanitize_field_name('ods.user_id')

    def test_validate_operator_and_mask_sensitive_data(self):
        assert validate_operator('=', ['=', '!=']) is True
        assert validate_operator('in', ['=', '!=']) is False
        assert mask_sensitive_data('13812345678', 'mobile') == '138****5678'
        assert mask_sensitive_data('john@example.com', 'email') == 'joh***@example.com'
        assert mask_sensitive_data('ab@example.com', 'email') == 'a***@example.com'
        assert mask_sensitive_data('110101199001011234', 'id_card') == '110101********1234'
        assert mask_sensitive_data('张三', 'name') == '张*'
        assert mask_sensitive_data('anything', 'unknown') == '***'
        assert mask_sensitive_data('', 'mobile') == ''

    def test_generate_trace_id_returns_uuid(self):
        trace_id = generate_trace_id()
        assert str(uuid.UUID(trace_id)) == trace_id


class TestDbTypes:
    def test_json_type_uses_jsonb_for_postgresql_and_json_for_other_dialects(self):
        postgres_type = JsonType().load_dialect_impl(_FakeDialect('postgresql'))
        sqlite_type = JsonType().load_dialect_impl(_FakeDialect('sqlite'))

        assert postgres_type.__class__.__name__ == 'JSONB'
        assert isinstance(sqlite_type, JSON)

    def test_array_of_string_uses_array_for_postgresql_and_text_for_other_dialects(self):
        postgres_type = ArrayOfString().load_dialect_impl(_FakeDialect('postgresql'))
        sqlite_type = ArrayOfString().load_dialect_impl(_FakeDialect('sqlite'))

        assert postgres_type.__class__.__name__ == 'ARRAY'
        assert isinstance(sqlite_type, Text)

    def test_array_of_string_process_bind_param_covers_all_paths(self):
        array_type = ArrayOfString()
        postgres = _FakeDialect('postgresql')
        sqlite = _FakeDialect('sqlite')

        assert array_type.process_bind_param(['a', 'b'], postgres) == ['a', 'b']
        assert array_type.process_bind_param(None, sqlite) == '[]'
        assert array_type.process_bind_param(['中', '文'], sqlite) == '["中", "文"]'

    def test_array_of_string_process_result_value_covers_all_paths(self):
        array_type = ArrayOfString()
        postgres = _FakeDialect('postgresql')
        sqlite = _FakeDialect('sqlite')

        assert array_type.process_result_value(['a'], postgres) == ['a']
        assert array_type.process_result_value(None, sqlite) == []
        assert array_type.process_result_value(['a', 'b'], sqlite) == ['a', 'b']
        assert array_type.process_result_value('["a", "b"]', sqlite) == ['a', 'b']
        assert array_type.process_result_value('invalid-json', sqlite) == []


class TestResponseHelpers:
    def test_response_helpers_include_trace_id_and_status(self, app):
        with app.test_request_context('/health'):
            from flask import g

            g.request_id = 'req-123'

            payload, status = success({'ok': True}, message='done')
            assert status == 200
            assert payload.get_json() == {
                'code': 0,
                'message': 'done',
                'data': {'ok': True},
                'trace_id': 'req-123',
            }

            payload, status = created({'id': 1})
            assert status == 201
            assert payload.get_json()['trace_id'] == 'req-123'

            payload, status = bad_request(details={'field': 'name'})
            assert status == 400
            assert payload.get_json()['details'] == {'field': 'name'}

            payload, status = not_found()
            assert status == 404
            assert payload.get_json()['code'] == -1

            payload, status = server_error()
            assert status == 500
            assert payload.get_json()['trace_id'] == 'req-123'

            payload, status = error(message='boom', status=409)
            assert status == 409
            assert payload.get_json()['message'] == 'boom'

    def test_success_and_error_without_request_context_have_no_trace_id(self, app):
        with app.app_context():
            payload, _ = success()
            assert payload.get_json()['trace_id'] is None

            payload, _ = error()
            assert payload.get_json()['trace_id'] is None


class TestExceptions:
    def test_base_exception_to_dict(self):
        exc = BaseAppException('boom', code='BOOM', details={'x': 1})

        assert exc.to_dict() == {
            'error': 'BOOM',
            'message': 'boom',
            'details': {'x': 1},
        }

    def test_specialized_exceptions_build_expected_payload(self):
        task_exc = TaskNotFoundError(42)
        fields_exc = InvalidFieldsError(['name', 'age'])
        datasource_exc = DataSourceConnectionError('postgresql', 'timeout')

        assert task_exc.to_dict()['details'] == {'task_id': 42}
        assert fields_exc.to_dict()['details'] == {'invalid_fields': ['name', 'age']}
        assert datasource_exc.to_dict()['details'] == {
            'source_type': 'postgresql',
            'error': 'timeout',
        }
        assert str(BaseAppException('generic')) == 'generic'
