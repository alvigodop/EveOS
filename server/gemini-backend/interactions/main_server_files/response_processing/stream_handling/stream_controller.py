from .core.stream_lifecycle import StreamSession

async def receive_from_gemini(session, websocket, connection_monitor, connection_id, audio_processor, voice_name, client=None, initialize_gemini_session=None, response_timeout=None, inline_transcription_mode=False):
    """
    Receive and process responses from Gemini with enhanced timeout management, error handling, and persistent session support.
    
    Refactored to use the modular SteamSession class.
    """
    # Initialize the StreamSession with all necessary dependencies
    stream_session = StreamSession(
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
    )
    
    # Run the session loop
    await stream_session.run()
