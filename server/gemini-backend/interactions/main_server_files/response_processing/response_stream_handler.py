from .stream_handling.stream_controller import receive_from_gemini

# Deprecated: These imports are maintained for backward compatibility
# but new code should import directly from the stream_handling package
__all__ = ['receive_from_gemini']
 