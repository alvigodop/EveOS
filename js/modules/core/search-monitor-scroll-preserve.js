/**
 * Search Monitor Scroll Preservation
 *
 * The expanded Search Monitor / Gemini workspace scroll areas (the control column, chat log,
 * system log, past chats) could snap back to the top when a periodic update re-rendered a
 * subtree or some code reset scrollTop. The fix here is source-agnostic: remember where the USER
 * scrolled each container, and if something later resets it to the top without user input, snap
 * it back to where they were.
 *
 * It only ever restores when a container is reset to ~top while we hold a meaningful saved
 * position, so it never fights a deliberate scroll-to-top and never interferes with the chat's
 * auto-scroll-to-bottom (which lands far from the top).
 */
(function () {
    'use strict';
    if (window.__eveMonitorScrollPreserveReady) return;
    window.__eveMonitorScrollPreserveReady = true;

    const ROOT_ID = 'loadingIndicator';
    const SCROLLER_SELECTOR = [
        '.left-column', '.right-column',
        '.chat-messages-container', '.gemini-chat-messages',
        '.system-messages-container', '.gemini-system-messages',
        '#pastChatsLog', '#previousConversationContent'
    ].join(', ');
    // Stable keys so a saved position survives the container being re-rendered/replaced.
    const KEY_CLASSES = [
        'left-column', 'right-column', 'chat-messages-container', 'gemini-chat-messages',
        'system-messages-container', 'gemini-system-messages'
    ];
    const MIN_MEANINGFUL = 4;     // ignore tiny scrolls
    const USER_INPUT_WINDOW_MS = 700;

    const saved = Object.create(null);
    let lastUserInputAt = 0;
    let restoring = false;

    function root() { return document.getElementById(ROOT_ID); }

    function keyFor(el) {
        if (el.id) return '#' + el.id;
        for (let i = 0; i < KEY_CLASSES.length; i += 1) {
            if (el.classList && el.classList.contains(KEY_CLASSES[i])) return '.' + KEY_CLASSES[i];
        }
        return null;
    }

    function isScroller(el) {
        return el instanceof Element
            && typeof el.matches === 'function'
            && el.matches(SCROLLER_SELECTOR)
            && !!keyFor(el);
    }

    // Track genuine user intent so we don't mistake a programmatic reset for a user scroll.
    ['wheel', 'touchmove', 'keydown', 'pointerdown', 'mousedown'].forEach(function (type) {
        document.addEventListener(type, function () { lastUserInputAt = Date.now(); },
            { capture: true, passive: true });
    });

    // scroll doesn't bubble -> listen in the capture phase.
    document.addEventListener('scroll', function (event) {
        const el = event.target;
        if (restoring || !isScroller(el)) return;
        const host = root();
        if (!host || !host.contains(el)) return;
        const key = keyFor(el);
        const userDriven = (Date.now() - lastUserInputAt) < USER_INPUT_WINDOW_MS;
        if (userDriven) {
            // Remember where the user put it (including a deliberate scroll to top).
            saved[key] = el.scrollTop;
        } else if (el.scrollTop <= 1 && saved[key] > MIN_MEANINGFUL && el.scrollHeight > el.clientHeight) {
            // A non-user reset to the top -> put it back where the user was.
            restoring = true;
            el.scrollTop = saved[key];
            restoring = false;
        }
    }, true);

    function restoreAll() {
        const host = root();
        if (!host) return;
        restoring = true;
        try {
            host.querySelectorAll(SCROLLER_SELECTOR).forEach(function (el) {
                const key = keyFor(el);
                if (!key) return;
                const want = saved[key];
                if (want > MIN_MEANINGFUL && el.scrollTop <= 1 && el.scrollHeight > el.clientHeight) {
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
        // Any subtree re-render under the monitor can reset a scroller -> restore next frame.
        const observer = new MutationObserver(function () {
            window.requestAnimationFrame(restoreAll);
        });
        observer.observe(host, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.EveMonitorScrollPreserve = { restoreAll: restoreAll, _saved: saved };
})();
