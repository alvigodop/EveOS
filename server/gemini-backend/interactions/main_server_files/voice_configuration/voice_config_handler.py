import re
import json

def extract_voice_configuration(config_data):
    """
    Extracts voice configuration from the provided config data.
    Returns the voice name and any additional voice settings.
    """
    voice_name = None
    try:
        print("Extracting voice configuration...")
        print(f"Config data: {json.dumps(config_data, indent=2)}")
        
        # Check for voice in different possible locations in the config
        if "setup" in config_data:
            # First, try to extract from the setup.contents text
            try:
                setup_text = config_data.get("setup", {}).get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
                if "voice of" in setup_text:
                    # Extract voice name from text like "You are a helpful AI assistant speaking with the voice of Puck."
                    voice_match = re.search(r"voice of (\w+)", setup_text)
                    if voice_match:
                        voice_name = voice_match.group(1)
                        print(f"Extracted voice name from setup text: {voice_name}")
            except Exception as e:
                print(f"Error extracting voice from setup text: {e}")
            
            # If not found in text, check in the standard location
            if not voice_name:
                voice_config = config_data.get("setup", {}).get("speechConfig", {}).get("voiceConfig", {})
                voice_name = voice_config.get("prebuiltVoiceConfig", {}).get("voiceName")
                print(f"Found voice in setup.speechConfig.voiceConfig: {voice_name}")
            
            # If not found in the expected location, check if it's directly in setup
            if not voice_name and "speechConfig" in config_data.get("setup", {}):
                voice_name = config_data.get("setup", {}).get("speechConfig")
                print(f"Found voice directly in setup.speechConfig: {voice_name}")
        elif "speechConfig" in config_data:
            voice_name = config_data.get("speechConfig")
            print(f"Found voice in speechConfig: {voice_name}")
        elif "voice" in config_data:
            voice_name = config_data.get("voice")
            print(f"Found voice in voice field: {voice_name}")
        
        # If we still don't have a voice name, check if it's directly in the config
        if not voice_name and isinstance(config_data, str):
            voice_name = config_data
            print(f"Using config data directly as voice: {voice_name}")
            
        if voice_name:
            print(f"Using voice: {voice_name}")
        else:
            voice_name = "Aoede"
            print(f"No voice name found in config, using default: {voice_name}")
            
        return voice_name
        
    except Exception as e:
        voice_name = "Aoede"
        print(f"Error extracting voice name: {e}, using default: {voice_name}")
        return voice_name

async def change_voice_settings(new_voice):
    """
    Changes the voice settings for the current session.
    
    Args:
        new_voice (str): The name of the new voice to use
        
    Returns:
        bool: True if the voice was changed successfully
    """
    try:
        print(f"Changing voice settings to: {new_voice}")
        # Here you would typically update any global voice settings
        # or notify other components about the voice change
        
        # For now, we just validate the voice name
        valid_voices = ["Aoede", "Charon", "Fenrir", "Kore", "Leda", "Orus", "Puck", "Zephyr"]
        if new_voice not in valid_voices:
            raise ValueError(f"Invalid voice name. Must be one of: {', '.join(valid_voices)}")
            
        # In a real implementation, you might:
        # 1. Update a global voice configuration
        # 2. Notify any active TTS services
        # 3. Update any relevant configuration files
        
        return True
    except Exception as e:
        print(f"Error changing voice settings: {e}")
        raise 