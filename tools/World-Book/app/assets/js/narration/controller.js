(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const CACHE_POLICY_VERSION = "world-book-narration-v1";

  function hash(value) {
    let code = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      code ^= value.charCodeAt(index);
      code = Math.imul(code, 16777619);
    }
    return (code >>> 0).toString(36);
  }

  class NarrationController extends EventTarget {
    constructor() {
      super();
      this.browser = new WB.BrowserNarrator();
      this.gemini = new WB.GeminiNarrator();
      this.source = null;
      this.passages = [];
      this.index = 0;
      this.status = "idle";
      this.activeEngine = "";
      this.marker = null;
      this.runToken = 0;
      this.prefetches = new Map();
      this.resumeWaiters = new Set();
      this.cacheEpoch = 0;
    }

    snapshot(extra = {}) {
      return {
        status: this.status,
        source: this.source,
        index: this.index,
        passageCount: this.passages.length,
        passage: this.passages[this.index] || "",
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
      const passages = WB.NarrationText.split(source?.text || "");
      if (!passages.length) throw new Error("This source does not contain speakable text.");
      this.source = {
        id: String(source.id || `source:${hash(source.text || "")}`),
        title: String(source.title || "Untitled source"),
      };
      this.passages = passages;
      this.index = 0;
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

    cacheKey(index, settings) {
      const text = this.passages[index] || "";
      const policy = settings.strictVerbatim === false ? "natural" : "verbatim";
      return [
        "gemini",
        CACHE_POLICY_VERSION,
        policy,
        settings.geminiVoice || "Aoede",
        hash(this.source?.id || "unknown"),
        index,
        hash(text),
      ].join(":");
    }

    async geminiRecord(index, settings) {
      const key = this.cacheKey(index, settings);
      const cached = await WB.NarrationStore.getAudio(key);
      if (cached && this.gemini.isPlayableRecord(cached)) return cached;
      if (cached) {
        await WB.NarrationStore.deleteAudio(key).catch(error => {
          console.warn("Invalid narration cache entry could not be removed:", error);
        });
      }
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
          sourceId: source.id || "",
          sourceTitle: source.title || "Unknown source",
          passageIndex: index,
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

    async playPassage(index, settings, token) {
      const passage = this.passages[index];
      this.activeEngine = settings.engine;
      this.marker = { sentenceStart: 0, sentenceEnd: passage.length, wordStart: 0, wordEnd: 0, kind: "passage" };
      if (settings.engine === "gemini") {
        this.status = "generating";
        this.emit();
        const record = await this.geminiRecord(index, settings);
        if (token !== this.runToken) return;
        await this.waitWhilePaused(token);
        if (token !== this.runToken) return;
        this.status = "playing";
        this.emit({ cached: record.createdAt !== undefined });
        this.prefetch(index + 1, settings);
        await this.gemini.play(record, settings, ratio => {
          if (token !== this.runToken) return;
          this.marker = { ...WB.NarrationText.progressMarker(passage, ratio), kind: "estimated" };
          this.emit({ cached: record.createdAt !== undefined });
        });
        return;
      }
      this.status = "playing";
      this.emit();
      await this.browser.speak(passage, settings, boundary => {
        if (token !== this.runToken) return;
        this.marker = { ...WB.NarrationText.markerRange(passage, boundary), kind: boundary.name || "word" };
        this.emit({ boundary, passageLength: passage.length });
      });
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
          this.emit();
        }
        if (token === this.runToken) {
          this.index = Math.max(0, this.passages.length - 1);
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
      if (this.status === "complete") this.index = 0;
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
      this.emit();
    }

    seek(index, autoplay = false) {
      const next = Math.max(0, Math.min(this.passages.length - 1, Number(index) || 0));
      this.stop();
      this.index = next;
      this.marker = null;
      this.emit();
      if (autoplay) this.play();
    }

    next() { this.seek(this.index + 1, true); }
    previous() { this.seek(this.index - 1, true); }
  }

  WB.Narration = new NarrationController();
  WB.NARRATION_CACHE_POLICY_VERSION = CACHE_POLICY_VERSION;
})();
