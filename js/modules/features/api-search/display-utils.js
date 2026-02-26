window.EveOS = window.EveOS || {};
window.EveOS.API = window.EveOS.API || {};
window.EveOS.API.DisplayInternals = window.EveOS.API.DisplayInternals || {};

(function (internals) {
    internals.toArray = function (value) {
        return Array.isArray(value) ? value : [];
    };

    internals.uniqStrings = function (values) {
        const seen = new Set();
        const result = [];
        values.forEach(value => {
            const normalized = String(value || "").trim();
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            result.push(normalized);
        });
        return result;
    };

    internals.limitList = function (values, max) {
        return internals.uniqStrings(values).slice(0, max);
    };

    internals.pickLocalizedText = function (raw) {
        if (!raw) return "";
        if (typeof raw === "string") return raw;
        if (typeof raw !== "object") return "";

        const preferred = ["en", "en_us", "ja-ro", "ja", "ko", "es", "fr"];
        for (const key of preferred) {
            if (typeof raw[key] === "string" && raw[key].trim()) return raw[key];
        }

        const fallback = Object.values(raw).find(value => typeof value === "string" && value.trim());
        return fallback || "";
    };

    internals.cleanText = function (raw, maxLength = 240) {
        const text = String(raw || "")
            .replace(/<[^>]*>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!text) return "";
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 3).trim()}...`;
    };

    internals.formatStatus = function (status) {
        const source = String(status || "").trim();
        if (!source) return "";
        return source
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, char => char.toUpperCase());
    };

    internals.extractYear = function (rawDate) {
        if (!rawDate) return "";
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) return "";
        return String(parsed.getUTCFullYear());
    };

    internals.formatDateParts = function (parts) {
        if (!parts || typeof parts !== "object") return "";
        const year = Number(parts.year);
        const month = Number(parts.month);
        const day = Number(parts.day);
        if (!Number.isFinite(year)) return "";
        const mm = Number.isFinite(month) && month > 0 ? String(month).padStart(2, "0") : "01";
        const dd = Number.isFinite(day) && day > 0 ? String(day).padStart(2, "0") : "01";
        return `${year}-${mm}-${dd}`;
    };

    internals.formatSeason = function (season, year) {
        const seasonName = internals.formatStatus(season);
        const yearText = String(year || "").trim();
        if (!seasonName && !yearText) return "";
        if (seasonName && yearText) return `${seasonName} ${yearText}`;
        return seasonName || yearText;
    };

    internals.parseMangaDexLink = function (key, value) {
        const next = String(value || "").trim();
        if (!next) return "";
        if (/^https?:\/\//i.test(next)) return next;
        switch (key) {
            case "al":
                return `https://anilist.co/manga/${next}`;
            case "mal":
                return `https://myanimelist.net/manga/${next}`;
            case "mu":
                return `https://www.mangaupdates.com/series/${next}`;
            case "nu":
                return `https://www.novelupdates.com/series/${next}`;
            default:
                return "";
        }
    };
})(window.EveOS.API.DisplayInternals);
