import json
import ssl
import urllib.request
import urllib.parse
from http import HTTPStatus
import logging

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            }
        )
        
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        with urllib.request.urlopen(req, timeout=15, context=ssl_context) as response:
            data = json.loads(response.read().decode('utf-8'))
            
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
