import json
import ssl
import urllib.request
import urllib.error
import urllib.parse
from http import HTTPStatus
import logging
import time

from server_modules import proxy as proxy_helpers

logger = logging.getLogger("FandomDiscoveryServer")

def handle_wikipedia_search(handler, query):
    """Handle Wikipedia search requests"""
    logger.info(f"Handling Wikipedia search request")
    
    search_query = query.get('q', query.get('query', []))
    if not search_query:
        handler.send_response(HTTPStatus.BAD_REQUEST)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        handler.wfile.write(b'{"error": "Missing q parameter"}')
        return
    
    search_term = search_query[0]
    logger.info(f"Wikipedia search for: {search_term}")
    
    # Build Wikipedia OpenSearch API URL
    encoded_query = urllib.parse.quote(search_term)
    wiki_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={encoded_query}&limit=10&namespace=0&format=json"
    
    try:
        req = urllib.request.Request(
            wiki_url,
            headers={
                'User-Agent': proxy_helpers.WMF_USER_AGENT,
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
            }
        )
        
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        response_data = None

        for attempt in range(2):
            try:
                proxy_helpers._throttle_wikimedia_request()
                with urllib.request.urlopen(req, timeout=15, context=ssl_context) as response:
                    response_data = json.loads(proxy_helpers._read_response_body(response).decode('utf-8'))
                break
            except urllib.error.HTTPError as http_error:
                if http_error.code == HTTPStatus.TOO_MANY_REQUESTS and attempt == 0:
                    retry_after_seconds = proxy_helpers._retry_after_seconds(http_error.headers.get('Retry-After'))
                    if retry_after_seconds > 0:
                        logger.warning(f"Wikipedia search backing off for {retry_after_seconds:.2f}s")
                        time.sleep(retry_after_seconds)
                        continue
                raise

        data = response_data if isinstance(response_data, list) else response_data or []

        # OpenSearch returns [query, titles, descriptions, urls]
        if isinstance(data, list) and len(data) >= 4:
            titles = data[1]
            descriptions = data[2]
            urls = data[3]

            results = []
            for i, title in enumerate(titles):
                results.append({
                    'title': title,
                    'description': descriptions[i] if i < len(descriptions) else '',
                    'url': urls[i] if i < len(urls) else f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}",
                    'source': 'wikipedia'
                })

            logger.info(f"Wikipedia search returned {len(results)} results")

            handler.send_response(HTTPStatus.OK)
            handler.send_header('Content-Type', 'application/json')
            handler.end_headers()
            handler.wfile.write(json.dumps({'results': results, 'query': search_term}).encode('utf-8'))
        else:
            # Return raw data if format is unexpected
            handler.send_response(HTTPStatus.OK)
            handler.send_header('Content-Type', 'application/json')
            handler.end_headers()
            handler.wfile.write(json.dumps(data).encode('utf-8'))
                
    except Exception as e:
        logger.error(f"Wikipedia search error: {str(e)}")
        handler.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
        handler.send_header('Content-Type', 'application/json')
        handler.end_headers()
        error_msg = json.dumps({'error': 'Wikipedia search failed', 'details': str(e)})
        handler.wfile.write(error_msg.encode('utf-8'))
