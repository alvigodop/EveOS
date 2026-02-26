import asyncio
import json
import datetime
from ...api_configuration.gemini_config import MAIN_MODEL, create_gemini_config
from ...session_management.session_manager import active_sessions
from ...session_management.gemini_session_initializer import initialize_gemini_session
from ...session_management.keep_alive_manager import KeepAliveManager
from ...chat_history.chat_history_handler import load_chat_history
from ..message_processor import send_to_gemini
from ...response_processing.stream_handling.stream_controller import receive_from_gemini

async def execute_session_loop(websocket, client, connection_monitor, audio_processor, error_handler, connection_id, voice_name, config_data, monitor_task):
    """
    Executes the main Gemini session loop.
    """
    # Load chat history
    chat_history = load_chat_history()
    
    # Build context from chat history
    context = []

    # FEW-SHOT PROMPT INJECTION: Prime the model with examples of correct behavior
    # This prevents the "Instruction Dilution" where it forgets the system prompt after a few turns.
    if config_data.get("inlineTranscriptionMode", True):
        context.extend([
            {
                "role": "user",
                "parts": [{"text": "system_transcription_check_protocol_initiate"}]
            },
            {
                "role": "model",
                "parts": [{"text": "<Transcription-Start>system_transcription_check_protocol_initiate</Transcription-End>\nProtocol acknowledged. I will perform inline transcription for every turn."}]
            },
            {
                "role": "user",
                "parts": [{"text": "Hello"}]
            },
            {
                "role": "model",
                "parts": [{"text": "<Transcription-Start>Hello</Transcription-End>\nHi there! How can I help you today?"}]
            }
        ])

    for msg in chat_history[-10:]:  # Use last 10 messages for context
        context.append({
            "role": "user" if msg['role'] == 'user' else "model",
            "parts": [{"text": msg['content']}]
        })

    # Create configuration with context if available
    setup_data = config_data.get("setup", {})
    generation_config = setup_data.get("generationConfig")
    safety_settings = setup_data.get("safetySettings")
    system_instruction_data = setup_data.get("systemInstruction")
    system_instruction = None
    if isinstance(system_instruction_data, dict) and "parts" in system_instruction_data:
        # Extract text from parts if it's a structured object
        parts = system_instruction_data.get("parts", [])
        if parts and isinstance(parts, list):
             texts = [p.get("text", "") for p in parts if isinstance(p, dict) and "text" in p]
             system_instruction = "\n".join(texts)
    elif isinstance(system_instruction_data, str):
        system_instruction = system_instruction_data
            
    print(f"DEBUG: Parsed system_instruction text: {system_instruction}")
    
    # Extract speech config
    speech_config = setup_data.get("speechConfig", {})
    voice_config = speech_config.get("voiceConfig", {}).get("prebuiltVoiceConfig", {})
    speaking_rate = voice_config.get("speakingRate", 1.0)
    pitch = voice_config.get("pitch", 0.0)

    # Extract response timeout
    response_timeout = config_data.get("responseTimeout")
    
    # Extract inline transcription mode preference (at the top level of the message)
    # Note: We now favor inline transcription to save quota and reduce latency.
    inline_transcription_mode = config_data.get("inlineTranscriptionMode", True) 
    
    # FORCE Disable inline transcription for Gemini 2.5 to enable Local Transcription (Vosk)
    # Since gemini-2.5 is configured for AUDIO-only response modalities, it won't send text.
    # We need audio_processor to handle the transcription locally.
    if "gemini-2.5" in config_data.get("model", MAIN_MODEL):
         inline_transcription_mode = False
         print(f"Connection {connection_id}: Forcing inline_transcription_mode=False for Gemini 2.5 to enable Local Vosk Transcription")

    print(f"Connection {connection_id}: Inline transcription mode preference: {inline_transcription_mode}")

    # Inline transcription logic removed in favor of native ["TEXT", "AUDIO"] modalities
    # This was causing 1007 errors by bloating the system prompt and conflicting with native behavior.
    
    # Initialize the session
    print(f"DEBUG: Final system_instruction being sent (preview): {system_instruction[:100] if system_instruction else 'None'}...")


    config = create_gemini_config(
        voice_name=voice_name, 
        generation_config=generation_config,
        safety_settings=safety_settings,
        context=system_instruction,
        speaking_rate=speaking_rate,
        pitch=pitch
    )
    print(f"Created configuration with voice: {voice_name}")
    print(f"DEBUG: Final system_instruction being sent: {system_instruction}")

    # Determine model to use
    model_name = config_data.get("model", MAIN_MODEL)
    print(f"Selected model: {model_name}")

    # Send a message to the client that we're connecting to Gemini
    await connection_monitor.safe_send(json.dumps({
        "text": f"Connecting to Gemini API ({model_name})...",
        "is_system_message": True
    }))

    try:
        # Fix the connection handling to properly use the async context manager
        print(f"Connecting to Gemini API for connection: {connection_id}")
        
        # Create a session using the async context manager pattern
        async with client.aio.live.connect(model=model_name, config=config) as session:
            print(f"Connected to Gemini API with voice: {voice_name}, model: {model_name}")
            
            # Add to active sessions
            active_sessions[connection_id] = {
                "session": session,
                "voice_name": voice_name,
                "model": model_name,
                "generation_config": generation_config,
                "connected_at": datetime.datetime.now().isoformat(),
                "client": client  # Store the client instance
            }
            print(f"Active sessions: {len(active_sessions)}")
            
            # Notify the client that we're connected
            await connection_monitor.safe_send(json.dumps({
                "text": f"Connected to {model_name}",
                "is_system_message": True
            }))
            
            # Initialize audio processor with sequential preference
            audio_processor.is_sequential = config_data.get("sequentialAudioPlay", False)
            print(f"Sequential audio playback {'enabled' if audio_processor.is_sequential else 'disabled'} for connection {connection_id}")

            # Set up keep-alive ping using the new component
            keep_alive_manager = KeepAliveManager(websocket, connection_id, connection_monitor)
            await keep_alive_manager.start_keep_alive()  # We don't need to store the task reference anymore

            # Start the audio queue processor
            audio_queue_task = asyncio.create_task(audio_processor.process_audio_queue())

            # Start tasks for sending and receiving messages
            send_task = asyncio.create_task(send_to_gemini(session, websocket, connection_monitor, connection_id, audio_processor, client))
            receive_task = asyncio.create_task(receive_from_gemini(
                session=session,
                websocket=websocket,
                connection_monitor=connection_monitor,
                connection_id=connection_id,
                audio_processor=audio_processor,
                voice_name=voice_name,
                client=client,
                initialize_gemini_session=initialize_gemini_session,
                response_timeout=response_timeout,
                inline_transcription_mode=inline_transcription_mode
            ))

            try:
                # Wait for both tasks to complete
                done, pending = await asyncio.wait(
                    [send_task, receive_task, monitor_task],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                # Check for exceptions
                for task in done:
                    if task.exception():
                        print(f"Task failed with exception for connection {connection_id}: {task.exception()}")
                        # Cancel other tasks
                        for p in pending:
                            p.cancel()
                        break
            except Exception as e:
                await error_handler.handle_session_tasks_error(e, [send_task, receive_task, monitor_task])
            finally:
                # Stop and cancel keep-alive task when done
                if 'keep_alive_manager' in locals():
                    keep_alive_manager.stop()
                
                # Cancel audio queue task
                audio_queue_task.cancel()
                
                # Cancel any remaining tasks
                if 'send_task' in locals() and not send_task.done():
                    send_task.cancel()
                if 'receive_task' in locals() and not receive_task.done():
                    receive_task.cancel()
                if 'monitor_task' in locals() and not monitor_task.done():
                    monitor_task.cancel()
                
                await error_handler.send_session_closed_message()
                
    except Exception as e:
        # Use handle_session_error instead of handle_gemini_connection_error
        await error_handler.handle_session_error(e, model_name)
        return
