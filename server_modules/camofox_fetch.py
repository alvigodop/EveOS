import atexit
import errno
import json
import logging
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections import deque
from http import HTTPStatus
from types import SimpleNamespace
from urllib.parse import urlparse

logger = logging.getLogger("FandomDiscoveryServer")

from server_modules.camofox_metadata import _build_metadata_from_snapshot
from server_modules.camofox_runtime import _cookie_diagnostics_for_target, _cookies_for_target, _project_root
from server_modules.camofox_server import (
    DEFAULT_CAMOFOX_FETCH_TIMEOUT_SECONDS,
    _cleanup_session,
    _is_client_disconnect,
    _json_request,
    _safe_send_response,
    ensure_camofox_server,
)

def _extract_dom_metadata(tab_id, user_id, target_url):
    expression = r"""({
      title: document.title || null,
      canonicalUrl:
        document.querySelector('link[rel="canonical"]')?.href
        || document.querySelector('meta[property="og:url"]')?.content
        || location.href,
      description:
        document.querySelector('meta[name="description"]')?.content
        || document.querySelector('meta[property="og:description"]')?.content
        || document.querySelector('meta[name="twitter:description"]')?.content
        || null,
      icon:
        document.querySelector('link[rel="icon"]')?.href
        || document.querySelector('link[rel="shortcut icon"]')?.href
        || document.querySelector('link[rel="apple-touch-icon"]')?.href
        || null,
      coverCandidates: (() => {
        const seen = new Set();
        const out = [];
        const push = (rawUrl, source, extra = {}) => {
          const url = String(rawUrl || '').trim();
          if (!url || seen.has(url)) return;
          seen.add(url);
          out.push({
            src: url,
            source,
            alt: String(extra.alt || '').trim(),
            title: String(extra.title || '').trim(),
            width: Number(extra.width || 0) || 0,
            height: Number(extra.height || 0) || 0,
            className: String(extra.className || '').trim(),
            id: String(extra.id || '').trim(),
          });
        };
        push(document.querySelector('meta[property="og:image"]')?.content, 'og_image');
        push(document.querySelector('meta[property="og:image:secure_url"]')?.content, 'og_image');
        push(document.querySelector('meta[name="twitter:image"]')?.content, 'twitter_image');
        push(document.querySelector('meta[name="twitter:image:src"]')?.content, 'twitter_image');
        Array.from(document.querySelectorAll('video[poster]')).slice(0, 4).forEach((video) => {
          push(video.poster, 'video_poster', {
            width: video.videoWidth || video.clientWidth || video.offsetWidth || 0,
            height: video.videoHeight || video.clientHeight || video.offsetHeight || 0,
            className: video.className || '',
            id: video.id || '',
            title: video.getAttribute('title') || '',
          });
        });
        Array.from(document.querySelectorAll('main img, article img, figure img, [class*="cover"] img, [class*="poster"] img, [class*="hero"] img, [class*="featured"] img'))
          .slice(0, 16)
          .forEach((img) => {
            push(img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'), 'content_image', {
              alt: img.alt || '',
              title: img.title || '',
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0,
              className: img.className || '',
              id: img.id || '',
            });
          });
        Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 8).forEach((script) => {
          const text = String(script.textContent || '').trim();
          if (!text) return;
          try {
            const parsed = JSON.parse(text);
            const stack = Array.isArray(parsed) ? parsed.slice() : [parsed];
            while (stack.length) {
              const item = stack.shift();
              if (!item) continue;
              if (Array.isArray(item)) {
                stack.push(...item);
                continue;
              }
              if (typeof item !== 'object') continue;
              const graph = item['@graph'];
              if (Array.isArray(graph)) stack.push(...graph);
              const image = item.image;
              if (typeof image === 'string') {
                push(image, 'jsonld_image');
              } else if (Array.isArray(image)) {
                image.forEach((entry) => {
                  if (typeof entry === 'string') push(entry, 'jsonld_image');
                  else if (entry && typeof entry === 'object') push(entry.url || entry.contentUrl, 'jsonld_image');
                });
              } else if (image && typeof image === 'object') {
                push(image.url || image.contentUrl, 'jsonld_image');
              }
            }
          } catch (error) {
          }
        });
        return out;
      })(),
    })"""
    response = _json_request(
        "POST",
        f"/tabs/{tab_id}/evaluate",
        payload={"userId": user_id, "expression": expression},
        timeout=20,
    )
    result = response.get("result")
    return result if isinstance(result, dict) else {}

def fetch_camofox_metadata(target_url):
    ensure_camofox_server()
    user_id = f"eveos-{uuid.uuid4().hex[:12]}"
    tab_id = None
    snapshot_text = ""
    images = []
    page_url = target_url
    dom_metadata = {}
    cookies = _cookies_for_target(target_url)

    try:
        created = _json_request(
            "POST",
            "/tabs",
            payload={
                "userId": user_id,
                "sessionKey": "autotitle",
            },
            timeout=15,
        )
        tab_id = str(created.get("tabId") or "").strip()
        if not tab_id:
            raise RuntimeError("Camofox upstream did not return a tabId.")

        if cookies:
            encoded_user = urllib.parse.quote(user_id, safe="")
            _json_request(
                "POST",
                f"/sessions/{encoded_user}/cookies",
                payload={"cookies": cookies},
                timeout=15,
            )

        _json_request(
            "POST",
            f"/tabs/{tab_id}/navigate",
            payload={
                "userId": user_id,
                "url": target_url,
            },
            timeout=DEFAULT_CAMOFOX_FETCH_TIMEOUT_SECONDS,
        )
        _json_request(
            "POST",
            f"/tabs/{tab_id}/wait",
            payload={
                "userId": user_id,
                "timeout": 12000,
                "waitForNetwork": True,
            },
            timeout=20,
        )
        try:
            dom_metadata = _extract_dom_metadata(tab_id, user_id, target_url)
        except Exception:
            dom_metadata = {}
        snapshot_payload = _json_request(
            "GET",
            f"/tabs/{tab_id}/snapshot",
            query={"userId": user_id},
            timeout=20,
        )
        snapshot_text = str(snapshot_payload.get("snapshot") or "")
        page_url = str(snapshot_payload.get("url") or target_url)

        images_payload = _json_request(
            "GET",
            f"/tabs/{tab_id}/images",
            query={"userId": user_id, "limit": 12},
            timeout=20,
        )
        images = images_payload.get("images") if isinstance(images_payload.get("images"), list) else []

        metadata = _build_metadata_from_snapshot(target_url, snapshot_text, images, page_url, dom_metadata=dom_metadata)
        return {
            "metadata": metadata,
            "snapshot": snapshot_text,
            "images": images,
            "domMetadata": dom_metadata,
            "usedCookies": bool(cookies),
        }
    finally:
        _cleanup_session(user_id)

def handle_camofox_fetch(handler, query):
    target_url_list = query.get("url")
    response_format = str((query.get("format") or ["json"])[0] or "json").strip().lower()
    metadata_only = str((query.get("metadata_only") or ["0"])[0] or "0").strip().lower() in ("1", "true", "yes", "on")

    if not target_url_list:
        _safe_send_response(handler, HTTPStatus.BAD_REQUEST, "application/json", b'{"error":"Missing url parameter"}')
        return

    target_url = str(target_url_list[0] or "").strip()
    cookie_diagnostics = _cookie_diagnostics_for_target(target_url)
    log_path = os.path.join(_project_root(), "bin", "camofox_activity.log")

    def log_activity(message):
        try:
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"[{timestamp}] {message}\n")
        except Exception:
            return

    logger.info("Camofox: Fetching URL: %s", target_url)
    log_activity(f"FETCH START: {target_url}")

    try:
        payload = fetch_camofox_metadata(target_url)
        metadata = payload.get("metadata") or {}
        snapshot_text = str(payload.get("snapshot") or "")
        images = payload.get("images") if isinstance(payload.get("images"), list) else []

        log_activity(
            "SUCCESS: {} (title={} cover={} cookies={})".format(
                target_url,
                metadata.get("title") or "",
                "yes" if metadata.get("coverUrl") else "no",
                "yes" if payload.get("usedCookies") else "no",
            )
        )

        body_payload = {
            "ok": True,
            "url": target_url,
            "metadata": metadata,
            "cookieDiagnostics": cookie_diagnostics,
            "usedCookies": bool(payload.get("usedCookies")),
        }
        if not metadata_only:
            body_payload["snapshot"] = snapshot_text
            body_payload["images"] = images
        body = json.dumps(body_payload).encode("utf-8")

        if response_format != "json":
            _safe_send_response(handler, HTTPStatus.OK, "text/plain; charset=utf-8", snapshot_text.encode("utf-8", errors="replace"))
            return

        _safe_send_response(handler, HTTPStatus.OK, "application/json", body)
    except Exception as exc:
        if _is_client_disconnect(exc):
            logger.info("Camofox: Client disconnected during response handling for %s", target_url)
            return
        logger.error("Camofox: Unexpected error: %s", exc)
        log_activity(f"FAILED: {target_url} ({exc})")
        error_payload = {
            "error": "Camofox execution failed",
            "details": str(exc),
            "cookieDiagnostics": cookie_diagnostics,
        }
        _safe_send_response(
            handler,
            HTTPStatus.INTERNAL_SERVER_ERROR,
            "application/json",
            json.dumps(error_payload).encode("utf-8"),
        )
