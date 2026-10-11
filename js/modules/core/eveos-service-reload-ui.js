(function () {
    'use strict';

    if (window.EveOSServiceReloadUI) return;

    const CONFIRM_MS = 8000;

    function serviceLabel(button) {
        const title = String(button?.title || '');
        const match = title.match(/running (.+?) service$/i);
        return match?.[1] || String(button?.dataset?.eveosServiceRestart || 'selected service');
    }

    function reset(button, originalText, originalLabel, originalTitle) {
        if (!button?.isConnected || button.dataset.eveosRestartConfirm !== 'true') return;
        delete button.dataset.eveosRestartConfirm;
        button.textContent = originalText;
        if (originalLabel) button.setAttribute('aria-label', originalLabel);
        else button.removeAttribute('aria-label');
        button.title = originalTitle;
    }

    document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-eveos-service-restart]');
        if (!button || button.disabled) return;
        if (button.dataset.eveosRestartConfirm === 'true') {
            delete button.dataset.eveosRestartConfirm;
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        const label = serviceLabel(button);
        const originalText = button.textContent;
        const originalLabel = button.getAttribute('aria-label') || '';
        const originalTitle = button.title || '';
        button.dataset.eveosRestartConfirm = 'true';
        button.textContent = 'Confirm restart';
        button.setAttribute('aria-label', `Confirm restart ${label}`);
        button.title = `Confirm restart of ${label}. This interrupts only ${label}; unrelated services stay running.`;
        window.setTimeout(() => reset(button, originalText, originalLabel, originalTitle), CONFIRM_MS);
    }, true);

    window.EveOSServiceReloadUI = { ready: true };
})();
