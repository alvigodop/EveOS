window.getModalStackZIndex = function () {
    const candidates = [
        document.getElementById('constellation-map-overlay'),
        document.getElementById('custom-modal-overlay'),
        document.getElementById('custom-confirm-modal'),
        ...Array.from(document.querySelectorAll('.modal-overlay'))
    ].filter(Boolean);

    return candidates.reduce((maxZ, element) => {
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        if (!style || style.display === 'none' || style.visibility === 'hidden') return maxZ;
        const nextZ = parseInt(style.zIndex, 10);
        return Number.isFinite(nextZ) ? Math.max(maxZ, nextZ) : maxZ;
    }, 3000);
};

window.showConfirm = function (msg) {
    return new Promise((resolve) => {
        window.setupModal('Confirm', msg, false, (result) => resolve(result));
    });
};

window.showPrompt = function (msg, defaultValue = '') {
    return new Promise((resolve) => {
        window.setupModal(msg, '', true, (result) => resolve(result), defaultValue);
    });
};

window.setupModal = function (title, msg, isPrompt, callback, defaultValue = '') {
    const overlay = document.getElementById('custom-modal-overlay');
    const titleEl = document.getElementById('custom-modal-title');
    const msgEl = document.getElementById('custom-modal-msg');
    const inputContainer = document.getElementById('custom-modal-input-container');
    const input = document.getElementById('custom-modal-input');
    const confirmBtn = document.getElementById('custom-modal-confirm');
    const cancelBtn = document.getElementById('custom-modal-cancel');

    if (!overlay) return callback(false);

    titleEl.innerText = title;
    msgEl.innerText = msg;
    msgEl.style.display = msg ? 'block' : 'none';

    if (isPrompt) {
        inputContainer.style.display = 'block';
        input.value = defaultValue;
        input.focus();
    } else {
        inputContainer.style.display = 'none';
    }

    overlay.style.zIndex = String((typeof window.getModalStackZIndex === 'function' ? window.getModalStackZIndex() : 3000) + 2);
    overlay.style.display = 'flex';

    const overlayClickHandler = (event) => {
        if (event.target !== overlay) return;
        cancelBtn.click();
    };
    const keyHandler = (event) => {
        if (event.key === 'Escape') cancelBtn.click();
        if (!isPrompt && event.key === 'Enter') confirmBtn.click();
    };

    const cleanup = () => {
        overlay.style.display = 'none';
        overlay.style.zIndex = '';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
        overlay.onclick = null;
        document.removeEventListener('keydown', keyHandler);
    };

    confirmBtn.onclick = () => {
        cleanup();
        if (isPrompt) callback(input.value);
        else callback(true);
    };

    cancelBtn.onclick = () => {
        cleanup();
        callback(null);
    };

    overlay.onclick = overlayClickHandler;
    document.addEventListener('keydown', keyHandler);

    if (isPrompt) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter') confirmBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };
    }
};
