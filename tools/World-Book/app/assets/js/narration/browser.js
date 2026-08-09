(function () {
  const WB = window.WorldBook = window.WorldBook || {};

  function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  class BrowserNarrator {
    constructor() {
      this.active = null;
      this.cancelled = false;
    }

    voices() {
      return window.speechSynthesis?.getVoices?.() || [];
    }

    speak(text, settings, onBoundary) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        return Promise.reject(new Error("Browser speech is unavailable in this browser."));
      }
      this.stop();
      this.cancelled = false;
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        const selected = this.voices().find(voice => voice.voiceURI === settings.browserVoice);
        if (selected) {
          utterance.voice = selected;
          utterance.lang = selected.lang;
        }
        utterance.rate = boundedNumber(settings.rate, 0.5, 2, 1);
        utterance.pitch = boundedNumber(settings.pitch, 0, 2, 1);
        utterance.volume = boundedNumber(settings.volume, 0, 1, 1);
        utterance.onboundary = event => onBoundary?.({
          charIndex: Math.max(0, Number(event.charIndex) || 0),
          charLength: Math.max(0, Number(event.charLength) || 0),
          elapsedTime: Math.max(0, Number(event.elapsedTime) || 0),
          name: String(event.name || "word"),
        });
        utterance.onend = () => {
          this.active = null;
          resolve();
        };
        utterance.onerror = event => {
          this.active = null;
          if (this.cancelled || event.error === "canceled" || event.error === "interrupted") resolve();
          else reject(new Error(`Browser narration failed: ${event.error || "unknown error"}`));
        };
        this.active = utterance;
        window.speechSynthesis.speak(utterance);
      });
    }

    pause() {
      window.speechSynthesis?.pause?.();
    }

    resume() {
      window.speechSynthesis?.resume?.();
    }

    stop() {
      this.cancelled = true;
      this.active = null;
      window.speechSynthesis?.cancel?.();
    }
  }

  WB.BrowserNarrator = BrowserNarrator;
})();
