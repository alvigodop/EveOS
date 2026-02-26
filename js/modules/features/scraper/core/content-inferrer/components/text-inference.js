/**
 * Text Inference
 * Logic for inferring content type from text snippets/descriptions
 */
const TextInference = {
    /**
     * Infer content type from text description/snippet.
     * @param {string} text - The text to analyze.
     * @returns {string|null} - 'Real-Person', 'Fictional-Character', 'story', or null.
     */
    inferContentTypeFromText: function (text) {
        if (!text) return null;
        const lower = text.toLowerCase();

        // --- CHECK STORY/MEDIA FIRST ---
        if (lower.match(/is a \d{4}[\w\s]+\b(film|movie)\b/) ||
            lower.match(/is a (film|movie|anime|manga|video game|novel|light novel|ova|tv series|web series)/) ||
            lower.match(/\b\d{4}\b.*\b(film|movie)\b/) ||
            lower.includes('animated film') || lower.includes('animated series') ||
            lower.includes('fantasy film') || lower.includes('action film') ||
            lower.includes('adventure film') || lower.includes('martial arts') ||
            lower.includes('directed by') || lower.includes('produced by') ||
            lower.includes('released in') || lower.includes('was released') ||
            lower.includes('premiered in') || lower.includes('theatrical release') ||
            lower.includes('box office') || lower.includes('grossed') ||
            lower.includes('sequel to') || lower.includes('prequel to') ||
            lower.includes('spin-off') || lower.includes('based on the manga') ||
            lower.includes('based on the anime') || lower.includes('anime adaptation') ||
            lower.includes('film adaptation') || lower.includes('live-action') ||
            lower.includes('media franchise')) {
            return 'story';
        }

        // --- CHECK FICTIONAL CHARACTER ---
        if (lower.includes('is a character') || lower.includes('is the main character') ||
            lower.includes('is the protagonist') || lower.includes('is the antagonist') ||
            lower.includes('is a villain') || lower.includes('is an antagonist') ||
            lower.includes('is a fictional') || lower.includes('fictional character') ||
            lower.includes('main protagonist') || lower.includes('main antagonist') ||
            lower.includes('supporting character') || lower.includes('recurring character') ||
            lower.includes('minor character') || lower.includes('appears in') ||
            lower.includes('featured in') || lower.includes('was killed') ||
            lower.includes('was defeated') || lower.includes('alternate timeline') ||
            lower.includes('alternate version') || lower.match(/\bprotagonist of\b/) ||
            lower.match(/\bantagonist of\b/) || lower.match(/\bhero of\b/) ||
            lower.match(/\bvillain of\b/) || lower.match(/\bvillain in\b/) ||
            lower.match(/\bcharacter in\b/) || lower.match(/\bcharacter from\b/) ||
            lower.match(/\bmember of\b.*\b(team|group|clan|guild|organization|saiyan|z.?fighters)\b/i) ||
            lower.includes('playable character') || lower.includes('non-playable character') ||
            lower.includes('npc') || lower.includes('super saiyan') ||
            lower.includes('saiyan') || lower.includes('namekian') ||
            lower.includes('jutsu') || lower.includes('chakra') ||
            lower.includes('devil fruit') || lower.includes('quirk')) {
            return 'Fictional-Character';
        }

        // --- REAL PERSON INDICATORS ---
        if (lower.includes('manga artist') || lower.includes('mangaka') ||
            lower.includes('illustrator') || lower.includes('animator') ||
            lower.includes('voice actor') || lower.includes('voice actress') ||
            lower.includes('seiyū') || lower.includes('seiyu') ||
            lower.includes('japanese actress') || lower.includes('japanese actor') ||
            lower.includes('american actor') || lower.includes('american actress') ||
            lower.match(/\b(physicist|scientist|philosopher|inventor|politician|musician|singer|director|producer|screenwriter|author|novelist|poet|painter|sculptor|architect|athlete|designer|engineer|mathematician|biologist|chemist|doctor|physician|surgeon|nurse|teacher|professor|academic|historian|journalist|reporter|lawyer|judge|activist|philanthropist|entrepreneur|executive|manager|coach|soldier|officer|general|admiral|pilot|astronaut|comedian|photographer|chef|developer|programmer)\b/) ||
            lower.includes('biography') || lower.includes('early life') ||
            lower.includes('personal life') || lower.includes('filmography') ||
            lower.includes('discography') || lower.includes('bibliography') ||
            text.match(/\(\d{4}[–-]\d{4}\)/) || text.match(/\(b\.\s*\d{4}\)/) ||
            text.match(/\(born\s+\w+\s+\d{1,2},?\s*\d{4}\)/) ||
            text.match(/\(born\s+\d{4}\)/) || text.match(/\(died\s+\d{4}\)/)) {
            return 'Real-Person';
        }

        return null;
    }
};

window.TextInference = TextInference;
