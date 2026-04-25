"""
分块 CSV 写入器

- 流式追加 chunk，避免 1M 行一次性驻留内存
- running total：行数 / 字节数
- 行数 / 字节数 超限抛异常
- 可选 column-level mask（传入 {column_name: mask_rule}，由 job 层决定是否启用）
- abort / commit：异常时清理未完成文件
"""
from __future__ import annotations

import csv
import os
import re
import tempfile
from typing import Any, Dict, Iterable, List, Optional


UTF8_BOM = "\ufeff"


class ExportLimitExceeded(RuntimeError):
    """行数 / 字节数超限"""


class ChunkedCsvWriter:
    """分块 CSV 写入器，写入到一个临时本地文件。"""

    def __init__(
        self,
        *,
        columns: List[str],
        output_path: Optional[str] = None,
        max_rows: int = 1_000_000,
        max_bytes: int = 2 * 1024 * 1024 * 1024,
        mask_columns: Optional[Dict[str, str]] = None,
        tmp_dir: Optional[str] = None,
    ):
        if not columns:
            raise ValueError("columns must be a non-empty list")
        self.columns = list(columns)
        self.max_rows = max_rows
        self.max_bytes = max_bytes
        self.mask_columns = mask_columns or {}
        self._row_count = 0
        self._byte_count = 0
        self._closed = False

        if output_path is None:
            prefix = 'query_export_'
            fd, output_path = tempfile.mkstemp(
                prefix=prefix,
                suffix='.csv',
                dir=tmp_dir,
            )
            os.close(fd)
        self.output_path = output_path

        # 用 text mode 即可，csv 模块内部会处理换行
        self._file = open(self.output_path, 'w', encoding='utf-8', newline='')
        self._file.write(UTF8_BOM)
        self._writer = csv.writer(self._file, quoting=csv.QUOTE_MINIMAL)
        self._writer.writerow(self.columns)
        self._file.flush()
        self._byte_count = os.path.getsize(self.output_path)

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def write_rows(self, rows: Iterable[Any]) -> int:
        """写入一批行（list[list] 或 list[dict]），返回这一批的写入条数。"""
        if self._closed:
            raise RuntimeError("writer already closed")

        batch_count = 0
        for row in rows:
            values = self._row_to_values(row)
            if self.mask_columns:
                values = [
                    _apply_mask(values[i], self.mask_columns.get(col))
                    for i, col in enumerate(self.columns)
                ]
            self._writer.writerow(values)
            self._row_count += 1
            batch_count += 1
            if self._row_count > self.max_rows:
                raise ExportLimitExceeded(
                    f"row count exceeded limit {self.max_rows}"
                )

        # flush so that size tracking is reliable
        self._file.flush()
        self._byte_count = os.path.getsize(self.output_path)
        if self._byte_count > self.max_bytes:
            raise ExportLimitExceeded(
                f"file size exceeded limit {self.max_bytes} bytes"
            )
        return batch_count

    def _row_to_values(self, row: Any) -> List[Any]:
        if isinstance(row, dict):
            return [row.get(col) for col in self.columns]
        if isinstance(row, (list, tuple)):
            # pad to columns length so csv writer gets fixed width
            padded = list(row) + [None] * max(0, len(self.columns) - len(row))
            return padded[: len(self.columns)]
        raise TypeError(f"unsupported row type: {type(row)!r}")

    # ------------------------------------------------------------------
    # 生命周期
    # ------------------------------------------------------------------

    @property
    def row_count(self) -> int:
        return self._row_count

    @property
    def byte_count(self) -> int:
        return self._byte_count

    def close(self) -> None:
        """正常关闭：刷盘，保留文件。"""
        if self._closed:
            return
        try:
            self._file.flush()
            self._file.close()
        finally:
            self._closed = True
        if os.path.exists(self.output_path):
            self._byte_count = os.path.getsize(self.output_path)

    def abort(self) -> None:
        """异常 / 取消：关闭并删除文件。"""
        try:
            self._file.close()
        except Exception:  # pragma: no cover
            pass
        self._closed = True
        if os.path.exists(self.output_path):
            try:
                os.remove(self.output_path)
            except OSError:  # pragma: no cover
                pass


# ----------------------------------------------------------------------
# Mask utilities
# ----------------------------------------------------------------------

_MOBILE_RE = re.compile(r'^(\d{3})(\d{4})(\d{4})$')
_ID_CARD_RE = re.compile(r'^(\d{6})(\d{8})(\w{4})$')
_EMAIL_RE = re.compile(r'^([^@]{1,3})[^@]*(@.*)$')


def _apply_mask(value: Any, mask_rule: Optional[str]) -> Any:
    """根据 mask_rule 对 value 做行级脱敏；未知规则直接原样返回。"""
    if value is None or not mask_rule:
        return value

    text = str(value)
    if mask_rule == 'mobile':
        match = _MOBILE_RE.match(text)
        return f"{match.group(1)}****{match.group(3)}" if match else text
    if mask_rule == 'id_card':
        match = _ID_CARD_RE.match(text)
        return f"{match.group(1)}********{match.group(3)}" if match else text
    if mask_rule == 'email':
        match = _EMAIL_RE.match(text)
        return f"{match.group(1)}***{match.group(2)}" if match else text
    if mask_rule == 'name':
        return f"{text[:1]}**" if text else text
    if mask_rule == 'amount':
        return '***'
    if mask_rule == 'full_mask':
        return '***'
    return value
