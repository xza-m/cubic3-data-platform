"""
权限校验服务测试
"""
from unittest.mock import MagicMock

import pytest

from app.domain.services.permission_checker import PermissionCheckerService
from app.shared.exceptions import AuthorizationError


def _mock_dataset(*, ready: bool = True, fields: list[str] | None = None):
    dataset = MagicMock()
    dataset.dataset_code = "orders"
    dataset.is_ready.return_value = ready
    relation = MagicMock()
    relation.all.return_value = [MagicMock(physical_name=name) for name in (fields or ["id", "city", "amount"])]
    dataset.fields = relation
    return dataset


class TestPermissionCheckerService:
    @pytest.fixture
    def service(self) -> PermissionCheckerService:
        return PermissionCheckerService()

    def test_check_dataset_access_returns_true_for_ready_dataset(self, service: PermissionCheckerService):
        dataset = _mock_dataset(ready=True)
        assert service.check_dataset_access("user-1", dataset) is True

    def test_check_dataset_access_rejects_not_ready_dataset(self, service: PermissionCheckerService):
        dataset = _mock_dataset(ready=False)

        with pytest.raises(AuthorizationError) as exc:
            service.check_dataset_access("user-1", dataset)

        assert exc.value.code == "DATASET_NOT_READY"
        assert "orders" in str(exc.value)

    def test_check_field_access_validates_fields(self, service: PermissionCheckerService):
        dataset = _mock_dataset(fields=["id", "city"])

        assert service.check_field_access("user-1", dataset, ["id"]) is True

        with pytest.raises(AuthorizationError) as exc:
            service.check_field_access("user-1", dataset, ["id", "secret"])

        assert exc.value.code == "FIELD_ACCESS_DENIED"
        assert exc.value.details["invalid_fields"] == ["secret"]

    def test_row_level_filters_and_max_row_limit_use_defaults(self, service: PermissionCheckerService):
        dataset = _mock_dataset()

        assert service.get_row_level_filters("user-1", dataset) == []
        assert service.get_max_row_limit("user-1", dataset) == 500000
