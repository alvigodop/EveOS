// --- AUTO-TITLE UI MODULE ---

function getLightpandaBlockedMessage(data) {
    const cookiePath = data?.cookieConfigPath || '%LOCALAPPDATA%\\EveOS\\lightpanda-site-cookies.json';
    if (!data?.cookieFileExists) {
        return `Protected page. No local Lightpanda cookie file was found. Add host cookies to ${cookiePath} for real title and cover extraction.`;
    }
    if (!data?.cookieHostConfigured || Number(data?.nonEmptyCookieCount || 0) <= 0) {
        return `Protected page. Lightpanda reached a challenge page and the local cookie file has no active cookies for this host. Update ${cookiePath} for real title and cover extraction.`;
    }
    return `Protected page. Lightpanda reached a challenge page even with local cookies. Refresh the cookies in ${cookiePath} and try again.`;
}

window.fetchTitle = async function (btn) {
    const urlInput = document.getElementById('newUrl');
    const url = String(urlInput?.value || '').trim();
    if (!url) return showToast("Please enter a URL first.", "warning");

    const originalText = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    try {
        const utils = window.EveOS?.Autotitle?.CoreUtils || {};
        const isWeakAutotitleResult = typeof utils.isWeakAutotitleResult === 'function'
            ? utils.isWeakAutotitleResult
            : (result) => !result || !result.title || result.title === "CLOUDFLARE_BLOCK" || !!result.isFallback;
        const mergeAutotitleMetadata = typeof utils.mergeAutotitleMetadata === 'function'
            ? utils.mergeAutotitleMetadata
            : ((primary, candidate) => candidate || primary);
        const adoptAutotitleTitle = typeof utils.adoptAutotitleTitle === 'function'
            ? utils.adoptAutotitleTitle
            : ((primary, candidate) => candidate || primary);
        const isClearlyBetterTitle = typeof utils.isClearlyBetterTitle === 'function'
            ? utils.isClearlyBetterTitle
            : ((candidate, primary) => !!candidate?.title && (!primary?.title || String(candidate.title).length > String(primary.title || '').length));

        const data = await window.getTitleFromUrl(url, { allowSlowCover: true });
        const usedLightpandaFallback = !!(data?.source === 'Lightpanda');
        const lightpandaBlocked = !!data?.lightpandaBlocked;

        if (lightpandaBlocked && isWeakAutotitleResult(data, url)) {
            showToast(getLightpandaBlockedMessage(data), "warning");
            return;
        }

        if (data && data.title) {
            if (data.title === "CLOUDFLARE_BLOCK") {
                showToast("Protected by Cloudflare. Defaulting to URL.", "warning");
            } else {
                document.getElementById('newTitle').value = data.title;
                if (usedLightpandaFallback || data.source === 'Lightpanda') {
                    showToast("Fetched via Lightpanda fallback.", "success");
                } else if (data.isFallback) {
                    showToast("Proxies blocked. Derived title from URL.", "info");
                } else if (data.isAdvancedScrape) {
                    showToast("Fetched via Advanced Scraper Hub.", "success");
                }

                if (data.icon) {
                    const iconInput = document.getElementById('newIcon');
                    if (iconInput) {
                        const currentIcon = String(iconInput.value || '').trim();
                        if (!currentIcon || data.icon) {
                            iconInput.value = data.icon;
                        }
                    }
                }

                if (data.coverUrl) {
                    const coverInput = document.getElementById('newCoverImage');
                    if (coverInput) coverInput.value = data.coverUrl;
                    const libraryImageInput = document.getElementById('libImageUrl');
                    if (libraryImageInput) libraryImageInput.value = data.coverUrl;
                    window.EveLinkForm?.refreshCoverImagesSummary?.();
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
