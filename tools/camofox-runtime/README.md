# EveOS-local Camofox runtime

The browser and all persistent Camofox state stay in this repository:

- browser/ — downloaded official browser and version.json (not tracked by Git)
- state/ — local sessions, cookies, profiles, traces and uploads (not tracked)
- node_modules/ — native Node server dependencies (not tracked)

On Windows, open tools\batch\start-camofox-bridge.bat from the EveOS
checkout and choose **1. Install or update**. Option 1 downloads the official
browser using EveOS's Python standard-library fetcher BEFORE invoking npm.
The download therefore does not depend on native Node build tools and never
writes to the per-user Camoufox browser cache.

The Node server is a separate install step: @askjo/camofox-browser uses
better-sqlite3, which may require a working Windows C++ toolchain and Windows
SDK. Option 1 first runs the runtime doctor; if the existing native runtime is
healthy, node_modules is preserved and npm is skipped. This prevents a browser
update from needlessly rebuilding a working better-sqlite3 installation. Only
a missing/incomplete runtime invokes npm. If npm then reports "missing any
Windows SDK", use Visual Studio Installer to add the Windows 11 SDK and retry.
A successfully downloaded browser is preserved across npm build failures.
Do not delete node_modules while a Camofox process is running.

A leftover server.js after a failed npm install is NOT enough to report
runtime readiness. The installer and startup script load better-sqlite3 and
execute an in-memory SQLite query before marking the Node server ready.

Offline installer self-test and local state verification from repo root:

\`\`\`powershell
python .\tools\camofox-runtime\fetch_browser.py --self-test
python .\tools\camofox-runtime\fetch_browser.py --check
node .\tools\camofox-runtime\scripts\doctor.cjs
\`\`\`

The browser checker requires both browser/version.json and the platform
executable. Runtime verification requires a loadable native SQLite addon.
Only choose menu option **2. Start Camofox bridge** when both pass.
The loopback bridge /api/status reports runtimeAvailable, browserInstalled
and browserRoot separately.

Keep CAMOUFOX_INSTALL_DIR pointed at tools/camofox-runtime/browser for all
Camoufox subprocesses. EveOS's Python launcher does this automatically.
The official browser is downloaded from daijro/camoufox GitHub releases,
not from npm or AppData. No old user-cache browser is silently adopted or
deleted.
