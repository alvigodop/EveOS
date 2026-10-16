// Selected-item duplicate details for legacy callers without the shared library index.
(function () {
    'use strict';

    function scan({ items, itemId, dismissed, descriptor, pairClassification, indexedFallback }) {
        let position = -1;
        for (let index = 0; index < items.length; index += 1) {
            if (items[index].id !== itemId) continue;
            // Repeated legacy IDs retain the full report's indexed pair semantics.
            if (position !== -1) return indexedFallback();
            position = index;
        }
        if (position === -1) return [];
        const selected = descriptor(items[position], position), matches = [];
        const excluded = new Set(dismissed);
        for (let other = 0; other < items.length; other += 1) {
            const item = items[other];
            const key = [String(itemId ?? '').trim(), String(item.id ?? '').trim()].sort().join('|');
            if (item.id === itemId || excluded.has(key)) continue;
            const found = pairClassification(selected, descriptor(item, other));
            if (!found) continue;
            matches.push({ item, ...found, reason: found.reasons.join(' + '),
                left: Math.min(position, other), right: Math.max(position, other) });
        }
        matches.sort((left, right) => (left.level === right.level
            ? left.left - right.left || left.right - right.right : left.level === 'hard' ? -1 : 1));
        return matches.map(({ left, right, ...match }) => match);
    }

    window.EveAudioflixDuplicateDetails = Object.freeze({ scan });
})();
