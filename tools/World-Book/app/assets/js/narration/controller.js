(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const CACHE_POLICY_VERSION = "world-book-narration-v2";
  const LEGACY_CACHE_POLICY_VERSION = "world-book-narration-v1";

  const clampRatio = value => Math.min(1, Math.max(0, Number(value) || 0));
  const hash = value => WB.NarrationIntegrity.hash(value);

  class NarrationController extends EventTarget {
    constructor() {
      super();
      this.browser = new WB.BrowserNarrator();
      this.gemini = new WB.GeminiNarrator();
      this.source = null;
      this.passages = [];
      this.index = 0;
      this.passageRatio = 0;
      this.pendingStartRatio = 0;
      this.activeDuration = 0;
      this.status = "idle";
      this.activeEngine = "";
      this.marker = null;
      this.runToken = 0;
      this.prefetches = new Map();
      this.resumeWaiters = new Set();
      this.cacheEpoch = 0;
    }

    snapshot(extra = {}) {
      const passageCount = this.passages.length;
      const overallRatio = passageCount
        ? this.status === "complete" ? 1 : clampRatio((this.index + this.passageRatio) / passageCount)
        : 0;
      return {
        status: this.status,
        source: this.source,
        index: this.index,
        passageCount,
        passage: this.passages[this.index] || "",
        passageRatio: this.passageRatio,
        overallRatio,
        passageDuration: this.activeDuration,
        engine: this.activeEngine,
        marker: this.marker,
        ...extra,
      };
    }

    emit(extra) {
      const detail = this.snapshot(extra);
      this.dispatchEvent(new CustomEvent("state", { detail }));
      WB.NarrationHost?.post?.({ type: "eve-world-book-narration-state", detail });
    }

    load(source) {
      this.stop();
      const sourceText = String(source?.text || "");
      const passages = WB.NarrationText.split(sourceText);
      if (!passages.length) throw new Error("This source does not contain speakable text.");
      this.source = {
        id: String(source.id || `source:${hash(sourceText)}`),
        title: String(source.title || "Untitled source"),
        locator: String(source.locator || ""),
        kind: String(source.kind || "source"),
        revision: hash(sourceText),
      };
      this.passages = passages;
      this.index = 0;
      this.passageRatio = 0;
      this.pendingStartRatio = 0;
      this.activeDuration = 0;
      this.status = "ready";
      this.activeEngine = "";
      this.marker = null;
      this.prefetches.clear();
      this.emit();
      return this.snapshot();
    }

    settings() {
      return WB.NarrationStore.settings();
    }

    cacheKey(index, settings, version = CACHE_POLICY_VERSION) {
      const text = this.passages[index] || "";
      const policy = settings.strictVerbatim === false ? "natural" : "verbatim";
      return [
        "gemini",
        version,
        policy,
        settings.geminiVoice || "Aoede",
        hash(this.source?.id || "unknown"),
        index,
        hash(text),
      ].join(":");
    }

    async cachedRecord(index, settings) {
      for (const version of [CACHE_POLICY_VERSION, LEGACY_CACHE_POLICY_VERSION]) {
        const key = this.cacheKey(index, settings, version);
        const cached = await WB.NarrationStore.getAudio(key);
        if (cached && this.gemini.isPlayableRecord(cached)) return cached;
        if (cached) {
          await WB.NarrationStore.deleteAudio(key).catch(error => {
            console.warn("Invalid narration cache entry could not be removed:", error);
          });
        }
      }
      return null;
    }

    async geminiRecord(index, settings) {
      const cached = await this.cachedRecord(index, settings);
      if (cached) return cached;
      const key = this.cacheKey(index, settings);
      if (this.prefetches.has(key)) return this.prefetches.get(key);
      const source = { ...(this.source || {}) };
      const passage = this.passages[index] || "";
      const cacheEpoch = this.cacheEpoch;
      const pending = this.gemini.synthesize(passage, settings).then(async result => {
        if (!this.gemini.isPlayableRecord(result)) {
          throw new Error("Gemini returned empty narration audio. Try this passage again.");
        }
        if (cacheEpoch !== this.cacheEpoch) return result;
        return WB.NarrationStore.putAudio({
          key,
          ...result,
          voice: settings.geminiVoice,
          model: result.model || "",
          sourceId: source.id || "",
          sourceTitle: source.title || "Unknown source",
          sourceLocator: source.locator || "",
          sourceKind: source.kind || "",
          sourceRevision: source.revision || "",
          sourceHash: hash(passage),
          sourceText: passage,
          spokenText: result.spokenText || "",
          passageIndex: index,
          passageCount: this.passages.length,
          passagePreview: passage.replace(/\s+/g, " ").trim().slice(0, 180),
          narrationPolicy: settings.strictVerbatim === false ? "natural" : "verbatim",
          cachePolicyVersion: CACHE_POLICY_VERSION,
        });
      }).finally(() => {
        if (this.prefetches.get(key) === pending) this.prefetches.delete(key);
      });
      this.prefetches.set(key, pending);
      return pending;
    }

    prefetch(index, settings) {
      if (!settings.backgroundPrefetch || settings.engine !== "gemini" || index >= this.passages.length) return;
      void this.geminiRecord(index, settings).catch(error => {
        console.warn("Narration prefetch skipped:", error);
      });
    }

    updatePassageProgress(passage, ratio, token, extra = {}) {
      if (token !== this.runToken) return;
      this.passageRatio = clampRatio(ratio);
      this.marker = { ...WB.NarrationText.progressMarker(passage, this.passageRatio), kind: "estimated" };
      this.emit(extra);
    }

    async playGeminiPassage(index, passage, settings, token, startRatio) {
      this.status = "generating";
      this.emit();
      const record = await this.geminiRecord(index, settings);
      if (token !== this.runToken) return;
      await this.waitWhilePaused(token);
      if (token !== this.runToken) return;
      this.activeDuration = Number(record.durationSec) || WB.GeminiNarrationAudio.durationSeconds(record);
      this.status = "playing";
      this.emit({ cached: record.createdAt !== undefined });
      this.prefetch(index + 1, settings);
      await this.gemini.play(record, settings, ratio => {
        this.updatePassageProgress(passage, ratio, token, { cached: record.createdAt !== undefined });
      }, startRatio);
    }

    async playBrowserPassage(passage, settings, token, startRatio) {
      const offset = WB.NarrationText.offsetForRatio(passage, startRatio);
      if (offset >= passage.length) {
        this.updatePassageProgress(passage, 1, token);
        return;
      }
      const spokenText = passage.slice(offset);
      const words = Math.max(1, spokenText.trim().split(/\s+/).length);
      const estimateMs = Math.max(500, (words / (175 * Math.max(0.5, Number(settings.rate) || 1))) * 60000);
      let elapsedMs = 0;
      let lastTick = performance.now();
      const estimateTimer = window.setInterval(() => {
        const now = performance.now();
        if (this.status === "playing") elapsedMs += now - lastTick;
        lastTick = now;
        const ratio = startRatio + Math.min(0.98, elapsedMs / estimateMs) * (1 - startRatio);
        if (ratio > this.passageRatio) this.updatePassageProgress(passage, ratio, token);
      }, 180);
      this.status = "playing";
      this.emit();
      try {
        await this.browser.speak(spokenText, settings, boundary => {
          if (token !== this.runToken) return;
          const adjusted = { ...boundary, charIndex: offset + Math.max(0, Number(boundary.charIndex) || 0) };
          this.passageRatio = clampRatio(adjusted.charIndex / Math.max(1, passage.length));
          this.marker = { ...WB.NarrationText.markerRange(passage, adjusted), kind: boundary.name || "word" };
          this.emit({ boundary: adjusted, passageLength: passage.length });
        });
      } finally {
        window.clearInterval(estimateTimer);
      }
    }

    async playPassage(index, settings, token) {
      const passage = this.passages[index];
      const startRatio = clampRatio(this.pendingStartRatio || this.passageRatio);
      this.pendingStartRatio = 0;
      this.passageRatio = startRatio;
      this.activeEngine = settings.engine;
      this.marker = { ...WB.NarrationText.progressMarker(passage, startRatio), kind: "passage" };
      if (settings.engine === "gemini") await this.playGeminiPassage(index, passage, settings, token, startRatio);
      else await this.playBrowserPassage(passage, settings, token, startRatio);
      if (token === this.runToken) this.updatePassageProgress(passage, 1, token);
    }

    waitWhilePaused(token) {
      if (this.status !== "paused" || token !== this.runToken) return Promise.resolve();
      return new Promise(resolve => this.resumeWaiters.add(resolve));
    }

    releasePauseWaiters() {
      this.resumeWaiters.forEach(resolve => resolve());
      this.resumeWaiters.clear();
    }

    invalidateCacheWrites() {
      this.cacheEpoch += 1;
    }

    async clearAudioCache() {
      this.invalidateCacheWrites();
      await WB.NarrationStore.clearAudio();
    }

    async clearSourceCache(sourceId) {
      this.invalidateCacheWrites();
      return WB.NarrationStore.clearSource(sourceId);
    }

    async deleteCachedAudio(key) {
      this.invalidateCacheWrites();
      await WB.NarrationStore.deleteAudio(key);
    }

    async run(token) {
      try {
        while (token === this.runToken && this.index < this.passages.length) {
          const settings = this.settings();
          if (!settings.enabled) throw new Error("World Book narration is disabled in Search Monitor.");
          await this.playPassage(this.index, settings, token);
          if (token !== this.runToken) return;
          this.marker = null;
          this.index += 1;
          this.passageRatio = 0;
          this.activeDuration = 0;
          this.emit();
        }
        if (token === this.runToken) {
          this.index = Math.max(0, this.passages.length - 1);
          this.passageRatio = 1;
          this.status = "complete";
          this.emit();
        }
      } catch (error) {
        if (token !== this.runToken) return;
        this.status = "error";
        this.emit({ error: error.message || String(error) });
      }
    }

    play() {
      if (!this.passages.length) throw new Error("Choose an entry or reader document first.");
      if (this.status === "paused") return this.resume();
      if (this.status === "complete") {
        this.index = 0;
        this.passageRatio = 0;
      }
      const token = ++this.runToken;
      void this.run(token);
      return this.snapshot();
    }

    pause() {
      if (!["playing", "generating"].includes(this.status)) return;
      this.status = "paused";
      this.browser.pause();
      void this.gemini.pause();
      this.emit();
    }

    resume() {
      if (this.status !== "paused") return;
      this.status = "playing";
      this.browser.resume();
      void this.gemini.resume();
      this.releasePauseWaiters();
      this.emit();
    }

    stop() {
      this.runToken += 1;
      this.invalidateCacheWrites();
      this.browser.stop();
      if (this.gemini.isGenerating()) this.gemini.cancelGeneration();
      this.gemini.stopPlayback();
      this.prefetches.clear();
      this.releasePauseWaiters();
      this.status = this.passages.length ? "ready" : "idle";
      this.activeEngine = "";
      this.marker = null;
      this.passageRatio = 0;
      this.pendingStartRatio = 0;
      this.activeDuration = 0;
      this.emit();
    }

    seek(index, autoplay = false) {
      const next = Math.max(0, Math.min(this.passages.length - 1, Number(index) || 0));
      this.stop();
      this.index = next;
      this.passageRatio = 0;
      this.marker = null;
      this.emit();
      if (autoplay) this.play();
    }

    seekProgress(value, autoplay = false) {
      if (!this.passages.length) return;
      const ratio = clampRatio((Number(value) || 0) / 1000);
      this.stop();
      if (ratio >= 1) {
        this.index = this.passages.length - 1;
        this.passageRatio = 1;
        this.marker = { ...WB.NarrationText.progressMarker(this.passages[this.index], 1), kind: "passage" };
        this.status = "complete";
        this.emit();
        return;
      }
      const scaled = ratio * this.passages.length;
      this.index = Math.min(this.passages.length - 1, Math.floor(scaled));
      this.passageRatio = clampRatio(scaled - this.index);
      this.pendingStartRatio = this.passageRatio;
      this.marker = { ...WB.NarrationText.progressMarker(this.passages[this.index], this.passageRatio), kind: "passage" };
      this.emit();
      if (autoplay) this.play();
    }

    focusCachedPassage(record) {
      if (!this.source || String(this.source.id) !== String(record?.sourceId)) {
        return { ok: false, message: "Open this source before jumping to its cached clip." };
      }
      const index = Math.max(0, Math.min(this.passages.length - 1, Number(record?.passageIndex) || 0));
      this.seek(index, false);
      return { ok: true, message: `Moved to clip ${index + 1}.` };
    }

    cachePassageStatus(record) {
      if (!this.source || String(this.source.id) !== String(record?.sourceId)) return { status: "cached", label: "Cached" };
      const passageIndex = Math.max(0, Number(record?.passageIndex) || 0);
      if (this.status === "complete" || passageIndex < this.index) return { status: "complete", label: "Completed" };
      if (passageIndex > this.index) return { status: "upcoming", label: "Upcoming" };
      if (["playing", "generating"].includes(this.status)) return { status: "reading", label: "Reading now" };
      if (this.status === "paused") return { status: "paused", label: "Paused here" };
      return { status: "selected", label: "Selected" };
    }

    inspectCachedRecord(record) {
      return {
        ...WB.NarrationIntegrity.inspectRecord(record, this),
        reading: this.cachePassageStatus(record),
      };
    }

    next() { this.seek(this.index + 1, true); }
    previous() { this.seek(this.index - 1, true); }
  }

  WB.Narration = new NarrationController();
  WB.NARRATION_CACHE_POLICY_VERSION = CACHE_POLICY_VERSION;
})();
