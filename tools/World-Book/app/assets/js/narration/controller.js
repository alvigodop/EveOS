(function () {
  const WB = window.WorldBook = window.WorldBook || {};

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
      this.runToken = 0;
      this.prefetches = new Map();
    }

    snapshot(extra = {}) {
      return {
        status: this.status,
        source: this.source,
        index: this.index,
        passageCount: this.passages.length,
        passage: this.passages[this.index] || "",
        ...extra,
      };
    }

    emit(extra) {
      const detail = this.snapshot(extra);
      this.dispatchEvent(new CustomEvent("state", { detail }));
      window.parent?.postMessage?.({ type: "eve-world-book-narration-state", detail }, "*");
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
      this.prefetches.clear();
      this.emit();
      return this.snapshot();
    }

    settings() {
      return WB.NarrationStore.settings();
    }

    cacheKey(index, settings) {
      const text = this.passages[index] || "";
      return `gemini:${settings.geminiVoice}:${hash(text)}`;
    }

    async geminiRecord(index, settings) {
      const key = this.cacheKey(index, settings);
      const cached = await WB.NarrationStore.getAudio(key);
      if (cached) return cached;
      if (this.prefetches.has(key)) return this.prefetches.get(key);
      const pending = this.gemini.synthesize(this.passages[index], settings).then(async result => {
        const record = { key, ...result, voice: settings.geminiVoice, sourceId: this.source?.id || "" };
        await WB.NarrationStore.putAudio(record);
        return record;
      }).finally(() => this.prefetches.delete(key));
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
      if (settings.engine === "gemini") {
        this.status = "generating";
        this.emit();
        const record = await this.geminiRecord(index, settings);
        if (token !== this.runToken) return;
        this.status = "playing";
        this.emit({ cached: record.createdAt !== undefined });
        this.prefetch(index + 1, settings);
        await this.gemini.play(record, settings.volume);
        return;
      }
      this.status = "playing";
      this.emit();
      await this.browser.speak(passage, settings, charIndex => {
        if (token === this.runToken) this.emit({ charIndex, passageLength: passage.length });
      });
    }

    async run(token) {
      try {
        while (token === this.runToken && this.index < this.passages.length) {
          const settings = this.settings();
          if (!settings.enabled) throw new Error("World Book narration is disabled in Search Monitor.");
          await this.playPassage(this.index, settings, token);
          if (token !== this.runToken) return;
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
      this.emit();
    }

    stop() {
      this.runToken += 1;
      this.browser.stop();
      this.gemini.stopPlayback();
      this.status = this.passages.length ? "ready" : "idle";
      this.emit();
    }

    seek(index, autoplay = false) {
      const next = Math.max(0, Math.min(this.passages.length - 1, Number(index) || 0));
      this.stop();
      this.index = next;
      this.emit();
      if (autoplay) this.play();
    }

    next() { this.seek(this.index + 1, true); }
    previous() { this.seek(this.index - 1, true); }
  }

  WB.Narration = new NarrationController();
})();
