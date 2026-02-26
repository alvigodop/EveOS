// js/modules/gemini/Time_Perception_Agentic/timestamp_parser/timestampParser.js

(function() {
    function parseTimestamp(timestampStr) {
        if (!timestampStr) return new Date(0);

        try {
            // Try direct parsing first
            let date = new Date(timestampStr);

            // Check if valid date
            if (!isNaN(date.getTime())) {
                return date;
            }

            // Try MM/DD/YYYY HH:MM AM/PM format
            const mmddyyyyMatch = timestampStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i);
            if (mmddyyyyMatch) {
                const [_, month, day, year, hour, minute, ampm] = mmddyyyyMatch;
                let hours = parseInt(hour);
                if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;

                return new Date(year, month - 1, day, hours, minute);
            }

            // Try other formats as needed

            // Default to current date if parsing fails
            return new Date();
        } catch (e) {
            console.error("Error parsing timestamp:", e);
            return new Date();
        }
    }

    // Expose functionality to the TimePerceptionAgentic global object
    window.TimePerceptionAgentic.parseTimestamp = parseTimestamp;
})(); 