(function () {
  const WB = window.WorldBook = window.WorldBook || {};

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
        utterance.rate = Math.min(2, Math.max(0.5, Number(settings.rate) || 1));
        utterance.pitch = Math.min(2, Math.max(0, Number(settings.pitch) || 1));
        utterance.volume = Math.min(1, Math.max(0, Number(settings.volume) || 1));
        utterance.onboundary = event => onBoundary?.(event.charIndex || 0);
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
