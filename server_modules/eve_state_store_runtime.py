import hashlib
import shutil


def ensure_clean_store(store_root, meta_dir, tabs_dir):
    if store_root.exists():
        shutil.rmtree(store_root)
    meta_dir.mkdir(parents=True, exist_ok=True)
    tabs_dir.mkdir(parents=True, exist_ok=True)


def collect_status(store_root):
    if not store_root.exists():
        return {
            "exists": False,
            "signature": "",
            "fileCount": 0,
            "lastModified": 0,
            "path": str(store_root),
        }

    parts = []
    file_count = 0
    last_modified = 0

    for path in sorted(store_root.rglob("*")):
        if not path.is_file():
            continue
        stat = path.stat()
        file_count += 1
        last_modified = max(last_modified, int(stat.st_mtime))
        rel = str(path.relative_to(store_root)).replace("\\", "/")
        parts.append(f"{rel}:{stat.st_size}:{stat.st_mtime_ns}")

    signature = hashlib.sha1("\n".join(parts).encode("utf-8")).hexdigest() if parts else ""
    return {
        "exists": True,
        "signature": signature,
        "fileCount": file_count,
        "lastModified": last_modified,
        "path": str(store_root),
    }
