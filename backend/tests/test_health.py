"""Tests for health and root endpoints."""


def test_root_endpoint(client_app):
    """Root endpoint returns status and version."""
    response = client_app.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "Active"
    assert data["version"] == "2.0.0"
    assert "Izana" in data["message"]


def test_health_endpoint(client_app):
    """Health check endpoint returns healthy status."""
    response = client_app.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_nonexistent_endpoint(client_app):
    """Non-existent endpoint returns 404."""
    response = client_app.get("/nonexistent")
    assert response.status_code in (404, 405)
