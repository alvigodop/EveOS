window.EveMatrixWorkshop = window.EveMatrixWorkshop || {};

(function (ns) {
    'use strict';

    const OVERLAY_ID = 'matrix-workshop-overlay';
    const FRAME_ID = 'matrix-workshop-frame';
    const SOURCE_PATH = 'tools/workshop/MatrixBackground-V2-Upgrading.html';
    let previousFocus = null;
    let previousBodyOverflow = '';

    function getLauncher() {
        return document.querySelector('.topbar-matrix-btn');
    }

    function isOpen() {
        return document.getElementById(OVERLAY_ID)?.classList.contains('is-open') || false;
    }

    function updateLauncher(open) {
        const launcher = getLauncher();
        if (launcher) launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function getSourceUrl() {
        return new URL(SOURCE_PATH, window.location.href).href;
    }

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'matrix-workshop-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'matrix-workshop-title');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <section class="matrix-workshop-shell">
                <header class="matrix-workshop-header">
                    <div class="matrix-workshop-identity">
                        <span class="matrix-workshop-mark" aria-hidden="true"></span>
                        <div class="matrix-workshop-heading">
                            <strong id="matrix-workshop-title">Matrix Workshop</strong>
                            <span data-matrix-status>Local visual engine</span>
                        </div>
                    </div>
                    <button class="matrix-workshop-close" type="button"
                        data-matrix-close aria-label="Close Matrix Workshop"
                        title="Close Matrix Workshop">Close <span aria-hidden="true">&times;</span></button>
                </header>
                <div class="matrix-workshop-stage">
                    <div class="matrix-workshop-loader" data-matrix-loader>
                        <span class="matrix-workshop-loader-grid" aria-hidden="true"></span>
                        <strong>Initializing Matrix</strong>
                    </div>
                    <iframe id="${FRAME_ID}" class="matrix-workshop-frame"
                        title="Matrix Code Rain Workshop" allow="fullscreen"></iframe>
                </div>
            </section>`;

        const frame = overlay.querySelector(`#${FRAME_ID}`);
        frame.addEventListener('load', function () {
            if (!isOpen() || frame.src === 'about:blank') return;
            overlay.classList.remove('is-loading');
            const status = overlay.querySelector('[data-matrix-status]');
            if (status) status.textContent = 'Visual engine online';
        });

        overlay.querySelector('[data-matrix-close]')?.addEventListener('click', ns.close);
        document.body.appendChild(overlay);
        return overlay;
    }

    function ensureOverlay() {
        return document.getElementById(OVERLAY_ID) || createOverlay();
    }

    ns.open = function openMatrixWorkshop() {
        const overlay = ensureOverlay();
        if (isOpen()) return;

        if (window.EveConstellationMap?.closeMap) {
            window.EveConstellationMap.closeMap();
        }

        previousFocus = document.activeElement;
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('matrix-workshop-open');

        const frame = overlay.querySelector(`#${FRAME_ID}`);
        const status = overlay.querySelector('[data-matrix-status]');
        if (status) status.textContent = 'Starting local visual engine';
        overlay.classList.add('is-open', 'is-loading');
        overlay.setAttribute('aria-hidden', 'false');
        updateLauncher(true);

        if (frame) frame.src = getSourceUrl();
        requestAnimationFrame(function () {
            overlay.querySelector('[data-matrix-close]')?.focus();
        });
    };

    ns.close = function closeMatrixWorkshop() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay || !isOpen()) return;

        overlay.classList.remove('is-open', 'is-loading');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('matrix-workshop-open');
        document.body.style.overflow = previousBodyOverflow;
        updateLauncher(false);

        const frame = overlay.querySelector(`#${FRAME_ID}`);
        if (frame) frame.src = 'about:blank';

        if (previousFocus && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
        previousFocus = null;
    };

    ns.isOpen = isOpen;

    window.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !isOpen()) return;
        event.preventDefault();
        ns.close();
    });

    window.dispatchEvent(new CustomEvent('eve:matrix-workshop-ready'));
    if (window.__eveMatrixOpenPending) {
        window.__eveMatrixOpenPending = false;
        setTimeout(ns.open, 0);
    }
})(window.EveMatrixWorkshop);
