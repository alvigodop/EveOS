import json
import base64
from google.genai import types
from main_server_files.chat_history.chat_history_handler import save_chat_history
import asyncio

async def process_realtime_input(data, session, connection_monitor, audio_processor):
    """Process realtime input data from the client."""
    print(f"Processing realtime_input with {len(data['realtime_input']['media_chunks'])} chunks")
    image_b64_string = None
    image_bytes = None
    text_part_content = None
    is_user_message = False
    has_image = False
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
        elif mime_type == "image/jpeg":
            try:
                # Store the base64 string directly for API usage
                image_b64_string = chunk_data
                
                # Decode only for debug saving/logging
                image_bytes = base64.b64decode(chunk_data)
                has_image = True
                
                # DEBUG: Save image to check what the server is receiving
                try:
                    with open("debug_received_image.jpg", "wb") as f:
                        f.write(image_bytes)
                    print("DEBUG: Saved received image to debug_received_image.jpg")
                except Exception as save_err:
                    print(f"DEBUG: Failed to save image: {save_err}")
            except Exception as e:
                print(f"Error processing image: {e}")
                image_bytes = None
                image_b64_string = None
                has_image = False
                await connection_monitor.safe_send(json.dumps({"text": "Error processing screen capture."}))
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

    if image_b64_string:
        print("Image data was received alongside other chunks.")

    if text_part_content and not is_system_context:
        text_part_string = text_part_content
        print(f"Preparing text part string for sending: {text_part_string[:100]}...")
        if is_user_message:
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
        
        if image_b64_string:
            print(f"Adding image chunk of size {len(image_b64_string)} chars to content parts...")
            # Use types.Blob and types.Part explicitly
            # Pass base64 string directly to data
            blob = types.Blob(mime_type="image/jpeg", data=image_b64_string)
            content_parts.append(types.Part(inline_data=blob))
            
        if text_part_string:
            print(f"Adding text part to content parts: {text_part_string[:100]}...")
            content_parts.append(types.Part(text=text_part_string))
            
        if content_parts:
            if session is not None:
                try:
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
        
        if not text_part_string and not image_bytes:
             print("No valid text or image part prepared to send for this realtime_input.")

        await asyncio.sleep(0.1)
    except Exception as e:
         print(f"ERROR: Exception during session.send(): {e}")
         import traceback
         traceback.print_exc()
         await connection_monitor.safe_send(json.dumps({
             "text": f"Error sending message to Gemini: {str(e)}",
             "is_system_message": True, "is_error": True })) 