(function () {
    let peekEl = null;
    let hideTimer = null;
    let displayTimer = null;

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
        peekEl.onmouseenter = () => clearTimers();
        peekEl.onmouseleave = () => hidePathPeek();

        document.body.appendChild(peekEl);
        return peekEl;
    }

    /**
     * Show the full workspace path peek.
     */
    window.showPathPeek = function (event, wsId) {
        if (!wsId) return;
        const helpers = window.EveWorkspaceHelpers;
        if (!helpers) return;

        const path = helpers.getPath(config.workspaces, wsId);
        if (!path || path.length === 0) return;

        clearTimers();
        const peek = ensurePeek();

        // Build interactive breadcrumb HTML
        let html = '';
        path.forEach((node, index) => {
            if (index > 0) {
                html += '<span class="path-separator">›</span>';
            }
            const nodeName = String(node.name || 'Workspace');
            const safeName = nodeName.replace(/'/g, "\\'");
            const safeId = String(node.id).replace(/'/g, "\\'");
            
            html += `<button class="path-segment" title="Go to ${nodeName}" onclick="event.preventDefault(); event.stopPropagation(); window.switchWorkspace('${safeId}'); window.hidePathPeek(true);">${node.icon || '📁'} ${nodeName}</button>`;
        });

        peek.innerHTML = html;
        peek.classList.add('active');
        peek.style.display = 'flex';

        // Position near the marker
        const rect = event.currentTarget.getBoundingClientRect();
        peek.style.top = `${rect.top - 40}px`;
        peek.style.left = `${rect.left}px`;

        // Constraint within viewport
        requestAnimationFrame(() => {
            const peekRect = peek.getBoundingClientRect();
            if (peekRect.bottom > window.innerHeight) {
                peek.style.top = `${rect.top - peekRect.height - 10}px`;
            }
            if (peekRect.right > window.innerWidth) {
                peek.style.left = `${window.innerWidth - peekRect.width - 20}px`;
            }
        });
    };

    /**
     * Handle mouse movement while hovering the marker/peek.
     */
    window.movePathPeek = function (event) {
        // No-op for now unless we want follow-cam
    };

    /**
     * Dismiss the peek with a fade-out.
     */
    window.hidePathPeek = function (immediate = false) {
        if (!peekEl) return;

        clearTimers();

        if (immediate) {
            peekEl.classList.remove('active');
            peekEl.style.display = 'none';
        } else {
            hideTimer = setTimeout(() => {
                peekEl.classList.remove('active');
                displayTimer = setTimeout(() => {
                    peekEl.style.display = 'none';
                }, 150);
            }, 50);
        }
    };

    // Global "Emergency Brakes"
    window.addEventListener('scroll', () => hidePathPeek(true), { passive: true });
    window.addEventListener('click', (e) => {
        if (peekEl && !peekEl.contains(e.target)) hidePathPeek(true);
    });

})();
