import os
import json
import wave
import sys
from vosk import Model, KaldiRecognizer
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class VoskTranscriber:
    def __init__(self, model_path="model"):
        """
        Initialize the Vosk transcriber.
        Downloads the model if not found.
        """
        self.model_path = model_path
        self.model = self._load_model()
    
    def _load_model(self):
        """
        Loads the Vosk model. Downloads a small model if not found.
        """
        if not os.path.exists(self.model_path):
            logger.info(f"Vosk model not found at {self.model_path}. attempting to find or download...")
            # Check for default small model
            try:
                # We can't easily auto-download without extra libraries or complex scripts in a single file
                # But Vosk has a helper for this usually. 
                # For this environment, we will assume we can rely on vosk.Model to find it or we guide user.
                # Actually, vosk.Model(lang="en-us") auto downloads!
                logger.info("Initializing Vosk model (auto-downloading 'vosk-model-small-en-us-0.15' if needed)...")
                return Model(lang="en-us")
            except Exception as e:
                logger.error(f"Failed to load or download Vosk model: {e}")
                raise
        else:
             logger.info(f"Loading Vosk model from {self.model_path}...")
             return Model(self.model_path)

    def transcribe(self, audio_data, sample_rate=24000):
        """
        Transcribes PCM audio data.
        
        Args:
            audio_data (bytes): Raw PCM audio data.
            sample_rate (int): Sample rate of the audio (Gemini defaults to 24000).
        
        Returns:
            str: The transcribed text.
        """
        try:
            # Vosk expects mono PCM. 
            # Note: Gemini output is 24kHz. Vosk small model might be 16k or whatever.
            # But the recognizer accepts the sample rate in constructor.
            
            rec = KaldiRecognizer(self.model, sample_rate)
            rec.SetWords(False) # We just want the text
            
            # We need to feed data. 
            # AcceptWaveform accepts bytes.
            # AcceptWaveform returns True if a result is ready, False otherwise.
            # But since we are processing the WHOLE buffer as one turn, we should 
            # feed it and then ask for the FinalResult to ensure we get everything.
            rec.AcceptWaveform(audio_data)
            
            # FinalResult flushes the decoder and returns the full content
            result = json.loads(rec.FinalResult())
            return result.get("text", "")
                
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return ""

# Singleton instance or helper for easy import
_transcriber = None

def get_transcriber():
    global _transcriber
    if _transcriber is None:
        _transcriber = VoskTranscriber()
    return _transcriber
