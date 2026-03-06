window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.UIModules = window.EveLibrary.UIModules || {};

(function () {
    if (window.EveLibrary.UIModules.createForms) return;

    window.EveLibrary.UIModules.createForms = function createForms(deps) {
        const state = deps.state;
        const normalizeListForInput = deps.normalizeListForInput;
        const formatTimestamp = deps.formatTimestamp;
        const formatOptionalScore = deps.formatOptionalScore;
        const State = deps.State;

        function getPrefix(categoryName) {
            return `lib-${categoryName.replace(/[^a-zA-Z0-9]/g, '_')}-`;
        }

        function showAddForm(categoryName) {
            const prefix = getPrefix(categoryName);
            const form = document.getElementById(prefix + 'entry-form');
            const title = document.getElementById(prefix + 'form-title');
            if (!form) return;

            form.style.display = 'block';
            if (title) title.textContent = 'Add New Entry';
            state.currentEditingCategory = categoryName;
            state.currentEditingEntryId = null;
            clearForm(categoryName);
        }

        function hideForm(categoryName) {
            const prefix = getPrefix(categoryName);
            const form = document.getElementById(prefix + 'entry-form');
            if (form) form.style.display = 'none';
            state.currentEditingCategory = null;
            state.currentEditingEntryId = null;
        }

        function clearForm(categoryName) {
            const prefix = getPrefix(categoryName);

            [
                'title',
                'author',
                'author-alt-names',
                'artist',
                'genre',
                'summary',
                'language',
                'tags',
                'source-url',
                'image-url',
                'api-rating-anilist',
                'api-rating-myanimelist',
                'api-rating-mangadex'
            ].forEach(field => {
                const element = document.getElementById(prefix + field);
                if (element) element.value = '';
            });

            ['chapter', 'season', 'episode'].forEach(field => {
                const element = document.getElementById(prefix + field);
                if (element) element.value = '0';
            });

            const rating = document.getElementById(prefix + 'rating');
            if (rating) rating.value = '';

            const status = document.getElementById(prefix + 'status');
            if (status && status.options.length > 0) status.selectedIndex = 0;

            const dateAddedMeta = document.getElementById(prefix + 'date-added-meta');
            const lastEditedMeta = document.getElementById(prefix + 'last-edited-meta');
            if (dateAddedMeta) dateAddedMeta.textContent = 'Added: -';
            if (lastEditedMeta) lastEditedMeta.textContent = 'Last Edited: -';
        }

        function fillForm(categoryName, entry) {
            const prefix = getPrefix(categoryName);
            const summaryValue = entry?.summary || '';
            const safeSummary = /^Source:\s*https?:\/\//i.test(summaryValue.trim()) ? '' : summaryValue;
            const authorAltNames = Array.isArray(entry?.authorAltNames)
                ? entry.authorAltNames
                : (entry?.authorAltNames ? String(entry.authorAltNames).split(',') : []);

            const setValue = (field, value) => {
                const element = document.getElementById(prefix + field);
                if (element) element.value = value;
            };

            setValue('title', entry?.title || '');
            setValue('author', entry?.author || '');
            setValue('author-alt-names', normalizeListForInput(authorAltNames));
            setValue('artist', normalizeListForInput(entry?.artist));
            setValue('genre', normalizeListForInput(entry?.genre));
            setValue('summary', safeSummary);
            setValue('language', entry?.language || '');
            setValue('tags', normalizeListForInput(entry?.tags));
            setValue('source-url', entry?.sourceUrl || '');
            setValue('image-url', entry?.image || '');
            setValue('chapter', entry?.chapter || 0);
            setValue('season', entry?.season || 0);
            setValue('episode', entry?.episode || 0);
            setValue('rating', entry?.rating || '');
            setValue('api-rating-anilist', formatOptionalScore(entry?.apiRatings?.anilist));
            setValue('api-rating-myanimelist', formatOptionalScore(entry?.apiRatings?.myanimelist));
            setValue('api-rating-mangadex', formatOptionalScore(entry?.apiRatings?.mangadex));
            setValue('status', entry?.status || '');

            const dateAddedMeta = document.getElementById(prefix + 'date-added-meta');
            const lastEditedMeta = document.getElementById(prefix + 'last-edited-meta');
            if (dateAddedMeta) dateAddedMeta.textContent = `Added: ${formatTimestamp(entry?.dateAdded)}`;
            if (lastEditedMeta) {
                lastEditedMeta.textContent = `Last Edited: ${formatTimestamp(entry?.lastEdited || entry?.dateAdded)}`;
            }
        }

        function editEntry(categoryName, entryId) {
            const lib = State.getCategoryLibrary(categoryName);
            const entry = lib.entries.find(item => item.id === entryId);
            if (!entry) return;

            const prefix = getPrefix(categoryName);
            const form = document.getElementById(prefix + 'entry-form');
            const title = document.getElementById(prefix + 'form-title');

            if (!form) return;
            form.style.display = 'block';
            if (title) title.textContent = 'Edit Entry';
            state.currentEditingCategory = categoryName;
            state.currentEditingEntryId = entryId;
            fillForm(categoryName, entry);
        }

        return {
            getPrefix,
            showAddForm,
            hideForm,
            clearForm,
            fillForm,
            editEntry
        };
    };
})();
