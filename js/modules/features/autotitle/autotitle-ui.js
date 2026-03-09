// --- AUTO-TITLE UI MODULE ---

window.fetchTitle = async function (btn) {
    const urlInput = document.getElementById('newUrl');
    const url = urlInput.value.trim();
    if (!url) return showToast("Please enter a URL first.", "warning");

    const originalText = btn.innerText;
    btn.innerText = "⏳";
    btn.disabled = true;

    try {
        const data = await window.getTitleFromUrl(url);
        if (data && data.title) {
            if (data.title === "CLOUDFLARE_BLOCK") {
                showToast("Protected by Cloudflare. Defaulting to URL.", "warning");
            } else {
                document.getElementById('newTitle').value = data.title;
                if (data.isFallback) showToast("Proxies blocked. Derived title from URL.", "info");

                if (data.icon) {
                    const iconInput = document.getElementById('newIcon');
                    if (iconInput) iconInput.value = data.icon;
                }
                if (data.coverUrl) {
                    const coverInput = document.getElementById('newCoverImage');
                    if (coverInput) coverInput.value = data.coverUrl;
                }
            }
        } else {
            showToast("Could not find a title on that page.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Failed to fetch page title. The site might be blocking proxies.", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};


