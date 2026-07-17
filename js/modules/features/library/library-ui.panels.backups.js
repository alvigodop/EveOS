window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelBackupHelpers) return;

    window.EveLibrary.UIModules.createPanelBackupHelpers = function createPanelBackupHelpers(deps) {
        const Storage = deps.Storage;

        function notify(message, type) {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
            } else {
                console[type === 'error' ? 'error' : 'warn']('[EveOS library]', message);
            }
        }

        function openLightbox(imageUrl) {
            if (!imageUrl) return;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;justify-content:center;align-items:center;cursor:zoom-out;';
            const image = document.createElement('img');
            image.src = String(imageUrl);
            image.alt = 'Library cover preview';
            image.style.cssText = 'max-width:90%;max-height:90%;border-radius:4px;';
            overlay.appendChild(image);
            overlay.addEventListener('click', function () { overlay.remove(); }, { once: true });
            document.body.appendChild(overlay);
        }

        function createButton(label, onClick, styleText) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.style.cssText = styleText;
            button.addEventListener('click', onClick);
            return button;
        }

        function showBackups() {
            const backups = Storage.getBackups();
            if (!Array.isArray(backups) || backups.length === 0) {
                notify('No local backups found.', 'warning');
                return;
            }

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;justify-content:center;align-items:center;color:#fff;';
            const panel = document.createElement('section');
            panel.style.cssText = 'background:#222;padding:20px;border-radius:8px;border:1px solid #444;max-width:400px;width:min(100% - 32px,400px);';
            const heading = document.createElement('h3');
            heading.textContent = 'Restore Backup';
            const warning = document.createElement('p');
            warning.textContent = 'Warning: this overwrites library data in every category.';
            warning.style.cssText = 'color:#aaa;font-size:.9em;margin-bottom:15px;';
            const list = document.createElement('ul');
            list.style.cssText = 'list-style:none;padding:0;margin-bottom:20px;max-height:50vh;overflow:auto;';

            backups.slice().reverse().forEach(function (backup) {
                const originalIndex = backups.indexOf(backup);
                const row = document.createElement('li');
                row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #333;padding:8px 0;';
                const date = document.createElement('span');
                date.textContent = new Date(backup.timestamp).toLocaleString();
                row.append(date, createButton('Restore', function () {
                    restoreBackup(originalIndex);
                }, 'background:#4B0082;border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;'));
                list.appendChild(row);
            });

            const cancel = createButton('Cancel', function () {
                overlay.remove();
            }, 'width:100%;padding:8px;background:#444;border:none;color:#fff;cursor:pointer;border-radius:4px;');
            panel.append(heading, warning, list, cancel);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        }

        async function restoreBackup(index) {
            const confirmed = typeof window.showConfirm === 'function'
                ? await window.showConfirm('Restore this backup? Current library data will be replaced.', {
                    title: 'Restore Library Backup',
                    confirmLabel: 'Restore',
                    kind: 'danger'
                })
                : false;
            if (!confirmed) return false;
            if (!Storage.restoreBackup(index)) {
                notify('Failed to restore the library backup.', 'error');
                return false;
            }
            notify('Library restored successfully.', 'success');
            window.location.reload();
            return true;
        }

        return { openLightbox, showBackups, restoreBackup };
    };
})();