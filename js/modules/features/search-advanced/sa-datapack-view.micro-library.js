window.EveOS = window.EveOS || {};
window.EveOS.SearchAdvanced = window.EveOS.SearchAdvanced || {};

(function () {
    const ns = window.EveOS.SearchAdvanced;
    if (ns.DatapackViewMicroLibrary) return;

    function list(value) {
        return Array.isArray(value) ? value.join(', ') : String(value || '');
    }

    function numberValue(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) && n > 0 ? String(n) : '';
    }

    function mediaTypeLabel(value) {
        const normalized = String(value || '').trim();
        const dataTypes = window.EveLibrary?.State?.getDataTypes?.() || {};
        return dataTypes[normalized]?.label || normalized;
    }

    function mediaTypeLabels(value) {
        const values = Array.isArray(value)
            ? value
            : String(value || '').split(',').map(part => part.trim()).filter(Boolean);
        return values.map(mediaTypeLabel).filter(Boolean).join(', ');
    }

    function readoutLine(escapeHtml, label, value) {
        if (value === null || value === undefined || value === '') return '';
        return '<span><b>' + escapeHtml(label) + '</b> ' + escapeHtml(value) + '</span>';
    }

    function input(escapeHtml, label, field, value, type) {
        return '<label><span>' + escapeHtml(label) + '</span><input type="' + (type || 'text') + '" data-nx-dv-library-field="' + escapeHtml(field) + '" value="' + escapeHtml(value) + '"></label>';
    }

    function renderLibraryEditor(library, escapeHtml) {
        if (!library?.linked) return '';
        const initial = {
            title: library.title || '',
            titleAltNames: list(library.titleAltNames || library.altTitles),
            author: list(library.author),
            authorAltNames: list(library.authorAltNames),
            artist: list(library.artist),
            mediaTypes: list(library.mediaTypeIds || library.mediaTypes),
            status: library.status || '',
            sourceStatus: library.sourceStatus || '',
            chapter: numberValue(library.chapter),
            graphicChapter: numberValue(library.graphicChapter),
            novelChapter: numberValue(library.novelChapter),
            season: numberValue(library.season),
            episode: numberValue(library.episode),
            rating: library.rating || '',
            sourceUrl: library.sourceUrl || '',
            imageUrl: library.imageUrl || '',
            language: library.language || '',
            genre: list(library.genre),
            tags: list(library.tags),
            summary: library.summary || ''
        };
        const attrs = Object.keys(initial).map(function (field) {
            return ' data-lib-initial-' + field.toLowerCase() + '="' + escapeHtml(initial[field]) + '"';
        }).join('');
        const readableTypes = mediaTypeLabels(library.mediaTypeIds || library.mediaTypes || initial.mediaTypes);
        const progressParts = [
            initial.chapter ? 'Chapter ' + initial.chapter : '',
            initial.graphicChapter ? 'Graphic Ch ' + initial.graphicChapter : '',
            initial.novelChapter ? 'Novel Ch ' + initial.novelChapter : '',
            initial.season ? 'Season ' + initial.season : '',
            initial.episode ? 'Episode ' + initial.episode : ''
        ].filter(Boolean);
        return '<div class="nx-dv-library-editor" data-nx-dv-library-entry-id="' + escapeHtml(library.entryId || '') + '"' + attrs + '>'
            + '<div class="nx-dv-library-title"><strong>Library</strong><span title="' + escapeHtml(library.title) + '">' + escapeHtml(library.title) + '</span></div>'
            + '<div class="nx-dv-library-readout">'
            + readoutLine(escapeHtml, 'Type', readableTypes)
            + readoutLine(escapeHtml, 'Status', initial.status)
            + readoutLine(escapeHtml, 'Source Status', initial.sourceStatus)
            + readoutLine(escapeHtml, 'Progress', progressParts.join(' / '))
            + readoutLine(escapeHtml, 'Rating', initial.rating)
            + readoutLine(escapeHtml, 'Unified', library.unified)
            + readoutLine(escapeHtml, 'Confidence', library.confidence)
            + readoutLine(escapeHtml, 'API Avg', library.apiAverage)
            + '</div>'
            + '<div class="nx-dv-library-grid">'
            + input(escapeHtml, 'Title', 'title', initial.title)
            + input(escapeHtml, 'Title Aliases', 'titleAltNames', initial.titleAltNames)
            + input(escapeHtml, 'Author', 'author', initial.author)
            + input(escapeHtml, 'Author Aliases', 'authorAltNames', initial.authorAltNames)
            + input(escapeHtml, 'Artist', 'artist', initial.artist)
            + input(escapeHtml, 'Media Types', 'mediaTypes', initial.mediaTypes)
            + input(escapeHtml, 'Status', 'status', initial.status)
            + input(escapeHtml, 'Source Status', 'sourceStatus', initial.sourceStatus)
            + input(escapeHtml, 'Chapter', 'chapter', initial.chapter, 'number')
            + input(escapeHtml, 'Graphic Ch', 'graphicChapter', initial.graphicChapter, 'number')
            + input(escapeHtml, 'Novel Ch', 'novelChapter', initial.novelChapter, 'number')
            + input(escapeHtml, 'Season', 'season', initial.season, 'number')
            + input(escapeHtml, 'Episode', 'episode', initial.episode, 'number')
            + input(escapeHtml, 'Rating', 'rating', initial.rating)
            + input(escapeHtml, 'Source URL', 'sourceUrl', initial.sourceUrl, 'url')
            + input(escapeHtml, 'Image URL', 'imageUrl', initial.imageUrl, 'url')
            + input(escapeHtml, 'Language', 'language', initial.language)
            + input(escapeHtml, 'Genres', 'genre', initial.genre)
            + input(escapeHtml, 'Tags', 'tags', initial.tags)
            + '<label class="nx-dv-library-wide"><span>Summary / Notes</span><textarea data-nx-dv-library-field="summary" rows="3">' + escapeHtml(initial.summary) + '</textarea></label>'
            + '</div>'
            + '<div class="nx-dv-library-foot">'
            + '<span>' + escapeHtml((library.workspaceId || '') + ' / ' + (library.categoryName || '')) + '</span>'
            + (library.unified ? '<span>Unified ' + escapeHtml(library.unified) + '</span>' : '')
            + (library.confidence ? '<span>Conf ' + escapeHtml(library.confidence) + '</span>' : '')
            + (library.apiAverage ? '<span>API Avg ' + escapeHtml(library.apiAverage) + '</span>' : '')
            + '</div>'
            + '</div>';
    }

    function getField(row, field) {
        return String(row.querySelector('[data-nx-dv-library-field="' + field + '"]')?.value || '').trim();
    }

    function getInitial(container, field) {
        return String(container?.getAttribute('data-lib-initial-' + field.toLowerCase()) || '').trim();
    }

    function collectLibraryPatch(row, patchApi, target) {
        const editor = row?.querySelector?.('[data-nx-dv-library-entry-id]');
        if (!editor || !patchApi?.buildPatch || !target) return null;
        const fields = ['title', 'titleAltNames', 'author', 'authorAltNames', 'artist', 'mediaTypes', 'status', 'sourceStatus', 'chapter', 'graphicChapter', 'novelChapter', 'season', 'episode', 'rating', 'sourceUrl', 'imageUrl', 'language', 'genre', 'tags', 'summary'];
        const changes = {};
        fields.forEach(function (field) {
            const value = getField(row, field);
            if (value === getInitial(editor, field)) return;
            changes[field] = value;
        });
        if (!Object.keys(changes).length) return null;
        return patchApi.buildPatch('set-linked-library-fields', target, changes, {
            source: 'nexus-datapack-view-micro',
            reason: 'micro-linked-library-fields'
        });
    }

    ns.DatapackViewMicroLibrary = {
        renderLibraryEditor,
        collectLibraryPatch
    };
})();
