import json
import asyncio
import websockets
from ..chat_history.chat_history_handler import save_chat_history
from ..transcription.transcription_handler import transcribe_audio

# Maximum audio buffer size (5MB)
MAX_AUDIO_BUFFER_SIZE = 1024 * 1024 * 5

class GeminiResponseHandler:
    def __init__(self, connection_monitor, audio_processor, inline_transcription_mode=False):
        self.connection_monitor = connection_monitor
        self.audio_processor = audio_processor
        self.inline_transcription_mode = inline_transcription_mode
        self.last_audio_time = None
        self.audio_completion_threshold = 15.0  # Increased to 15.0s to allow for longer model thinking pauses without premature turn completion

    async def process_response_part(self, part):
        """Process a single part of the Gemini response."""
        if not self.connection_monitor.is_websocket_open():
            print("Connection closed during part processing")
            return

        try:
            if hasattr(part, 'text') and part.text is not None:
                await self.process_text_response(part.text)
                # Save text responses to chat history immediately
                save_chat_history(part.text, is_user=False)
            elif hasattr(part, 'inline_data') and part.inline_data is not None:
                import time
                self.last_audio_time = time.time()  # Track when audio was received
                await self.process_audio_response(part.inline_data.data)
            # After processing any part, record activity
            self.connection_monitor.record_activity()
        except Exception as e:
            print(f"Error processing response part: {e}")

    async def process_text_response(self, text):
        """Process text response from Gemini."""
        try:
            if self.connection_monitor.is_websocket_open():
                await self.connection_monitor.safe_send(json.dumps({
                    "text": text
                }))
                # Removed artificial sleep to prevent delivery latency
        except Exception as e:
            print(f"Error sending text response: {e}")

    async def process_audio_response(self, audio_data):
        """Process audio response from Gemini."""
        try:
            print(f"Received audio data: {len(audio_data)} bytes")
            if not self.connection_monitor.is_websocket_open():
                print("Connection closed, skipping audio processing")
                return

            # Check if adding this chunk would exceed the buffer size
            if len(self.audio_processor.audio_data) + len(audio_data) > MAX_AUDIO_BUFFER_SIZE:
                print(f"Audio buffer would exceed size limit ({MAX_AUDIO_BUFFER_SIZE} bytes), resetting...")
                self.audio_processor.reset()
            
            # Add to audio processor's data
            # REMOVED: Redundant addition. process_audio_data handles this.
            # self.audio_processor.audio_data += audio_data
            
            # Process the audio data with minimal delay
            await self.audio_processor.process_audio_data(audio_data, self.audio_processor.is_sequential)
            
            # Removed artificial sleep to prevent audio buffer under-runs
        except Exception as e:
            print(f"Error processing audio data: {e}")
            # Reset audio processor on error
            self.audio_processor.reset()

    async def handle_turn_complete(self):
        """Handle turn completion from Gemini."""
        try:
            print(f"Processing turn complete with {len(self.audio_processor.audio_data)} bytes of audio data")
            # Process audio data and get transcription (passing inline mode flag)
            transcribed_text = await self.audio_processor.process_turn_complete(self.inline_transcription_mode)
            
            if transcribed_text:
                print(f"Got transcription: {transcribed_text[:50]}...")
                # Save to chat history
                save_chat_history(transcribed_text, is_user=False)
                
            # Removed artificial sleep to prevent turn handoff latency
            return transcribed_text
        except Exception as e:
            print(f"Error processing transcription: {e}")
            return None
        finally:
            # Always reset audio processor after turn complete
            self.audio_processor.reset()

    async def check_audio_completion(self):
        """Check if audio processing should be completed based on timing."""
        if self.last_audio_time is not None:
            import time
            silence_duration = time.time() - self.last_audio_time
            if silence_duration > self.audio_completion_threshold:
                if hasattr(self.audio_processor, 'audio_data') and len(self.audio_processor.audio_data) > 0:
                    print(f"Auto-completing turn due to audio silence ({silence_duration:.1f}s)")
                    await self.handle_turn_complete()
                    return True
        return False 