import base64
import asyncio
import json
import logging
import websockets
# from main_server_files.transcription.transcription_handler import transcribe_audio # Removed old handler
from main_server_files.transcription.vosk_handler import get_transcriber
from google import genai

# Optimized audio processing settings for faster performance
SEQUENTIAL_DELAY = 0.001    # Transmit as fast as possible, let client handle timing
RETRY_DELAY = 0.005         # Faster retries
QUEUE_TIMEOUT = 5.0        # Allow more time to drain the queue naturally at turn end

class AudioProcessor:
    def __init__(self, websocket, connection_id, client=None, update_activity_callback=None):
        self.websocket = websocket
        self.connection_id = connection_id
        self.audio_data = b''
        self.audio_queue = asyncio.Queue()
        self.is_sequential = False
        self.is_playing_audio = False
        self.client = client
        self.update_activity_callback = update_activity_callback

    def reset(self):
        """Reset the audio processor state."""
        self.audio_data = b''
        self.is_playing_audio = False
        # Clear the queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.task_done()
            except asyncio.QueueEmpty:
                break

    async def safe_send(self, message):
        """Safely send a message through the websocket."""
        try:
            if self.websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                await self.websocket.send(json.dumps(message))
                if self.update_activity_callback:
                    self.update_activity_callback()
                return True
            return False
        except Exception as e:
            print(f"Error sending message to connection {self.connection_id}: {e}")
            return False

    async def process_audio_queue(self):
        """Process audio chunks in sequential order with optimized performance."""
        try:
            while True:
                if self.websocket.state in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                    print(f"Connection {self.connection_id} closed, stopping audio queue processing")
                    break

                try:
                    audio_data = await self.audio_queue.get()
                    self.is_playing_audio = True

                    base64_audio = base64.b64encode(audio_data).decode('utf-8')
                    send_success = False

                    # Reduced retry attempts for faster processing
                    for attempt in range(2):
                        if self.websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                            send_success = await self.safe_send({
                                "audio": base64_audio,
                                "sequential": True
                            })
                            if send_success:
                                print(f"Sequential audio sent to client (attempt {attempt+1})")
                                break
                            else:
                                print(f"Failed to send sequential audio (attempt {attempt+1}), retrying...")
                                await asyncio.sleep(RETRY_DELAY)
                        else:
                            print(f"WebSocket closed for connection {self.connection_id}, cannot send audio")
                            break

                    # Reduced delay for faster sequential playback
                    await asyncio.sleep(SEQUENTIAL_DELAY)
                    self.audio_queue.task_done()
                    self.is_playing_audio = False

                except Exception as e:
                    print(f"Error processing audio queue: {e}")
                    self.is_playing_audio = False
                    await asyncio.sleep(RETRY_DELAY)

        except asyncio.CancelledError:
            print("Audio queue processor cancelled")
        except Exception as e:
            print(f"Error in audio queue processor: {e}")

    async def process_audio_data(self, audio_data, is_sequential=None):
        """Process incoming audio data with optimized performance."""
        # Use instance sequential setting if none provided
        if is_sequential is None:
            is_sequential = self.is_sequential

        # Accumulate audio data for transcription
        self.audio_data += audio_data

        if is_sequential:
            await self.audio_queue.put(audio_data)
            print(f"Added audio chunk to sequential queue, size: {self.audio_queue.qsize()}")
        else:
            base64_audio = base64.b64encode(audio_data).decode('utf-8')
            send_success = False
            
            # Reduced retry attempts for faster non-sequential processing
            for attempt in range(2):
                if self.websocket.state not in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                    send_success = await self.safe_send({
                        "audio": base64_audio,
                        "sequential": False
                    })
                    if send_success:
                        print(f"Direct audio sent to client (attempt {attempt+1})")
                        break
                    else:
                        print(f"Failed to send direct audio (attempt {attempt+1}), retrying...")
                        await asyncio.sleep(RETRY_DELAY)
                else:
                    print(f"WebSocket closed for connection {self.connection_id}, cannot send audio")
                    break

    async def process_turn_complete(self, inline_transcription_mode=False):
        """Process audio data when a turn is complete with optimized performance."""
        try:
            if self.websocket.state in (websockets.protocol.State.CLOSED, websockets.protocol.State.CLOSING):
                print(f"Connection {self.connection_id} closed, skipping transcription")
                return None

            if self.audio_data:
                print(f"Processing audio data: {len(self.audio_data)} bytes")

                if not self.audio_queue.empty():
                    print(f"Waiting for audio queue to be processed, remaining items: {self.audio_queue.qsize()}")
                    try:
                        # Reduced timeout for faster queue processing
                        await asyncio.wait_for(self.audio_queue.join(), timeout=QUEUE_TIMEOUT)
                        print("Audio queue processing completed")
                    except asyncio.TimeoutError:
                        print("Timeout waiting for audio queue to be processed")

                # If inline transcription mode is active, we don't need to call the separate model
                if inline_transcription_mode:
                    print(f"Connection {self.connection_id}: Inline transcription mode active, skipping separate transcription call")
                    return None

                # Local Vosk Transcription
                try:
                    logger = logging.getLogger(__name__)
                    loop = asyncio.get_running_loop()
                    transcriber = get_transcriber()
                    
                    # Run transcription in executor to avoid blocking the event loop
                    transcribed_text = await loop.run_in_executor(
                        None, 
                        transcriber.transcribe, 
                        bytes(self.audio_data)
                    )

                    if transcribed_text:
                        print(f"Connection {self.connection_id}: Local Transcription: {transcribed_text}")
                        
                        # Send to client
                        # Adhering to the "text" format the client expects for subtitles/transcription
                        send_success = await self.safe_send({
                            "text": transcribed_text,
                            "type": "transcription", # Explicit type might help client distinguish
                            "is_transcription": True
                        })
                        
                        if send_success:
                             print(f"Transcription sent to client.")
                        else:
                             print(f"Failed to send transcription.")
                             
                        return transcribed_text
                    else:
                        print(f"Connection {self.connection_id}: Local Transcription yielded no text.")
                        return None
                        
                except Exception as e:
                    print(f"Connection {self.connection_id}: Error in local transcription: {e}")
                    return None

            return None

        except Exception as e:
            print(f"Error processing transcription: {e}")
            return None
        finally:
            self.reset()  # Reset audio data and state after processing 