# AudioFlix typed playback and large-library stability

## Protected ownership

AudioFlix remains the only queue owner. Managed Playwright handles provider transport and observation, not queue scheduling. Card pagination is a presentation projection, never a second list of queue entries or a library limit.

Remote Spotify identity is the complete `spotify:track:<id>` or `spotify:episode:<id>` URI. IDs are case-sensitive and type namespaces are distinct. Bare legacy IDs mean tracks; Spotify-local metadata never becomes a remote track. Conflicting identity aliases are rejected before an engine or volume mutation.

Volume retains owner/engine/track-generation fencing and now validates the typed helper identity. Completion, seek acknowledgments, and activation leases likewise compare the complete URI. Provider failure does not justify substituting an invented track URL.

Episodes use the official episode embed path throughout import metadata, source preparation, fallback playback, and managed transport. Restricted entries remain unavailable; local metadata requires a real file. Track-only legacy fields remain track-only.

## Bounded work

- Single additions normalize only the new item and preserve existing item/array identity. Folder lookup uses an ephemeral index. Structural recovery indexes an unchanged journal once, observes external journal rewrites, and bounds its private cache to eight packs.
- Duplicate badges use shared descriptor buckets, not a full pair report for each card. Spotify duplicate keys retain namespace and base62 case. Similar titles alone remain soft matches, including local metadata. An explicit report containing genuinely quadratic numbers of matching pairs still has quadratic output; badges do not materialize that report.
- Track Details scans current descriptors for its one selected item without allocating the full-library ID/bucket graph. Reason/order semantics remain identical; ambiguous legacy repeated IDs retain the indexed fallback, and same-array edits/dismissals are read fresh.
- Classifier projection partitions provider URLs once; conservative plain HTTP(S) authorities avoid URL construction while unusual forms retain WHATWG parsing. Nexus passes one freshly computed classifier projection to its chips, without a cross-render cache or unrelated sound-panel scan.
- Collapsed groups mount headers, not hidden song cards. Opening a group mounts only its projection; closing it does not stop its playing song.
- Music scopes up to 40 cards retain their existing layout. Larger scopes use 40-card pages with explicit Previous/Next controls, total counts and page numbers. The page-position cache is bounded to 32 entries and stores no song arrays; this is a DOM bound, not a library or queue limit.
- Paging remounts only the selected grid. Nonstructural playback/volume updates preserve other cards and focus. Main Nexus jumps reveal the containing page without closing Nexus or discarding the query.
- Fast Track consumes the existing canonical frontend scope, including folder/group/artist/classifier filters and exclusions. It must not infer that scope from the currently mounted page. Play Group continues to receive the complete canonical source.

## Indexed runtime and volume transactions

The canonical library arrays remain the persisted source. A weakly cached runtime index supplies unique ID lookup, typed identity, folder/group/provider membership and normalized search descriptors. Adds, metadata edits and removals update that index; volume/playback ticks do not rebuild it. Ambiguous IDs fail closed, and row-slot checks repair a replaced array or stale same-ID row. Queue snapshots use the existing linear `entries()` projection, not one library scan per queue member.

Card and Internal Player controls share bounded volume gestures. Input previews change audible/live state without autosaving each tick; release, blur, cancellation or keyboard settlement commits one latest value. Music/sound namespaces stay distinct, including equal IDs and ported records. Pending gestures bind row identity, so a replaced/deleted track cannot inherit a late release.

Unrelated autosaves and backup capture project committed gains into detached serialized data while retaining the audible preview in live state. Page close finalizes valid previews before the synchronous mirror flush; stale previews are rejected. Default programmatic volume calls remain durable.

Core config persistence reuses its existing detached full-config signature capture for a queued storage write, avoiding a second JSON clone and freezing unrelated nested preferences at capture time. Null/unstable captures retain ordinary storage cloning; delta events, history and IndexedDB/local fallback remain unchanged.

Unified backup/sync capture derives its structural journal from the same detached AudioFlix capture as its full section. This avoids duplicate projection work and prevents the two sections from describing different revisions; standalone structural capture and existing error policies remain compatible.

Production diagnostics record bounded numeric spans/counters for index builds, rendering, playlist reconciliation and persistence. They cannot change successful operation semantics, and metric keys contain no track identities or secrets.

## Independent large-library recovery

Small recovery copies retain the synchronous guarded localStorage path. Libraries above 2,000
tracks, or any smaller copy rejected by localStorage quota, use the existing IndexedDB store
for an independent owned JSON/Blob mirror and a separate URL-free structural journal. Legacy
copies are not removed. Success requires transaction completion, not merely request success.
Cross-tab conditional writes reject older generations; asynchronous capture and bootstrap
recovery cannot replace a newer local mutation. Core replication remains a separate fallback.

Authoritative replacements preserve the prior mirror in the same IndexedDB transaction;
failed/aborted backup transactions cannot accept the replacement. Pending unmirrored large
changes request the browser's unsaved-changes confirmation on close. An unavailable database
still permits the original guarded local/core fallback; it never turns memory into durability.
The registered mirror contracts exercise actual 25k HTTP/file reloads, quota failure,
independent topology recovery, corruption, stale completions, explicit clear and rollback data.

Search qualification records synchronous results-commit, automation overhead and input through
second-animation-frame timing separately. The latter enters the unchanged 100 ms visual
budget; the 150 ms search-processing budget is not a substitute for paint evidence.

Noninteractive capture/storage task boundaries use background-priority `scheduler.postTask`
when supported, then `scheduler.yield` or a real timer fallback. Large incremental receipt
parsing yields before its first native parse and revalidates the owner generation afterward.
This prevents default boosted continuations from unnecessarily competing with fresh input;
it does not relax the full-audit TTL or alter payload/hash output. See the browser's
[priority-inheritance explanation](https://developer.chrome.com/blog/use-scheduler-yield?hl=en).

The registered opt-in `qualify:audioflix-library-soak` exercises real HTTP/file library copies and a synthetic 25k library. Its fixed latency/resource budgets are acceptance targets, not a claim that merely adding the harness passed them. Likewise `qualify:audioflix-typed-natural` requires actual full-duration hidden playback, typed Ended identity and repeat-on/off transitions; seek-assisted evidence is not interchangeable.

## Boot and audit policy

During deferred loading, both scraper fallback event buses support the canonical pub/sub names and legacy aliases. The real bus adopts listeners collected before it loaded. A Chromium regression initializes discovery against each fallback and verifies listener delivery before and after handoff; errors are not hidden.

GitHub Actions is intentionally disabled through `config/eveos-ci-policy.json`. This is not a security-test exemption: every adversarial workflow-security contract still runs, and tracked workflows are rejected while the policy says disabled. Re-enabling CI requires an explicit policy change and workflows that pass the existing security analyzer.

## Verification

Library qualification must prove source identity before benchmarking: the runner and the served
checkout have the same clean Git HEAD, critical HTTP assets match the candidate (SHA-256 with
CRLF/LF normalization only), and actual HTTP/file browser response bodies match that proof.
The gate runs again after qualification to detect source changes during the run. A runner SHA
alone is not a served-source proof. All three projection/mirror/core persistence stages must
be recorded by a completed soak; missing measurements fail instead of becoming zero-duration
samples. A mismatched historical run remains evidence about its actual old source, not a red
or green qualification of the newer candidate. The source gate never starts/restarts services.

Paint-response probes settle before the driver starts the next synthetic phase. Their bounded
event/first-frame/second-frame timestamps expose overlap rather than treating a completed click
as a completed paint. Startup and measured interactions retain the same strict budgets; the
explicit ten-iteration warmup cohort has separate retained response/long-task summaries and
does not contaminate the measured p95. This is a second-animation-frame probe, not Chrome INP.

Registered deterministic lanes include:

```text
npm run --silent smoke:audioflix-full
npm run --silent smoke:audioflix-typed-playback
npm run --silent smoke:audioflix-sequential-add
npm run --silent smoke:audioflix-duplicate-scale
npm run --silent smoke:scraper-event-bus-boot-browser
npm run --silent test:deep
npm run --silent test:security
npm run --silent test:ai-control
npm run --silent verify
```

The opt-in library qualification accepts an explicit backup path. It makes an ignored byte-verified copy, uses disposable HTTP/file contexts, denies library/backend writes, verifies source/backend hashes, and records real DOM/pointer/scroll/focus and 10k/25k measurements. Its audio adapter is synthetic: it does not claim provider playback.

```text
npm run --silent qualify:audioflix-library-local -- --source "<backup-json>"
npm run --silent qualify:audioflix-typed-media -- --take-over --episode=spotify:episode:<episode-id>
```

The typed live lane uses the existing signed-in managed profile and disposable controllers. It checks actual playing media URIs, time advancement, volume element readback, pause/resume/seek and exactly one episode-to-track queue transition on HTTP and file entrypoints. Its default end test is seek-assisted. The explicit `qualify:audioflix-typed-natural` command instead observes the complete episode, next song, repeat-one ON and OFF, and final idle without seeking. No account playlist is created or modified to manufacture mixed-import evidence.

### Cold layout and genuine background qualification

The viewport-sized AudioFlix overlay has explicit `minmax(0, 1fr)` grid tracks. A cold-file trace isolated 92 ms of layout inside a 131 ms interaction; explicit tracks reduced one diagnostic to 92 ms total, but did not alone pass every cold-start sample. Paged music cards therefore use `content-visibility: auto` with a remembered intrinsic block-size estimate, preserving all forty mounted cards and the complete canonical library. One refined diagnostic reached 78 ms; that is not a substitute for unchanged strict-50 and 500-cycle acceptance gates. See [Chrome rendering diagnostics](https://developer.chrome.com/docs/devtools/performance/reference) and [content visibility](https://web.dev/articles/content-visibility).

Explicit Nexus navigation focuses/materializes only its requested Play control. Optimized cards use instant rather than smooth scrolling: rendering intermediate estimated-height cards during an animated scroll can move the destination. Normal cards retain smooth scrolling. Real-CSS projection coverage uses production navigation, native focus, pagination, extreme-length titles, narrow/normal/fullscreen views and fixed Internal Player hit targets. Unpaged small libraries retain normal rendering. No extra rendering timer, canonical truncation or smaller page is introduced. CSS response bodies are part of mandatory HTTP/file source attestation.

Queue exhaustion publishes terminal controls through the existing queue runtime before returning from the final step. This covers the Spotify fast path that can settle before a second Ended consumer observes the now-idle queue. It does not add a completion owner, scheduler or full-panel rebuild. The regression requires one Play Group, zero stale Stop Group controls, no extra start and retained card nodes.

Learned durations remain durable metadata, not structural library edits. Their distinct save reason avoids rebuilding cards during a long queue; title/folder and other ordinary edits retain the normal structural path. The queue contract includes an initially unknown-duration entry rather than pre-filling fixture durations to hide the path.

For Frontend music catalogs up to 4,000 entries, the panel selects the viewport/overscan subset of the existing forty-card page after projection and promotes those cards together. Geometry estimates are read before visibility writes; descendant readbacks no longer force repeated layout inside that loop. Larger catalogs keep their existing lazy layout; the cutoff never trims canonical records or changes the page size. Browser contracts cover both sides of the cutoff, 25k records, unpaged libraries, focus, scroll, pagination and long titles. This follows [batched layout read/write guidance](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing), not Spotify scheduling.

Cold projection also avoids redundant membership work: explicitly exposed music does not first resolve group membership, an empty registry reuses the whole scope as Ungrouped, and the selector reuses memberships already computed for that render. Grouped/private tracks still use the existing membership/exposure rules; no additional persistent cache or invalidation owner is introduced. A reproduced slow synthetic click included a 12 ms major GC pause alongside markup/layout work. That observation does not retroactively prove why an older unprofiled run differed.

Paged cards explicitly retain `contain: content` while viewport promotion changes `content-visibility`. This preserves the layout/style/paint containment supplied by `auto`, without adding size containment or constraining dynamic heights. The [CSS containment specification](https://www.w3.org/TR/css-contain-2/#content-visibility) explains why these modes must stay stable when content becomes relevant. Browser contracts inspect both promoted and lazy cards while retaining long-title, narrow/fullscreen, focus, scroll and pagination checks.

Transport and voice projection finish their DOM writes before viewport/card geometry is measured. Unchanged transport time labels retain their Text nodes instead of replacing them on every observation. A real Chromium mutation regression covers unchanged labels, actual time/duration changes and active seeking; the projection contract also enforces write-before-measure ordering. These changes remove avoidable post-measure invalidation rather than adjusting frame clocks or acceptance limits.

The normal AudioFlix backdrop retains its dimmed gradients but no longer applies a viewport-sized blur, matching the already-unblurred fullscreen/details paths. Event-scoped traces located the remaining inter-frame cost in `VizCompositorThread`/`SoftwareRenderer::DoDrawQuad`, not a deferred Stop handler. A controlled 20-sample blur-on/off diagnostic at the same source/runtime reduced Stop p95 from 71.4 to 30.0 ms and software drawing p95 from 40.7 to 2.3 ms. Those profiled samples establish the rendering cost, not formal qualification; the unprofiled gate and its limits remain unchanged.

Diagnostic candidates `238249ced30f263b369011cf78a121d6e6c1d3c3` and `a057c3916c65f0aadaedd5f273399078dc1eb26c` have the identical Git tree `c1b8d6512a8c5173d9988e389a3b27e72bf77d1a`. Their 133.5 ms versus 68.2 ms isolated startup measurements therefore do not establish a source difference as the cause. Historical reports lacked the function-level and host/browser evidence needed to attribute that swing. The qualifier now retains the first phase metrics separately from its recent ring and records runtime identity and cohort order outside timed actions. Full profiler captures are diagnostic evidence, not substitutes for the unprofiled 10 → 50 → 500 gate; budgets and cold samples remain unchanged.

Natural playback uses a native headed browser, a disposable companion tab in the verified same window, and minimization. Restoring the window therefore leaves the actual controller tab in the background. The browser's native visibility getter and Ended visibility are still required; any visible interval is retained as a violation, never silently re-hidden or accepted. The native-browser regression proves restoring the window stays hidden and explicitly activating the controller is rejected. This follows the [Page Visibility API's actual background-tab behavior](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), not emulated visibility. Failures retain bounded visibility transitions and native window bounds.

Full diagnostics live in ignored `data/runtime/smoke-results/`. Qualification reports must distinguish synthetic library interaction, provider playback, seek-assisted completion and natural-duration playback. Functional success alone is not a performance seal.
