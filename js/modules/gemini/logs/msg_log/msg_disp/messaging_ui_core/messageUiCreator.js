/**
 * messageUiCreator.js
 * Creates DOM elements for chat messages.
 */

window.MessagingLog = window.MessagingLog || {};

window.MessagingLog.MessageUiCreator = {
    createMessageContainer: function (text) { // Optional text arg to classify upfront if needed
        const newMessage = document.createElement('div');
        // Add 'message-container' class for compatibility with socketAudioHandler.js
        newMessage.className = 'chat-message message-container';

        if (text) {
            if (text.startsWith("YOU: ")) {
                newMessage.classList.add("user-message");
            } else if (text.startsWith("GEMINI: ")) {
                newMessage.classList.add("gemini-message");
            } else {
                newMessage.classList.add("gemini-message"); // Default to Gemini style if unsure
            }
        }

        return newMessage;
    },

    getDynamicLabel: function (text) {
        if (!text) return 'SPEECH';

        const cleanText = text.trim().toUpperCase();

        // 1. Confirmation Heuristic
        const confirmations = ["OK", "YES", "SURE", "CONFIRMED", "UNDERSTOOD", "DONE", "ACKNOWLEDGED", "GOT IT"];
        if (confirmations.some(c => cleanText.startsWith(c) && cleanText.length < 20)) {
            return "CONFIRMATION";
        }

        // 2. Query Heuristic
        if (cleanText.endsWith("?")) {
            return "INQUIRY";
        }

        // 3. Length Heuristic
        if (text.length > 200) {
            return "DETAILED RESPONSE";
        }

        // 4. Randomized Variety Fallback
        const variety = ["DIRECT REPLY", "MESSAGE", "RESPONSE", "RESULT", "OUTPUT", "SPEECH"];
        // Simple hash/stable "random" based on text content to keep it consistent for the same text
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = text.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash % variety.length);

        return variety[index];
    },

    createMessageContent: function (text) {
        const messageContent = document.createElement("div");
        messageContent.className = "message-content message";

        // Clean up prefixes for display
        let displayText = text;
        let isUser = false;
        if (text.startsWith("YOU: ")) {
            displayText = text.substring(5);
            isUser = true;
        } else if (text.startsWith("GEMINI: ")) {
            displayText = text.substring(8);
        }

        // Check for thinking blocks (both **Title** format and wrapped content)
        // More flexible pattern to handle missing double newlines if needed
        const thinkingPattern = /\*\*([^*]+)\*\*[\s]*\n*([\s\S]*?)(?=\n+[\s]*\*\*|$)/g;
        let lastIndex = 0;
        let matches = [];
        let match;

        while ((match = thinkingPattern.exec(displayText)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                title: match[1].trim(),
                content: match[2].trim()
            });
        }

        // If we found blocks, reorganize the content
        if (matches.length > 0) {
            messageContent.innerHTML = ''; // Clear text content

            // Separating segments while tracking which one is last
            let contentParts = [];
            lastIndex = 0;
            matches.forEach((m, index) => {
                if (m.start > lastIndex) {
                    contentParts.push({
                        type: 'text',
                        content: displayText.substring(lastIndex, m.start).trim()
                    });
                }
                contentParts.push({
                    type: 'block',
                    title: m.title,
                    content: m.content
                });
                lastIndex = m.end;
            });

            // Add remaining text
            if (lastIndex < displayText.length) {
                const remaining = displayText.substring(lastIndex).trim();
                if (remaining) {
                    contentParts.push({
                        type: 'text',
                        content: remaining
                    });
                }
            }

            // Heuristic keywords that usually mean "collapsed thinking" (Meta-talk)
            const thinkingKeywords = ["THOUGHT", "REASONING", "MONOLOGUE", "INTERNAL", "PLANNING", "THINKING", "ACKNOWLEDG", "ANALYZ", "TASK", "STEP", "UNDERSTAND", "INITIAT", "PROCESS", "FORMULAT", "GENERAT", "GREETING"];

            // Render all parts
            contentParts.forEach((part, index) => {
                const isLast = (index === contentParts.length - 1);

                // For user messages, keep it simple
                if (isUser) {
                    const textDiv = document.createElement('div');
                    textDiv.className = 'message-text-content';
                    textDiv.textContent = part.content;
                    messageContent.appendChild(textDiv);
                    return;
                }

                // Gemini Logic: Decide between Thinking Box or Speech Box
                const isThinkingLabel = (part.type === 'block') && (
                    thinkingKeywords.some(kw => part.title.toUpperCase().includes(kw))
                );

                // AUTO-SPLIT LOGIC: Check if this block contains a clear thought-to-speech transition
                let mainContent = part.content;
                let promotedSpeech = "";

                // If it contains double newlines, try to split the final paragraph into its own speech box
                // We do this universally for any Gemini segment that has a large gap at the end
                const splitIndex = mainContent.lastIndexOf("\n\n");
                if (splitIndex !== -1 && splitIndex < mainContent.length - 5) {
                    const potentialSpeech = mainContent.substring(splitIndex + 2).trim();
                    // Only promote if it doesn't look like more thinking (no meta-words at the start)
                    const startsWithThinking = thinkingKeywords.some(kw => potentialSpeech.toUpperCase().startsWith(kw));
                    if (!startsWithThinking) {
                        promotedSpeech = potentialSpeech;
                        mainContent = mainContent.substring(0, splitIndex).trim();
                    }
                }

                // A segment is "Thinking" if:
                // 1. It has a thinking keyword in its title
                // 2. It's not the last segment
                // 3. OR it was just auto-split (meaning the first half is definitely thoughts)
                const isThinking = isThinkingLabel || (part.type === 'block' && !isLast) || (promotedSpeech !== "");

                if (isThinking) {
                    const thinkingDiv = document.createElement('div');
                    thinkingDiv.className = 'message-thinking-block collapsed';

                    const thinkingHeader = document.createElement('div');
                    thinkingHeader.className = 'thinking-header';
                    thinkingHeader.style.cursor = 'pointer';

                    const thinkingToggle = document.createElement('span');
                    thinkingToggle.className = 'thinking-toggle';
                    thinkingToggle.textContent = '▶';
                    thinkingHeader.appendChild(thinkingToggle);

                    const thinkingTitle = document.createElement('span');
                    thinkingTitle.className = 'thinking-title';
                    thinkingTitle.textContent = part.title;
                    thinkingHeader.appendChild(thinkingTitle);

                    const thinkingContentDiv = document.createElement('div');
                    thinkingContentDiv.className = 'thinking-content';

                    let contentToDisplay = mainContent;
                    if (window.AudioProcessingControlsAgentic?.TranscriptionBoxParser &&
                        window.AudioProcessingControlsAgentic.TranscriptionModeState?.isExtractionEnabled()) {
                        contentToDisplay = window.AudioProcessingControlsAgentic.TranscriptionBoxParser.removeTranscriptionBoxes(mainContent);
                    }
                    thinkingContentDiv.textContent = contentToDisplay;

                    thinkingHeader.addEventListener('click', () => {
                        thinkingDiv.classList.toggle('collapsed');
                        thinkingToggle.textContent = thinkingDiv.classList.contains('collapsed') ? '▶' : '▼';
                    });

                    thinkingDiv.appendChild(thinkingHeader);
                    thinkingDiv.appendChild(thinkingContentDiv);
                    messageContent.appendChild(thinkingDiv);

                    // If we found promoted speech inside the segment, render it as its own Speech box now
                    if (promotedSpeech) {
                        this.appendSpeechBox(messageContent, promotedSpeech, part.title + " (RESPONSE)");
                    }
                } else {
                    // Render as Structured Speech Box (Always Expanded)
                    this.appendSpeechBox(messageContent, mainContent, (part.type === 'block') ? part.title : null);
                }
            });
        } else {
            // No segments found
            if (isUser) {
                messageContent.textContent = displayText;
            } else if (displayText) {
                this.appendSpeechBox(messageContent, displayText, null);
            }
        }


        return messageContent;
    },

    appendSpeechBox: function (container, text, title) {
        const transcriptionDiv = document.createElement('div');
        transcriptionDiv.className = 'message-transcription-block';

        const content = document.createElement('div');
        content.className = 'transcription-content';

        let textToDisplay = text;
        if (window.AudioProcessingControlsAgentic?.TranscriptionBoxParser &&
            window.AudioProcessingControlsAgentic.TranscriptionModeState?.isExtractionEnabled()) {

            const extracted = window.AudioProcessingControlsAgentic.TranscriptionBoxParser.getFirstTranscription(text);
            if (extracted) {
                // TAG-ONLY ISOLATION: If we find a transcription tag, DISCARD everything else.
                // This targets: "hello how can it <Transcribe-Start>hello how can i help you</Transcribe-Start>"
                textToDisplay = extracted;
            } else {
                // Otherwise, just remove any tags if they happen to be empty/broken
                textToDisplay = window.AudioProcessingControlsAgentic.TranscriptionBoxParser.removeTranscriptionBoxes(text);
            }
        }

        // AGGRESSIVE DEDUPLICATION: Handle "hello how are you hello how are you"
        // (Even if not using tags, sometimes models repeat themselves twice)
        if (textToDisplay && textToDisplay.length > 4) {
            const trimmed = textToDisplay.trim();
            const halfLen = Math.floor(trimmed.length / 2);
            const firstHalf = trimmed.substring(0, halfLen).trim();
            const secondHalf = trimmed.substring(halfLen).trim();

            // If the two halves are nearly identical, just take one
            if (secondHalf.startsWith(firstHalf) || firstHalf.includes(secondHalf) && secondHalf.length > 5) {
                textToDisplay = secondHalf; // Take the latter as it's usually the "corrected" or final one
            }
        }

        // If after all cleaning we have no text, don't show the box
        if (!textToDisplay || textToDisplay.trim() === "") {
            return;
        }

        const label = document.createElement('span');
        label.className = 'transcription-label';
        label.textContent = title || this.getDynamicLabel(textToDisplay);
        transcriptionDiv.appendChild(label);

        content.textContent = textToDisplay;
        transcriptionDiv.appendChild(content);
        container.appendChild(transcriptionDiv);
    },

    createTimestamp: function () {
        const timestampElement = document.createElement("div");
        timestampElement.className = "message-timestamp";
        timestampElement.textContent = new Date().toLocaleTimeString();
        return timestampElement;
    },

    createAndAppend: function (text) {
        const newMessage = this.createMessageContainer(text);

        const content = this.createMessageContent(text);
        newMessage.appendChild(content);

        const time = this.createTimestamp();
        newMessage.appendChild(time);

        this.appendMessageToLog(newMessage);
        return newMessage; // Return for audio player attachment if needed
    },

    appendMessageToLog: function (newMessage) {
        const chatLog = document.getElementById('chatLog');
        if (chatLog) {
            let container = chatLog.querySelector('.chat-messages-container');

            // Create container if it doesn't exist (Fixes overflow:hidden issue)
            if (!container) {
                console.log("[MessageUiCreator] Creating missing .chat-messages-container");
                container = document.createElement('div');
                container.className = 'chat-messages-container';
                chatLog.appendChild(container);
            }

            container.appendChild(newMessage);
            container.scrollTop = container.scrollHeight;
        } else {
            console.error("chatLog element not found!");
        }
    }
};

console.log("messageUiCreator.js (Core) loaded.");
