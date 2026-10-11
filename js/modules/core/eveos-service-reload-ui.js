(function () {
    'use strict';

    if (window.EveOSServiceReloadUI) return;

    const CONFIRM_MS = 8000;
    const armed = new WeakMap();

    function serviceLabel(button) {
        const title = String(button?.title || '');
        const match = title.match(/running (.+?) service$/i);
        return match?.[1] || String(button?.dataset?.eveosServiceRestart || 'selected service');
    }

    function reset(button) {
        const original = armed.get(button);
        if (!button || !original) return false;
        armed.delete(button);
        delete button.dataset.eveosRestartConfirm;
        if (!button.isConnected) return true;
        button.textContent = original.text;
        if (original.label) button.setAttribute('aria-label', original.label);
        else button.removeAttribute('aria-label');
        button.title = original.title;
        return true;
    }

    document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-eveos-service-restart]');
        if (!button || button.disabled) return;
        if (button.dataset.eveosRestartConfirm === 'true') {
            // Restore the control before allowing its existing lifecycle click handler to run.
            // The timeout is now harmless because reset() consumes the WeakMap entry exactly once.
            reset(button);
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        const label = serviceLabel(button);
        armed.set(button, {
            text: button.textContent,
            label: button.getAttribute('aria-label') || '',
            title: button.title || ''
        });
        button.dataset.eveosRestartConfirm = 'true';
        button.textContent = 'Confirm restart';
        button.setAttribute('aria-label', `Confirm restart ${label}`);
        button.title = `Confirm restart of ${label}. This interrupts only ${label}; unrelated services stay running.`;
        window.setTimeout(() => reset(button), CONFIRM_MS);
    }, true);

    window.EveOSServiceReloadUI = { ready: true };
})();
