# Browser Extension Engineering Notes

This directory contains the Nexus Browser Online-Origin extension runtime: service-worker logic, provider registry/freshness code, and provider content adapters.

## Canonical agent workflow after extension changes

Future agents working in this directory should **use the repo's automated npm workflow before asking Drift to do browser work manually**.

From `tools/Nexus-Browser` in EveOS:

```powershell
npm run extension:refresh
```

That single command performs the normal shared deterministic gate and then reloads the unpacked extension through the bridge:

```text
npm run validate:shared
npm run extension:reload
```

Use `npm run extension:reload` by itself only when `validate:shared` has already passed for the exact current working tree.

Do **not** default to telling Drift to open `chrome://extensions` and click Reload. The repository already automates the extension reload/reconnect cycle with `scripts/dexctl.js reload-extension`.

If the automated reload command fails, diagnose that failure first. Manual Chrome interaction is a fallback only after the repo-owned path is proven unavailable.

## Adapter freshness

When changing provider content-adapter behavior that existing provider tabs must receive, also advance `content/provider-adapter-revision.js`. Runtime freshness checks use that revision to reload only stale provider tabs before work resumes.

Keep exact-once delivery and recovery boundaries intact while doing so.
