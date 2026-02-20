"""Tests for admin endpoints: auth, PIN verification, stats."""

import os
import json
from unittest.mock import patch


class TestAdminAuth:
    """Test admin authentication via X-Admin-Key header."""

    def test_stats_without_key_returns_401(self, client_app):
        """Admin stats without API key should be rejected."""
        response = client_app.get("/admin/stats")
        assert response.status_code == 401
        assert "Invalid or missing admin key" in response.json()["detail"]

    def test_stats_with_wrong_key_returns_401(self, client_app):
        """Admin stats with wrong API key should be rejected."""
        response = client_app.get(
            "/admin/stats",
            headers={"X-Admin-Key": "wrong-key"}
        )
        assert response.status_code == 401

    def test_stats_with_correct_key(self, client_app):
        """Admin stats with correct API key should succeed."""
        response = client_app.get(
            "/admin/stats",
            headers={"X-Admin-Key": "test-admin-key-abc123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "gaps" in data
        assert "feedback" in data
        assert "doc_usage" in data
        assert isinstance(data["gaps"], list)
        assert isinstance(data["feedback"], list)
        assert isinstance(data["doc_usage"], list)

    def test_download_db_without_key_returns_401(self, client_app):
        """DB download without API key should be rejected."""
        response = client_app.get("/admin/download_db")
        assert response.status_code == 401

    def test_stats_when_no_admin_key_configured(self, client_app):
        """When ADMIN_API_KEY is empty, endpoints should be accessible (dev mode)."""
        import app.routers.admin as admin_mod
        original = admin_mod.ADMIN_API_KEY
        admin_mod.ADMIN_API_KEY = ""
        try:
            response = client_app.get("/admin/stats")
            assert response.status_code == 200
        finally:
            admin_mod.ADMIN_API_KEY = original


class TestPinVerification:
    """Test server-side PIN verification."""

    def test_correct_pin(self, client_app):
        """Correct PIN returns authenticated=True and admin_key."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": "test-pin-9876"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["admin_key"] == "test-admin-key-abc123"

    def test_incorrect_pin(self, client_app):
        """Incorrect PIN returns 401."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": "wrong-pin"}
        )
        assert response.status_code == 401
        assert "Incorrect PIN" in response.json()["detail"]

    def test_empty_pin(self, client_app):
        """Empty PIN returns 401."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": ""}
        )
        assert response.status_code == 401

    def test_missing_pin_field(self, client_app):
        """Missing pin field returns 401."""
        response = client_app.post(
            "/admin/verify-pin",
            json={}
        )
        assert response.status_code == 401

    def test_pin_not_configured_returns_503(self, client_app):
        """When ADMIN_PIN env is empty, returns 503."""
        with patch.dict(os.environ, {"ADMIN_PIN": ""}, clear=False):
            response = client_app.post(
                "/admin/verify-pin",
                json={"pin": "anything"}
            )
            assert response.status_code == 503
            assert "not configured" in response.json()["detail"]


class TestAdminStatsContent:
    """Test that admin stats correctly reads log files."""

    def test_stats_with_log_data(self, client_app, test_env):
        """Stats should return data from log files."""
        gap_data = [{"timestamp": "2026-01-01", "question": "test q", "score": 0.1, "type": "Gap"}]
        feedback_data = [{"timestamp": "2026-01-01", "rating": 5, "question": "test", "reason": "great"}]
        doc_data = [{"timestamp": "2026-01-01", "document": "Test Doc"}]

        with open(test_env["GAP_LOG_FILE"], "w") as f:
            json.dump(gap_data, f)
        with open(test_env["FEEDBACK_LOG_FILE"], "w") as f:
            json.dump(feedback_data, f)
        with open(test_env["DOC_USAGE_LOG_FILE"], "w") as f:
            json.dump(doc_data, f)

        # Reload log file paths in admin module
        import app.routers.admin as admin_mod
        admin_mod.GAP_LOG_FILE = test_env["GAP_LOG_FILE"]
        admin_mod.FEEDBACK_LOG_FILE = test_env["FEEDBACK_LOG_FILE"]
        admin_mod.DOC_USAGE_LOG_FILE = test_env["DOC_USAGE_LOG_FILE"]

        response = client_app.get(
            "/admin/stats",
            headers={"X-Admin-Key": "test-admin-key-abc123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["gaps"]) == 1
        assert data["gaps"][0]["question"] == "test q"
        assert len(data["feedback"]) == 1
        assert data["feedback"][0]["rating"] == 5
        assert len(data["doc_usage"]) == 1
        assert data["doc_usage"][0]["document"] == "Test Doc"

    def test_stats_with_corrupt_log_file(self, client_app, test_env):
        """Stats should handle corrupt JSON log files gracefully."""
        import app.routers.admin as admin_mod
        admin_mod.GAP_LOG_FILE = test_env["GAP_LOG_FILE"]

        with open(test_env["GAP_LOG_FILE"], "w") as f:
            f.write("this is not json{{{")

        response = client_app.get(
            "/admin/stats",
            headers={"X-Admin-Key": "test-admin-key-abc123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["gaps"] == []
