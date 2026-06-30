"""
query_export_job 行级脱敏接线测试

现实约束：当前平台不走 dataset 工作流（datasets / dataset_fields 实际 0 行，
数据走 cube/语义层 + 裸 SQL），所以脱敏的主来源是 FieldIdentifier 现场分类，
Dataset 桥仅作权威叠加。测试据此分三组：

A. FieldIdentifier 主来源（0 datasets 真实场景）：按导出列名现场识别敏感列，
   只遮 PII/机密/绝密，INTERNAL（金额类）不动。
B. Dataset 桥权威叠加：存在 dataset 时以 DatasetField.mask_rule 为权威覆盖。
C. job 端到端：writer 真收到 mask_columns 且写出的 CSV 中敏感列被遮蔽、非敏感列原样。
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


# ======================================================================
# A. FieldIdentifier 主来源（0 datasets 真实场景）
# ======================================================================


def test_identifier_masks_pii_columns_without_any_dataset():
    """MVP 真实场景：无任何 dataset，FieldIdentifier 现场分类 PII 列。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT student_name, mobile, id_card, score, class_name FROM students",
    )
    # 关键：datasets / fields 全空（与生产一致）
    session = _FakeSession(datasets=[], fields=[])

    mask_columns = _resolve_mask_columns(
        session,
        export,
        ['student_name', 'mobile', 'id_card', 'score', 'class_name'],
        export_id=1,
    )

    # PII 列被识别并给出正确规则
    assert mask_columns['student_name'] == 'name'
    assert mask_columns['mobile'] == 'mobile'
    assert mask_columns['id_card'] == 'id_card'
    # 非敏感列不入选
    assert 'score' not in mask_columns
    assert 'class_name' not in mask_columns


def test_identifier_does_not_mask_internal_amount_columns():
    """死守边界：INTERNAL（金额类 salary/revenue）不脱敏，即便 FieldIdentifier 标其 is_sensitive。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT salary, revenue, total_count FROM payroll",
    )
    session = _FakeSession(datasets=[], fields=[])

    mask_columns = _resolve_mask_columns(
        session,
        export,
        ['salary', 'revenue', 'total_count'],
        export_id=1,
    )

    # INTERNAL 不动：金额列不被遮蔽
    assert mask_columns == {}


def test_identifier_masks_email_and_full_mask_columns():
    """email → email 规则；学号/账号等 → full_mask；均在 _apply_mask 覆盖范围内。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT email, student_id, address FROM students",
    )
    session = _FakeSession(datasets=[], fields=[])

    mask_columns = _resolve_mask_columns(
        session,
        export,
        ['email', 'student_id', 'address'],
        export_id=1,
    )

    assert mask_columns['email'] == 'email'
    assert mask_columns['student_id'] == 'full_mask'
    assert mask_columns['address'] == 'full_mask'


def test_identifier_no_sensitive_columns_returns_empty():
    """全为非敏感列 → 空 dict，不脱敏。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT score, class_name FROM t")
    session = _FakeSession(datasets=[], fields=[])

    assert _resolve_mask_columns(session, export, ['score', 'class_name'], export_id=1) == {}


def test_identifier_works_even_without_source_or_sql():
    """脱敏主来源是列名分类，不依赖 source_id/sql；缺 source/sql 时 Dataset 桥跳过但
    FieldIdentifier 仍生效。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    no_source = _FakeExport(source_id=None, sql_query="")
    session = _FakeSession()

    mask_columns = _resolve_mask_columns(session, no_source, ['mobile', 'score'], export_id=1)
    # 列名分类不依赖 source/sql
    assert mask_columns == {'mobile': 'mobile'}


# ======================================================================
# B. Dataset 桥权威叠加
# ======================================================================


def test_dataset_bridge_overrides_identifier_rule():
    """同列两者都命中时，Dataset 的 mask_rule 权威覆盖 FieldIdentifier 的。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(
        source_id=10,
        sql_query="SELECT mobile FROM students",
    )
    dataset = SimpleNamespace(id=100, physical_table='students')
    # 数据集把 mobile 字段配置成 full_mask（比 identifier 的 mobile 更严）
    fields = [
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.FULL_MASK.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(session, export, ['mobile'], export_id=1)

    # Dataset 权威：full_mask 覆盖 identifier 的 mobile
    assert mask_columns == {'mobile': MaskRule.FULL_MASK.value}


def test_dataset_bridge_case_insensitive_alignment():
    """导出列名与 physical_name 大小写不一致时仍能对齐，key 用导出实际列名。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT Mobile FROM Students")
    dataset = SimpleNamespace(id=100, physical_table='Students')
    fields = [
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(session, export, ['Mobile'], export_id=1)

    assert mask_columns == {'Mobile': MaskRule.MOBILE.value}


def test_dataset_bridge_strips_schema_prefix():
    """SQL 用 db.table 形式时，按末段表名与 Dataset.physical_table 对齐。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT mobile FROM analytics.students")
    dataset = SimpleNamespace(id=100, physical_table='students')
    fields = [
        _make_field('mobile', SensitivityLevel.PII.value, MaskRule.MOBILE.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    mask_columns = _resolve_mask_columns(session, export, ['mobile'], export_id=1)

    assert mask_columns == {'mobile': MaskRule.MOBILE.value}


def test_dataset_bridge_internal_field_not_masked():
    """Dataset 桥同样只遮 PII/机密/绝密：DatasetField.is_sensitive 不含 internal。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT bonus FROM payroll")
    dataset = SimpleNamespace(id=100, physical_table='payroll')
    # internal 字段（amount 规则），DatasetField.is_sensitive 返回 False → 不遮
    fields = [
        _make_field('bonus', SensitivityLevel.INTERNAL.value, MaskRule.AMOUNT.value),
    ]
    session = _FakeSession(datasets=[dataset], fields=fields)

    # bonus 列名不触发 FieldIdentifier PII，且 Dataset 桥 internal 不入选
    mask_columns = _resolve_mask_columns(session, export, ['bonus'], export_id=1)

    assert mask_columns == {}


def test_resolution_failure_degrades_to_no_masking():
    """解析异常时降级为不脱敏不崩。"""
    from app.infrastructure.tasks.jobs.query_export_job import _resolve_mask_columns

    export = _FakeExport(source_id=10, sql_query="SELECT mobile FROM students")

    broken_session = MagicMock()
    broken_session.query.side_effect = RuntimeError("db down")

    # 即使 Dataset 桥查询炸了，FieldIdentifier 主来源仍能产出（异常被各自吞掉）
    mask_columns = _resolve_mask_columns(broken_session, export, ['mobile'], export_id=1)
    # mobile 由 FieldIdentifier 识别，dataset 桥失败不影响主来源
    assert mask_columns == {'mobile': 'mobile'}


# ======================================================================
# C. job 端到端：CSV 中敏感列被遮蔽
# ======================================================================


class _JobExport:
    """job 端到端用的 export stub（带状态机 + 脱敏映射所需字段）。"""

    def __init__(self, sql_query="SELECT student_name, mobile, score FROM students"):
        self.id = 1
        self.user_id = 'u1'
        self.source_id = 10
        self.sql_query = sql_query
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
def test_export_job_masks_sensitive_columns_via_identifier(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
    tmp_path,
):
    """0 datasets 真实场景：FieldIdentifier 分类 → CSV 敏感列被遮蔽。"""
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _JobExport()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})

    session = MagicMock()
    # query(QueryExport/DataSource) 走 .filter_by(...).first()
    session.query.return_value.filter_by.return_value.first.side_effect = [export, datasource]

    real_query = session.query

    def _query_dispatch(entity):
        # 无任何 dataset / field（与生产一致）
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
def test_export_job_non_sensitive_columns_keep_raw(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
    tmp_path,
):
    """全非敏感列 → 不脱敏、不崩，值原样写出。"""
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _JobExport(sql_query="SELECT class_name, score FROM grades")
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})

    session = MagicMock()
    session.query.return_value.filter_by.return_value.first.side_effect = [export, datasource]

    real_query = session.query

    def _query_dispatch(entity):
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
            'columns': [{'name': 'class_name'}, {'name': 'score'}],
            'rows': [['三年二班', 95]],
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
    assert '三年二班' in content
    assert '95' in content
