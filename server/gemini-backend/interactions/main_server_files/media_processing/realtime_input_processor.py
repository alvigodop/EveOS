import json
import base64
from google.genai import types
from main_server_files.chat_history.chat_history_handler import save_chat_history
import asyncio
import time

async def process_realtime_input(data, session, connection_monitor, audio_processor):
    """Process realtime input data from the client."""
    print(f"Processing realtime_input with {len(data['realtime_input']['media_chunks'])} chunks")
    source = data.get("source")
    screen_share_meta = data.get("screen_share") if isinstance(data.get("screen_share"), dict) else {}
    is_screen_share_user_message = source == "screen_share_user_message"
    is_screen_share = source == "screen_share" or bool(screen_share_meta)
    screen_share_silent = bool(
        not is_screen_share_user_message
        and (
            data.get("silent_response")
            or data.get("suppress_response")
            or screen_share_meta.get("silent")
        )
    )
    image_chunks = []
    text_part_content = None
    is_user_message = False
    is_system_context = False

    for idx, chunk in enumerate(data["realtime_input"]["media_chunks"]):
        mime_type = chunk.get("mime_type")
        chunk_data = chunk.get("data")
        seq = chunk.get("seq")

        if mime_type == "audio/pcm":
            # If client included a sequence id, ACK it back so client can pace sends
            try:
                if seq is not None and connection_monitor and connection_monitor.is_websocket_open():
                    await connection_monitor.safe_send(json.dumps({"audio_ack": seq}))
                    print(f"Sent audio ACK for seq {seq}")
            except Exception as e:
                print(f"Failed to send audio ACK for seq {seq}: {e}")
        elif mime_type in ("image/jpeg", "image/png", "image/webp"):
            try:
                # Decode only for debug saving/logging
                image_bytes = base64.b64decode(chunk_data)
                image_chunks.append({
                    "mime_type": mime_type,
                    "data": chunk_data,
                    "bytes": image_bytes,
                    "name": chunk.get("name") or f"image-{len(image_chunks) + 1}"
                })
                
                # DEBUG: Save image only when explicitly requested. Writing every
                # screen-share frame was noisy and created avoidable disk churn.
                if data.get("debug_capture"):
                    try:
                        ext = "png" if mime_type == "image/png" else ("webp" if mime_type == "image/webp" else "jpg")
                        with open(f"debug_received_image_{len(image_chunks)}.{ext}", "wb") as f:
                            f.write(image_bytes)
                        print(f"DEBUG: Saved received image to debug_received_image_{len(image_chunks)}.{ext}")
                    except Exception as save_err:
                        print(f"DEBUG: Failed to save image: {save_err}")
            except Exception as e:
                print(f"Error processing image: {e}")
                await connection_monitor.safe_send(json.dumps({"text": "Error processing image input."}))
        elif mime_type == "text/plain":
            print("Found text/plain chunk in realtime_input")
            is_selftalk = data.get("is_selftalk", False)
            is_system_msg = data.get("is_system_message", False)
            is_sys_context = data.get("is_system_context", False)

            if is_system_msg:
                print(f"Ignoring system message from client: {chunk_data[:100]}...")
                continue

            text_part_content = chunk_data
            print(f"Text chunk content stored: {text_part_content[:100]}...")

            if is_sys_context:
                is_system_context = True
                print("Detected system context - will handle as background context")
            elif is_screen_share_user_message:
                is_user_message = True
                print("Detected user message with screen-share frame")
            elif is_screen_share:
                print("Detected screen-share instruction chunk - not saving as user chat")
            elif not is_selftalk:
                is_user_message = True
        else:
            print(f"WARNING: Unknown MIME type in realtime_input chunk: {mime_type}")

    # Handle system context separately
    if is_system_context and text_part_content:
        print("Processing system context - adding as background context to session")
        try:
            # Extract just the conversation history without the prefix
            if text_part_content.startswith("[SYSTEM CONTEXT - Chat History]:"):
                history_content = text_part_content.replace("[SYSTEM CONTEXT - Chat History]:", "").strip()
            else:
                history_content = text_part_content
            
            # Format as a system instruction that won't confuse the AI
            system_instruction = f"""System: The following is your conversation history with this user for context. This is NOT a new message from the user, but information to help you understand the conversation context:

{history_content}

Please acknowledge that you've received this context and can now continue the conversation with full awareness of what was discussed previously."""
            
            # Send as system instruction to Gemini with proper formatting
            if session is not None:
                await session.send(input=system_instruction, end_of_turn=True)
                print("System context sent to Gemini as system instruction")
                
                # Inform the client that context was added
                await connection_monitor.safe_send(json.dumps({
                    "text": "Chat history context added successfully. AI now has access to previous conversation.",
                    "is_system_message": True
                }))
            else:
                print("ERROR: Cannot send system context, session is None.")
                await connection_monitor.safe_send(json.dumps({
                    "text": "Error: Could not add chat history context - no active session.",
                    "is_system_message": True,
                    "is_error": True
                }))
        except Exception as e:
            print(f"ERROR: Exception during system context processing: {e}")
            await connection_monitor.safe_send(json.dumps({
                "text": f"Error adding chat history context: {str(e)}",
                "is_system_message": True,
                "is_error": True
            }))
        return  # Exit early for system context

    # Construct individual parts (string for text)
    text_part_string = None

    if image_chunks:
        print(f"{len(image_chunks)} image chunk(s) were received alongside other chunks.")

    if text_part_content and not is_system_context:
        text_part_string = text_part_content
        print(f"Preparing text part string for sending: {text_part_string[:100]}...")
        if is_user_message:
             # A direct user message should always be answerable, even if a
             # silent screen-share frame was pending just before it.
             setattr(connection_monitor, "screen_share_silent_response_pending", False)
             setattr(connection_monitor, "screen_share_silent_response_started_at", 0)
             save_chat_history(text_part_content, is_user=True)
             if connection_monitor.is_websocket_open():
                 await connection_monitor.safe_send(json.dumps({
                     "text": "Processing your message...",
                     "is_system_message": True,
                     "is_processing": True
                 }))

    try:
        # Combine content into a single turn using google.genai.types
        content_parts = []
        
        for image_index, image_chunk in enumerate(image_chunks, start=1):
            print(f"Adding image chunk {image_index} ({image_chunk['mime_type']}) of size {len(image_chunk['data'])} chars to content parts...")
            # Use types.Blob and types.Part explicitly
            # Pass base64 string directly to data
            blob = types.Blob(mime_type=image_chunk["mime_type"], data=image_chunk["data"])
            content_parts.append(types.Part(inline_data=blob))
            
        if text_part_string:
            print(f"Adding text part to content parts: {text_part_string[:100]}...")
            content_parts.append(types.Part(text=text_part_string))
            
        if content_parts:
            if session is not None:
                try:
                    if is_screen_share and screen_share_silent:
                        setattr(connection_monitor, "screen_share_silent_response_pending", True)
                        setattr(connection_monitor, "screen_share_silent_response_started_at", time.time())
                        print("Screen-share silent observation enabled for next model turn.")

                    # Wrap parts in types.Content as session.send_client_content expects Content (or dict)
                    input_content = types.Content(parts=content_parts, role="user")
                    
                    # Use send_client_content for multimodal content
                    await session.send_client_content(turns=input_content)
                    print(f"Sent Content with {len(content_parts)} parts to Gemini session successfully.")
                except Exception as ve:
                    print(f"Error during send: {ve}")
                    raise
            else:
                print("ERROR: Cannot send content, session is None.")
        else:
             print("No valid text or image part prepared to send for this realtime_input.")
        
        if not text_part_string and not image_chunks:
             print("No valid text or image part prepared to send for this realtime_input.")

        await asyncio.sleep(0.1)
    except Exception as e:
         print(f"ERROR: Exception during session.send(): {e}")
         import traceback
         traceback.print_exc()
         await connection_monitor.safe_send(json.dumps({
             "text": f"Error sending message to Gemini: {str(e)}",
             "is_system_message": True, "is_error": True }))
