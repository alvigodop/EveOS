/* Style Loader for EveOS */
(function () {
    const styles = window.EveModuleManifest ? window.EveModuleManifest.styles : [];

    if (!window.EveModuleManifest) {
        console.error("EveOS Manifest not found! Styles will not load.");
    }

    function loadStyle(href) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    async function initStyles() {
        const promises = styles.map(href => loadStyle(href)
            .then(() => ({ status: 'fulfilled', href }))
            .catch(err => ({ status: 'rejected', href, reason: err }))
        );

        const results = await Promise.all(promises);

        const generatedErrors = results.filter(r => r.status === 'rejected');
        if (generatedErrors.length > 0) {
            console.warn('Some styles failed to load:', generatedErrors);
        } else {
            console.log('All modular styles loaded successfully.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStyles);
    } else {
        initStyles();
    }
})();
