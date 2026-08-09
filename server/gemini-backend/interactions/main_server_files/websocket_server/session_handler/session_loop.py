import asyncio
import json
import datetime
from ...api_configuration.gemini_config import MAIN_MODEL, create_gemini_config
from ...api_configuration.model_registry import model_capabilities, resolve_live_model
from ...session_management.session_manager import active_sessions
from ...session_management.keep_alive_manager import KeepAliveManager
from ..message_processor import send_to_gemini
from ...response_processing.stream_handling.stream_controller import receive_from_gemini

async def execute_session_loop(websocket, client, connection_monitor, audio_processor, error_handler, connection_id, voice_name, config_data, monitor_task):
    """
    Executes the main Gemini session loop.
    """
    session_role = str(config_data.get("sessionRole") or "interactive").strip().lower()
    is_narration = session_role == "world_book_narration"
    requested_model = str(config_data.get("model") or MAIN_MODEL).strip()
    model_name = resolve_live_model(requested_model)
    capabilities = model_capabilities("live", model_name)
    setattr(connection_monitor, "model_name", model_name)

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
            
    # Extract speech config
    speech_config = setup_data.get("speechConfig", {})
    voice_config = speech_config.get("voiceConfig", {}).get("prebuiltVoiceConfig", {})
    speaking_rate = voice_config.get("speakingRate", 1.0)
    pitch = voice_config.get("pitch", 0.0)

    # Extract response timeout
    response_timeout = config_data.get("responseTimeout")
    
    output_transcription_enabled = bool(config_data.get("outputTranscriptionEnabled", True))
    native_output_transcription = bool(
        output_transcription_enabled
        and capabilities.get("output_audio_transcription")
    )
    # Native output transcription is also used to verify World Book narration. This flag
    # means a separate Vosk pass is unnecessary; unsupported models retain the local fallback.
    inline_transcription_mode = is_narration or native_output_transcription

    print(
        f"Connection {connection_id}: native output transcription "
        f"{'enabled' if native_output_transcription else 'disabled'}; "
        f"local fallback {'disabled' if inline_transcription_mode else 'enabled'}"
    )

    config = create_gemini_config(
        voice_name=voice_name, 
        generation_config=generation_config,
        safety_settings=safety_settings,
        context=system_instruction,
        speaking_rate=speaking_rate,
        pitch=pitch,
        model_name=model_name,
        enable_input_transcription=False,
        enable_output_transcription=native_output_transcription,
    )
    print(f"Created configuration with voice: {voice_name}")
    print(f"Selected model: {model_name}")

    if requested_model != model_name:
        await connection_monitor.safe_send(json.dumps({
            "type": "model_migrated",
            "kind": "live",
            "from": requested_model,
            "to": model_name,
            "text": f"Updated retired Live model {requested_model} to {model_name}.",
            "is_system_message": True,
        }))

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
            active_sessions.setdefault(connection_id, {}).update({
                "session": session,
                "voice_name": voice_name,
                "model": model_name,
                "generation_config": generation_config,
                "connected_at": datetime.datetime.now().isoformat(),
                "client": client,
                "session_role": session_role,
            })
            print(f"Active sessions: {len(active_sessions)}")
            
            # Notify the client that we're connected
            await connection_monitor.safe_send(json.dumps({
                "type": "session_ready",
                "text": f"Connected to {model_name}",
                "is_system_message": True,
                "model": model_name,
                "sessionRole": session_role,
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
                response_timeout=response_timeout,
                inline_transcription_mode=inline_transcription_mode,
                session_role=session_role
            ))

            try:
                # Wait for both tasks to complete
                done, pending = await asyncio.wait(
                    [send_task, receive_task, monitor_task],
                    return_when=asyncio.FIRST_COMPLETED
                )
                
                # Check for exceptions
                for task in done:
                    if task.cancelled():
                        continue
                    task_error = task.exception()
                    if task_error:
                        print(f"Task failed with exception for connection {connection_id}: {task_error}")
                        # Cancel other tasks
                        for p in pending:
                            p.cancel()
                        break
            except Exception as e:
                await error_handler.handle_session_tasks_error(e, [send_task, receive_task, monitor_task])
            finally:
                # Stop and cancel keep-alive task when done
                if 'keep_alive_manager' in locals():
                    await keep_alive_manager.stop()
                
                tasks_to_close = [audio_queue_task, send_task, receive_task, monitor_task]
                for task in tasks_to_close:
                    if task and not task.done():
                        task.cancel()
                await asyncio.gather(*tasks_to_close, return_exceptions=True)
                
                await error_handler.send_session_closed_message()
                
    except Exception as e:
        # Use handle_session_error instead of handle_gemini_connection_error
        await error_handler.handle_session_error(e, model_name)
        return
