"""
ChunkedCsvWriter 单元测试
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.infrastructure.tasks.jobs.chunked_csv_writer import (
    ChunkedCsvWriter,
    ExportLimitExceeded,
    _apply_mask,
)


def _read(path: str) -> str:
    with open(path, encoding='utf-8') as f:
        return f.read()


def test_header_and_rows_list_tuple(tmp_path):
    writer = ChunkedCsvWriter(
        columns=['id', 'name'],
        output_path=str(tmp_path / 'out.csv'),
    )
    writer.write_rows([(1, 'alice'), (2, 'bob')])
    writer.close()

    content = _read(writer.output_path)
    # 第一行 UTF-8 BOM + 列头，随后两行数据
    assert content.startswith('\ufeffid,name\r\n') or content.startswith('\ufeffid,name\n')
    assert 'alice' in content and 'bob' in content
    assert writer.row_count == 2


def test_dict_rows(tmp_path):
    writer = ChunkedCsvWriter(
        columns=['id', 'name'],
        output_path=str(tmp_path / 'out.csv'),
    )
    writer.write_rows([{'name': 'alice', 'id': 1}, {'id': 2, 'name': 'bob'}])
    writer.close()

    content = _read(writer.output_path)
    assert ',alice' in content and ',bob' in content


def test_rejects_row_limit(tmp_path):
    writer = ChunkedCsvWriter(
        columns=['id'],
        output_path=str(tmp_path / 'out.csv'),
        max_rows=2,
    )
    with pytest.raises(ExportLimitExceeded):
        writer.write_rows([(1,), (2,), (3,)])


def test_rejects_byte_limit(tmp_path):
    writer = ChunkedCsvWriter(
        columns=['x'],
        output_path=str(tmp_path / 'out.csv'),
        max_bytes=20,
    )
    with pytest.raises(ExportLimitExceeded):
        writer.write_rows([('a' * 100,) for _ in range(5)])


def test_abort_deletes_file(tmp_path):
    path = tmp_path / 'gone.csv'
    writer = ChunkedCsvWriter(columns=['x'], output_path=str(path))
    writer.write_rows([(1,)])
    writer.abort()
    assert not path.exists()


def test_mask_applied_when_mask_columns_present(tmp_path):
    writer = ChunkedCsvWriter(
        columns=['id', 'phone'],
        output_path=str(tmp_path / 'out.csv'),
        mask_columns={'phone': 'mobile'},
    )
    writer.write_rows([(1, '13800001111'), (2, '13500002222')])
    writer.close()
    content = _read(writer.output_path)
    assert '138****1111' in content
    assert '13800001111' not in content


@pytest.mark.parametrize(
    'rule,value,expected',
    [
        ('mobile', '13800001111', '138****1111'),
        ('id_card', '110101199001011234', '110101********1234'),
        ('email', 'john.doe@example.com', 'joh***@example.com'),
        ('name', '张三', '张**'),
        ('amount', 100.5, '***'),
        ('full_mask', 'secret', '***'),
    ],
)
def test_apply_mask_variants(rule, value, expected):
    assert _apply_mask(value, rule) == expected


def test_apply_mask_unknown_rule_is_identity():
    assert _apply_mask('foo', 'unknown-rule') == 'foo'


def test_apply_mask_none_passes_through():
    assert _apply_mask(None, 'mobile') is None
