import json
import base64
import io
import wave
from pydub import AudioSegment
import google.generativeai as generative
from main_server_files.api_configuration.gemini_config import TRANSCRIPTION_MODEL, TRANSCRIPTION_CONFIG

async def transcribe_audio(audio_data, client):
    """Transcribe audio data using the Gemini API."""
    try:
        # Convert PCM to MP3 first
        mp3_data = await convert_pcm_to_mp3(audio_data)
        if not mp3_data:
            return None

        # Create a transcription model with specific configuration
        model = generative.GenerativeModel(
            model_name=TRANSCRIPTION_MODEL,
            generation_config=TRANSCRIPTION_CONFIG
        )
        
        # Create the prompt for transcription
        prompt = """Please transcribe the following audio accurately. 
        Output only the transcribed text without any additional formatting or commentary.
        If the audio is not clear enough to transcribe, respond with '<Not recognizable>'."""
        
        # Process the transcription
        response = await model.generate_content_async(
            contents=[
                prompt,
                {"mime_type": "audio/mp3", "data": base64.b64encode(mp3_data).decode()}
            ]
        )
        
        # *** ENHANCED ERROR HANDLING: Check for valid response structure ***
        if not response:
            print("No response received from Gemini transcription API")
            return None
            
        # Check if response has parts and is usable
        if hasattr(response, 'parts') and response.parts:
            # Response has parts, check if any have text
            has_text_parts = any(hasattr(part, 'text') and part.text for part in response.parts)
            if not has_text_parts:
                print("Response has parts but no text content")
                return None
        elif hasattr(response, 'text') and response.text:
            # Direct text access works
            pass
        else:
            # Check finish_reason for more context
            finish_reason = getattr(response, 'finish_reason', 'unknown')
            print(f"Invalid Gemini response structure. Finish reason: {finish_reason}")
            
            # Common finish_reason codes and their meanings:
            # 1: FINISH_REASON_STOP (normal completion)
            # 2: FINISH_REASON_MAX_TOKENS
            # 3: FINISH_REASON_SAFETY (content filtered for safety)
            # 4: FINISH_REASON_RECITATION 
            # 8: Often indicates empty/filtered response
            if finish_reason == 3:
                print("Transcription blocked by safety filters")
                return "[Content filtered by safety settings]"
            elif finish_reason == 8:
                print("Gemini returned empty response (possibly due to unclear audio)")
                return "[Audio not clear enough for transcription]"
            else:
                print(f"Unexpected finish_reason: {finish_reason}")
                return "[Transcription unavailable]"
        
        if response and hasattr(response, 'text') and response.text:
            text = response.text
            # Clean up the transcription text
            text = text.replace("[GEMINI: ", "").replace("]", "")
            text = text.replace("P.P.P.P.P.", "").replace("P.P.P.", "").replace("P.P.", "").replace(" P.", "")
            text = text.replace(" P P P P P", "").replace(" P P P", "").replace(" P P", "").replace(" P", "")
            text = text.rstrip(" P").rstrip(".")
            text = text.replace("I.O.D.E.", "Puck")
            text = " ".join(text.split())
            
            # Final validation - ensure we have meaningful content
            if not text.strip() or text.strip() == '<Not recognizable>':
                print("Transcription resulted in empty or unrecognizable content")
                return "[Audio content not recognizable]"
                
            return text
        else:
            print("No transcription result available")
            return None
            
    except Exception as e:
        print(f"Error transcribing audio: {e}")
        return None

async def convert_pcm_to_mp3(pcm_data, sample_rate=24000, channels=1):
    """Convert PCM audio data to MP3 format."""
    try:
        # Create a BytesIO object to hold the WAV data
        wav_buffer = io.BytesIO()
        
        # Create a WAV file in memory
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(channels)
            wav_file.setsampwidth(2)  # 16-bit audio
            wav_file.setframerate(sample_rate)
            # Ensure pcm_data is bytes
            if isinstance(pcm_data, (bytes, bytearray)):
                wav_file.writeframes(pcm_data)
            elif isinstance(pcm_data, io.BytesIO):
                wav_file.writeframes(pcm_data.getvalue())
            else:
                raise ValueError(f"Unsupported audio data type: {type(pcm_data)}")
        
        # Reset buffer position
        wav_buffer.seek(0)
        
        # Convert WAV to MP3 using pydub
        audio = AudioSegment.from_wav(wav_buffer)
        
        # Create a new BytesIO object for the MP3
        mp3_buffer = io.BytesIO()
        audio.export(mp3_buffer, format='mp3')
        
        # Get the MP3 data
        mp3_data = mp3_buffer.getvalue()
        
        return mp3_data
        
    except Exception as e:
        print(f"Error converting PCM to MP3: {e}")
        return None 