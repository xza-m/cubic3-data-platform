"""
File Delivery Service 单元测试

Mock FeishuClient、OSS 等依赖
"""
import os
import tempfile
import pytest
from unittest.mock import MagicMock, patch

from app.infrastructure.adapters.file_delivery.file_delivery_service import FileDeliveryService
from app.shared.enums import DeliveryMethod


# ============================================================================
# save_query_result
# ============================================================================


class TestSaveQueryResult:
    def test_save_query_result_csv_success(self, app):
        """成功保存 CSV 结果"""
        app.config["EXTRACTION_RESULT_DIR"] = tempfile.mkdtemp()
        with app.app_context():
            service = FileDeliveryService()
            data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
            columns = ["a", "b"]

            result = service.save_query_result(data, columns, run_id=1, file_format="csv")

            assert "file_path" in result
            assert result["file_path"].endswith(".csv")
            assert result["row_count"] == 2
            assert result["file_size_mb"] > 0
            assert os.path.exists(result["file_path"])

    def test_save_query_result_relative_path(self, app):
        """相对路径转换为绝对路径"""
        app.config["EXTRACTION_RESULT_DIR"] = "instance/extraction_results"
        with app.app_context():
            service = FileDeliveryService()
            data = [{"x": 1}]
            columns = ["x"]

            result = service.save_query_result(data, columns, run_id=99, file_format="csv")

            assert os.path.isabs(result["file_path"])
            assert "extraction_99_" in result["file_path"]


# ============================================================================
# deliver_file
# ============================================================================


class TestDeliverFile:
    def test_deliver_auto_feishu_when_small_and_chat_id(self, app):
        """小文件 + 飞书 chat_id 时自动选择飞书"""
        with app.app_context():
            service = FileDeliveryService()
            with patch.object(service, "deliver_via_feishu") as mock_feishu:
                mock_feishu.return_value = {"method": "feishu_file", "message": "ok"}

                result = service.deliver_file(
                    file_path="/tmp/test.csv",
                    file_size_mb=5.0,
                    subscription_config={"feishu_chat_id": "oc_xxx", "delivery_method": "auto"},
                )

                mock_feishu.assert_called_once()
                assert result["method"] == "feishu_file"

    def test_deliver_auto_oss_when_large(self, app):
        """大文件时自动选择 OSS"""
        with app.app_context():
            service = FileDeliveryService()
            with patch.object(service, "deliver_via_oss") as mock_oss:
                mock_oss.return_value = {"method": "oss", "download_url": "http://..."}

                result = service.deliver_file(
                    file_path="/tmp/large.csv",
                    file_size_mb=25.0,
                    subscription_config={"delivery_method": "auto"},
                )

                mock_oss.assert_called_once()
                assert result["method"] == "oss"

    def test_deliver_auto_local_when_no_feishu(self, app):
        """无飞书配置时自动选择本地"""
        with app.app_context():
            service = FileDeliveryService()
            result = service.deliver_file(
                file_path="/tmp/test.csv",
                file_size_mb=5.0,
                subscription_config={"delivery_method": "auto"},
            )

            assert result["method"] == DeliveryMethod.LOCAL.value
            assert "file_path" in result

    def test_deliver_manual_feishu(self, app):
        """手动指定飞书"""
        with app.app_context():
            service = FileDeliveryService()
            with patch.object(service, "deliver_via_feishu") as mock_feishu:
                mock_feishu.return_value = {"method": "feishu_file"}

                service.deliver_file(
                    file_path="/tmp/test.csv",
                    file_size_mb=1.0,
                    subscription_config={
                        "feishu_chat_id": "oc_xxx",
                        "delivery_method": "feishu_file",
                    },
                )
                mock_feishu.assert_called_once()


# ============================================================================
# deliver_via_feishu
# ============================================================================


class TestDeliverViaFeishu:
    def test_deliver_via_feishu_success(self, app):
        """飞书交付成功"""
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"a,b\n1,2\n")
            tmp_path = f.name
        try:
            with app.app_context():
                service = FileDeliveryService()
                with patch("app.infrastructure.adapters.feishu.client.FeishuClient") as MockClient:
                    mock_client = MockClient.return_value
                    mock_client.upload_file.return_value = "file_key_123"
                    mock_client.send_file_message = MagicMock()
                    mock_client.send_card_message = MagicMock()

                    result = service.deliver_via_feishu(
                        file_path=tmp_path,
                        chat_id="oc_xxx",
                        task_name="数据提取",
                    )

                    assert result["method"] == DeliveryMethod.FEISHU_FILE.value
                    assert result["file_key"] == "file_key_123"
                    assert "message" in result
        finally:
            os.unlink(tmp_path)

    def test_deliver_via_feishu_failure_returns_error(self, app):
        """飞书交付失败时返回错误信息"""
        with app.app_context():
            service = FileDeliveryService()
            with patch("app.infrastructure.adapters.feishu.client.FeishuClient") as MockClient:
                MockClient.side_effect = Exception("Upload failed")

                result = service.deliver_via_feishu(
                    file_path="/tmp/test.csv",
                    chat_id="oc_xxx",
                    task_name="任务",
                )

                assert result["method"] == DeliveryMethod.FEISHU_FILE.value
                assert "error" in result
                assert "Upload failed" in result["error"]


# ============================================================================
# deliver_via_oss
# ============================================================================


class TestDeliverViaOss:
    def test_deliver_via_oss_not_configured_fallback_local(self, app):
        """OSS 未配置时回退到本地"""
        app.config["OSS_ACCESS_KEY_ID"] = None
        with app.app_context():
            service = FileDeliveryService()
            result = service.deliver_via_oss(
                file_path="/tmp/test.csv",
                object_name="extraction/test.csv",
                expiry_hours=24,
            )

            assert result["method"] == DeliveryMethod.LOCAL.value
            assert "OSS未配置" in result["message"]

    def test_deliver_via_oss_success(self, app):
        """OSS 交付成功"""
        app.config["OSS_ACCESS_KEY_ID"] = "key"
        app.config["OSS_ACCESS_KEY_SECRET"] = "secret"
        app.config["OSS_ENDPOINT"] = "oss-cn-hangzhou.aliyuncs.com"
        app.config["OSS_BUCKET_NAME"] = "bucket"
        with app.app_context():
            service = FileDeliveryService()
            mock_oss2 = MagicMock()
            mock_bucket = MagicMock()
            mock_bucket.sign_url.return_value = "https://signed-url.example.com"
            mock_oss2.Auth = MagicMock()
            mock_oss2.Bucket = MagicMock(return_value=mock_bucket)

            with patch.dict("sys.modules", {"oss2": mock_oss2}):
                result = service.deliver_via_oss(
                    file_path="/tmp/test.csv",
                    object_name="extraction/test.csv",
                    expiry_hours=24,
                )

            assert result["method"] == DeliveryMethod.OSS.value
            assert "download_url" in result
            assert "expires_at" in result

    def test_deliver_via_oss_exception_fallback(self, app):
        """OSS 上传异常时回退到本地"""
        app.config["OSS_ACCESS_KEY_ID"] = "key"
        app.config["OSS_ACCESS_KEY_SECRET"] = "secret"
        app.config["OSS_ENDPOINT"] = "ep"
        app.config["OSS_BUCKET_NAME"] = "bucket"
        with app.app_context():
            service = FileDeliveryService()
            mock_oss2 = MagicMock()
            mock_bucket = MagicMock()
            mock_bucket.put_object_from_file.side_effect = Exception("Network error")
            mock_oss2.Auth = MagicMock()
            mock_oss2.Bucket = MagicMock(return_value=mock_bucket)
            with patch.dict("sys.modules", {"oss2": mock_oss2}):
                result = service.deliver_via_oss(
                    file_path="/tmp/test.csv",
                    object_name="extraction/test.csv",
                )

            assert result["method"] == DeliveryMethod.LOCAL.value
            assert "error" in result
            assert "Network error" in result["error"]


# ============================================================================
# send_notification
# ============================================================================


class TestSendNotification:
    def test_send_notification_success(self, app):
        """发送通知成功"""
        with app.app_context():
            service = FileDeliveryService()
            with patch("app.infrastructure.adapters.feishu.client.FeishuClient") as MockClient:
                mock_client = MockClient.return_value
                mock_client.send_card_message = MagicMock()

                service.send_notification(
                    chat_id="oc_xxx",
                    title="标题",
                    content="内容",
                    link="https://example.com",
                )

                mock_client.send_card_message.assert_called_once_with(
                    "oc_xxx", "标题", "内容", "https://example.com"
                )

    def test_send_notification_failure_logs(self, app):
        """通知失败时记录日志但不抛出"""
        with app.app_context():
            service = FileDeliveryService()
            with patch("app.infrastructure.adapters.feishu.client.FeishuClient") as MockClient:
                MockClient.side_effect = Exception("Feishu error")

                # 不应抛出，仅记录日志
                service.send_notification(chat_id="oc_xxx", title="t", content="c")
