const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file:///' + path.join(REPO_ROOT, 'EveOS.html').replace(/\\/g, '/');

async function waitForApp(page) {
    await page.waitForFunction(() => (
        typeof window.openAddModal === 'function'
        && typeof window.openEdit === 'function'
        && typeof window.saveLink === 'function'
        && typeof window.addBookmarkCoverImageCandidate === 'function'
        && typeof window.setBookmarkFixedCoverImage === 'function'
        && !!window.EveLinkForm?.ready
    ), undefined, { timeout: 180000 });
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

    try {
        await page.goto(FILE_URL, { waitUntil: 'load', timeout: 180000 });
        await waitForApp(page);

        const result = await page.evaluate(() => {
            const originalSaveData = window.saveData;
            const originalShowToast = window.showToast;
            const originalCloseModals = window.closeModals;
            const toasts = [];
            let saveCalls = 0;

            window.links = links = [];
            window.config = config = Object.assign({}, window.config || {}, {
                activeWorkspace: 'main'
            });
            if (window.eveState) {
                window.eveState.links = links;
                window.eveState.config = config;
            }

            window.saveData = function () {
                saveCalls += 1;
            };
            window.showToast = function (message, type) {
                toasts.push({ message, type });
            };
            window.closeModals = function () {
                const modal = document.getElementById('addModal');
                if (modal) modal.style.display = 'none';
            };

            try {
                window.openAddModal('Alpha');

                document.getElementById('newTitle').value = 'Example Title';
                document.getElementById('newUrl').value = 'https://example.com/watch/1';
                document.getElementById('newCategory').value = 'Alpha';
                document.getElementById('newCoverImage').value = 'https://example.com/images/primary.jpg';
                document.getElementById('newCoverImageCandidate').value = 'https://example.com/images/alt.jpg';
                window.addBookmarkCoverImageCandidate();
                window.setBookmarkFixedCoverImage(0);
                window.saveLink();

                if (!Array.isArray(window.links) || !window.links.length) {
                    throw new Error('Link was not saved');
                }

                const saved = JSON.parse(JSON.stringify(window.links[0]));
                window.openEdit(saved.id);

                return {
                    saveCalls,
                    saved,
                    modalTitle: document.getElementById('modalTitle')?.innerText || '',
                    editTitle: document.getElementById('newTitle')?.value || '',
                    editUrl: document.getElementById('newUrl')?.value || '',
                    editCategory: document.getElementById('newCategory')?.value || '',
                    editCover: document.getElementById('newCoverImage')?.value || '',
                    editCoverImages: document.getElementById('newCoverImages')?.value || '',
                    editFixedCover: document.getElementById('newFixedCoverImage')?.value || '',
                    lastToast: toasts[toasts.length - 1] || null
                };
            } finally {
                window.saveData = originalSaveData;
                window.showToast = originalShowToast;
                window.closeModals = originalCloseModals;
            }
        });

        if (result.saveCalls !== 1) {
            throw new Error(`Expected one saveData call, saw ${result.saveCalls}`);
        }
        if (result.saved.title !== 'Example Title') {
            throw new Error(`Expected saved title to persist, saw ${result.saved.title}`);
        }
        if (result.saved.url !== 'https://example.com/watch/1') {
            throw new Error(`Expected saved URL to persist, saw ${result.saved.url}`);
        }
        if (result.saved.category !== 'Alpha') {
            throw new Error(`Expected saved category Alpha, saw ${result.saved.category}`);
        }
        if (result.saved.coverImage !== 'https://example.com/images/primary.jpg') {
            throw new Error(`Expected primary cover to persist, saw ${result.saved.coverImage}`);
        }
        if (!Array.isArray(result.saved.coverImages) || result.saved.coverImages.length !== 1) {
            throw new Error(`Expected one stored cover image candidate, saw ${JSON.stringify(result.saved.coverImages)}`);
        }
        if (result.saved.coverImages[0] !== 'https://example.com/images/alt.jpg') {
            throw new Error(`Expected saved cover image candidate to persist, saw ${JSON.stringify(result.saved.coverImages)}`);
        }
        if (result.saved.fixedCoverImage !== 'https://example.com/images/alt.jpg') {
            throw new Error(`Expected fixed cover to persist, saw ${result.saved.fixedCoverImage}`);
        }
        if (result.modalTitle !== 'Edit Link') {
            throw new Error(`Expected edit modal title, saw ${result.modalTitle}`);
        }
        if (result.editTitle !== 'Example Title' || result.editUrl !== 'https://example.com/watch/1') {
            throw new Error('Edit modal did not repopulate title/url correctly');
        }
        if (result.editCategory !== 'Alpha') {
            throw new Error(`Expected edit category Alpha, saw ${result.editCategory}`);
        }
        if (result.editCover !== 'https://example.com/images/primary.jpg') {
            throw new Error(`Expected edit cover primary image, saw ${result.editCover}`);
        }
        if (!result.editCoverImages.includes('https://example.com/images/alt.jpg')) {
            throw new Error(`Expected edit modal cover list to include alt image, saw ${result.editCoverImages}`);
        }
        if (result.editFixedCover !== 'https://example.com/images/alt.jpg') {
            throw new Error(`Expected edit fixed cover to repopulate, saw ${result.editFixedCover}`);
        }
        if (!result.lastToast || result.lastToast.message !== 'Link Saved') {
            throw new Error(`Expected Link Saved toast, saw ${JSON.stringify(result.lastToast)}`);
        }

        console.log('LINK_FORM_MODAL_BROWSER_SMOKE_OK ' + JSON.stringify(result));
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
