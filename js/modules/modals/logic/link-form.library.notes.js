window.EveLibraryNotesSections = window.EveLibraryNotesSections || {};

(function (api) {
    if (api.ready) return;

    function text(value) {
        return String(value == null ? '' : value);
    }

    function escapeHtml(value) {
        return text(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function splitMergeBlocks(value) {
        const source = text(value).replace(/\r\n/g, '\n');
        const lines = source.split('\n');
        const blocks = [];
        const humanLines = [];
        let index = 0;
        while (index < lines.length) {
            if (lines[index].trim() !== '=== Bookmark Merge ===') {
                humanLines.push(lines[index]);
                index += 1;
                continue;
            }
            const blockLines = [lines[index]];
            index += 1;
            while (index < lines.length) {
                const line = lines[index];
                if (/^===\s+.+\s+===$/.test(line.trim())) break;
                blockLines.push(line);
                index += 1;
            }
            blocks.push(blockLines.join('\n').trim());
        }
        return {
            human: humanLines.join('\n').trim(),
            blocks
        };
    }

    function parseMergeBlock(block) {
        const lines = text(block).split('\n');
        const fields = {};
        let section = '';
        const sectionLines = {};
        lines.forEach((line) => {
            const trimmed = line.trim();
            const fieldMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
            if (fieldMatch && !['Incoming Bookmark Notes', 'Incoming Linked Library Snapshot', 'Library Rule', 'Incoming Non-overwritten Bookmark Fields'].includes(fieldMatch[1])) {
                fields[fieldMatch[1].trim()] = fieldMatch[2].trim();
                section = '';
                return;
            }
            if (trimmed.endsWith(':') || ['Incoming Bookmark Notes:', 'Incoming Linked Library Snapshot:', 'Library Rule:', 'Incoming Non-overwritten Bookmark Fields:'].includes(trimmed)) {
                section = trimmed.replace(/:$/, '');
                if (!sectionLines[section]) sectionLines[section] = [];
                return;
            }
            if (section && trimmed) sectionLines[section].push(line);
        });
        return { fields, sections: sectionLines, raw: block };
    }

    function summarizeLine(value, maxLength) {
        const raw = text(value).replace(/\s+/g, ' ').trim();
        const limit = Number(maxLength || 90);
        return raw.length > limit ? raw.slice(0, limit - 1) + '...' : raw;
    }

    function renderMergeBlocks(blocks) {
        if (!Array.isArray(blocks) || !blocks.length) {
            return '<div class="library-notes-empty">No bookmark merge history found in the raw notes.</div>';
        }
        return blocks.map((block, index) => {
            const parsed = parseMergeBlock(block);
            const fields = parsed.fields || {};
            const sections = parsed.sections || {};
            const rows = [
                ['Mode', fields.Mode],
                ['Merged At', fields['Merged At']],
                ['Reason', fields.Reason],
                ['Destination Kept', fields['Destination Kept']],
                ['Incoming Title', fields['Incoming Title']],
                ['Incoming URL', fields['Incoming URL']],
                ['Incoming Scope', fields['Incoming Scope']],
                ['Destination Scope', fields['Destination Scope']]
            ].filter((row) => row[1]);
            const sectionHtml = Object.keys(sections).map((key) => {
                const body = sections[key].join('\n').trim();
                if (!body) return '';
                return '<details class="library-notes-merge-subsection">'
                    + '<summary>' + escapeHtml(key) + '</summary>'
                    + '<pre>' + escapeHtml(body) + '</pre>'
                    + '</details>';
            }).join('');
            return '<div class="library-notes-merge-card">'
                + '<div class="library-notes-merge-title">Merge #' + (index + 1) + '</div>'
                + rows.map((row) => '<div class="library-notes-merge-row"><span>' + escapeHtml(row[0]) + '</span><strong title="' + escapeHtml(row[1]) + '">' + escapeHtml(summarizeLine(row[1], 120)) + '</strong></div>').join('')
                + sectionHtml
                + '</div>';
        }).join('');
    }

    const profiles = {
        library: {
            rawId: 'libSummary',
            humanId: 'libHumanNotes',
            mergeId: 'libMergedNotesView',
            shellMetaId: 'libNotesSummary',
            mergeDisclosureId: 'libMergeNotesDisclosure',
            humanMetaId: 'libHumanNotesSummary',
            mergeMetaId: 'libMergedNotesSummary',
            rawMetaId: 'libRawNotesSummary'
        },
        focus: {
            rawId: 'bookmarkFocusSummary',
            humanId: 'bookmarkFocusHumanNotes',
            mergeId: 'bookmarkFocusMergeNotesView',
            shellMetaId: 'bookmarkFocusNotesSummary',
            mergeDisclosureId: 'bookmarkFocusMergeNotesDisclosure',
            humanMetaId: 'bookmarkFocusHumanNotesSummary',
            mergeMetaId: 'bookmarkFocusMergedNotesSummary',
            rawMetaId: 'bookmarkFocusRawNotesSummary'
        }
    };

    let syncing = false;

    function getProfile(name) {
        return profiles[name] || null;
    }

    function updateMeta(profile, split) {
        const shellMeta = document.getElementById(profile.shellMetaId);
        const humanMeta = document.getElementById(profile.humanMetaId);
        const mergeMeta = document.getElementById(profile.mergeMetaId);
        const rawMeta = document.getElementById(profile.rawMetaId);
        const mergeDisclosure = document.getElementById(profile.mergeDisclosureId);
        const humanLength = split.human.trim().length;
        const rawLength = text(document.getElementById(profile.rawId)?.value || '').trim().length;
        if (shellMeta) {
            const parts = [];
            if (humanLength) parts.push(humanLength + ' personal chars');
            if (split.blocks.length) parts.push(split.blocks.length + ' merge' + (split.blocks.length === 1 ? '' : 's'));
            if (!parts.length && rawLength) parts.push(rawLength + ' raw chars');
            shellMeta.textContent = parts.join(' / ') || 'empty';
        }
        if (humanMeta) humanMeta.textContent = humanLength ? humanLength + ' chars' : 'empty';
        if (mergeMeta) mergeMeta.textContent = split.blocks.length + ' merge' + (split.blocks.length === 1 ? '' : 's');
        if (rawMeta) rawMeta.textContent = rawLength + ' chars';
        if (mergeDisclosure) {
            mergeDisclosure.style.display = split.blocks.length ? '' : 'none';
            if (!split.blocks.length) mergeDisclosure.open = false;
        }
    }

    function stopGlobalShortcutCapture(event) {
        if (!event) return;
        event.stopPropagation();
    }

    function syncFromRaw(profileName) {
        const profile = getProfile(profileName);
        if (!profile || syncing) return;
        const raw = document.getElementById(profile.rawId);
        const human = document.getElementById(profile.humanId);
        const merge = document.getElementById(profile.mergeId);
        if (!raw) return;
        syncing = true;
        const split = splitMergeBlocks(raw.value || '');
        if (human) human.value = split.human;
        if (merge) merge.innerHTML = renderMergeBlocks(split.blocks);
        updateMeta(profile, split);
        syncing = false;
    }

    function syncRawFromHuman(profileName) {
        const profile = getProfile(profileName);
        if (!profile || syncing) return;
        const raw = document.getElementById(profile.rawId);
        const human = document.getElementById(profile.humanId);
        const merge = document.getElementById(profile.mergeId);
        if (!raw || !human) return;
        syncing = true;
        const split = splitMergeBlocks(raw.value || '');
        const nextParts = [];
        const personal = text(human.value).trim();
        if (personal) nextParts.push(personal);
        split.blocks.forEach((block) => {
            if (block.trim()) nextParts.push(block.trim());
        });
        raw.value = nextParts.join('\n\n').trim();
        if (merge) merge.innerHTML = renderMergeBlocks(split.blocks);
        updateMeta(profile, {
            human: human.value,
            blocks: split.blocks
        });
        syncing = false;
    }

    function bindProfile(profileName) {
        const profile = getProfile(profileName);
        if (!profile) return;
        const raw = document.getElementById(profile.rawId);
        const human = document.getElementById(profile.humanId);
        if (raw && !raw.dataset.libraryNotesBound) {
            raw.dataset.libraryNotesBound = '1';
            raw.addEventListener('input', () => syncFromRaw(profileName));
            raw.addEventListener('keydown', stopGlobalShortcutCapture);
        }
        if (human && !human.dataset.libraryNotesBound) {
            human.dataset.libraryNotesBound = '1';
            human.addEventListener('input', () => syncRawFromHuman(profileName));
            human.addEventListener('keydown', stopGlobalShortcutCapture);
        }
        syncFromRaw(profileName);
    }

    function bindAll() {
        bindProfile('library');
        bindProfile('focus');
    }

    Object.assign(api, {
        ready: true,
        splitMergeBlocks,
        parseMergeBlock,
        renderMergeBlocks,
        bindAll,
        bindProfile,
        syncLibraryNotesUiFromRaw: () => bindProfile('library'),
        syncLibraryRawNotesFromHuman: () => syncRawFromHuman('library'),
        syncFocusFromRaw: () => bindProfile('focus'),
        syncFocusRawFromHuman: () => syncRawFromHuman('focus')
    });
})(window.EveLibraryNotesSections);
