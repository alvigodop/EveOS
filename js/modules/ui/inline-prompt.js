// --- Inline Prompt Popover ---
// Replaces browser prompt() with a styled in-app input popover.
window.EveInlinePrompt = (function () {
    var OVERLAY_ID = 'eve-inline-prompt-overlay';

    function getOrCreateOverlay() {
        var existing = document.getElementById(OVERLAY_ID);
        if (existing) return existing;

        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'eve-inline-prompt-overlay';
        overlay.innerHTML = [
            '<div class="eve-inline-prompt-box">',
            '  <div class="eve-inline-prompt-label" id="eve-inline-prompt-label"></div>',
            '  <input type="text" class="eve-inline-prompt-input" id="eve-inline-prompt-input" autocomplete="off" spellcheck="false">',
            '  <div class="eve-inline-prompt-actions">',
            '    <button class="eve-inline-prompt-ok" id="eve-inline-prompt-ok">OK</button>',
            '    <button class="eve-inline-prompt-cancel" id="eve-inline-prompt-cancel">Cancel</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);

        // Close on backdrop click
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) dismiss();
        });

        return overlay;
    }

    var _resolve = null;

    function dismiss(value) {
        var overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.classList.remove('is-visible');
        if (_resolve) {
            _resolve(value !== undefined ? value : null);
            _resolve = null;
        }
    }

    /**
     * Show an inline prompt popover.
     * @param {Object} opts
     * @param {string} opts.label - Prompt text
     * @param {string} [opts.value] - Default value
     * @param {string} [opts.type] - Input type (default: 'text')
     * @param {HTMLElement} [opts.anchor] - Position near this element
     * @returns {Promise<string|null>} User input or null if cancelled
     */
    function show(opts) {
        opts = opts || {};
        var overlay = getOrCreateOverlay();
        var box = overlay.querySelector('.eve-inline-prompt-box');
        var labelEl = document.getElementById('eve-inline-prompt-label');
        var input = document.getElementById('eve-inline-prompt-input');
        var okBtn = document.getElementById('eve-inline-prompt-ok');
        var cancelBtn = document.getElementById('eve-inline-prompt-cancel');

        if (labelEl) labelEl.textContent = opts.label || 'Enter value:';
        if (input) {
            input.type = opts.type || 'text';
            input.value = opts.value || '';
            input.placeholder = opts.placeholder || '';
            if (opts.min !== undefined && opts.min !== null && opts.min !== '') input.min = String(opts.min);
            else input.removeAttribute('min');
            if (opts.max !== undefined && opts.max !== null && opts.max !== '') input.max = String(opts.max);
            else input.removeAttribute('max');
            if (opts.step !== undefined && opts.step !== null && opts.step !== '') input.step = String(opts.step);
            else input.removeAttribute('step');
            if (opts.inputMode) input.setAttribute('inputmode', String(opts.inputMode));
            else input.removeAttribute('inputmode');
        }

        // Position near anchor if provided
        if (opts.anchor && box) {
            var rect = opts.anchor.getBoundingClientRect();
            var boxW = 240;
            var left = rect.left + rect.width / 2 - boxW / 2;
            var top = rect.bottom + 6;

            // Keep in viewport
            if (left < 10) left = 10;
            if (left + boxW > window.innerWidth - 10) left = window.innerWidth - boxW - 10;
            if (top + 120 > window.innerHeight) top = rect.top - 120;

            box.style.position = 'fixed';
            box.style.left = Math.round(left) + 'px';
            box.style.top = Math.round(top) + 'px';
            box.style.transform = 'none';
        } else {
            box.style.position = '';
            box.style.left = '';
            box.style.top = '';
            box.style.transform = '';
        }

        overlay.classList.add('is-visible');

        // Focus and select input
        setTimeout(function () {
            if (input) { input.focus(); input.select(); }
        }, 50);

        return new Promise(function (resolve) {
            _resolve = resolve;

            // Clean up old listeners
            var newOk = okBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOk, okBtn);
            var newCancel = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

            newOk.addEventListener('click', function () {
                dismiss(input ? input.value : '');
            });
            newCancel.addEventListener('click', function () {
                dismiss(null);
            });

            // Enter to submit, Escape to cancel
            input.onkeydown = function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    dismiss(input.value);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dismiss(null);
                }
            };
        });
    }

    return { show: show, dismiss: dismiss };
})();
