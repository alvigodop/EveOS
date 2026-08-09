from .core.stream_lifecycle import StreamSession

async def receive_from_gemini(session, websocket, connection_monitor, connection_id, audio_processor, response_timeout=None, inline_transcription_mode=False, session_role="interactive"):
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
        response_timeout=response_timeout,
        inline_transcription_mode=inline_transcription_mode,
        session_role=session_role
    )
    
    # Run the session loop
    await stream_session.run()
