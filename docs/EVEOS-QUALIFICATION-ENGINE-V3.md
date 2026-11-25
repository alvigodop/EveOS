# EveOS Qualification Engine v3

## Release authority

Qualification Engine v3 is the authoritative `npm run verify` implementation. It executes the
41 obligations in `tools/qualification/eveos_qualification_manifest.v3.json` once, freshly, as a
dependency graph. It does **not** run the optimized graph and then repeat the legacy verifier.

`npm run verify:legacy` preserves the former sequential command as a rollback/comparison oracle.
It is not part of a normal v3 release run. Manifest validation compares its ordered top-level
obligations to every manifest gate and fails before execution on additions, removals, reordering,
unknown scripts, missing dependencies, dependency cycles, or unproved duplicate removal.

## Scheduling model

The manifest records each gate's npm script, legacy obligation, category, prerequisites,
exclusive resources, contracts, and source areas. The scheduler starts only dependency-ready
gates and reserves all resources before assigning a worker, preventing lock-blocked work from
occupying the bounded worker pool.

The default pool is three workers. Build-output mutations remain serialized. Shared ports and
service lifecycle use `ports`/`services`; real browser owners use `playwright`; AudioFlix lanes
also use `audioflix-runtime`. Pure checks can overlap these lanes without sharing their state.
Increasing concurrency is opt-in with `--jobs` and is capped at four.

On failure, already-running owned gates finish and retain their logs; pending gates are cancelled
with an explicit reason. Ctrl+C terminates only child processes registered to that qualification.
Missing, skipped, interrupted, stale, or partial evidence cannot produce release eligibility.

## Commands and scopes

| Command | Scope | Release eligible |
| --- | --- | --- |
| `npm run verify` / `npm run verify:timed` | Fresh manifest-complete release graph | Yes, only when all 41 gates pass |
| `npm run verify:legacy` | Sequential rollback/parity oracle | Comparison only |
| `npm run --silent qualify:affected:timed` | Affected checks for local changes | No |
| `npm run --silent test:handoff` | Affected checks with a chat handoff receipt | No |
| `npm run --silent test:handoff -- --final` | Full release with a chat handoff receipt | Same requirements as `verify` |
| `npm run qualify:fast:timed` | Fast development feedback | No |
| `npm run qualify:integration:timed` | Deep integration | No |
| `npm run qualify:nexus:timed` | Nexus-focused guardrails and tests | No |
| `npm run smoke:timed-qualification-contract` | Hermetic scheduler/manifest negatives | No |

Nexus no longer appends a hidden full release to its focused profile. Run `npm run verify` when
release evidence is required.

## Scoped development

Preview the affected plan before launching checks.

```powershell
npm run --silent qualify:affected:timed -- --plan
npm run --silent qualify:affected:timed
npm run --silent qualify:affected:timed -- --base HEAD^ --plan
```

The default base is local `HEAD`. Staged, unstaged, and untracked changes count. An explicit base
also includes commits since its merge base with `HEAD`. Both paths of a move count, and an invalid
base stops selection. A docs-only change runs shared guardrails.

WatchFusion sync changes use the in-process room lab. Other WatchFusion changes select its
integration smoke. World Book client changes use the VM smoke. World Book runtime changes,
Bookmark Intelligence, and datapack changes select their respective subsystem suites. Audioflix
changes select their relevant playback, provider, Spotify, or mode checks. Shared runtime inputs
and unrecognized code paths fall back to a broader profile. The plan records those paths.

Shared guardrails retain asset, coverage, and repository checks. Spotify handoff and Audioflix mode
checks run in their affected lanes and remain in full guardrails. A combined plan
reuses the broader profile's mandatory guardrails and omits a narrower npm gate when its command
already runs inside that plan.

The affected profile can reuse passing WatchFusion room-lab and World Book client results. The
cache matches the command, input contents, Node executable, and environment, and requires the
original log. Misses, failures, and changed inputs lead to real execution. Use `--fresh` to force a
rerun, or `--verbose` for per-gate progress. Receipts record executed, reused, and unselected checks.
Use an existing passing receipt when it already covers the task. Run a broader suite when its
coverage is required and run release or publication gates through their normal entry points.

## Commit, push, and chat handoffs

For a local edit, use affected qualification before committing. The pre-commit hook checks the
staged files. On the approved publication branch, pre-push compares the fetched origin tip with
the clean candidate commit. It always runs fresh shared repository guardrails, adds the applicable
Audioflix structural checks, and falls back to full guardrails for a broad or unclassified range.
It writes its logs under `data/runtime/smoke-results/publication/`. Set
`EVEOS_PUSH_FULL_GUARDRAILS=1` for a push that requires all structural guardrails.

For a clean candidate and a handoff receipt, preview with `npm run --silent test:handoff -- --plan`
and run `npm run --silent test:handoff`. The affected default supports `main` and the active
publication branch. Its origin tip must be an ancestor of the candidate after fetching. An explicit
`--base HEAD~1` reviews the last commit after it has already been published. The standalone affected
command is the development path for a dirty tree.

Use `npm run verify` for a full release qualification or `npm run --silent test:handoff -- --final`
for the release gate with a handoff receipt. When a final handoff has no explicit profile or
script, it runs only `verify`.

## Coverage and deduplication

The optimized graph preserves all 41 legacy top-level obligations. Recursive npm-script
inventory found one exact duplicate: `smoke:coverage-map` ran in both `test:guardrails` and
`smoke:capability-surfaces`. The release-only capability script removes precisely that one
invocation; standalone `smoke:capability-surfaces` remains unchanged. Manifest validation proves
the legacy graph contains it twice, the optimized graph contains it once, and the replacement is
an exact one-command subtraction. Any new optimized transitive duplicate fails parity.

The affected pass cache covers only the two in-process checks. Browser, provider, security,
service, and full-release checks require fresh execution when selected by timed qualification.

## Evidence

Every run writes ignored evidence beneath
`data/runtime/smoke-results/timed-qualification/<profile>-<timestamp>/`:

- one complete log per gate and a bounded console failure tail;
- executed, reused, and skipped gates with reasons and original logs;
- manifest, transitive coverage graph, and source fingerprints;
- dependency and resource wait, per-gate wall/child CPU time, worker utilization and contention;
- observed and dependency critical paths, historical comparison and slowest nested children;
- duplicate inventory and the approved deduplication record; and
- an explicit `releaseEligible` boolean.

The input fingerprint includes the Git HEAD, working-tree status, manifest identity, and complete
reachable npm coverage graph. Generated evidence is not committed.

## Acceptance and rollback

The hermetic contract covers manifest parity, missing dependencies, cycles, independent
concurrency, resource serialization, nonzero propagation, dependent cancellation, and partial
rejection. Guardrails validate command wiring and the exact duplicate subtraction.

If v3 scheduling itself is suspected, use `npm run verify:legacy` once as the comparison oracle.
Do not make both paths mandatory; doing so restores the old runtime and adds no release coverage.

## Performance history

The v2 full-release baseline is 581.67 seconds (9m42s), down from 1008 seconds (16m48s). The v3
manifest-complete Windows pass finished 41/41 gates in 458.41 seconds (7m38s), with three bounded
workers, zero optimized duplicate executions, and `releaseEligible=true`. That is 123.26 seconds
(21.2%) faster than v2 and 549.59 seconds (54.5%) faster than the original qualification. The
first v3 evidence is
`data/runtime/smoke-results/timed-qualification/verify-20261018T202100953886Z/report.json`.

The remaining critical tail is deliberately serialized by `playwright` and `audioflix-runtime`:
Spotify 177.77s, AudioFlix playback 64.48s, Bookmark Intelligence 46.30s, Local Control 41.78s,
and World Book 35.31s. Further parallelism requires narrower proven runtime ownership; v3 does
not trade lifecycle isolation for a lower number.
