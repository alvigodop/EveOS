(function () {
    var peekEl = null;
    var hideTimer = null;
    var displayTimer = null;

    /**
     * Clear all active timers to prevent race conditions.
     */
    function clearTimers() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        if (displayTimer) {
            clearTimeout(displayTimer);
            displayTimer = null;
        }
    }

    /**
     * Ensure the peek element exists in the DOM.
     */
    function ensurePeek() {
        if (peekEl) return peekEl;

        peekEl = document.createElement('div');
        peekEl.id = 'ws-path-peek';
        peekEl.className = 'ws-path-peek';
        
        // Prevent peek from being dismissed if mouse is actually inside it
        peekEl.onmouseenter = function() { clearTimers(); };
        peekEl.onmouseleave = function() { hidePathPeek(); };

        document.body.appendChild(peekEl);
        return peekEl;
    }

    /**
     * Helper to escape HTML attributes.
     */
    function esc(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Helper to escape JS strings.
     */
    function escJs(text) {
        if (!text) return '';
        return String(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'");
    }

    /**
     * Show the full workspace path peek.
     */
    window.showPathPeek = function (event, wsId) {
        if (!wsId) return;
        var helpers = window.EveWorkspaceHelpers;
        if (!helpers) return;

        var path = helpers.getPath(config.workspaces, wsId);
        if (!path || path.length === 0) return;

        clearTimers();
        var peek = ensurePeek();

        // Build interactive breadcrumb HTML (ES5 concatenation)
        var html = '';
        for (var i = 0; i < path.length; i++) {
            var node = path[i];
            if (i > 0) {
                html += '<span class="path-separator">›</span>';
            }
            var nodeName = String(node.name || 'Workspace');
            var safeName = esc(nodeName);
            var safeId = escJs(node.id);
            var nodeIcon = node.icon || '📁';
            
            html += '<button class="path-segment" title="Go to ' + safeName + '" ' +
                    'onclick="event.preventDefault(); event.stopPropagation(); window.switchWorkspace(\'' + safeId + '\'); window.hidePathPeek(true);">' +
                    nodeIcon + ' ' + safeName + '</button>';
        }

        peek.innerHTML = html;
        peek.classList.add('active');
        peek.style.display = 'flex';

        // Position near the marker
        var rect = event.currentTarget.getBoundingClientRect();
        peek.style.top = (rect.top - 40) + 'px';
        peek.style.left = rect.left + 'px';

        // Constraint within viewport
        requestAnimationFrame(function () {
            var peekRect = peek.getBoundingClientRect();
            if (peekRect.bottom > window.innerHeight) {
                peek.style.top = (rect.top - peekRect.height - 10) + 'px';
            }
            if (peekRect.right > window.innerWidth) {
                peek.style.left = (window.innerWidth - peekRect.width - 20) + 'px';
            }
        });
    };

    /**
     * Handle mouse movement while hovering the marker/peek.
     */
    window.movePathPeek = function (event) {
        // No-op
    };

    /**
     * Dismiss the peek with a fade-out.
     */
    window.hidePathPeek = function (immediate) {
        if (!peekEl) return;

        clearTimers();

        if (immediate === true) {
            peekEl.classList.remove('active');
            peekEl.style.display = 'none';
        } else {
            hideTimer = setTimeout(function () {
                peekEl.classList.remove('active');
                displayTimer = setTimeout(function () {
                    peekEl.style.display = 'none';
                }, 150);
            }, 50);
        }
    };

    // Global "Emergency Brakes"
    window.addEventListener('scroll', function() { hidePathPeek(true); }, { passive: true });
    window.addEventListener('click', function(e) {
        if (peekEl && !peekEl.contains(e.target)) hidePathPeek(true);
    });

})();
