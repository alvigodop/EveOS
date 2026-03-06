window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createPanelBackupHelpers) return;

    window.EveLibrary.UIModules.createPanelBackupHelpers = function createPanelBackupHelpers(deps) {
        const Storage = deps.Storage;

        function openLightbox(imageUrl) {
            if (!imageUrl) return;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;cursor:zoom-out;';
            overlay.innerHTML = `<img src="${imageUrl}" style="max-width:90%;max-height:90%;border-radius:4px;">`;
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        }

        function showBackups() {
            const backups = Storage.getBackups();
            if (!backups || backups.length === 0) {
                if (typeof showToast === 'function') showToast('No local backups found.', 'warning');
                else alert('No local backups found.');
                return;
            }

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;display:flex;justify-content:center;align-items:center;flex-direction:column;color:#fff;';

            let html = '<div style="background:#222;padding:20px;border-radius:8px;border:1px solid #444;max-width:400px;width:100%;"><h3>Restore Backup</h3><p style="color:#aaa;font-size:0.9em;margin-bottom:15px;">Warning: This will overwrite ALL library data in ALL categories.</p><ul style="list-style:none;padding:0;margin-bottom:20px;">';

            backups.slice().reverse().forEach((backup) => {
                const date = new Date(backup.timestamp).toLocaleString();
                const originalIndex = backups.indexOf(backup);
                html += `<li style="display:flex;justify-content:space-between;border-bottom:1px solid #333;padding:8px 0;">
                            <span>${date}</span>
                            <button onclick="window.EveLibrary.UI.restoreBackup(${originalIndex})" style="background:#4B0082;border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;">Restore</button>
                         </li>`;
            });

            html += '</ul><button onclick="this.parentElement.parentElement.remove()" style="width:100%;padding:8px;background:#444;border:none;color:#fff;cursor:pointer;border-radius:4px;">Cancel</button></div>';
            overlay.innerHTML = html;
            document.body.appendChild(overlay);
        }

        function restoreBackup(index) {
            if (!confirm('Are you sure? Current data will be lost.')) return;
            if (Storage.restoreBackup(index)) {
                if (typeof showToast === 'function') showToast('Library restored successfully!');
                else alert('Restored!');
                window.location.reload();
                return;
            }
            alert('Failed to restore.');
        }

        return {
            openLightbox,
            showBackups,
            restoreBackup
        };
    };
})();
