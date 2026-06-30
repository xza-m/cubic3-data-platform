"""
query_export_job 行级脱敏接线测试

覆盖：
1. _resolve_mask_columns：source_id + SQL 物理表名 → Dataset → 敏感 DatasetField
   构造 {导出列名: mask_rule}（含列名大小写对齐、非敏感列不入选）。
2. 边界：表名解析不到 / 无匹配 Dataset / 字段无 mask_rule → 空 dict（不崩）。
3. job 端到端：writer 真收到 mask_columns 且写出的 CSV 中敏感列被遮蔽、非敏感列原样。
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.shared.enums import (
    MaskRule,
    QueryExportStatus,
    SensitivityLevel,
)


# ----------------------------------------------------------------------
# 测试桩
# ----------------------------------------------------------------------


def _make_field(physical_name, sensitivity_level, mask_rule):
    """构造一个最小 DatasetField stub（仅用到 is_sensitive/mask_rule/physical_name）。"""
    field = SimpleNamespace(
        physical_name=physical_name,
        sensitivity_level=sensitivity_level,
        mask_rule=mask_rule,
    )
    # 复用真实 is_sensitive 逻辑，避免重复实现敏感度口径
    field.is_sensitive = lambda: DatasetField.is_sensitive(field)
    return field


class _FakeSession:
    """按查询实体类型分流的 fake session。

    - query(Dataset) -> .filter(...).all() 返回 datasets
    - query(DatasetField) -> .filter(...).all() 返回 fields
    """

    def __init__(self, *, datasets=None, fields=None):
        self._datasets = datasets or []
        self._fields = fields or []

    def query(self, entity):
        if entity is Dataset:
            return _FakeQuery(self._datasets)
        if entity is DatasetField:
            return _FakeQuery(self._fields)
        return _FakeQuery([])


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._result


class _FakeExport:
    def __init__(self, *, source_id=10, sql_query="SELECT id, mobile FROM students"):
        self.id = 1
        self.source_id = source_id
        self.sql_query = sql_query


# ----------------------------------------------------------------------
# _resolve_mask_columns 单测
# ----------------------------------------------------------------------


def test_resolve_mask_columns_maps_sensitive_fields():
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT student_name, mobile, score FROM students",
    )
    dataset = SimpleNamespace(id=100, physical_table='students')
    fields = [
        _make_field('student_name', SensitivityLevel.PII.value, MaskRule.NAME.value),
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
        # 非敏感列：不应入选
        _make_field('score', SensitivityLevel.PUBLIC.value, None),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(
        session,
        export,
        ['student_name', 'mobile', 'score'],
        export_id=1,
    )

    assert mask_columns == {
        'student_name': MaskRule.NAME.value,
        'mobile': MaskRule.MOBILE.value,
    }
    assert 'score' not in mask_columns


def test_resolve_mask_columns_case_insensitive_alignment():
    """导出列名与 physical_name 大小写不一致时仍能对齐，key 用导出实际列名。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT Mobile FROM Students",
    )
    dataset = SimpleNamespace(id=100, physical_table='Students')
    fields = [
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    # 导出结果列名是 'Mobile'（首字母大写）
    mask_columns = _resolve_mask_columns(session, export, ['Mobile'], export_id=1)

    assert mask_columns == {'Mobile': MaskRule.MOBILE.value}


def test_resolve_mask_columns_strips_schema_prefix():
    """SQL 用 db.table 形式时，按末段表名与 Dataset.physical_table 对齐。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT mobile FROM analytics.students",
    )
    dataset = SimpleNamespace(id=100, physical_table='students')
    fields = [
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(session, export, ['mobile'], export_id=1)

    assert mask_columns == {'mobile': MaskRule.MOBILE.value}


def test_resolve_mask_columns_no_dataset_match_returns_empty():
    """free-SQL / 无匹配 Dataset → 空 dict，不崩。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT mobile FROM students",
    )
    session = _FakeSession(datasets=[], fields=[])

    mask_columns = _resolve_mask_columns(session, export, ['mobile'], export_id=1)

    assert mask_columns == {}


def test_resolve_mask_columns_no_tables_returns_empty():
    """SQL 解析不出表名（如纯字面量查询）→ 空 dict。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT 1")
    session = _FakeSession(datasets=[SimpleNamespace(id=1, physical_table='x')])

    mask_columns = _resolve_mask_columns(session, export, ['value'], export_id=1)

    assert mask_columns == {}


def test_resolve_mask_columns_field_without_mask_rule_skipped():
    """敏感但无 mask_rule 的字段不入选（无规则无法脱敏）。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT secret_col FROM students",
    )
    dataset = SimpleNamespace(id=100, physical_table='students')
    fields = [
        _make_field('secret_col', SensitivityLevel.SECRET.value, None),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(session, export, ['secret_col'], export_id=1)

    assert mask_columns == {}


def test_resolve_mask_columns_handles_missing_source_or_sql():
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    no_source = _FakeExport(source_id=None, sql_query="SELECT mobile FROM students")
    no_sql = _FakeExport(source_id=10, sql_query="")
    session = _FakeSession()

    assert _resolve_mask_columns(session, no_source, ['mobile'], export_id=1) == {}
    assert _resolve_mask_columns(session, no_sql, ['mobile'], export_id=1) == {}


# ----------------------------------------------------------------------
# job 端到端：CSV 中敏感列被遮蔽
# ----------------------------------------------------------------------


class _JobExport:
    """job 端到端用的 export stub（带状态机 + 脱敏映射所需字段）。"""

    def __init__(self):
        self.id = 1
        self.user_id = 'u1'
        self.source_id = 10
        self.sql_query = "SELECT student_name, mobile, score FROM students"
        self.status = QueryExportStatus.PENDING.value
        self.job_id = 'rq-1'
        self.file_object_key = None
        self.mark_success_calls = []

    def start(self):
        self.status = QueryExportStatus.RUNNING.value

    def mark_success(self, **kwargs):
        self.mark_success_calls.append(kwargs)
        self.status = QueryExportStatus.SUCCESS.value
        self.row_count = kwargs.get('row_count')
        self.file_size_bytes = kwargs.get('file_size_bytes')
        self.file_url = kwargs.get('file_url')
        self.file_storage = kwargs.get('file_storage')
        self.file_object_key = kwargs.get('file_object_key')


@patch('app.infrastructure.tasks.jobs.query_export_job.FileDeliveryService')
@patch('app.infrastructure.tasks.jobs.query_export_job.AdapterFactory')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_db_session')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_current_job')
def test_export_job_masks_sensitive_columns_in_csv(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
    tmp_path,
):
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _JobExport()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})
    dataset = SimpleNamespace(id=100, physical_table='students')
    fields = [
        _make_field('student_name', SensitivityLevel.PII.value, MaskRule.NAME.value),
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
        _make_field('score', SensitivityLevel.PUBLIC.value, None),
    ]

    session = MagicMock()

    # query(QueryExport/DataSource) 走 .filter_by(...).first()
    session.query.return_value.filter_by.return_value.first.side_effect = [
        export,
        datasource,
    ]

    # query(Dataset/DatasetField) 走 .filter(...).all()，按实体分流
    real_query = session.query

    def _query_dispatch(entity):
        if entity is Dataset:
            return _FakeQuery([dataset])
        if entity is DatasetField:
            return _FakeQuery(fields)
        return real_query.return_value

    session.query.side_effect = _query_dispatch
    mock_get_session.return_value = session

    adapter = MagicMock()
    adapter.execute_query_stream.return_value = iter([
        {
            'columns': [{'name': 'student_name'}, {'name': 'mobile'}, {'name': 'score'}],
            'rows': [
                ['张三丰', '13800001111', 95],
                ['李四', '13900002222', 88],
            ],
        },
    ])
    mock_adapter_factory.create_adapter.return_value = adapter

    out_path = tmp_path / 'export_1.csv'
    file_service_instance = MagicMock()
    file_service_instance.upload_local_file.return_value = {
        'method': 'local',
        'file_path': str(out_path),
        'object_name': 'query_exports/x/export_1.csv',
        'file_size_bytes': 100,
    }
    mock_file_service.return_value = file_service_instance

    with patch(
        'app.infrastructure.tasks.jobs.query_export_job._get_output_dir',
        return_value=str(tmp_path),
    ):
        result = execute_query_export_job(export_id=1)

    assert result['status'] == 'success'
    assert result['row_count'] == 2

    content = (tmp_path / 'export_1.csv').read_text(encoding='utf-8')

    # 敏感列被遮蔽：姓名 张** / 李**，手机号 138****1111 / 139****2222
    assert '张三丰' not in content
    assert '李四' not in content
    assert '13800001111' not in content
    assert '13900002222' not in content
    assert '张**' in content
    assert '李**' in content
    assert '138****1111' in content
    assert '139****2222' in content

    # 非敏感列原样
    assert '95' in content
    assert '88' in content


@patch('app.infrastructure.tasks.jobs.query_export_job.FileDeliveryService')
@patch('app.infrastructure.tasks.jobs.query_export_job.AdapterFactory')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_db_session')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_current_job')
def test_export_job_free_sql_no_dataset_keeps_values_raw(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
    tmp_path,
):
    """无匹配 Dataset（free-SQL）→ 不脱敏、不崩，敏感样式值原样写出。"""
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _JobExport()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})

    session = MagicMock()
    session.query.return_value.filter_by.return_value.first.side_effect = [
        export,
        datasource,
    ]

    real_query = session.query

    def _query_dispatch(entity):
        # 无任何 Dataset 匹配
        if entity is Dataset:
            return _FakeQuery([])
        if entity is DatasetField:
            return _FakeQuery([])
        return real_query.return_value

    session.query.side_effect = _query_dispatch
    mock_get_session.return_value = session

    adapter = MagicMock()
    adapter.execute_query_stream.return_value = iter([
        {
            'columns': [{'name': 'student_name'}, {'name': 'mobile'}],
            'rows': [['张三丰', '13800001111']],
        },
    ])
    mock_adapter_factory.create_adapter.return_value = adapter

    out_path = tmp_path / 'export_1.csv'
    file_service_instance = MagicMock()
    file_service_instance.upload_local_file.return_value = {
        'method': 'local',
        'file_path': str(out_path),
        'object_name': 'query_exports/x/export_1.csv',
        'file_size_bytes': 100,
    }
    mock_file_service.return_value = file_service_instance

    with patch(
        'app.infrastructure.tasks.jobs.query_export_job._get_output_dir',
        return_value=str(tmp_path),
    ):
        result = execute_query_export_job(export_id=1)

    assert result['status'] == 'success'

    content = (tmp_path / 'export_1.csv').read_text(encoding='utf-8')
    # free-SQL：原样，不脱敏
    assert '张三丰' in content
    assert '13800001111' in content
