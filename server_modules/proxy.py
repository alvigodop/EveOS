import urllib.request
import urllib.error
import urllib.parse
from http import HTTPStatus
import logging
import traceback
import ssl
import http.cookiejar
import gzip
import threading
import time

logger = logging.getLogger("FandomDiscoveryServer")

WMF_USER_AGENT = "EveOS/0.4 (local Wikimedia client proxy; +https://github.com/driftai/EveOS)"
WMF_MIN_INTERVAL_SECONDS = 0.25

_WMF_THROTTLE_LOCK = threading.Lock()
_WMF_NEXT_REQUEST_AT = 0.0
_FORWARDED_MEDIA_HEADERS = (
    'Content-Type',
    'Content-Length',
    'Content-Range',
    'Accept-Ranges',
    'Content-Disposition',
    'ETag',
    'Last-Modified',
)


def _origin_referer(target_url):
    try:
        parsed = urllib.parse.urlparse(target_url)
        if parsed.scheme in ('http', 'https') and parsed.netloc:
            return f'{parsed.scheme}://{parsed.netloc}/'
    except Exception:
        return None
    return None


def _is_wikimedia_request(target_url):
    try:
        parsed = urllib.parse.urlparse(target_url)
        host = (parsed.hostname or '').lower()
        return (
            host == 'wikipedia.org'
            or host.endswith('.wikipedia.org')
            or host == 'wikimedia.org'
            or host.endswith('.wikimedia.org')
        )
    except Exception:
        return False


def _throttle_wikimedia_request():
    global _WMF_NEXT_REQUEST_AT
    wait_seconds = 0.0
    with _WMF_THROTTLE_LOCK:
        now = time.monotonic()
        wait_seconds = max(0.0, _WMF_NEXT_REQUEST_AT - now)
        scheduled_at = max(_WMF_NEXT_REQUEST_AT, now)
        _WMF_NEXT_REQUEST_AT = scheduled_at + WMF_MIN_INTERVAL_SECONDS

    if wait_seconds > 0:
        time.sleep(wait_seconds)


def _retry_after_seconds(retry_after_value):
    if not retry_after_value:
        return 0.0

    try:
        return max(0.0, float(retry_after_value))
    except (TypeError, ValueError):
        return 0.0


def _read_response_body(response):
    content = response.read()
    content_encoding = str(response.getheader('Content-Encoding', '') or '').lower()
    if 'gzip' in content_encoding:
        try:
            return gzip.decompress(content)
        except OSError:
            logger.warning("Failed to decompress gzip response; returning raw body")
    return content


def _collect_response_headers(response):
    return {
        key: response.getheader(key)
        for key in _FORWARDED_MEDIA_HEADERS
        if response.getheader(key)
    }


def _is_streaming_media(response_headers, requested_range):
    content_type = str(response_headers.get('Content-Type') or '').lower()
    return bool(requested_range) or content_type.startswith(('audio/', 'video/'))


def _stream_response(handler, response, response_headers):
    status = int(getattr(response, 'status', 0) or response.getcode() or HTTPStatus.OK)
    handler.send_response(status)
    for key, value in response_headers.items():
        handler.send_header(key, value)
    if 'Content-Type' not in response_headers:
        handler.send_header('Content-Type', 'application/octet-stream')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    handler.send_header('Access-Control-Allow-Headers', '*')
    handler.end_headers()

    sent = 0
    try:
        while True:
            chunk = response.read(64 * 1024)
            if not chunk:
                break
            handler.wfile.write(chunk)
            handler.wfile.flush()
            sent += len(chunk)
    except OSError:
        logger.debug("Media proxy client closed after %s bytes", sent)
    return sent

def handle_proxy_request(handler, query):
    """Handle requests to /api/proxy?url=..."""
    target_url_list = query.get('url')
    
    if not target_url_list:
        handler.send_response(HTTPStatus.BAD_REQUEST)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Missing url parameter"}')
        return

    target_url = target_url_list[0]
    media_hint = str((query.get('media') or [''])[0]).lower() in {'1', 'true', 'yes'}
    is_yahoo = 'yahoo.com' in target_url.lower()
    is_bing = 'bing.com' in target_url.lower()
    is_ddg = 'duckduckgo.com' in target_url.lower()
    is_brave = 'search.brave.com' in target_url.lower()
    is_wikimedia = _is_wikimedia_request(target_url)
    
    search_engine = ""
    if is_yahoo: search_engine = "[YAHOO]"
    elif is_bing: search_engine = "[BING]"
    elif is_ddg: search_engine = "[DDG]"
    elif is_brave: search_engine = "[BRAVE]"
    
    logger.info(f"Proxying request to: {target_url}" + (f" {search_engine}" if search_engine else ""))
    
    try:
        # For search engines, we need cookie handling
        cookie_jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        
        # Create a request object with headers that mimic a real browser
        headers = {
            'User-Agent': WMF_USER_AGENT if is_wikimedia else 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8' if is_wikimedia else 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip' if is_wikimedia else 'identity',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }
        
        # Add search engine / media-specific headers
        is_googlevideo = 'googlevideo.com' in target_url.lower() or 'youtube.com' in target_url.lower() or 'youtu.be' in target_url.lower()
        if is_googlevideo:
            headers['Referer'] = 'https://www.youtube.com/'
            headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        elif is_yahoo:
            headers['Referer'] = 'https://search.yahoo.com/'
            headers['Host'] = 'search.yahoo.com'
        elif is_bing:
            headers['Referer'] = 'https://www.bing.com/'
            headers['Host'] = 'www.bing.com'
        elif is_ddg:
            headers['Referer'] = 'https://duckduckgo.com/'
            headers['Host'] = 'html.duckduckgo.com'
        elif is_brave:
            headers['Referer'] = 'https://search.brave.com/'
            headers['Host'] = 'search.brave.com'
        else:
            referer = _origin_referer(target_url)
            if referer:
                headers['Referer'] = referer
            headers['Sec-Fetch-Dest'] = 'document'
            headers['Sec-Fetch-Mode'] = 'navigate'
            headers['Sec-Fetch-Site'] = 'none'
            headers['Sec-Fetch-User'] = '?1'
        
        # Forward Range header for audio/media streaming if provided by client
        range_header = handler.headers.get('Range')
        if range_header:
            headers['Range'] = range_header
        
        req = urllib.request.Request(target_url, data=None, headers=headers)
        
        # Create SSL context that doesn't verify certificates
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        content = b''
        response_headers = {}
        last_http_error = None

        for attempt in range(2 if is_wikimedia else 1):
            try:
                if is_wikimedia:
                    _throttle_wikimedia_request()

                # Use opener for cookie handling with search engines, regular urlopen otherwise
                if is_yahoo or is_bing or is_ddg or is_brave:
                    urllib.request.install_opener(opener)
                    try:
                        response = urllib.request.urlopen(req, timeout=30, context=ssl_context)
                        content = _read_response_body(response)
                        response_headers = _collect_response_headers(response)
                        response.close()
                    finally:
                        urllib.request.install_opener(None)
                else:
                    with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
                        response_headers = _collect_response_headers(response)
                        if not is_wikimedia and _is_streaming_media(response_headers, range_header or media_hint):
                            sent = _stream_response(handler, response, response_headers)
                            logger.info("Proxy streamed %s bytes from %s", sent, target_url)
                            return
                        content = _read_response_body(response)

                last_http_error = None
                break
            except urllib.error.HTTPError as http_error:
                last_http_error = http_error
                if is_wikimedia and http_error.code == HTTPStatus.TOO_MANY_REQUESTS and attempt == 0:
                    retry_after_seconds = _retry_after_seconds(http_error.headers.get('Retry-After'))
                    if retry_after_seconds > 0:
                        logger.warning(f"Wikimedia requested backoff for {retry_after_seconds:.2f}s")
                        time.sleep(retry_after_seconds)
                        continue
                raise

        if last_http_error is not None:
            raise last_http_error

        logger.info(f"Proxy success: {len(content)} bytes from {target_url}")
        
        status_code = getattr(last_http_error, 'code', HTTPStatus.PARTIAL_CONTENT if 'Content-Range' in response_headers else HTTPStatus.OK)
        handler.send_response(status_code)
        for h_key, h_val in response_headers.items():
            handler.send_header(h_key, h_val)
        if 'Content-Type' not in response_headers:
            handler.send_header('Content-Type', 'application/octet-stream')
        handler.end_headers()
        handler.wfile.write(content)
            
    except urllib.error.HTTPError as e:
        logger.warning(f"Proxy HTTP Error {e.code} for {target_url}")
        # Try to read error body for more info
        try:
            error_body = e.read().decode('utf-8', errors='replace')[:500]
            logger.warning(f"Error body: {error_body}")
        except:
            pass
        handler.send_response(e.code)
        handler.send_header('Content-Type', 'text/plain')
        retry_after_header = e.headers.get('Retry-After') if getattr(e, 'headers', None) else None
        if retry_after_header:
            handler.send_header('Retry-After', retry_after_header)
        handler.end_headers()
        handler.wfile.write(str(e).encode('utf-8'))
        
    except urllib.error.URLError as e:
        logger.warning(f"Proxy URL Error for {target_url}: {e.reason}")
        handler.send_response(HTTPStatus.BAD_GATEWAY)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = f'{{"error": "Failed to reach target URL", "details": "{str(e.reason)}"}}'
        handler.wfile.write(error_msg.encode('utf-8'))
        
    except Exception as e:
        # Log full traceback for debugging
        logger.error(f"Proxy unexpected error for {target_url}: {type(e).__name__}: {str(e)}")
        logger.error(traceback.format_exc())
        handler.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = f'{{"error": "Internal Proxy Error", "details": "{str(e)}"}}'
        handler.wfile.write(error_msg.encode('utf-8'))

def handle_proxy_post_request(handler, query):
    """Handle POST requests to /api/proxy?url=..."""
    target_url_list = query.get('url')
    
    if not target_url_list:
        handler.send_response(HTTPStatus.BAD_REQUEST)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Missing url parameter"}')
        return

    target_url = target_url_list[0]
    
    # Read the POST body from the incoming request
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length) if content_length > 0 else None
    
    # Forward the requested Content-Type
    content_type_in = handler.headers.get('Content-Type', 'application/json')
    
    logger.info(f"POST Proxying request to: {target_url}")
    
    try:
        headers = {
            'User-Agent': WMF_USER_AGENT if _is_wikimedia_request(target_url) else 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Content-Type': content_type_in,
            'Accept-Encoding': 'gzip' if _is_wikimedia_request(target_url) else 'identity',
        }
        
        req = urllib.request.Request(target_url, data=post_data, headers=headers, method='POST')
        
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        if _is_wikimedia_request(target_url):
            _throttle_wikimedia_request()

        with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
            content = _read_response_body(response)
            content_type_out = response.getheader('Content-Type', 'application/json')
            
        logger.info(f"POST Proxy success: {len(content)} bytes from {target_url}")
        
        handler.send_response(HTTPStatus.OK)
        handler.send_header('Content-Type', content_type_out)
        handler.end_headers()
        handler.wfile.write(content)
            
    except urllib.error.HTTPError as e:
        logger.warning(f"POST Proxy HTTP Error {e.code} for {target_url}")
        try:
            error_body = e.read().decode('utf-8', errors='replace')[:500]
            logger.warning(f"Error body: {error_body}")
        except:
            pass
        handler.send_response(e.code)
        handler.send_header('Content-Type', 'text/plain')
        handler.end_headers()
        handler.wfile.write(str(e).encode('utf-8'))
        
    except urllib.error.URLError as e:
        logger.warning(f"POST Proxy URL Error for {target_url}: {e.reason}")
        handler.send_response(HTTPStatus.BAD_GATEWAY)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = f'{{"error": "Failed to reach target URL", "details": "{str(e.reason)}"}}'
        handler.wfile.write(error_msg.encode('utf-8'))
        
    except Exception as e:
        logger.error(f"POST Proxy unexpected error for {target_url}: {type(e).__name__}: {str(e)}")
        logger.error(traceback.format_exc())
        handler.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = f'{{"error": "Internal Proxy Error", "details": "{str(e)}"}}'
        handler.wfile.write(error_msg.encode('utf-8'))
