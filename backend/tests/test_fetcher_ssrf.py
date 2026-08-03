"""SSRF guard.

`POST /api/crawl/start` hands a caller-supplied URL to the fetcher. Before
this guard existed, that was a straight path to internal addresses — cloud
metadata at 169.254.169.254 included — with the response readable back
through /api/explore/page/{id}. These tests are the regression fence.
"""
import socket

import pytest

from crawler.fetcher import ALLOWED_SCHEMES, _is_public_ip, is_safe_url


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",  # cloud metadata
        "http://127.0.0.1:8000/admin",
        "http://[::1]/",
        "http://10.0.0.5/",
        "http://172.16.0.1/",
        "http://192.168.1.1/",
        "http://0.0.0.0/",
        "http://255.255.255.255/",
    ],
)
def test_rejects_non_public_addresses(url):
    assert is_safe_url(url) is False


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/",
        "gopher://example.com/",
        "data:text/html,hi",
        "//example.com/",
        "not-a-url",
    ],
)
def test_rejects_unsupported_schemes(url):
    assert is_safe_url(url) is False


def test_allows_public_host(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))]
    )
    assert is_safe_url("https://example.com/page") is True


def test_rejects_host_with_any_private_record(monkeypatch):
    """A hostname resolving to both a public and a private address is unsafe."""
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **k: [
            (2, 1, 6, "", ("93.184.216.34", 443)),
            (2, 1, 6, "", ("127.0.0.1", 443)),
        ],
    )
    assert is_safe_url("https://rebind.example/") is False


def test_rejects_unresolvable_host(monkeypatch):
    def boom(*a, **k):
        raise socket.gaierror("nope")

    monkeypatch.setattr(socket, "getaddrinfo", boom)
    assert is_safe_url("https://does-not-exist.invalid/") is False


def test_is_public_ip_rejects_garbage():
    assert _is_public_ip("not-an-ip") is False


def test_only_http_schemes_allowed():
    assert ALLOWED_SCHEMES == {"http", "https"}
