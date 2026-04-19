import json
import os
import shutil
import time
from datetime import datetime
from pathlib import Path

from server_modules.eve_state_store_layers_shared import KNOWLEDGE_STORAGE_KEYS

def _normalize_knowledge_context_key(value):
    normalized = str(value or "").strip().lower().replace(" ", "_")
    return normalized or "__global__"

def _clone_json_compatible(value, fallback):
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return fallback

def _normalize_knowledge_state(knowledge):
    source = knowledge if isinstance(knowledge, dict) else {}
    scoped_storage = source.get("scopedStorage") if isinstance(source.get("scopedStorage"), dict) else {}
    normalized = {}
    for context_key, raw_bucket in scoped_storage.items():
        if not isinstance(raw_bucket, dict):
            continue
        bucket = {}
        for field_key in KNOWLEDGE_STORAGE_KEYS:
            if field_key not in raw_bucket:
                continue
            bucket[field_key] = _clone_json_compatible(raw_bucket.get(field_key), raw_bucket.get(field_key))
        if not bucket:
            continue
        normalized[_normalize_knowledge_context_key(context_key)] = bucket
    return {"scopedStorage": normalized}

def _filter_knowledge_state(knowledge, category_names):
    normalized = _normalize_knowledge_state(knowledge)
    contexts = {
        _normalize_knowledge_context_key(name)
        for name in (category_names or [])
        if str(name or "").strip()
    }
    if not contexts:
        return {"scopedStorage": {}}
    return {
        "scopedStorage": {
            context_key: _clone_json_compatible(bucket, {})
            for context_key, bucket in (normalized.get("scopedStorage") or {}).items()
            if context_key in contexts
        }
    }

def _replace_knowledge_contexts(base_knowledge, incoming_knowledge, category_names=None):
    if category_names is None:
        return _normalize_knowledge_state(incoming_knowledge)

    contexts = {
        _normalize_knowledge_context_key(name)
        for name in (category_names or [])
        if str(name or "").strip()
    }
    base_buckets = dict((_normalize_knowledge_state(base_knowledge).get("scopedStorage") or {}))
    incoming_buckets = dict((_normalize_knowledge_state(incoming_knowledge).get("scopedStorage") or {}))

    for context_key in contexts:
        base_buckets.pop(context_key, None)
        if context_key in incoming_buckets:
            base_buckets[context_key] = _clone_json_compatible(incoming_buckets[context_key], {})

    return {"scopedStorage": base_buckets}
