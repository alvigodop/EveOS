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

    overlay.style.display = 'flex';

    const cleanup = () => {
        overlay.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
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

    if (isPrompt) {
        input.onkeydown = (e) => {
            if (e.key === 'Enter') confirmBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        };
    }
};
