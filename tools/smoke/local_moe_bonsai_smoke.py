#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
HARNESS = ROOT / "tools" / "Local-MoE-Harness"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


models = json.loads((HARNESS / "config" / "models.json").read_text(encoding="utf-8"))
record = next((item for item in models["models"] if item.get("id") == "bonsai2-27b-ptq1"), None)
require(isinstance(record, dict), "Bonsai registry record is missing")
require(record["runtime_backend"] == "prism-llama", "Bonsai must use the Prism backend")
require(len(record["revision"]) == 40, "Bonsai Hugging Face revision must be immutable")
require(record["serve_file"] in record["required_files"], "Bonsai serve file is not required")
require(record["download"]["files"] == record["required_files"], "Bonsai download is not bounded")
require(
    record["runtime_options"]["profiles"]["recovery"]["gpu_layers"] == 0,
    "Bonsai recovery profile must support CPU-only fallback",
)
require(
    record["runtime_options"]["profiles"]["normal"] == {
        "gpu_layers": 56, "auto_fit": True, "fit_target_mb": 256
    },
    "Bonsai normal profile must use high-performance VRAM auto-fit",
)
require(record["default_reasoning_effort"] == "none", "Bonsai must default to non-thinking chat")

runtime = json.loads((HARNESS / "config" / "windows-runtime.json").read_text(encoding="utf-8"))
prism = runtime.get("prism_llama") or {}
require(prism.get("release_tag") == "prism-b10709-9a9394a", "Prism release pin changed")
archives = prism.get("archives") or []
require(len(archives) == 2, "Prism CUDA runtime must pin binary and CUDA archives")
for archive in archives:
    require(len(archive.get("sha256", "")) == 64, "Prism archive hash is not pinned")
    require(
        archive.get("url", "").startswith("https://github.com/PrismML-Eng/llama.cpp/releases/"),
        "Prism archive source is not allowlisted",
    )

launcher = (HARNESS / "scripts" / "run-prism-llama-windows.ps1").read_text(encoding="utf-8")
require('"--host", "127.0.0.1"' in launcher, "Prism runtime must bind loopback only")
require('"--alias", $ServedModelName' in launcher, "Prism runtime identity must be explicit")
require('"--fit", "on"' in launcher and '"--fit-target", "$FitTarget"' in launcher,
        "Prism launcher must adapt offload to live VRAM")
require('if ($GpuLayers -ne "auto")' in launcher,
        "Prism auto-fit must omit the explicit n_gpu_layers override")
require("Invoke-Expression" not in launcher, "Prism launcher must not evaluate command text")

installer = (HARNESS / "scripts" / "install-model-windows.py").read_text(encoding="utf-8")
require('"model-downloads"' in installer, "External model downloads need NTFS staging")

lifecycle = (HARNESS / "app" / "services" / "runtime_lifecycle_windows.py").read_text(encoding="utf-8")
require('record.runtime_backend == "prism-llama"' in lifecycle, "Lifecycle backend routing is missing")
control = (ROOT / "server_modules" / "local_moe_control.py").read_text(encoding="utf-8")
require("run-prism-llama-windows.ps1" in control, "EveOS stop ownership omits Prism")

ui = (HARNESS / "web" / "app.js").read_text(encoding="utf-8")
require("Prism llama" in ui, "Harness UI does not name the active Prism runtime")

print("LOCAL_MOE_BONSAI_SMOKE: PASS 1 | FAIL 0")
