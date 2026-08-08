(function () {
  const WB = window.WorldBook = window.WorldBook || {};
  const WS_URL = "ws://127.0.0.1:9085";

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

  class GeminiNarrator {
    constructor() {
      this.socket = null;
      this.connectPromise = null;
      this.pending = null;
      this.voice = "";
      this.context = null;
      this.source = null;
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
      return {
        sessionRole: "world_book_narration",
        model: "gemini-2.5-flash-native-audio-latest",
        responseTimeout: 90,
        sequentialAudioPlay: true,
        inlineTranscriptionMode: true,
        setup: {
          contents: [{ parts: [{ text: `You are World Book's narrator speaking with the voice of ${voice}.` }] }],
          tools: [],
          systemInstruction: { parts: [{ text: "Read supplied prose aloud exactly and naturally. Do not add commentary, headings, acknowledgments, summaries, or invented words. Preserve names and punctuation. Return audio only." }] },
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
      if (data.audio && this.pending) {
        this.pending.chunks.push(base64Bytes(data.audio));
        window.parent?.postMessage?.({
          type: "eve-world-book-narration-audio",
          sessionId: this.sessionId,
          audio: data.audio,
          sampleRate: 24000,
        }, "*");
      }
      if (data.type === "turn_complete" && this.pending) this.finishPending();
      if (data.is_error && this.pending) this.finishPending(new Error(data.text || "Gemini narration failed."));
    }

    finishPending(error) {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      window.clearTimeout(pending.timeout);
      if (error) pending.reject(error);
      else if (!pending.chunks.length) pending.reject(new Error("Gemini returned no narration audio."));
      else pending.resolve({ pcm: joinBytes(pending.chunks), sampleRate: 24000 });
    }

    async synthesize(text, settings) {
      if (this.pending) throw new Error("Gemini is already narrating another passage.");
      await this.connect(settings);
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => this.finishPending(new Error("Gemini narration timed out.")), 90000);
        this.pending = { resolve, reject, chunks: [], timeout };
        this.socket.send(JSON.stringify({
          source: "world_book_narration",
          realtime_input: { media_chunks: [{ mime_type: "text/plain", data: text }] },
        }));
      });
    }

    async play(record, volume = 1) {
      this.stopPlayback();
      const context = this.context || new (window.AudioContext || window.webkitAudioContext)({ sampleRate: record.sampleRate || 24000 });
      this.context = context;
      await context.resume();
      const bytes = new Uint8Array(record.pcm);
      const frameCount = Math.floor(bytes.byteLength / 2);
      const buffer = context.createBuffer(1, frameCount, record.sampleRate || 24000);
      const output = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (let index = 0; index < frameCount; index += 1) output[index] = view.getInt16(index * 2, true) / 32768;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = Math.min(1, Math.max(0, Number(volume) || 1));
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      this.source = source;
      return new Promise(resolve => {
        source.onended = () => {
          if (this.source === source) this.source = null;
          resolve();
        };
        source.start();
      });
    }

    pause() { return this.context?.suspend?.(); }
    resume() { return this.context?.resume?.(); }
    stopPlayback() {
      try { this.source?.stop?.(); } catch (_error) {}
      this.source = null;
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
})();
