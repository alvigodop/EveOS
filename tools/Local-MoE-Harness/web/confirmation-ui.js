(function attachConfirmation(root) {
  let pending = false;

  function ask(message, {confirmLabel = 'Confirm'} = {}) {
    if (pending) return Promise.resolve(false);
    pending = true;
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'local-confirm-overlay';
    const panel = document.createElement('div');
    panel.className = 'local-confirm-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'local-confirm-title');
    panel.setAttribute('aria-describedby', 'local-confirm-message');
    const title = document.createElement('h2');
    title.id = 'local-confirm-title';
    title.textContent = 'Confirm local action';
    const description = document.createElement('p');
    description.id = 'local-confirm-message';
    description.textContent = String(message);
    const actions = document.createElement('div');
    actions.className = 'local-confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary';
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    panel.append(title, description, actions);
    overlay.append(panel);
    document.body.append(overlay);

    return new Promise((resolve) => {
      const finish = (accepted) => {
        overlay.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        pending = false;
        previousFocus?.focus?.();
        resolve(accepted);
      };
      const onKeyDown = (event) => {
        if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        if (event.key === 'Tab') {
          if (event.shiftKey && document.activeElement === cancel) {
            event.preventDefault(); confirm.focus();
          } else if (!event.shiftKey && document.activeElement === confirm) {
            event.preventDefault(); cancel.focus();
          }
        }
      };
      overlay.addEventListener('keydown', onKeyDown);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) finish(false);
      });
      cancel.addEventListener('click', () => finish(false));
      confirm.addEventListener('click', () => finish(true));
      cancel.focus();
    });
  }

  root.LocalMoeConfirm = {ask};
})(window);
