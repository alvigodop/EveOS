"""Mode 2 text-brain relay package.

Provides the longer-context text model ("text brain") that, in Mode 2, receives
the user's utterance plus the grand EveOS conversation history/context, produces a
reply, and hands only the final spoken line to the live voice model. Additive and
isolated from the Mode 1 live audio loop.
"""

from .text_brain_handler import handle_text_brain_request

__all__ = ["handle_text_brain_request"]
