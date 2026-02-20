"""RED ZONE: CORS configuration tests.

Verifies that the CORS middleware correctly allows/blocks origins
based on env var configuration and default regex patterns.
"""

import os
from unittest.mock import patch


class TestCORSDefaultBehavior:
    """Test CORS headers on actual GET/POST requests via Origin header."""

    def test_localhost_origin_gets_cors_header(self, client_app):
        """Requests from localhost should get CORS allow-origin in response."""
        response = client_app.get(
            "/health",
            headers={"Origin": "http://localhost:3000"},
        )
        assert response.status_code == 200
        allow_origin = response.headers.get("access-control-allow-origin")
        assert allow_origin is not None

    def test_cors_credentials_allowed(self, client_app):
        """CORS should allow credentials."""
        response = client_app.get(
            "/health",
            headers={"Origin": "http://localhost:3000"},
        )
        assert response.headers.get("access-control-allow-credentials") == "true"

    def test_admin_key_in_preflight_headers(self, client_app):
        """X-Admin-Key must be in the allowed CORS headers for preflight."""
        response = client_app.options(
            "/admin/stats",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Admin-Key",
            },
        )
        allowed_headers = response.headers.get("access-control-allow-headers", "")
        assert "x-admin-key" in allowed_headers.lower()

    def test_allowed_methods_in_preflight(self, client_app):
        """Preflight should advertise GET and POST methods."""
        response = client_app.options(
            "/chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "GET" in allowed_methods
        assert "POST" in allowed_methods

    def test_delete_method_not_in_allowed(self, client_app):
        """DELETE should not be in allowed methods."""
        response = client_app.options(
            "/chat",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        allowed_methods = response.headers.get("access-control-allow-methods", "")
        assert "DELETE" not in allowed_methods
