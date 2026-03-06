/**
 * Entries Renderer Helpers for Eve OS
 */
window.EveLibrary = window.EveLibrary || {};
window.EveLibrary.Modules = window.EveLibrary.Modules || {};

(function () {
    window.EveLibrary.Modules.createEntriesRendererHelpers = function createEntriesRendererHelpers() {
        function parseUniqueCsvList(value) {
            const seen = new Set();
            return String(value || '')
                .split(',')
                .map(item => item.trim())
                .filter(Boolean)
                .filter(item => {
                    const key = item.toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
        }

        function toUniqueList(value) {
            if (Array.isArray(value)) {
                const seen = new Set();
                return value
                    .map(item => String(item || '').trim())
                    .filter(Boolean)
                    .filter(item => {
                        const key = item.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
            }
            return parseUniqueCsvList(value);
        }

        function toDisplayCsv(value) {
            return toUniqueList(value).join(', ');
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function sanitizeForId(value) {
            return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
        }

        function buildExpandableDetail(label, value, expandId, maxChars) {
            const compact = String(value || '').replace(/\s+/g, ' ').trim();
            if (!compact) return '';

            const escapedLabel = escapeHtml(label);
            if (compact.length <= maxChars) {
                return `<p><strong>${escapedLabel}:</strong> ${escapeHtml(compact)}</p>`;
            }

            const preview = escapeHtml(compact.slice(0, maxChars).trimEnd()) + '&hellip;';
            const full = escapeHtml(compact);
            return `
            <p class="lib-entry-expandable">
                <strong>${escapedLabel}:</strong>
                <span id="${expandId}-preview">${preview}</span>
                <span id="${expandId}-full" style="display:none;">${full}</span>
                <button type="button" class="lib-expand-toggle" onclick="window.EveLibrary.EntriesRenderer.toggleExpandableDetail('${expandId}', this)" aria-expanded="false" title="Show more">more</button>
            </p>
        `;
        }

        function toggleExpandableDetail(expandId, buttonEl) {
            const preview = document.getElementById(`${expandId}-preview`);
            const full = document.getElementById(`${expandId}-full`);
            if (!preview || !full) return;

            const isExpanded = full.style.display !== 'none';
            if (isExpanded) {
                full.style.display = 'none';
                preview.style.display = '';
                if (buttonEl) {
                    buttonEl.textContent = 'more';
                    buttonEl.setAttribute('aria-expanded', 'false');
                    buttonEl.title = 'Show more';
                }
                return;
            }

            full.style.display = '';
            preview.style.display = 'none';
            if (buttonEl) {
                buttonEl.textContent = 'less';
                buttonEl.setAttribute('aria-expanded', 'true');
                buttonEl.title = 'Show less';
            }
        }

        function formatLastEdited(isoValue) {
            if (!isoValue) return 'Last edited: -';
            const parsed = new Date(isoValue);
            if (Number.isNaN(parsed.getTime())) return 'Last edited: -';
            const stamp = parsed.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
            return `Last edited: ${stamp}`;
        }

        function renderTypeFields(entry, dataType) {
            if (dataType === 'films') {
                return `
                <p><strong>Season:</strong> ${entry.season || 0}</p>
                <p><strong>Episode:</strong> ${entry.episode || 0}</p>
            `;
            }
            return `<p><strong>Chapter:</strong> ${entry.chapter || 0}</p>`;
        }

        function formatScore(value) {
            const n = Number(value);
            if (!Number.isFinite(n)) return '';
            return n.toFixed(2).replace(/\.?0+$/, '');
        }

        function renderDerivedRatings(derived) {
            if (!derived || typeof derived !== 'object') return '';
            const average = formatScore(derived.apiAverage10);
            const weighted = formatScore(derived.apiWeighted10);
            const hybrid = formatScore(derived.hybrid10);
            const confidence = formatScore(derived.confidence);
            if (!average && !weighted && !hybrid) return '';
            const items = [];
            if (average) items.push(`API Avg: ${average}`);
            if (weighted) items.push(`API Weighted: ${weighted}`);
            if (hybrid) items.push(`Unified: ${hybrid}`);
            if (confidence) items.push(`Confidence: ${confidence}`);
            return `<p><strong>Derived:</strong> ${items.join(' | ')}</p>`;
        }

        return {
            toUniqueList,
            toDisplayCsv,
            sanitizeForId,
            buildExpandableDetail,
            toggleExpandableDetail,
            formatLastEdited,
            renderTypeFields,
            renderDerivedRatings
        };
    };
})();
