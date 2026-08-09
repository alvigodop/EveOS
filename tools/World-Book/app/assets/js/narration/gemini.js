(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const WS_URL = "ws://127.0.0.1:9085";
  const DEFAULT_MODEL = "gemini-3.1-flash-live-preview";

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function base64Bytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function joinBytes(chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output.buffer;
  }

  function bytesBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const block = 0x8000;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += block) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + block));
    }
    return btoa(binary);
  }

  function normalizeAudioRecord(record) {
    const value = record?.pcm;
    let pcm = null;
    if (value instanceof ArrayBuffer) pcm = value;
    else if (ArrayBuffer.isView(value)) {
      pcm = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    const sampleRate = boundedNumber(record?.sampleRate, 8000, 96000, 24000);
    if (!pcm || pcm.byteLength < 2 || pcm.byteLength % 2 !== 0) return null;
    return { ...record, pcm, sampleRate };
  }

  function durationSeconds(record) {
    const value = normalizeAudioRecord(record);
    return value ? value.pcm.byteLength / 2 / value.sampleRate : 0;
  }

  function reportProgress(callback, ratio) {
    if (typeof callback !== "function") return;
    try { callback(Math.min(1, Math.max(0, Number(ratio) || 0))); } catch (_error) {}
  }

  function mergeTranscript(current, incoming) {
    const chunk = String(incoming || "").trim();
    if (!chunk) return current;
    if (!current || chunk.startsWith(current)) return chunk;
    if (current.endsWith(chunk)) return current;
    return `${current} ${chunk}`.trim();
  }

  function pcmFromRatio(record, ratio) {
    const progress = Math.min(0.999999, Math.max(0, Number(ratio) || 0));
    const frameCount = Math.floor(record.pcm.byteLength / 2);
    const startFrame = Math.min(frameCount - 1, Math.floor(frameCount * progress));
    return record.pcm.slice(startFrame * 2);
  }

  class GeminiNarrator {
    constructor() {
      this.socket = null;
      this.connectPromise = null;
      this.pending = null;
      this.voice = "";
      this.context = null;
      this.source = null;
      this.progressTimer = 0;
      this.nativePlayback = null;
      this.model = DEFAULT_MODEL;
      this.sessionId = `reader-${Date.now().toString(36)}`;
    }

    connect(settings) {
      const voice = settings.geminiVoice || "Aoede";
      if (this.socket?.readyState === WebSocket.OPEN && this.voice === voice) return Promise.resolve();
      if (this.connectPromise && this.voice === voice) return this.connectPromise;
      this.close();
      this.voice = voice;
      this.connectPromise = new Promise((resolve, reject) => {
        const socket = new WebSocket(WS_URL);
        const timeout = window.setTimeout(() => {
          socket.close();
          reject(new Error("Gemini narration server did not answer."));
        }, 12000);
        socket.onopen = () => {
          socket.send(JSON.stringify(this.setupMessage(settings)));
          window.clearTimeout(timeout);
          resolve();
        };
        socket.onmessage = event => this.onMessage(event);
        socket.onerror = () => reject(new Error("Gemini narration server is offline."));
        socket.onclose = () => {
          this.socket = null;
          this.connectPromise = null;
          if (this.pending) this.finishPending(new Error("Gemini narration connection closed."));
        };
        this.socket = socket;
      }).catch(error => {
        this.connectPromise = null;
        throw error;
      });
      return this.connectPromise;
    }

    setupMessage(settings) {
      const voice = settings.geminiVoice || "Aoede";
      const instruction = settings.strictVerbatim === false
        ? "Narrate the supplied prose naturally without commentary, headings, acknowledgments, summaries, or invented facts."
        : "Read supplied prose aloud exactly and naturally. Do not add commentary, headings, acknowledgments, summaries, or invented words. Preserve names and punctuation. Return audio only.";
      return {
        sessionRole: "world_book_narration",
        model: DEFAULT_MODEL,
        responseTimeout: 90,
        sequentialAudioPlay: true,
        inlineTranscriptionMode: true,
        outputTranscriptionEnabled: true,
        setup: {
          contents: [{ parts: [{ text: `You are World Book's narrator speaking with the voice of ${voice}.` }] }],
          tools: [],
          systemInstruction: { parts: [{ text: instruction }] },
          generationConfig: {
            temperature: 0.2,
            topK: 1,
            topP: 0.8,
            candidateCount: 1,
            maxOutputTokens: 8192,
            responseModalities: ["AUDIO"],
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice, speakingRate: 1, pitch: 0 } },
          },
        },
      };
    }

    onMessage(event) {
      let data;
      try { data = JSON.parse(event.data); } catch (_error) { return; }
      if (data.type === "session_ready" && data.model) this.model = String(data.model);
      if (data.type === "model_migrated" && data.to) this.model = String(data.to);
      if (data.audio && this.pending) {
        this.pending.chunks.push(base64Bytes(data.audio));
      }
      if (data.type === "transcription" && this.pending) {
        this.pending.spokenText = mergeTranscript(this.pending.spokenText, data.text);
      }
      if (data.type === "turn_complete" && this.pending) this.finishPending();
      if ((data.is_error || data.type === "error") && this.pending) {
        this.finishPending(new Error(data.text || data.message || "Gemini narration failed."));
      }
    }

    finishPending(error) {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      window.clearTimeout(pending.timeout);
      if (error) pending.reject(error);
      else if (!pending.chunks.length) pending.reject(new Error("Gemini returned no narration audio."));
      else {
        const pcm = joinBytes(pending.chunks);
        const seconds = pcm.byteLength / 2 / 24000;
        const minimumSeconds = Math.min(5, Math.max(0.25, pending.textLength / 120));
        if (seconds < minimumSeconds) {
          pending.reject(new Error("Gemini narration ended before the passage was complete. Try this passage again."));
        } else {
          pending.resolve({
            pcm,
            sampleRate: 24000,
            spokenText: pending.spokenText,
            model: this.model || DEFAULT_MODEL,
            durationSec: seconds,
          });
        }
      }
    }

    async synthesize(text, settings) {
      if (this.pending) throw new Error("Gemini is already narrating another passage.");
      await this.connect(settings);
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => this.finishPending(new Error("Gemini narration timed out.")), 90000);
        this.pending = {
          resolve,
          reject,
          chunks: [],
          spokenText: "",
          timeout,
          textLength: String(text || "").length,
        };
        this.socket.send(JSON.stringify({
          source: "world_book_narration",
          realtime_input: { media_chunks: [{ mime_type: "text/plain", data: text }] },
        }));
      });
    }

    async playNative(record, settings, onProgress, startRatio = 0) {
      const baseRatio = Math.min(0.999999, Math.max(0, Number(startRatio) || 0));
      const routedPcm = pcmFromRatio(record, baseRatio);
      const response = await WB.NarrationHost?.request?.({
        type: "eve-world-book-narration-play",
        sessionId: this.sessionId,
        audio: bytesBase64(routedPcm),
        sampleRate: record.sampleRate || 24000,
        volume: boundedNumber(settings.volume, 0, 1, 1),
      }, 8000);
      if (response?.ok !== true) return false;
      const durationMs = Math.max(100, Math.ceil(durationSeconds(record) * (1 - baseRatio) * 1000));
      return new Promise(resolve => {
        const startedAt = performance.now();
        const progressTimer = window.setInterval(() => {
          const ratio = baseRatio + ((performance.now() - startedAt) / durationMs) * (1 - baseRatio);
          if (this.nativePlayback) this.nativePlayback.currentRatio = Math.min(1, ratio);
          reportProgress(onProgress, ratio);
        }, 120);
        reportProgress(onProgress, baseRatio);
        this.nativePlayback = {
          record,
          settings,
          onProgress,
          resolve,
          progressTimer,
          currentRatio: baseRatio,
          timer: window.setTimeout(() => {
            window.clearInterval(progressTimer);
            reportProgress(onProgress, 1);
            this.nativePlayback = null;
            resolve(true);
          }, durationMs + 80),
        };
      });
    }

    async play(record, settings = {}, onProgress, startRatio = 0) {
      this.stopPlayback();
      const playable = normalizeAudioRecord(record);
      if (!playable) {
        throw new Error("Gemini narration audio is empty or corrupt. The passage will need to be generated again.");
      }
      record = playable;
      const baseRatio = Math.min(0.999999, Math.max(0, Number(startRatio) || 0));
      if (settings.routeToAudioflix === true) {
        const routed = await this.playNative(record, settings, onProgress, baseRatio);
        if (routed !== false) return routed;
      }
      const context = this.context || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: record.sampleRate });
      this.context = context;
      await context.resume();
      const bytes = new Uint8Array(record.pcm);
      const frameCount = Math.floor(bytes.byteLength / 2);
      const buffer = context.createBuffer(1, frameCount, record.sampleRate);
      const output = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < frameCount; index += 1) output[index] = view.getInt16(index * 2, true) / 32768;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = boundedNumber(settings.volume, 0, 1, 1);
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      this.source = source;
      const startedAt = context.currentTime;
      const duration = frameCount / record.sampleRate;
      const remainingDuration = Math.max(0.001, duration * (1 - baseRatio));
      reportProgress(onProgress, baseRatio);
      const progressTimer = window.setInterval(() => {
        reportProgress(onProgress, baseRatio + ((context.currentTime - startedAt) / remainingDuration) * (1 - baseRatio));
      }, 120);
      this.progressTimer = progressTimer;
      return new Promise(resolve => {
        source.onended = () => {
          const completed = this.source === source;
          if (completed) {
            this.source = null;
            reportProgress(onProgress, 1);
          }
          window.clearInterval(progressTimer);
          if (this.progressTimer === progressTimer) this.progressTimer = 0;
          resolve();
        };
        source.start(0, duration * baseRatio);
      });
    }

    pause() {
      if (this.nativePlayback) {
        const active = this.nativePlayback;
        window.clearTimeout(this.nativePlayback.timer);
        window.clearInterval(this.nativePlayback.progressTimer);
        this.nativePlayback.timer = 0;
        this.nativePlayback.progressTimer = 0;
        active.currentRatio = Math.min(1, Math.max(active.currentRatio || 0, 0));
        WB.NarrationHost?.post?.({ type: "eve-world-book-narration-stop", sessionId: this.sessionId });
        return Promise.resolve();
      }
      return this.context?.suspend?.();
    }
    async resume() {
      if (this.nativePlayback && !this.nativePlayback.timer) {
        const active = this.nativePlayback;
        this.nativePlayback = null;
        this.playNative(active.record, active.settings, active.onProgress, active.currentRatio)
          .then(active.resolve)
          .catch(() => active.resolve(false));
        return;
      }
      return this.context?.resume?.();
    }
    stopPlayback() {
      try { this.source?.stop?.(); } catch (_error) {}
      this.source = null;
      window.clearInterval(this.progressTimer);
      this.progressTimer = 0;
      if (this.nativePlayback) {
        window.clearTimeout(this.nativePlayback.timer);
        window.clearInterval(this.nativePlayback.progressTimer);
        this.nativePlayback.resolve(false);
        this.nativePlayback = null;
      }
      WB.NarrationHost?.post?.({ type: "eve-world-book-narration-stop", sessionId: this.sessionId });
    }
    isGenerating() {
      return Boolean(this.pending);
    }
    isPlayableRecord(record) {
      return Boolean(normalizeAudioRecord(record));
    }
    cancelGeneration() {
      if (!this.pending) return;
      this.finishPending(new Error("Gemini narration was stopped."));
      try { this.socket?.close?.(); } catch (_error) {}
      this.socket = null;
      this.connectPromise = null;
    }
    close() {
      this.stopPlayback();
      if (this.pending) this.finishPending(new Error("Gemini narration was stopped."));
      try { this.socket?.close?.(); } catch (_error) {}
      this.socket = null;
      this.connectPromise = null;
    }
  }

  WB.GeminiNarrator = GeminiNarrator;
  WB.GeminiNarrationAudio = { normalizeRecord: normalizeAudioRecord, durationSeconds };
})();
