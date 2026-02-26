from ....api_configuration.gemini_config import MODEL, TimeoutConfig
from ....error_handling.api_error_handler import api_error_handler
from ....status_monitoring.api_usage_monitor import api_usage_tracker

class StreamErrorHandler:
    """
    Manages error state and handling logic for the Gemini stream session.
    Tracks consecutive errors and makes retry decisions.
    """
    def __init__(self, connection_id):
        self.connection_id = connection_id
        self.consecutive_errors = 0
        self.deadline_consecutive_errors = 0
        self.max_consecutive_errors = 5
        self.max_deadline_errors = TimeoutConfig.MAX_CONSECUTIVE_DEADLINE_ERRORS

    def reset(self):
        """Reset all error counters."""
        self.consecutive_errors = 0
        self.deadline_consecutive_errors = 0

    async def handle_deadline_error(self, error):
        """
        Handle a deadline/timeout error.
        Returns: (should_retry, handler_msg)
        """
        self.deadline_consecutive_errors += 1
        self.consecutive_errors += 1
        error_msg = str(error)
        
        print(f"Deadline error detected (deadline: {self.deadline_consecutive_errors}/{self.max_deadline_errors}, total: {self.consecutive_errors}/{self.max_consecutive_errors})")
        
        # Log deadline error in API usage tracker
        api_usage_tracker.log_error(str(self.connection_id), "deadline_error", error_msg, is_deadline_error=True)
        
        # Use enhanced error handler
        deadline_error_obj = Exception(f"Deadline expired error: {error_msg}")
        should_retry, handler_msg = await api_error_handler.handle_api_error(deadline_error_obj, self.connection_id, MODEL)
        
        # Enforce local max limits
        if should_retry:
            if self.deadline_consecutive_errors >= self.max_deadline_errors or self.consecutive_errors >= self.max_consecutive_errors:
                return False, f"Too many consecutive deadline errors ({self.deadline_consecutive_errors})"
                
        return should_retry, handler_msg

    async def handle_general_error(self, error):
        """
        Handle a general exception.
        Returns: (should_retry, error_msg)
        """
        self.consecutive_errors += 1
        print(f"Error in response receiving task (consecutive: {self.consecutive_errors}/{self.max_consecutive_errors}): {error}")
        
        # Log error in API usage tracker
        api_usage_tracker.log_error(str(self.connection_id), "response_error", str(error), is_deadline_error=False)
        
        should_retry, error_msg = await api_error_handler.handle_api_error(error, self.connection_id, MODEL)
        
        if should_retry and self.consecutive_errors >= self.max_consecutive_errors:
            return False, f"Too many consecutive errors ({self.consecutive_errors})"
            
        return should_retry, error_msg
