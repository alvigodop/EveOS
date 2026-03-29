"""
Optional local-only Lightpanda extractor hook.

Copy this file to `%LOCALAPPDATA%\\EveOS\\lightpanda_local_extractors.py`
or set `EVEOS_LIGHTPANDA_LOCAL_EXTRACTOR` to a custom path. Keep the real file
out of version control. Return either:

    {"metadata": {...}, "html": "..."}

or just a metadata dict. Return None when the extractor does not apply.
"""


def extract(target_url, cookies):
    _ = (target_url, cookies)
    return None
