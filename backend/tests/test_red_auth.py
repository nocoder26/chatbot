"""RED ZONE: Authentication and API key generation tests.

Verifies admin key generation, PIN verification edge cases,
and auth bypass resistance.
"""

import os
import hashlib
from unittest.mock import patch


class TestAdminKeyGeneration:
    """Test the auto-generated admin API key from PIN hash."""

    def test_generated_key_is_32_chars(self):
        """Generated key should always be exactly 32 characters."""
        import importlib
        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "2603"}, clear=False):
            import app.routers.admin as admin_mod
            importlib.reload(admin_mod)
            assert len(admin_mod.ADMIN_API_KEY) == 32

    def test_generated_key_is_deterministic(self):
        """Same PIN should always produce the same key."""
        import importlib
        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "1234"}, clear=False):
            import app.routers.admin as admin_mod
            importlib.reload(admin_mod)
            key1 = admin_mod.ADMIN_API_KEY

        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "1234"}, clear=False):
            importlib.reload(admin_mod)
            key2 = admin_mod.ADMIN_API_KEY

        assert key1 == key2

    def test_different_pins_produce_different_keys(self):
        """Different PINs must produce different keys."""
        import importlib
        import app.routers.admin as admin_mod

        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "1111"}, clear=False):
            importlib.reload(admin_mod)
            key1 = admin_mod.ADMIN_API_KEY

        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "9999"}, clear=False):
            importlib.reload(admin_mod)
            key2 = admin_mod.ADMIN_API_KEY

        assert key1 != key2

    def test_explicit_api_key_overrides_generation(self):
        """ADMIN_API_KEY env var should override hash-based generation."""
        import importlib
        import app.routers.admin as admin_mod
        with patch.dict(os.environ, {"ADMIN_API_KEY": "my-custom-key-abc"}, clear=False):
            importlib.reload(admin_mod)
            assert admin_mod.ADMIN_API_KEY == "my-custom-key-abc"

    def test_generated_key_is_hex_only(self):
        """Generated key should contain only hexadecimal characters."""
        import importlib
        with patch.dict(os.environ, {"ADMIN_API_KEY": "", "ADMIN_PIN": "2603"}, clear=False):
            import app.routers.admin as admin_mod
            importlib.reload(admin_mod)
            assert all(c in "0123456789abcdef" for c in admin_mod.ADMIN_API_KEY)


class TestPinEdgeCases:
    """Edge cases for PIN verification."""

    def test_pin_as_string_comparison(self, client_app):
        """PIN should work as exact string comparison."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": "test-pin-9876"}
        )
        assert response.status_code == 200

    def test_pin_with_leading_zeros(self, client_app):
        """PIN with extra characters should NOT match."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": "0test-pin-9876"}
        )
        assert response.status_code == 401

    def test_pin_with_whitespace(self, client_app):
        """PIN with whitespace should NOT match."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": " test-pin-9876 "}
        )
        assert response.status_code == 401

    def test_very_long_pin_rejected(self, client_app):
        """Very long PIN should be rejected (no DoS via comparison)."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": "x" * 10000}
        )
        assert response.status_code == 401

    def test_null_pin_rejected(self, client_app):
        """Null pin value should be rejected."""
        response = client_app.post(
            "/admin/verify-pin",
            json={"pin": None}
        )
        assert response.status_code == 401
