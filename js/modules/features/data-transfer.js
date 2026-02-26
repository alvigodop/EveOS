// --- Data Transfer Module ---
// Handles import/export of backup data
(function () {
    window.importData = function (inputElement) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const json = JSON.parse(e.target.result);

                    if (json.links && !json.config) {
                        // Organized Backup (Links only)
                        if (await showConfirm("Restore Organized Backup? (Overwrites Everything)")) {
                            window.links = json.links;
                            if (json.date) console.log("Backup Date:", json.date);
                            saveData();
                            location.reload();
                            showToast("Organized Backup Restored!", "success");
                        }
                    } else if (json.links && json.config) {
                        // Full Backup
                        if (await showConfirm("Restore Full Backup? (Overwrites Settings & Workspaces)")) {
                            window.links = json.links;
                            window.config = json.config;
                            saveData();
                            saveConfig();
                            location.reload();
                            showToast("Full Backup Restored!", "success");
                        }
                    } else if (Array.isArray(json)) {
                        // Legacy: Raw Array
                        window.links = json;
                        saveData();
                        location.reload();
                    } else if (json.children || json.title) {
                        showToast("Importing bookmarks structure...", "info");
                    } else {
                        showToast("Invalid Backup File", "error");
                    }
                } catch (err) {
                    showToast("Error importing: " + err.message, "error");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    window.exportData = function () {
        const data = {
            date: new Date().toISOString(),
            config: window.config,
            links: window.links
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `eve_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    };
})();
