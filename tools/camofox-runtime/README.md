# EveOS-local Camofox runtime

Camofox is installed and run under this folder. The downloaded browser is stored
in `browser/` and runtime state in `state/` (profiles, cookies, traces, uploads).
Both are machine-local and ignored by Git; never commit browser binaries or
session data.

On Windows, run `tools\\batch\\start-camofox-bridge.bat` from the project root.
Choose **1. Install or update Camofox runtime**. The installer installs the
pinned Node dependencies and fetches the browser into `browser/`. Choose
**2. Start Camofox bridge** only after the browser reports ready.

EveOS sets `CAMOUFOX_INSTALL_DIR` before npm installation, browser download,
and every Python-launched upstream browser session. Python also puts Camofox
profiles, cookies, traces, and uploads in `state/`; no per-user AppData
browser installation is needed. Existing external caches are neither adopted
nor deleted.

Local Windows install checks from the EveOS repository root:

```powershell
Test-Path .\\tools\\camofox-runtime\\browser\\version.json
Test-Path .\\tools\\camofox-runtime\\browser\\camoufox.exe
```

If either is false, use installer option 1. The localhost bridge `/api/status`
also reports `runtimeAvailable`, `browserInstalled`, and `browserRoot`.
