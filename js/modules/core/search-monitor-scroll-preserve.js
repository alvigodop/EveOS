/**
 * Search Monitor Scroll Preservation
 *
 * The expanded Search Monitor / Gemini workspace scroll areas could snap back to the top when a
 * periodic update or a new Gemini message re-rendered a subtree or reset scrollTop. The fix is
 * source-agnostic: remember where the USER scrolled, and if something later resets a container to
 * the top without user input, snap it back.
 *
 * It is GENERIC — it tracks any scrollable element the user actually scrolls inside the monitor
 * (the outer `.gemini-monitor-shell`, the control column, chat/system logs, past chats, etc.)
 * rather than a hard-coded list, so it can't miss a container. It only restores when a tracked
 * element is reset to ~top while we hold a meaningful saved position, so it never fights a
 * deliberate scroll-to-top and never interferes with the chat's auto-scroll-to-bottom.
 */
(function () {
    'use strict';
    if (window.__eveMonitorScrollPreserveReady) return;
    window.__eveMonitorScrollPreserveReady = true;

    const ROOT_ID = 'loadingIndicator';
    const MIN_MEANINGFUL = 4;          // ignore tiny scrolls
    const SCROLLABLE_SLACK = 8;        // px of overflow needed to count as scrollable
    const USER_INPUT_WINDOW_MS = 700;

    const sigTop = Object.create(null);   // signature -> last user scrollTop (survives re-render)
    const tracked = new Set();            // live element refs the user has scrolled
    let lastUserInputAt = 0;
    let restoring = false;

    function root() { return document.getElementById(ROOT_ID); }

    function isScrollable(el) {
        return el instanceof Element && (el.scrollHeight - el.clientHeight) > SCROLLABLE_SLACK;
    }

    // Stable-ish key so a saved position can survive the container being re-rendered/replaced.
    function signature(el) {
        if (el.id) return '#' + el.id;
        let cls = '';
        if (typeof el.className === 'string' && el.className.trim()) {
            cls = '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.');
        }
        return el.tagName.toLowerCase() + cls;
    }

    // Track genuine user intent so a programmatic reset isn't mistaken for a user scroll.
    ['wheel', 'touchmove', 'keydown', 'pointerdown', 'mousedown'].forEach(function (type) {
        document.addEventListener(type, function () { lastUserInputAt = Date.now(); },
            { capture: true, passive: true });
    });

    // scroll doesn't bubble -> capture phase.
    document.addEventListener('scroll', function (event) {
        const el = event.target;
        if (restoring || !(el instanceof Element)) return;
        const host = root();
        if (!host || !host.contains(el) || !isScrollable(el)) return;
        const key = signature(el);
        if ((Date.now() - lastUserInputAt) < USER_INPUT_WINDOW_MS) {
            // User put it here (including a deliberate scroll to top) -> remember it.
            sigTop[key] = el.scrollTop;
            tracked.add(el);
        } else if (el.scrollTop <= 1 && sigTop[key] > MIN_MEANINGFUL) {
            // A non-user reset to the top -> put it back where the user was.
            restoring = true;
            el.scrollTop = sigTop[key];
            restoring = false;
        }
    }, true);

    function restoreAll() {
        const host = root();
        if (!host) return;
        restoring = true;
        try {
            tracked.forEach(function (el) {
                if (!host.contains(el)) { tracked.delete(el); return; }
                const want = sigTop[signature(el)];
                if (want > MIN_MEANINGFUL && el.scrollTop <= 1 && (el.scrollHeight - el.clientHeight) > SCROLLABLE_SLACK) {
                    el.scrollTop = want;
                }
            });
        } finally {
            restoring = false;
        }
    }

    function start() {
        const host = root();
        if (!host) { window.setTimeout(start, 800); return; }
        // Any subtree re-render under the monitor (e.g. a new Gemini message) can reset a
        // scroller -> restore on the next frame, and again shortly after in case content/height
        // was still settling when the first restore ran.
        const observer = new MutationObserver(function () {
            window.requestAnimationFrame(restoreAll);
            window.setTimeout(restoreAll, 120);
        });
        observer.observe(host, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.EveMonitorScrollPreserve = { restoreAll: restoreAll, _sigTop: sigTop, _tracked: tracked };
})();
