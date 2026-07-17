"""Bookmark, media, source, identifier, and rating projections for Gemini context."""

from server_modules.eve_state_store_gemini_compact import (
    _compact_text,
    _compact_url,
    _summary_text,
)
def _summary_list(value):
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _summary_first(source, keys, fallback=""):
    for key in keys:
        value = (source or {}).get(key)
        if value not in (None, ""):
            return value
    return fallback


def _summary_timestamp(source):
    for key in ["lastEdited", "lastUpdated", "updatedAt", "dateAdded", "createdAt", "visitedAt", "lastVisited"]:
        value = (source or {}).get(key)
        if value not in (None, ""):
            return value
    return ""


def _summary_progress(source):
    return {
        "chapter": _summary_first(source, ["chapter", "graphicChapter", "novelChapter"]),
        "episode": _summary_first(source, ["episode"]),
        "season": _summary_first(source, ["season"]),
        "volume": _summary_first(source, ["volume"]),
        "progress": _summary_first(source, ["progress", "progressUnits"]),
    }


def _summary_related_urls(link):
    urls = []
    array_keys = [
        "relatedUrls",
        "additionalUrls",
        "extraUrls",
        "alternateUrls",
        "urlAlternates",
        "mirrors",
        "sources",
        "sourceUrls",
    ]
    scalar_keys = [
        "mirrorUrl",
        "sourceUrl",
        "wikiUrl",
        "alternateUrl",
        "additionalUrl",
        "mangaDexUrl",
        "anilistUrl",
        "malUrl",
        "fandomUrl",
    ]
    for key in array_keys:
        for entry in _summary_list((link or {}).get(key)):
            if isinstance(entry, dict):
                candidate = _summary_text(entry.get("url") or entry.get("href") or entry.get("link") or entry.get("source") or entry.get("value"))
            else:
                candidate = _summary_text(entry)
            if candidate:
                urls.append(_compact_url(candidate))
    for key in scalar_keys:
        candidate = _summary_text((link or {}).get(key))
        if candidate:
            urls.append(_compact_url(candidate))
    return [url for url in dict.fromkeys(urls) if url][:8]

def _summary_covers(link):
    additional = []
    for key in ["additionalCovers", "coverImages", "extraCovers"]:
        additional.extend(
            _compact_url(_summary_text(item.get("url") or item.get("src")) if isinstance(item, dict) else _summary_text(item))
            for item in _summary_list((link or {}).get(key))
        )
    additional = [value for value in dict.fromkeys(additional) if value]
    primary = _compact_url(_summary_text(_summary_first(link, ["coverImage", "cover", "imageUrl", "thumbnail", "thumbnailUrl"])))
    return {
        "primary": primary,
        "additional": additional[:8],
        "hasCover": bool(primary or additional),
        "hasAdditionalCovers": bool(additional),
    }


_DEFAULT_IDENTIFIER_LABELS = {
    "reading": "Reading",
    "watching": "Watching",
    "listening": "Listening",
    "playing": "Playing",
    "research": "Research",
    "reference": "Reference",
}


_RATING_PROVIDER_LABELS = {
    "anilist": "AniList",
    "myanimelist": "MyAnimeList",
    "mangadex": "MangaDex",
    "kitsu": "Kitsu",
    "tvmaze": "TVmaze",
    "mangaupdates": "MangaUpdates",
    "comick": "ComicK",
    "openlibrary": "OpenLibrary",
    "wlnupdates": "WlnUpdates",
    "itunes": "iTunes",
}


def _scalar(value):
    return None if value in (None, "") else value


def _compact_api_ratings(api_ratings):
    # Flat {Label: score} map — the old {values:{key:{label,score}},presentProviders,count}
    # shape repeated every provider name twice and shipped derivable counts.
    values = {}
    if isinstance(api_ratings, dict):
        for key, label in _RATING_PROVIDER_LABELS.items():
            value = _scalar(api_ratings.get(key, api_ratings.get(label, api_ratings.get(label.lower()))))
            if value is not None:
                values[label] = value
    return values


def _compact_derived_ratings(derived_ratings):
    source = derived_ratings if isinstance(derived_ratings, dict) else {}
    mapping = {
        "activeValue": "unified",
        "hybrid10": "hybrid",
        "personal10": "personal10",
        "apiAverage10": "apiAverage",
        "apiWeighted10": "apiWeighted",
        "confidence": "confidence",
    }
    out = {}
    for key, label in mapping.items():
        value = _scalar(source.get(key))
        if value is not None:
            out[label] = value
    return out


def _source_context(source):
    if not isinstance(source, dict):
        return None
    provider = _summary_text(source.get("source") or source.get("provider") or source.get("site") or source.get("name"))
    title = _compact_text(_summary_text(source.get("title") or source.get("name") or source.get("label")), 120)
    url = _compact_url(_summary_text(source.get("providerUrl") or source.get("url") or source.get("sourceUrl") or source.get("link")))
    score = _scalar(source.get("score", source.get("rating", source.get("averageScore"))))
    return {
        "provider": provider,
        "title": title,
        "status": _summary_text(source.get("status") or source.get("state")),
        "score": score,
        "url": url,
        "type": _summary_text(source.get("type") or source.get("mediaType") or source.get("format")),
        "author": _summary_text(source.get("author")),
        "tags": [_summary_text(item) for item in _summary_list(source.get("tags")) if _summary_text(item)][:16],
        "genres": [_summary_text(item) for item in _summary_list(source.get("genres")) if _summary_text(item)][:16],
        "synonyms": list(dict.fromkeys([
            _summary_text(item)
            for item in (_summary_list(source.get("synonyms")) + _summary_list(source.get("altTitles") or source.get("alternativeTitles")))
            if _summary_text(item)
        ]))[:12],
        "progress": _summary_progress(source),
        "coverUrl": _compact_url(_summary_text(source.get("coverUrl") or source.get("image") or source.get("imageUrl"))),
    }


def _attached_sources(link, linked_entry):
    raw = []
    if isinstance((link or {}).get("sources"), list):
        raw.extend((link or {}).get("sources") or [])
    if isinstance((linked_entry or {}).get("sources"), list):
        raw.extend((linked_entry or {}).get("sources") or [])
    seen = set()
    out = []
    for source in raw:
        compact = _source_context(source)
        if not compact:
            continue
        key = f"{compact.get('provider')}|{compact.get('title')}|{compact.get('url')}".lower()
        if key in seen:
            continue
        seen.add(key)
        if compact.get("provider") or compact.get("title") or compact.get("url") or compact.get("score") is not None:
            out.append(compact)
    return out[:8]


def _rating_context(link, linked_entry):
    # No `summary` block: it repeated a subset of `derived` verbatim on every rated bookmark.
    api = _compact_api_ratings((linked_entry or {}).get("apiRatings") or (link or {}).get("apiRatings"))
    derived = _compact_derived_ratings((linked_entry or {}).get("derivedRatings") or (link or {}).get("derivedRatings"))
    personal = _scalar(_summary_first(linked_entry, ["rating", "personalRating"], _summary_first(link, ["rating", "personalRating"])))
    return {"personal": personal, "api": api, "derived": derived}


def _has_rating_signal(ratings):
    return ratings.get("personal") is not None or bool(ratings.get("api")) or bool(ratings.get("derived"))


def _media_context(link, linked_entry, category_data):
    # No `flags` block: it was derivable from the mediaTypes list itself.
    media_types = list(dict.fromkeys(
        _summary_text(item)
        for item in (_summary_list((linked_entry or {}).get("mediaTypes")) + _summary_list((link or {}).get("mediaTypes")))
        if _summary_text(item)
    ))[:8]
    return {
        "dataType": _summary_text((category_data or {}).get("dataType") or (linked_entry or {}).get("dataType") or (link or {}).get("dataType")),
        "mediaTypes": media_types,
    }

def _summary_aliases(entry):
    aliases = []
    for key in ["aliases", "alternativeTitles", "altTitles", "titleAltNames", "otherNames", "synonyms"]:
        aliases.extend(_summary_text(value) for value in _summary_list((entry or {}).get(key)))
    return [value for value in dict.fromkeys(aliases) if value][:12]

def _bookmark_identifiers(link):
    ids = list(dict.fromkeys(
        _summary_text(item)
        for item in (
            _summary_list((link or {}).get("identifiers"))
            + _summary_list((link or {}).get("identifierIds"))
            + _summary_list((link or {}).get("bookmarkIdentifiers"))
        )
        if _summary_text(item)
    ))[:20]
    # ids + labels only: a `details` list without descriptions just repeated the same data a
    # third time, and the old per-bookmark explanatory note sentence lives in the header now.
    return {
        "ids": ids,
        "labels": [_DEFAULT_IDENTIFIER_LABELS.get(item, item) for item in ids],
    }
