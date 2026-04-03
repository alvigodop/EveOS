/**
 * Loads the AI Self-talk Settings card HTML component.
 */

async function loadAiSelfTalkCard() {
    const placeholder = document.getElementById('ai-self-talk-card-placeholder');
    if (!placeholder) {
        console.warn('AI Self-talk card placeholder not found.');
        return;
    }

    try {
        const html = `
<div class="agentic-function-card gemini-agentic-card gemini-agentic-card--self-talk">
    <div class="gemini-agentic-card-head">
        <div>
            <div class="gemini-agentic-card-kicker">Auto Continuation</div>
            <span class="gemini-agentic-card-title">AI Self-talk</span>
        </div>
        <div class="gemini-agentic-card-actions">
            <button id="selfTalkSettingsButton" class="mdl-button mdl-js-button mdl-button--icon gemini-agentic-icon-btn">
                <i class="material-icons">settings</i>
            </button>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect gemini-agentic-switch" for="aiSelftalkToggle">
                <input type="checkbox" id="aiSelftalkToggle" class="mdl-switch__input">
                <span class="mdl-switch__label"></span>
            </label>
        </div>
    </div>
    <div class="gemini-agentic-card-copy">
        Enable AI to occasionally continue the conversation without user input
    </div>
</div>
`;
        placeholder.innerHTML = html;

        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('AI Self-talk card loaded and MDL components upgraded.');
        return true;

    } catch (error) {
        console.error('Error loading AI Self-talk card:', error);
        return false;
    }
}
