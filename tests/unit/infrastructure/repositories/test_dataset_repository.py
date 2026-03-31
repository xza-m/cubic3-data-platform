"""
数据集仓储测试
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.infrastructure.repositories.dataset_repository import DatasetRepository


def _make_repo():
    session = MagicMock(spec=Session)
    return DatasetRepository(session=session), session


def _make_dataset(**overrides):
    payload = {
        "id": 1,
        "dataset_code": "orders",
        "dataset_name": "订单",
        "source_id": 1,
        "physical_table": "dw.orders",
        "created_by": "alice",
    }
    payload.update(overrides)
    return Dataset(**payload)


def test_save_and_find_methods_delegate_to_session():
    repo, session = _make_repo()
    dataset = _make_dataset()
    session.query.return_value.filter_by.return_value.first.return_value = dataset

    assert repo.save(dataset) is dataset
    session.add.assert_called_once_with(dataset)
    session.flush.assert_called_once()
    assert repo.find_by_id(1) is dataset
    assert repo.find_by_code("orders") is dataset


def test_delete_covers_found_and_not_found():
    repo, session = _make_repo()
    dataset = _make_dataset()
    repo.find_by_id = MagicMock(side_effect=[dataset, None])

    assert repo.delete(1) is True
    assert dataset.is_deleted is True
    assert session.flush.call_count == 1

    assert repo.delete(2) is False
    assert session.flush.call_count == 1


def test_save_field_batch_and_delete_fields():
    repo, session = _make_repo()
    field = DatasetField(physical_name="order_id", data_type="bigint")
    fields = [
        DatasetField(physical_name="order_id", data_type="bigint"),
        DatasetField(physical_name="amount", data_type="decimal"),
    ]
    delete_query = MagicMock()
    delete_query.filter.return_value = delete_query
    delete_query.delete.return_value = 2
    session.query.return_value = delete_query

    assert repo.save_field(field) is field
    session.add.assert_called_with(field)

    assert repo.save_fields_batch(fields) == fields
    session.add_all.assert_called_once_with(fields)

    assert repo.delete_fields(1, ["order_id", "amount"]) == 2
    delete_query.delete.assert_called_once_with(synchronize_session=False)


def test_commit_success_failure_and_rollback():
    repo, session = _make_repo()
    repo.commit()
    session.commit.assert_called_once()

    repo, session = _make_repo()
    session.commit.side_effect = RuntimeError("boom")
    with pytest.raises(RuntimeError, match="boom"):
        repo.commit()
    session.rollback.assert_called_once()

    repo.rollback()
    assert session.rollback.call_count == 2
