window.EveLinkForm = window.EveLinkForm || {};

(function (ns) {
    ns.ensureLibraryMetadataSectionEnabled = function () {
        const toggle = ns.getLibraryFormToggle();
        if (toggle && !toggle.checked) {
            toggle.checked = true;
        }
        ns.setLibraryFieldsCollapsed(false);
        ns.setLibraryFieldsVisibility(true);
    };

    ns.updateLinkedEntryFromMetadataPatch = function (patch) {
        if (!patch || typeof patch !== 'object') return;
        const editId = document.getElementById('editId')?.value;
        if (!editId) return;
        const api = ns.getConnectionsApi();
        if (!api?.findConnectionByLinkId?.(editId)) return;
        api.updateLinkedEntry?.(editId, patch);
    };

    ns.applySourceMetadataToLibraryFields = function (source) {
        if (!source) return false;

        ns.ensureLibraryMetadataSectionEnabled();

        const meta = ns.buildSourceMetadata(source);
        const updates = {};
        const editId = document.getElementById('editId')?.value || '';
        const connectionsApi = ns.getConnectionsApi();
        const linkedEntry = editId && connectionsApi?.getLinkedEntry
            ? connectionsApi.getLinkedEntry(editId)?.entry
            : null;

        const authorInput = document.getElementById('libAuthor');
        const altAuthorsInput = document.getElementById('libAuthorAltNames');
        const existingAuthor = String(authorInput?.value || '').trim();
        let primaryAuthor = existingAuthor;
        if (!primaryAuthor && meta.authors.length > 0) {
            primaryAuthor = meta.authors[0];
        }

        const existingAltAuthors = ns.parseUniqueCsvList(altAuthorsInput?.value || '');
        let nextAltAuthors = ns.mergeUniqueValues(existingAltAuthors, meta.authors);
        const primaryKey = ns.toTrimmedLower(primaryAuthor);
        nextAltAuthors = nextAltAuthors.filter(name => ns.toTrimmedLower(name) !== primaryKey);

        if (authorInput) authorInput.value = primaryAuthor;
        if (altAuthorsInput) altAuthorsInput.value = nextAltAuthors.join(', ');
        updates.author = primaryAuthor;
        updates.authorAltNames = nextAltAuthors;

        const artistInput = document.getElementById('libArtist');
        const existingArtists = ns.parseUniqueCsvList(artistInput?.value || '');
        const mergedArtists = ns.mergeUniqueValues(existingArtists, meta.artists);
        if (artistInput) artistInput.value = mergedArtists.join(', ');
        updates.artist = mergedArtists.join(', ');

        const genreInput = document.getElementById('libGenre');
        const existingGenres = ns.parseUniqueCsvList(genreInput?.value || '');
        const mergedGenres = ns.mergeUniqueValues(existingGenres, meta.genres);
        if (genreInput) genreInput.value = mergedGenres.join(', ');
        updates.genre = mergedGenres.join(', ');

        const tagsInput = document.getElementById('libTags');
        const existingTags = ns.parseUniqueCsvList(tagsInput?.value || '');
        const mergedTags = ns.mergeUniqueValues(existingTags, meta.tags);
        if (tagsInput) tagsInput.value = mergedTags.join(', ');
        updates.tags = mergedTags;

        const languageInput = document.getElementById('libLanguage');
        if (languageInput && !ns.toTrimmedLower(languageInput.value) && meta.language) {
            languageInput.value = meta.language;
            updates.language = meta.language;
        }

        const sourceUrlInput = document.getElementById('libSourceUrl');
        const bookmarkUrlInput = document.getElementById('newUrl');
        const hasCurrentSourceUrl = ns.toTrimmedLower(sourceUrlInput?.value);
        if (!hasCurrentSourceUrl && meta.sourceUrl) {
            if (sourceUrlInput) sourceUrlInput.value = meta.sourceUrl;
            if (bookmarkUrlInput && !ns.toTrimmedLower(bookmarkUrlInput.value)) {
                bookmarkUrlInput.value = meta.sourceUrl;
            }
            updates.sourceUrl = meta.sourceUrl;
        }

        const imageUrlInput = document.getElementById('libImageUrl');
        const hasCurrentImageUrl = ns.toTrimmedLower(imageUrlInput?.value);
        if (!hasCurrentImageUrl && meta.imageUrl) {
            if (imageUrlInput) imageUrlInput.value = meta.imageUrl;
            updates.image = meta.imageUrl;
        }

        const sourceStatus = String(meta.sourceStatus || '').trim();
        if (sourceStatus) {
            updates.sourceStatus = sourceStatus;
        }

        const statusSelect = document.getElementById('libStatus');
        if (statusSelect && !statusSelect.value && meta.status) {
            const availableStatuses = Array.from(statusSelect.options || [])
                .map(option => String(option.value || '').trim())
                .filter(Boolean);
            const pickAvailableStatus = function (candidates) {
                for (const candidate of candidates) {
                    const match = availableStatuses.find(value =>
                        ns.toTrimmedLower(value) === ns.toTrimmedLower(candidate)
                    );
                    if (match) return match;
                }
                return '';
            };
            const statusMatch = Array.from(statusSelect.options || []).find(option =>
                ns.toTrimmedLower(option.value) === ns.toTrimmedLower(meta.status)
            );
            if (statusMatch) {
                statusSelect.value = statusMatch.value;
                updates.status = statusMatch.value;
            } else if (sourceStatus) {
                const mappedStatusValue = (function mapSourceStatusToLibraryStatus(value) {
                    const normalized = ns.toTrimmedLower(value);
                    if (!normalized) return '';
                    if (normalized === 'completed') return pickAvailableStatus(['Completed']);
                    if (normalized === 'ongoing') return pickAvailableStatus(['Watching', 'Reading']);
                    if (normalized === 'upcoming') return pickAvailableStatus(['Plan to Watch', 'Plan to Read', 'Watching', 'Reading']);
                    if (normalized === 'hiatus') return pickAvailableStatus(['Hiatus', 'On Hold']);
                    if (normalized === 'cancelled') return pickAvailableStatus(['Dropped']);
                    return '';
                })(sourceStatus);
                if (mappedStatusValue) {
                    const mappedMatch = Array.from(statusSelect.options || []).find(option =>
                        ns.toTrimmedLower(option.value) === ns.toTrimmedLower(mappedStatusValue)
                    );
                    if (mappedMatch) {
                        statusSelect.value = mappedMatch.value;
                        updates.status = mappedMatch.value;
                    }
                }
            }
        }

        const ratingsApi = ns.getRatingsApi ? ns.getRatingsApi() : null;
        const mergedApiRatings = ratingsApi?.mergeApiRatings
            ? ratingsApi.mergeApiRatings(ns.readApiRatingsFromInputs(), meta.apiRatings)
            : ns.readApiRatingsFromInputs();
        const mergedSourceSignals = ratingsApi?.mergeSourceSignals
            ? ratingsApi.mergeSourceSignals(linkedEntry?.sourceSignals, meta.sourceSignals)
            : (meta.sourceSignals || linkedEntry?.sourceSignals || null);
        ns.writeApiRatingsToInputs(mergedApiRatings);
        updates.apiRatings = mergedApiRatings;
        if (mergedSourceSignals) {
            updates.sourceSignals = mergedSourceSignals;
        }
        const derived = ns.refreshDerivedRatingsPreview({
            rating: document.getElementById('libRating')?.value || '',
            apiRatings: mergedApiRatings,
            sourceSignals: mergedSourceSignals,
            sourceStatus: sourceStatus || linkedEntry?.sourceStatus || ''
        });
        if (derived) updates.derivedRatings = derived;

        const summaryInput = document.getElementById('libSummary');
        let addedNotes = 0;
        if (meta.summary) {
            const existingParts = (summaryInput?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
            const newParts = meta.summary.split('\n').map(s => s.trim()).filter(Boolean);
            const merged = [...existingParts];
            for (const part of newParts) {
                if (!existingParts.includes(part)) {
                    merged.push(part);
                    addedNotes++;
                }
            }
            if (addedNotes > 0) {
                const finalSummary = merged.join('\n\n');
                if (summaryInput) summaryInput.value = finalSummary;
                updates.summary = finalSummary;
            }
        }

        ns.updateLinkedEntryFromMetadataPatch(updates);

        const summaryBits = [];
        if (addedNotes > 0) summaryBits.push(`${addedNotes} new note segment${addedNotes !== 1 ? 's' : ''}`);
        if (meta.tags.length) summaryBits.push(`${meta.tags.length} tags`);
        if (meta.genres.length) summaryBits.push(`${meta.genres.length} genres`);
        if (meta.authors.length) summaryBits.push(`${meta.authors.length} authors`);
        if (meta.artists.length) summaryBits.push(`${meta.artists.length} artists`);
        if (derived?.apiAverage10 !== null) summaryBits.push(`API avg ${ns.formatRating(derived.apiAverage10)}`);
        const summaryText = summaryBits.length ? summaryBits.join(', ') : 'no metadata fields available';
        showToast(`Source metadata applied (${summaryText})`, 'success');
        return true;
    };

    ns.applySourceMetadataFromAttachedSource = function (index) {
        const source = ns.getAttachedSourceByIndex(index);
        if (!source) {
            showToast('Source metadata not found', 'warning');
            return;
        }
        ns.applySourceMetadataToLibraryFields(source);
    };
})(window.EveLinkForm);
