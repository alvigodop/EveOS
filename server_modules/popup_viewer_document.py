import gzip
import html
import ipaddress
import json
import logging
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus

from server_modules import proxy
from server_modules.popup_viewer_bridge import _bridge_shim
from server_modules.popup_viewer_rewrite import (
    _BASE_TAG_RE,
    _CSP_META_RE,
    _HEAD_TAG_RE,
    _META_REFRESH_RE,
    _rewrite_popup_resource_tags,
)

logger = logging.getLogger("FandomDiscoveryServer")


def build_popup_document(target_url, raw_html, bridge_base=""):
    page_url = str(target_url or "").strip()
    html_text = str(raw_html or "").strip()
    if not html_text:
        html_text = "<!doctype html><html><head></head><body></body></html>"

    clean_html = _CSP_META_RE.sub("", html_text)
    clean_html = _META_REFRESH_RE.sub("", clean_html)
    clean_html = _BASE_TAG_RE.sub("", clean_html)
    clean_html = _rewrite_popup_resource_tags(page_url, clean_html, bridge_base=bridge_base)

    base_tag = f'<base href="{html.escape(page_url, quote=True)}">'
    inject_block = (
        '<meta name="referrer" content="no-referrer">'
        + base_tag
        + _bridge_shim(page_url)
    )

    if _HEAD_TAG_RE.search(clean_html):
        return _HEAD_TAG_RE.sub(lambda match: f"<head{match.group(1)}>{inject_block}", clean_html, count=1)

    return f"<!doctype html><html><head>{inject_block}</head><body>{clean_html}</body></html>"


def _build_fallback_document(target_url, message):
    safe_target = html.escape(str(target_url or ""), quote=True)
    safe_message = html.escape(str(message or "Unable to load this page in the EveOS popup bridge."))
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Popup Bridge Fallback</title>
    <style>
        html, body {{
            margin: 0;
            min-height: 100%;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f1720;
            color: #f5f7fa;
        }}
        .shell {{
            max-width: 760px;
            margin: 6vh auto;
            padding: 24px;
        }}
        .card {{
            background: rgba(15, 23, 32, 0.92);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        }}
        h1 {{
            margin: 0 0 12px 0;
            font-size: 1.25rem;
        }}
        p {{
            line-height: 1.5;
            margin: 0 0 12px 0;
            color: rgba(245, 247, 250, 0.82);
        }}
        code {{
            display: block;
            margin: 14px 0;
            padding: 12px 14px;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.06);
            overflow-wrap: anywhere;
        }}
        a {{
            color: #8ec5ff;
        }}
    </style>
</head>
<body>
    <div class="shell">
        <div class="card">
            <h1>Popup View Unavailable</h1>
            <p>{safe_message}</p>
            <code>{safe_target}</code>
            <p><a href="{safe_target}" target="_blank" rel="noopener noreferrer">Open this page in a new tab</a></p>
        </div>
    </div>
</body>
</html>"""


def _send_html(handler, html_text, status=HTTPStatus.OK):
    body = str(html_text or "").encode("utf-8", errors="replace")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.end_headers()
    handler.wfile.write(body)


def _send_json_error(handler, status, message, target_url=""):
    payload = json.dumps({
        "error": message,
        "url": str(target_url or "").strip(),
    }).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(payload)
