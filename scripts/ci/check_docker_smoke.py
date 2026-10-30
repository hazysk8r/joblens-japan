#!/usr/bin/env python3
"""Check the Compose frontend and proxied API.

The API check signs up a throwaway user, so run it only against the CI-only database.
"""

import argparse
from http.client import HTTPException
from http.cookiejar import CookieJar
from html.parser import HTMLParser
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


class SmokeFailure(Exception):
    pass


# セッションとCSRFトークンのCookieを、ブラウザと同じようにリクエスト間で引き継ぐ。
COOKIES = CookieJar()
OPENER = build_opener(HTTPCookieProcessor(COOKIES))


def require(condition, message):
    if not condition:
        raise SmokeFailure(message)


class FrontendHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.has_root = False
        self.scripts = []
        self.styles = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.has_root |= attrs.get("id") == "root"
        if tag == "script" and attrs.get("type") == "module" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        if tag == "link" and "stylesheet" in attrs.get("rel", "").split() and attrs.get("href"):
            self.styles.append(attrs["href"])


def fetch(url, expected_status=200, data=None, headers=None):
    content_type, body, _ = fetch_with_headers(url, expected_status, data, headers)
    return content_type, body


def fetch_with_headers(url, expected_status=200, data=None, headers=None):
    path = urlsplit(url).path
    request = Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        response = OPENER.open(request, timeout=10)
    except HTTPError as error:
        response = error
    except (URLError, HTTPException, TimeoutError, OSError) as error:
        raise SmokeFailure(f"{path}: HTTP request failed ({type(error).__name__})") from None
    try:
        with response:
            require(response.status == expected_status,
                    f"{path}: expected HTTP {expected_status}, received {response.status}")
            body = response.read(8 * 1024 * 1024 + 1)
            require(len(body) <= 8 * 1024 * 1024, f"{path}: response exceeded 8 MiB")
            return response.headers.get_content_type(), body, response.headers
    except (HTTPException, TimeoutError, OSError) as error:
        raise SmokeFailure(f"{path}: response read failed ({type(error).__name__})") from None


def html_page(url):
    content_type, body = fetch(url)
    require(content_type == "text/html", f"{urlsplit(url).path}: expected HTML")
    try:
        page = FrontendHTML()
        page.feed(body.decode("utf-8"))
    except (UnicodeError, ValueError):
        raise SmokeFailure("Frontend HTML could not be parsed as UTF-8") from None
    require(page.has_root and page.scripts, "Frontend HTML is missing the React root or module script")
    return page


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    args = parser.parse_args()
    base = args.base_url.rstrip("/") + "/"
    origin = urlsplit(base)
    require(origin.scheme in {"http", "https"} and origin.netloc and
            not origin.username and not origin.password and origin.path == "/" and
            not origin.query and not origin.fragment, "--base-url must be an HTTP(S) origin without credentials")

    root = html_page(base)
    require(root.styles, "Frontend HTML is missing the built stylesheet")
    print("PASS: root HTML contains the React entry point")
    for references, mime_types, suffix in [
        (root.scripts, {"application/javascript", "text/javascript"}, ".js"),
        (root.styles, {"text/css"}, ".css"),
    ]:
        for reference in references:
            asset = urljoin(base, reference)
            parsed = urlsplit(asset)
            require((parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc),
                    "Built assets must be served from the frontend origin")
            require(parsed.path.startswith("/assets/") and parsed.path.endswith(suffix),
                    "Frontend HTML must reference built JavaScript and CSS assets")
            content_type, body = fetch(asset)
            require(content_type in mime_types and body.strip(),
                    f"{parsed.path}: expected a nonempty {suffix} asset with the correct MIME type")
    print("PASS: built JavaScript and CSS assets are served correctly")
    fetch(urljoin(base, "/assets/__docker_smoke_missing__.js"), expected_status=404)
    print("PASS: a missing static asset returns HTTP 404")

    route = html_page(urljoin(base, "/job-postings/new"))
    require(route.scripts == root.scripts and route.styles == root.styles,
            "Direct SPA route does not serve the same frontend entry point")
    print("PASS: direct /job-postings/new navigation serves the SPA")

    content_type, body = fetch(urljoin(base, "/api/auth/me"), expected_status=401)
    require(content_type == "application/json", "Unauthenticated API call must return JSON, not frontend HTML")
    try:
        error = json.loads(body)
    except (UnicodeError, ValueError):
        raise SmokeFailure("Unauthenticated API call returned invalid JSON") from None
    require(isinstance(error, dict) and error.get("code") == "UNAUTHORIZED",
            "Unauthenticated API call must return the UNAUTHORIZED error code")
    csrf_token = next((cookie.value for cookie in COOKIES if cookie.name == "XSRF-TOKEN"), None)
    require(csrf_token, "API must issue an XSRF-TOKEN cookie before login")
    print("PASS: proxied API rejects unauthenticated requests and issues a CSRF token")

    signup_body = json.dumps({"email": "smoke-test@example.com", "password": "smoke-test-password"}).encode()
    content_type, body = fetch(urljoin(base, "/api/auth/signup"), expected_status=201, data=signup_body,
                               headers={"Content-Type": "application/json", "X-XSRF-TOKEN": csrf_token})
    require(content_type == "application/json", "Signup API must return JSON")
    require(any(cookie.name == "SESSION" for cookie in COOKIES), "Signup must start a login session")
    print("PASS: proxied POST with the CSRF header signs up and starts a session")

    query = urlencode({"page": 0, "size": 3})
    content_type, body = fetch(urljoin(base, "/api/job-postings") + "?" + query)
    require(content_type == "application/json", "Job posting API must return JSON, not frontend HTML")
    try:
        page = json.loads(body)
    except (UnicodeError, ValueError):
        raise SmokeFailure("Job posting API returned invalid JSON") from None
    require(isinstance(page, dict) and isinstance(page.get("content"), list),
            "Job posting API must return a page object with a content array")
    require(all(type(page.get(key)) is int and page[key] >= 0
                for key in ("page", "size", "totalElements", "totalPages")),
            "Job posting API pagination fields must be nonnegative integers")
    require(all(type(page.get(key)) is bool for key in ("first", "last")),
            "Job posting API first/last fields must be booleans")
    require(page["page"] == 0 and page["size"] == 3 and len(page["content"]) <= 3,
            "Job posting API did not preserve the requested page and size query")
    require(page["totalElements"] >= len(page["content"]) and page["first"] and
            page["totalPages"] == (page["totalElements"] + 2) // 3 and
            page["last"] == (page["totalPages"] <= 1), "Job posting API pagination values are inconsistent")
    require(not page["content"] and page["totalElements"] == 0 and page["totalPages"] == 0,
            "CI job posting database must be newly initialized and empty")
    print("PASS: proxied API preserves pagination parameters and returns a valid empty CI database page")

    check_auth_rate_limits(base)


# frontend/nginx.confのlimit_reqの設定と同じ値にする(rate + burst、nodelay)。
# 連続した要求は1秒以内に終わるため、その間に回復する許容量は1回分に満たない。
LOGIN_ALLOWED_IN_BURST = 6
SIGNUP_ALLOWED_IN_BURST = 4
RATE_LIMITED_CODE = "TOO_MANY_REQUESTS"
RATE_LIMITED_MESSAGE = "リクエストが多すぎます。しばらくしてから再度お試しください。"


def current_csrf_token():
    # ログイン・会員登録でトークンが再発行されるため、毎回Cookieから読む。
    token = next((cookie.value for cookie in COOKIES if cookie.name == "XSRF-TOKEN"), None)
    require(token, "XSRF-TOKEN cookie is missing")
    return token


def post_json(base, path, payload, expected_status):
    return fetch_with_headers(urljoin(base, path), expected_status=expected_status,
                              data=json.dumps(payload).encode(),
                              headers={"Content-Type": "application/json", "X-XSRF-TOKEN": current_csrf_token()})


def require_rate_limited(path, content_type, body, headers):
    require(content_type == "application/json", f"{path}: rate-limited response must be JSON")
    try:
        error = json.loads(body)
    except (UnicodeError, ValueError):
        raise SmokeFailure(f"{path}: rate-limited response returned invalid JSON") from None
    require(isinstance(error, dict) and error.get("status") == 429 and error.get("code") == RATE_LIMITED_CODE
            and error.get("message") == RATE_LIMITED_MESSAGE and error.get("path") == path
            and error.get("fieldErrors") == {},
            f"{path}: rate-limited response must use the API error format")
    require(headers.get("Retry-After") == "60", f"{path}: rate-limited response must send Retry-After: 60")


def check_auth_rate_limits(base):
    # 許容範囲内のログインはバックエンドまで届く(誤ったパスワードの401)。
    wrong_login = {"email": "smoke-test@example.com", "password": "wrong-password"}
    for _ in range(LOGIN_ALLOWED_IN_BURST):
        content_type, body, _ = post_json(base, "/api/auth/login", wrong_login, expected_status=401)
        require(content_type == "application/json", "Login within the rate limit must return JSON")
        try:
            error = json.loads(body)
        except (UnicodeError, ValueError):
            raise SmokeFailure("Login within the rate limit returned invalid JSON") from None
        require(isinstance(error, dict) and error.get("code") == "INVALID_CREDENTIALS",
                "Login within the rate limit must reach the backend")
    content_type, body, headers = post_json(base, "/api/auth/login", wrong_login, expected_status=429)
    require_rate_limited("/api/auth/login", content_type, body, headers)
    print(f"PASS: login is rate-limited after {LOGIN_ALLOWED_IN_BURST} attempts with a JSON 429 and Retry-After")

    # ログインの制限は他のAPIに影響しない(ログイン中のセッションでの照会・一覧取得)。
    fetch(urljoin(base, "/api/auth/me"))
    fetch(urljoin(base, "/api/job-postings"))
    print("PASS: login rate limit does not affect other APIs")

    # 会員登録は、上の確認で行った1回を含めて数える。
    for index in range(1, SIGNUP_ALLOWED_IN_BURST):
        post_json(base, "/api/auth/signup",
                  {"email": f"smoke-test-{index}@example.com", "password": "smoke-test-password"},
                  expected_status=201)
    content_type, body, headers = post_json(
        base, "/api/auth/signup",
        {"email": "smoke-test-limited@example.com", "password": "smoke-test-password"},
        expected_status=429)
    require_rate_limited("/api/auth/signup", content_type, body, headers)
    print(f"PASS: signup is rate-limited after {SIGNUP_ALLOWED_IN_BURST} attempts with a JSON 429 and Retry-After")


if __name__ == "__main__":
    try:
        main()
    except SmokeFailure as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
