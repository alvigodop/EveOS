/**
 * Statistics Calculator for Eve OS Library
 * Calculates metrics for library entries
 */
window.EveLibrary = window.EveLibrary || {};

(function () {
    const Ratings = window.EveLibrary.Ratings;
    const STATUS_BUCKETS = ['Completed', 'In Progress', 'Planned', 'Paused', 'Dropped', 'Other'];
    const DEMOGRAPHIC_NAMES = ['Shonen', 'Seinen', 'Shojo', 'Josei'];

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

    function toList(value) {
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

    function toNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function round(value, digits = 2) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        const p = 10 ** digits;
        return Math.round(n * p) / p;
    }

    function normalizeStatus(rawStatus) {
        const value = String(rawStatus || '').trim().toLowerCase();
        if (!value) return 'Other';

        if (/complete|finished|done/.test(value)) return 'Completed';
        if (/plan|wishlist|queue|backlog|to read|to watch/.test(value)) return 'Planned';
        if (/pause|hiatus|hold/.test(value)) return 'Paused';
        if (/drop|abandon|cancel/.test(value)) return 'Dropped';
        if (/read|watch|progress|ongoing|current/.test(value)) return 'In Progress';
        return 'Other';
    }

    function ensureDerivedRatings(entry) {
        if (Ratings?.applyDerivedRatings) {
            Ratings.applyDerivedRatings(entry);
        }
        return entry?.derivedRatings || {};
    }

    function getProgressUnits(entry) {
        const chapter = toNumber(entry?.chapter);
        if (chapter !== null && chapter > 0) return chapter;

        const graphicChapter = toNumber(entry?.graphicChapter);
        if (graphicChapter !== null && graphicChapter > 0) return graphicChapter;

        const novelChapter = toNumber(entry?.novelChapter);
        if (novelChapter !== null && novelChapter > 0) return novelChapter;

        const episode = toNumber(entry?.episode);
        if (episode !== null && episode > 0) return episode;

        return 0;
    }

    function isFilmLikeEntry(entry) {
        const mediaTypes = Array.isArray(entry?.mediaTypes)
            ? entry.mediaTypes.map(item => String(item || '').toLowerCase())
            : [];
        if (mediaTypes.includes('films')) return true;

        const explicitEpisode = toNumber(entry?.episode);
        const explicitChapter = toNumber(entry?.chapter)
            ?? toNumber(entry?.graphicChapter)
            ?? toNumber(entry?.novelChapter);
        if (explicitEpisode !== null && explicitEpisode > 0 && (explicitChapter === null || explicitChapter <= 0)) {
            return true;
        }
        return false;
    }

    function extractTotalUnits(entry) {
        const chapterCandidates = [];
        const episodeCandidates = [];
        const pushPositive = (bucket, value) => {
            const n = toNumber(value);
            if (n === null || n <= 0) return;
            bucket.push(Math.floor(n));
        };

        [
            entry?.totalChapters,
            entry?.chapterTotal,
            entry?.chapters,
            entry?.lastChapter,
            entry?.maxChapter
        ].forEach(value => pushPositive(chapterCandidates, value));

        [
            entry?.totalEpisodes,
            entry?.episodeTotal,
            entry?.episodes,
            entry?.lastEpisode,
            entry?.maxEpisode
        ].forEach(value => pushPositive(episodeCandidates, value));

        const sources = Array.isArray(entry?.sources) ? entry.sources : [];
        sources.forEach(source => {
            pushPositive(chapterCandidates, source?.chapters);
            pushPositive(chapterCandidates, source?.lastChapter);
            pushPositive(episodeCandidates, source?.episodes);
            pushPositive(episodeCandidates, source?.lastEpisode);
        });

        toList(entry?.tags).forEach(tag => {
            const chapterMatch = String(tag).match(/chapters?\s*[:/=-]?\s*(\d+)/i);
            const episodeMatch = String(tag).match(/episodes?\s*[:/=-]?\s*(\d+)/i);
            if (chapterMatch) pushPositive(chapterCandidates, chapterMatch[1]);
            if (episodeMatch) pushPositive(episodeCandidates, episodeMatch[1]);
        });

        const useEpisodes = isFilmLikeEntry(entry);
        const preferred = useEpisodes ? episodeCandidates : chapterCandidates;
        const fallback = useEpisodes ? chapterCandidates : episodeCandidates;
        const all = preferred.length ? preferred : fallback;
        if (!all.length) return null;
        return Math.max(...all);
    }

    function extractYearFromText(value) {
        const match = String(value || '').match(/(?:19|20)\d{2}/);
        if (!match) return null;
        const year = toNumber(match[0]);
        if (year === null) return null;
        return clamp(Math.floor(year), 1900, 2100);
    }

    function extractPublicationYear(entry) {
        const direct = [
            entry?.publicationYear,
            entry?.year,
            entry?.releaseYear
        ];
        for (const candidate of direct) {
            const year = toNumber(candidate);
            if (year !== null && year >= 1900 && year <= 2100) return Math.floor(year);
        }

        const startDate = String(entry?.startDate || '').trim();
        if (startDate) {
            const parsed = new Date(startDate);
            if (!Number.isNaN(parsed.getTime())) {
                const year = parsed.getUTCFullYear();
                if (year >= 1900 && year <= 2100) return year;
            }
            const fromText = extractYearFromText(startDate);
            if (fromText) return fromText;
        }

        const tags = toList(entry?.tags);
        for (const tag of tags) {
            const publicationMatch = tag.match(/publication\s*:\s*((?:19|20)\d{2})/i);
            if (publicationMatch) {
                const year = toNumber(publicationMatch[1]);
                if (year !== null) return Math.floor(year);
            }
        }

        return null;
    }

    function extractCountryCode(entry) {
        const direct = String(entry?.countryOfOrigin || entry?.originCountry || entry?.country || '').trim().toUpperCase();
        if (direct && /^[A-Z]{2,3}$/.test(direct)) return direct;

        const tags = toList(entry?.tags);
        for (const tag of tags) {
            const match = tag.match(/original\s*:\s*([A-Z]{2,3})/i);
            if (match) return String(match[1] || '').toUpperCase();
        }

        const language = String(entry?.language || '').trim().toLowerCase();
        if (/japanese|\bja\b/.test(language)) return 'JA';
        if (/korean|\bko\b/.test(language)) return 'KO';
        if (/chinese|\bzh\b/.test(language)) return 'ZH';

        return '';
    }

    function mapCountryToOriginLabel(code) {
        const normalized = String(code || '').toUpperCase();
        if (normalized === 'JA' || normalized === 'JP') return 'Manga (Japan)';
        if (normalized === 'KO' || normalized === 'KR') return 'Manhwa (Korea)';
        if (['ZH', 'CN', 'TW', 'HK'].includes(normalized)) return 'Manhua (China)';
        if (normalized) return `Other (${normalized})`;
        return 'Unknown';
    }

    function extractTypeOriginLabel(entry) {
        const typeText = [
            entry?.type,
            entry?.format,
            entry?.mediaType,
            entry?.sourceType
        ]
            .map(value => String(value || '').trim().toLowerCase())
            .filter(Boolean)
            .join(' ');

        if (!typeText) return '';
        if (typeText.includes('manhwa')) return 'Manhwa (Korea)';
        if (typeText.includes('manhua')) return 'Manhua (China)';
        if (typeText.includes('manga')) return 'Manga (Japan)';
        return '';
    }

    function extractOriginLabel(entry) {
        const typeLabel = extractTypeOriginLabel(entry);
        if (typeLabel) return typeLabel;
        return mapCountryToOriginLabel(extractCountryCode(entry));
    }

    function calcGenreCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            parseUniqueCsvList(entry?.genre).forEach(genre => {
                counts[genre] = (counts[genre] || 0) + 1;
            });
        });
        return counts;
    }

    function calcTagCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const sourceTags = Array.isArray(entry?.tags)
                ? entry.tags
                : parseUniqueCsvList(entry?.tags);
            sourceTags.forEach(tagValue => {
                parseUniqueCsvList(tagValue).forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            });
        });
        return counts;
    }

    function calcOriginCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const label = extractOriginLabel(entry);
            counts[label] = (counts[label] || 0) + 1;
        });
        return counts;
    }

    function calcAvgRating(entries) {
        let sum = 0;
        let count = 0;
        entries.forEach(entry => {
            const rating = toNumber(entry?.rating);
            if (!rating || rating <= 0) return;
            sum += rating;
            count += 1;
        });
        return count > 0 ? sum / count : 0;
    }

    function calcStatusCounts(entries) {
        const counts = {
            Completed: 0,
            'In Progress': 0,
            Planned: 0,
            Paused: 0,
            Dropped: 0,
            Other: 0
        };

        entries.forEach(entry => {
            const bucket = normalizeStatus(entry?.status);
            counts[bucket] = (counts[bucket] || 0) + 1;
        });
        return counts;
    }

    function calcProgress(entries) {
        const counts = calcStatusCounts(entries);
        return {
            labels: STATUS_BUCKETS,
            data: STATUS_BUCKETS.map(label => counts[label] || 0)
        };
    }

    function calcRatingOverview(entries) {
        let personalSum = 0;
        let personalCount = 0;
        let unifiedSum = 0;
        let unifiedCount = 0;
        let apiSum = 0;
        let apiCount = 0;

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);

            const personal = toNumber(entry?.rating);
            if (personal && personal > 0) {
                personalSum += personal;
                personalCount += 1;
            }

            const unified = toNumber(derived?.hybrid10);
            if (unified && unified > 0) {
                unifiedSum += unified;
                unifiedCount += 1;
            }

            const api = toNumber(derived?.apiAverage10);
            if (api && api > 0) {
                apiSum += api;
                apiCount += 1;
            }
        });

        return {
            totalEntries: entries.length,
            personalRatedCount: personalCount,
            personalAvg5: personalCount ? personalSum / personalCount : null,
            unifiedRatedCount: unifiedCount,
            unifiedAvg10: unifiedCount ? unifiedSum / unifiedCount : null,
            apiRatedCount: apiCount,
            apiAvg10: apiCount ? apiSum / apiCount : null
        };
    }

    function calcRatingDiscrepancies(entries, limit = 5) {
        const rows = [];

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            const personal10 = toNumber(derived?.personal10);
            const apiAverage10 = toNumber(derived?.apiAverage10);
            if (personal10 === null || apiAverage10 === null) return;

            const delta = personal10 - apiAverage10;
            rows.push({
                id: entry?.id,
                title: String(entry?.title || 'Untitled'),
                personal10: round(personal10, 2),
                apiAverage10: round(apiAverage10, 2),
                delta: round(delta, 2)
            });
        });

        const lovedByMe = rows
            .filter(item => item.delta > 0)
            .sort((a, b) => b.delta - a.delta)
            .slice(0, limit);

        const overhypedForMe = rows
            .filter(item => item.delta < 0)
            .sort((a, b) => a.delta - b.delta)
            .slice(0, limit);

        return {
            totalCompared: rows.length,
            lovedByMe,
            overhypedForMe
        };
    }

    function calcGenreRatingStats(entries, minEntries = 2) {
        const genreMap = {};

        entries.forEach(entry => {
            const genres = parseUniqueCsvList(entry?.genre);
            if (!genres.length) return;

            const derived = ensureDerivedRatings(entry);
            const unified = toNumber(derived?.hybrid10);
            const personal = toNumber(entry?.rating);

            genres.forEach(genre => {
                if (!genreMap[genre]) {
                    genreMap[genre] = {
                        count: 0,
                        unifiedSum: 0,
                        unifiedCount: 0,
                        personalSum: 0,
                        personalCount: 0
                    };
                }

                const bucket = genreMap[genre];
                bucket.count += 1;

                if (unified !== null && unified > 0) {
                    bucket.unifiedSum += unified;
                    bucket.unifiedCount += 1;
                }

                if (personal !== null && personal > 0) {
                    bucket.personalSum += personal;
                    bucket.personalCount += 1;
                }
            });
        });

        return Object.entries(genreMap)
            .map(([genre, bucket]) => ({
                genre,
                count: bucket.count,
                avgUnified10: bucket.unifiedCount ? round(bucket.unifiedSum / bucket.unifiedCount, 2) : null,
                avgPersonal5: bucket.personalCount ? round(bucket.personalSum / bucket.personalCount, 2) : null
            }))
            .filter(item => item.count >= minEntries)
            .sort((a, b) => {
                const aScore = toNumber(a.avgUnified10) ?? -1;
                const bScore = toNumber(b.avgUnified10) ?? -1;
                if (bScore !== aScore) return bScore - aScore;
                return b.count - a.count;
            });
    }

    function calcTopGenres(entries, limit = 6) {
        const pairs = Object.entries(calcGenreCounts(entries))
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(1, limit));

        return pairs.map(([genre, count]) => ({ genre, count }));
    }

    function calcCreatorLoyalty(entries, limit = 8) {
        const authorCounts = {};
        const artistCounts = {};
        const studioCounts = {};

        entries.forEach(entry => {
            const authorList = toList(entry?.author);
            const authorAltList = toList(entry?.authorAltNames);
            const mergedAuthors = toList([...authorList, ...authorAltList]);
            const artistList = toList(entry?.artist);
            const studioList = toList(entry?.studios);

            mergedAuthors.forEach(name => {
                authorCounts[name] = (authorCounts[name] || 0) + 1;
            });
            artistList.forEach(name => {
                artistCounts[name] = (artistCounts[name] || 0) + 1;
            });
            studioList.forEach(name => {
                studioCounts[name] = (studioCounts[name] || 0) + 1;
            });
        });

        const toTop = (counts) => Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([name, count]) => ({ name, count }));

        return {
            topAuthors: toTop(authorCounts),
            topArtists: toTop(artistCounts),
            topStudios: toTop(studioCounts)
        };
    }

    function calcDropoffStats(entries) {
        const droppedProgress = [];
        const pausedProgress = [];

        entries.forEach(entry => {
            const bucket = normalizeStatus(entry?.status);
            const progress = getProgressUnits(entry);
            if (progress <= 0) return;

            if (bucket === 'Dropped') droppedProgress.push(progress);
            if (bucket === 'Paused') pausedProgress.push(progress);
        });

        const average = (values) => {
            if (!values.length) return null;
            return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
        };

        return {
            droppedCount: droppedProgress.length,
            pausedCount: pausedProgress.length,
            droppedAvgProgress: average(droppedProgress),
            pausedAvgProgress: average(pausedProgress),
            overallAvgProgress: average([...droppedProgress, ...pausedProgress])
        };
    }

    function calcReadingVelocity(entries, months = 6) {
        const safeMonths = clamp(months, 3, 18);
        const now = new Date();
        const monthSlots = [];
        const indexByKey = {};

        for (let i = safeMonths - 1; i >= 0; i -= 1) {
            const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            indexByKey[key] = monthSlots.length;
            monthSlots.push({
                key,
                label: dt.toLocaleString(undefined, { month: 'short', year: '2-digit' }),
                activity: 0,
                progressUnits: 0
            });
        }

        entries.forEach(entry => {
            const stampRaw = entry?.lastEdited || entry?.dateAdded;
            if (!stampRaw) return;

            const stamp = new Date(stampRaw);
            if (Number.isNaN(stamp.getTime())) return;

            const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}`;
            const index = indexByKey[key];
            if (typeof index !== 'number') return;

            monthSlots[index].activity += 1;
            monthSlots[index].progressUnits += getProgressUnits(entry);
        });

        return {
            labels: monthSlots.map(slot => slot.label),
            activityCounts: monthSlots.map(slot => slot.activity),
            progressTotals: monthSlots.map(slot => round(slot.progressUnits, 2))
        };
    }

    function calcMonthlyReadingProgress(entries, months = 12) {
        const velocity = calcReadingVelocity(entries, months);
        return {
            labels: velocity.labels || [],
            chaptersRead: velocity.progressTotals || [],
            activityCounts: velocity.activityCounts || []
        };
    }

    function calcDailyReadingHabits(entries, days = 30) {
        const safeDays = clamp(days, 7, 90);
        const now = new Date();
        const daySlots = [];
        const indexByKey = {};

        for (let i = safeDays - 1; i >= 0; i -= 1) {
            const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
            indexByKey[key] = daySlots.length;
            daySlots.push({
                key,
                label: dt.toLocaleString(undefined, { month: 'short', day: 'numeric' }),
                activity: 0,
                progressUnits: 0
            });
        }

        entries.forEach(entry => {
            const stampRaw = entry?.lastEdited || entry?.dateAdded;
            if (!stampRaw) return;
            const stamp = new Date(stampRaw);
            if (Number.isNaN(stamp.getTime())) return;

            const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;
            const index = indexByKey[key];
            if (typeof index !== 'number') return;

            daySlots[index].activity += 1;
            daySlots[index].progressUnits += getProgressUnits(entry);
        });

        return {
            labels: daySlots.map(slot => slot.label),
            activityCounts: daySlots.map(slot => slot.activity),
            progressTotals: daySlots.map(slot => round(slot.progressUnits, 2))
        };
    }

    function calcEstimatedReadingTime(entries, minutesPerUnit = 5) {
        const safeMinutes = clamp(minutesPerUnit, 1, 30);
        const totalUnits = entries.reduce((sum, entry) => sum + getProgressUnits(entry), 0);
        const totalMinutes = totalUnits * safeMinutes;
        const totalHours = totalMinutes / 60;

        return {
            totalUnits,
            minutesPerUnit: safeMinutes,
            totalMinutes: round(totalMinutes, 1),
            totalHours: round(totalHours, 2)
        };
    }

    function calcPublicationYearCounts(entries) {
        const counts = {};
        entries.forEach(entry => {
            const year = extractPublicationYear(entry);
            if (!year) return;
            counts[String(year)] = (counts[String(year)] || 0) + 1;
        });
        return counts;
    }

    function calcRatingDistribution(entries) {
        const buckets = {};
        for (let i = 1; i <= 10; i += 1) {
            buckets[String(i)] = 0;
        }

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            let personal10 = toNumber(derived?.personal10);
            if (personal10 === null) {
                const personal5 = toNumber(entry?.rating);
                if (personal5 !== null && personal5 > 0) personal10 = personal5 * 2;
            }
            if (personal10 === null || personal10 <= 0) return;

            const bucket = String(clamp(Math.round(personal10), 1, 10));
            buckets[bucket] = (buckets[bucket] || 0) + 1;
        });

        return buckets;
    }

    function calcUnifiedRatingDistribution(entries) {
        const buckets = {};
        for (let i = 1; i <= 10; i += 1) {
            buckets[String(i)] = 0;
        }

        entries.forEach(entry => {
            const derived = ensureDerivedRatings(entry);
            const unified10 = toNumber(derived?.hybrid10);
            if (unified10 === null || unified10 <= 0) return;
            const bucket = String(clamp(Math.round(unified10), 1, 10));
            buckets[bucket] = (buckets[bucket] || 0) + 1;
        });

        return buckets;
    }

    function calcTagCloud(entries, limit = 32) {
        const BLOCKED_PREFIXES = ['original:', 'translations:', 'serialization:'];
        const pairs = Object.entries(calcTagCounts(entries))
            .filter(([tag]) => {
                const lowered = String(tag || '').trim().toLowerCase();
                if (!lowered) return false;
                return !BLOCKED_PREFIXES.some(prefix => lowered.startsWith(prefix));
            })
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, Math.max(1, limit));

        const maxCount = pairs.length ? pairs[0][1] : 1;
        const minCount = pairs.length ? pairs[pairs.length - 1][1] : 1;
        const span = Math.max(1, maxCount - minCount);

        return pairs.map(([tag, count]) => ({
            tag,
            count,
            weight: (count - minCount) / span
        }));
    }

    function calcLengthVsQuality(entries) {
        const points = [];
        entries.forEach(entry => {
            const length = getProgressUnits(entry);
            const personal5 = toNumber(entry?.rating);
            if (length <= 0 || personal5 === null || personal5 <= 0) return;
            points.push({
                x: length,
                y: clamp(personal5, 0, 5),
                title: String(entry?.title || 'Untitled')
            });
        });
        return points;
    }

    function calcDemographicCounts(entries) {
        const counts = {};
        DEMOGRAPHIC_NAMES.forEach(name => {
            counts[name] = 0;
        });

        entries.forEach(entry => {
            const tags = toList(entry?.tags).map(tag => String(tag).toLowerCase());
            const genres = parseUniqueCsvList(entry?.genre).map(genre => String(genre).toLowerCase());
            const all = [...tags, ...genres];

            DEMOGRAPHIC_NAMES.forEach(name => {
                const key = name.toLowerCase();
                if (all.some(item => item.includes(key))) {
                    counts[name] += 1;
                }
            });
        });

        return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
    }

    function calcBacklogFunnel(entries) {
        const status = calcStatusCounts(entries);
        return {
            planned: status.Planned || 0,
            inProgress: status['In Progress'] || 0,
            completed: status.Completed || 0,
            paused: status.Paused || 0,
            dropped: status.Dropped || 0
        };
    }

    function calcSummaryKpis(entries) {
        const ratingOverview = calcRatingOverview(entries);
        const readingTime = calcEstimatedReadingTime(entries, 5);
        const creators = calcCreatorLoyalty(entries, 1);
        const topAuthor = creators.topAuthors[0] || null;
        const totalStatuses = calcStatusCounts(entries);
        const completedCount = totalStatuses.Completed || 0;
        const health = calcLibraryHealth(entries);

        return {
            totalSeries: entries.length,
            totalProgressUnits: readingTime.totalUnits,
            estimatedHours: readingTime.totalHours,
            avgUnified10: ratingOverview.unifiedAvg10,
            avgPersonal5: ratingOverview.personalAvg5,
            topAuthorName: topAuthor ? topAuthor.name : '',
            topAuthorCount: topAuthor ? topAuthor.count : 0,
            completedCount,
            averageConfidence: health.averageConfidence,
            highConfidenceShare: health.highConfidenceShare
        };
    }

    function calcActiveReadingEntries(entries, limit = 10) {
        const maxEntries = clamp(limit, 1, 40);
        return (Array.isArray(entries) ? entries : [])
            .filter(entry => normalizeStatus(entry?.status) === 'In Progress')
            .sort((a, b) => {
                const aStamp = Date.parse(a?.lastEdited || a?.dateAdded || 0) || 0;
                const bStamp = Date.parse(b?.lastEdited || b?.dateAdded || 0) || 0;
                return bStamp - aStamp;
            })
            .slice(0, maxEntries)
            .map(entry => {
                const currentUnits = getProgressUnits(entry);
                const totalUnits = extractTotalUnits(entry);
                const image = String(entry?.image || '').trim();
                const tagList = toList(entry?.tags).slice(0, 5);
                const genreList = parseUniqueCsvList(entry?.genre).slice(0, 3);
                const tags = tagList.length ? tagList : genreList;
                const unitLabel = isFilmLikeEntry(entry) ? 'Ep.' : 'Ch.';
                let percent;
                if (totalUnits && totalUnits > 0) {
                    percent = clamp((currentUnits / totalUnits) * 100, 0, 100);
                } else if (currentUnits > 0) {
                    percent = clamp(22 + (Math.log10(currentUnits + 1) * 26), 8, 92);
                } else {
                    percent = 6;
                }

                return {
                    id: entry?.id,
                    title: String(entry?.title || 'Untitled'),
                    image,
                    tags,
                    currentUnits,
                    totalUnits,
                    percent: round(percent, 2),
                    unitLabel
                };
            });
    }

    function calcLibraryHealth(entries) {
        if (!entries.length) {
            return {
                averageConfidence: 0,
                highConfidenceShare: 0,
                lowConfidenceEntries: []
            };
        }

        const rows = entries.map(entry => {
            const derived = ensureDerivedRatings(entry);
            const confidence = clamp(toNumber(derived?.confidence) ?? 0, 0, 1);
            return {
                id: entry?.id,
                title: String(entry?.title || 'Untitled'),
                confidence
            };
        });

        const averageConfidence = rows.reduce((sum, item) => sum + item.confidence, 0) / rows.length;
        const highConfidence = rows.filter(item => item.confidence >= 0.75).length;
        const lowConfidenceEntries = rows
            .filter(item => item.confidence < 0.65)
            .sort((a, b) => a.confidence - b.confidence)
            .slice(0, 8)
            .map(item => ({
                id: item.id,
                title: item.title,
                confidence: round(item.confidence, 2)
            }));

        return {
            averageConfidence: round(averageConfidence, 3),
            highConfidenceShare: round(highConfidence / rows.length, 3),
            lowConfidenceEntries
        };
    }

    window.EveLibrary.StatsCalc = {
        calcGenreCounts,
        calcTagCounts,
        calcOriginCounts,
        calcAvgRating,
        calcStatusCounts,
        calcProgress,
        calcRatingOverview,
        calcRatingDiscrepancies,
        calcGenreRatingStats,
        calcTopGenres,
        calcCreatorLoyalty,
        calcDropoffStats,
        calcReadingVelocity,
        calcMonthlyReadingProgress,
        calcDailyReadingHabits,
        calcEstimatedReadingTime,
        calcPublicationYearCounts,
        calcRatingDistribution,
        calcUnifiedRatingDistribution,
        calcTagCloud,
        calcLengthVsQuality,
        calcDemographicCounts,
        calcBacklogFunnel,
        calcSummaryKpis,
        calcActiveReadingEntries,
        calcLibraryHealth
    };
})();
