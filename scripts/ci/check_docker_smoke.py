#!/usr/bin/env python3
"""Check the Compose frontend and proxied API without changing stored data."""

import argparse
from http.client import HTTPException
from html.parser import HTMLParser
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import urlopen


class SmokeFailure(Exception):
    pass


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


def fetch(url, expected_status=200):
    path = urlsplit(url).path
    try:
        response = urlopen(url, timeout=10)
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
            return response.headers.get_content_type(), body
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


if __name__ == "__main__":
    try:
        main()
    except SmokeFailure as error:
        print(f"FAIL: {error}", file=sys.stderr)
        sys.exit(1)
