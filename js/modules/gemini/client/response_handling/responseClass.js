// js/modules/gemini/Client_Core_Control/response_handling/responseClass.js
class Response {
    constructor(data) {
        this.text = null;
        this.audioData = null;
        this.endOfTurn = null;

        if (data.text) {
            this.text = data.text;
        }

        if (data.audio) {
            this.audioData = data.audio;
        }
    }
} 