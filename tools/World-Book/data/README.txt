This folder is intentionally kept between updates and is private by default.

At runtime it stores:
- config.json: mounted workspace path and port
- state.json: World Book metadata and virtual entries
- imports\: imported read-only JSON snapshots
- recovery_* directories: local uploads, rollbacks, temporary archives, and backups

Only this README is tracked by Git. Every other current or future file beneath
data\ is ignored so personal lore, machine paths, recovery material, and backups
cannot enter the public EveOS repository through a normal add or commit.

Use World Book's backup and recovery controls to move your data intentionally.
Do not delete this folder unless you intentionally want to reset the app.
