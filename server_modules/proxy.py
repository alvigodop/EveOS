import urllib.request
import urllib.error
import urllib.parse
from http import HTTPStatus
import logging
import traceback
import ssl
import http.cookiejar

logger = logging.getLogger("FandomDiscoveryServer")


def _origin_referer(target_url):
    try:
        parsed = urllib.parse.urlparse(target_url)
        if parsed.scheme in ('http', 'https') and parsed.netloc:
            return f'{parsed.scheme}://{parsed.netloc}/'
    except Exception:
        return None
    return None

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
    is_yahoo = 'yahoo.com' in target_url.lower()
    is_bing = 'bing.com' in target_url.lower()
    is_ddg = 'duckduckgo.com' in target_url.lower()
    is_brave = 'search.brave.com' in target_url.lower()
    
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',  # Don't request compression to simplify handling
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }
        
        # Add search engine-specific headers
        if is_yahoo:
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
        
        req = urllib.request.Request(target_url, data=None, headers=headers)
        
        # Create SSL context that doesn't verify certificates
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        # Use opener for cookie handling with search engines, regular urlopen otherwise
        if is_yahoo or is_bing or is_ddg or is_brave:
            # Install opener temporarily
            urllib.request.install_opener(opener)
            try:
                response = urllib.request.urlopen(req, timeout=30, context=ssl_context)
                content = response.read()
                content_type = response.getheader('Content-Type', 'text/html')
                response.close()
            finally:
                urllib.request.install_opener(None)  # Reset to default
        else:
            with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
                content = response.read()
                content_type = response.getheader('Content-Type', 'text/html')
        
        logger.info(f"Proxy success: {len(content)} bytes from {target_url}")
        
        handler.send_response(HTTPStatus.OK)
        handler.send_header('Content-Type', content_type)
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Content-Type': content_type_in,
        }
        
        req = urllib.request.Request(target_url, data=post_data, headers=headers, method='POST')
        
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        with urllib.request.urlopen(req, timeout=30, context=ssl_context) as response:
            content = response.read()
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
