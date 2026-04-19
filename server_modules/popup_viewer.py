from server_modules.popup_viewer_bridge import _bridge_shim
from server_modules.popup_viewer_document import (
    _build_fallback_document,
    _send_html,
    _send_json_error,
    build_popup_document,
)
from server_modules.popup_viewer_handlers import handle_popup_resource_request, handle_popup_view
from server_modules.popup_viewer_http import (
    DEFAULT_BROWSER_USER_AGENT,
    _decode_text,
    _open_target,
    _read_response_body,
    _request_headers,
    _retry_after_seconds,
    is_popup_target_allowed,
)
from server_modules.popup_viewer_rewrite import (
    _BASE_TAG_RE,
    _CONTENT_TYPE_CHARSET_RE,
    _CSP_META_RE,
    _HEAD_TAG_RE,
    _META_REFRESH_RE,
    _REMOVABLE_RESOURCE_ATTRS,
    _RESOURCE_AS_TOKENS,
    _RESOURCE_ATTRS_BY_TAG,
    _RESOURCE_REL_TOKENS,
    _STYLE_BLOCK_RE,
    _STYLE_IMPORT_RE,
    _STYLE_URL_RE,
    _TAG_OPEN_RE,
    _extract_attr_value,
    _extract_target_url,
    _parse_popup_proxy_url,
    _popup_proxy_path,
    _remove_tag_attribute,
    _replace_attr_value,
    _resolve_popup_asset_url,
    _rewrite_css_urls,
    _rewrite_popup_resource_tags,
    _rewrite_srcset,
    _should_rewrite_link,
)
