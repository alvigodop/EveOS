// --- UTILS ---
function normalizeUrl(url) {
    if (!url) return "";
    if (url.startsWith('file://')) return url;
    if (!/^https?:\/\//i.test(url)) return 'https://' + url;
    return url;
}

function saveNotes() {
    const notesArea = document.getElementById('notes-area');
    if (notesArea) localStorage.setItem('eveV22Notes', notesArea.value);
}
