import json

def _bridge_shim(target_url):
    target_json = json.dumps(str(target_url or ""))
    return f"""
<script>
(function () {{
    var TARGET_URL = {target_json};
    var VIEW_PREFIX = window.location.origin + '/api/popup-view/';
    var RESOURCE_PREFIX = window.location.origin + '/api/popup-resource/';

    function createMemoryStorage() {{
        var data = Object.create(null);
        return {{
            getItem: function (key) {{
                key = String(key);
                return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
            }},
            setItem: function (key, value) {{
                data[String(key)] = String(value);
            }},
            removeItem: function (key) {{
                delete data[String(key)];
            }},
            clear: function () {{
                data = Object.create(null);
            }},
            key: function (index) {{
                var keys = Object.keys(data);
                return typeof index === 'number' && index >= 0 && index < keys.length ? keys[index] : null;
            }},
            get length() {{
                return Object.keys(data).length;
            }}
        }};
    }}

    function installStorageFallback(name) {{
        try {{
            void window[name];
        }} catch (error) {{
            try {{
                Object.defineProperty(window, name, {{
                    configurable: true,
                    enumerable: true,
                    value: createMemoryStorage()
                }});
            }} catch (_error) {{}}
        }}
    }}

    installStorageFallback('localStorage');
    installStorageFallback('sessionStorage');

    try {{
        void document.cookie;
    }} catch (error) {{
        var cookieValue = '';
        try {{
            Object.defineProperty(Document.prototype, 'cookie', {{
                configurable: true,
                get: function () {{
                    return cookieValue;
                }},
                set: function (value) {{
                    cookieValue = String(value || '');
                }}
            }});
        }} catch (_error) {{}}
    }}

    function isBridgeUrl(rawUrl) {{
        var value = String(rawUrl || '');
        return /^\\/api\\/popup-(?:view|resource)(?:\\/|\\?url=)/i.test(value)
            || /^https?:\\/\\/(127\\.0\\.0\\.1|localhost)(:\\d+)?\\/api\\/popup-(?:view|resource)(?:\\/|\\?url=)/i.test(value);
    }}

    function resolveUrl(rawUrl) {{
        var value = String(rawUrl || '').trim();
        if (!value) return '';
        if (isBridgeUrl(value)) return value;
        try {{
            return new URL(value, TARGET_URL).toString();
        }} catch (error) {{
            return '';
        }}
    }}

    function isHttpUrl(rawUrl) {{
        return /^https?:/i.test(String(rawUrl || ''));
    }}

    function proxyPathForUrl(rawUrl, mode) {{
        var absoluteUrl = resolveUrl(rawUrl);
        if (isBridgeUrl(absoluteUrl)) return absoluteUrl;
        if (!absoluteUrl || !isHttpUrl(absoluteUrl)) return '';
        try {{
            var parsed = new URL(absoluteUrl);
            var prefix = String(mode || 'resource').toLowerCase() === 'view' ? VIEW_PREFIX : RESOURCE_PREFIX;
            var pathname = parsed.pathname || '/';
            var query = parsed.search || '';
            var hash = String(mode || 'resource').toLowerCase() === 'view' ? (parsed.hash || '') : '';
            return prefix + parsed.protocol.replace(':', '') + '/' + parsed.host + pathname + query + hash;
        }} catch (error) {{
            return '';
        }}
    }}

    function toViewUrl(rawUrl) {{
        return proxyPathForUrl(rawUrl, 'view');
    }}

    function toResourceUrl(rawUrl) {{
        return proxyPathForUrl(rawUrl, 'resource');
    }}

    function isIgnoredLink(rawUrl) {{
        var value = String(rawUrl || '').trim().toLowerCase();
        return !value
            || value.charAt(0) === '#'
            || value.startsWith('javascript:')
            || value.startsWith('mailto:')
            || value.startsWith('tel:')
            || value.startsWith('data:');
    }}

    function navigateToView(rawUrl) {{
        var nextUrl = toViewUrl(rawUrl);
        if (nextUrl) {{
            window.location.href = nextUrl;
            return true;
        }}
        return false;
    }}

    document.addEventListener('click', function (event) {{
        var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (String(anchor.target || '').toLowerCase() === '_blank') return;

        var href = anchor.getAttribute('href');
        if (isIgnoredLink(href)) return;

        if (navigateToView(href)) {{
            event.preventDefault();
            event.stopPropagation();
        }}
    }}, true);

    document.addEventListener('submit', function (event) {{
        var form = event.target;
        if (!form || String(form.method || 'GET').toUpperCase() !== 'GET') return;

        var action = form.getAttribute('action') || TARGET_URL;
        if (isIgnoredLink(action)) return;

        try {{
            var url = new URL(resolveUrl(action) || TARGET_URL);
            var formData = new FormData(form);
            formData.forEach(function (value, key) {{
                url.searchParams.set(key, value);
            }});

            var nextUrl = toViewUrl(url.toString());
            if (nextUrl) {{
                event.preventDefault();
                event.stopPropagation();
                window.location.href = nextUrl;
            }}
        }} catch (error) {{}}
    }}, true);

    function shouldRewriteLink(node) {{
        if (!node || !node.getAttribute) return false;
        var relValue = String(node.getAttribute('rel') || '').toLowerCase();
        var asValue = String(node.getAttribute('as') || '').toLowerCase();
        var relTokens = relValue.split(/\\s+/).filter(Boolean);
        return relTokens.some(function (token) {{
            return token === 'stylesheet'
                || token === 'modulepreload'
                || token === 'preload'
                || token === 'prefetch'
                || token === 'icon'
                || token === 'apple-touch-icon'
                || token === 'manifest';
        }}) || ['fetch', 'font', 'image', 'script', 'style'].indexOf(asValue) !== -1;
    }}

    function rewriteSrcsetValue(rawValue) {{
        return String(rawValue || '')
            .split(',')
            .map(function (part) {{
                var chunk = String(part || '').trim();
                if (!chunk) return '';
                var tokens = chunk.split(/\\s+/);
                var rewritten = toResourceUrl(tokens[0]) || tokens[0];
                return [rewritten].concat(tokens.slice(1)).join(' ').trim();
            }})
            .filter(Boolean)
            .join(', ');
    }}

    function rewriteCssUrls(rawValue) {{
        return String(rawValue || '').replace(/url\\(\\s*(['\"]?)(.*?)\\1\\s*\\)/gi, function (fullMatch, quote, resourceUrl) {{
            var rewritten = toResourceUrl(resourceUrl);
            if (!rewritten) return fullMatch;
            return 'url(' + (quote || '') + rewritten + (quote || '') + ')';
        }});
    }}

    function rewriteAttribute(node, attributeName, rewriteFn) {{
        if (!node || !node.hasAttribute || !node.hasAttribute(attributeName)) return;
        var currentValue = node.getAttribute(attributeName);
        var rewritten = rewriteFn(currentValue);
        if (!rewritten || rewritten === currentValue) return;
        node.setAttribute(attributeName, rewritten);
    }}

    function rewriteElement(node) {{
        if (!node || node.nodeType !== 1 || !node.tagName) return;
        var tagName = String(node.tagName).toLowerCase();

        if (tagName === 'script') {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'link' && shouldRewriteLink(node)) {{
            rewriteAttribute(node, 'href', function (value) {{ return toResourceUrl(value); }});
        }}
        if (['img', 'source', 'iframe', 'embed', 'track', 'audio', 'video'].indexOf(tagName) !== -1) {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'video') {{
            rewriteAttribute(node, 'poster', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'object') {{
            rewriteAttribute(node, 'data', function (value) {{ return toResourceUrl(value); }});
        }}
        if (tagName === 'input') {{
            rewriteAttribute(node, 'src', function (value) {{ return toResourceUrl(value); }});
            rewriteAttribute(node, 'formaction', function (value) {{ return toViewUrl(value); }});
        }}
        if (tagName === 'img' || tagName === 'source') {{
            rewriteAttribute(node, 'srcset', rewriteSrcsetValue);
        }}
        rewriteAttribute(node, 'style', rewriteCssUrls);

        if (['script', 'link', 'img', 'source', 'video', 'audio', 'iframe', 'embed', 'object', 'track'].indexOf(tagName) !== -1) {{
            node.removeAttribute('crossorigin');
            node.removeAttribute('integrity');
        }}
    }}

    function rewriteTree(root) {{
        if (!root || root.nodeType !== 1) return;
        rewriteElement(root);
        if (!root.querySelectorAll) return;
        root.querySelectorAll('*').forEach(rewriteElement);
    }}

    try {{
        var nativeAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function (child) {{
            rewriteTree(child);
            return nativeAppendChild.call(this, child);
        }};
    }} catch (error) {{}}

    try {{
        var nativeInsertBefore = Node.prototype.insertBefore;
        Node.prototype.insertBefore = function (newNode, referenceNode) {{
            rewriteTree(newNode);
            return nativeInsertBefore.call(this, newNode, referenceNode);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplaceChild = Node.prototype.replaceChild;
        Node.prototype.replaceChild = function (newChild, oldChild) {{
            rewriteTree(newChild);
            return nativeReplaceChild.call(this, newChild, oldChild);
        }};
    }} catch (error) {{}}

    try {{
        rewriteTree(document.documentElement);
        var observer = new MutationObserver(function (records) {{
            records.forEach(function (record) {{
                if (record.type === 'attributes') {{
                    rewriteElement(record.target);
                    return;
                }}
                record.addedNodes.forEach(function (node) {{
                    rewriteTree(node);
                }});
            }});
        }});
        observer.observe(document.documentElement || document, {{
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'href', 'srcset', 'style', 'poster', 'data', 'formaction', 'crossorigin', 'integrity']
        }});
    }} catch (error) {{}}

    var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
    if (nativeFetch) {{
        window.fetch = function (input, init) {{
            var rawUrl = '';
            var method = 'GET';
            if (typeof input === 'string' || input instanceof URL) {{
                rawUrl = String(input);
            }} else if (input && typeof input.url === 'string') {{
                rawUrl = input.url;
                method = input.method || method;
            }}
            if (init && init.method) method = init.method;

            if (isBridgeUrl(rawUrl)) {{
                return nativeFetch(input, init);
            }}

            var resourceUrl = toResourceUrl(rawUrl);
            if (!resourceUrl) {{
                return nativeFetch(input, init);
            }}

            method = String(method || 'GET').toUpperCase();
            if (method !== 'GET' && method !== 'POST') {{
                return nativeFetch(input, init);
            }}

            var nextInit = Object.assign({{}}, init || {{}});
            nextInit.method = method;
            if (!nextInit.headers && input && input.headers) {{
                nextInit.headers = input.headers;
            }}

            return nativeFetch(resourceUrl, nextInit);
        }};
    }}

    if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {{
        var nativeOpen = window.XMLHttpRequest.prototype.open;
        window.XMLHttpRequest.prototype.open = function (method, rawUrl) {{
            var nextUrl = rawUrl;
            if (!isBridgeUrl(rawUrl)) {{
                var resourceUrl = toResourceUrl(rawUrl);
                if (resourceUrl) {{
                    nextUrl = resourceUrl;
                }}
            }}
            var args = Array.prototype.slice.call(arguments);
            args[1] = nextUrl;
            return nativeOpen.apply(this, args);
        }};
    }}

    if (window.EventSource) {{
        var NativeEventSource = window.EventSource;
        window.EventSource = function (rawUrl, config) {{
            var nextUrl = isBridgeUrl(rawUrl) ? String(rawUrl) : (toResourceUrl(rawUrl) || rawUrl);
            return new NativeEventSource(nextUrl, config);
        }};
        window.EventSource.prototype = NativeEventSource.prototype;
    }}

    if (window.WebSocket) {{
        var NativeWebSocket = window.WebSocket;
        window.WebSocket = function (rawUrl, protocols) {{
            var absoluteUrl = resolveUrl(rawUrl);
            if (absoluteUrl) {{
                absoluteUrl = absoluteUrl.replace(/^http/i, 'ws');
            }} else {{
                absoluteUrl = rawUrl;
            }}
            return protocols ? new NativeWebSocket(absoluteUrl, protocols) : new NativeWebSocket(absoluteUrl);
        }};
        window.WebSocket.prototype = NativeWebSocket.prototype;
    }}

    try {{
        var nativePushState = history.pushState.bind(history);
        history.pushState = function (state, title, rawUrl) {{
            if (rawUrl != null) {{
                var viewUrl = toViewUrl(rawUrl);
                if (viewUrl) rawUrl = viewUrl;
            }}
            return nativePushState(state, title, rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplaceState = history.replaceState.bind(history);
        history.replaceState = function (state, title, rawUrl) {{
            if (rawUrl != null) {{
                var viewUrl = toViewUrl(rawUrl);
                if (viewUrl) rawUrl = viewUrl;
            }}
            return nativeReplaceState(state, title, rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeAssign = window.location.assign.bind(window.location);
        window.location.assign = function (rawUrl) {{
            var viewUrl = toViewUrl(rawUrl);
            return nativeAssign(viewUrl || rawUrl);
        }};
    }} catch (error) {{}}

    try {{
        var nativeReplace = window.location.replace.bind(window.location);
        window.location.replace = function (rawUrl) {{
            var viewUrl = toViewUrl(rawUrl);
            return nativeReplace(viewUrl || rawUrl);
        }};
    }} catch (error) {{}}

    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {{
        try {{
            navigator.serviceWorker.register = function () {{
                return Promise.reject(new Error('Service workers are disabled inside the EveOS popup bridge.'));
            }};
        }} catch (error) {{}}
    }}

    window.__EVEOS_POPUP_BRIDGE__ = {{
        targetUrl: TARGET_URL,
        viewPrefix: VIEW_PREFIX,
        resourcePrefix: RESOURCE_PREFIX
    }};
}})();
</script>
""".strip()
