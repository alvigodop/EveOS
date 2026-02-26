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
<div class="agentic-function-card" style="background-color: white; padding: 12px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.12); min-width: 200px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-weight: 500; color: #333;">AI Self-talk</span>
        <div style="display: flex; align-items: center;">
            <button id="selfTalkSettingsButton" class="mdl-button mdl-js-button mdl-button--icon" style="margin-right: 8px;">
                <i class="material-icons">settings</i>
            </button>
            <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect" for="aiSelftalkToggle">
                <input type="checkbox" id="aiSelftalkToggle" class="mdl-switch__input">
                <span class="mdl-switch__label"></span>
            </label>
        </div>
    </div>
    <div style="font-size: 12px; color: #757575; margin-top: 8px;">
        Enable AI to occasionally continue the conversation without user input
    </div>
</div>
`;
        placeholder.innerHTML = html;

        // Upgrade MDL components within the loaded HTML
        if (window.componentHandler) {
            window.componentHandler.upgradeElements(placeholder);
        }
        console.log('AI Self-talk card loaded and MDL components upgraded.');

        // Return true to indicate successful loading
        return true;

    } catch (error) {
        console.error('Error loading AI Self-talk card:', error);
        return false;
    }
}

// Expose the loader function globally or via a namespace if needed elsewhere
// window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
// window.AiSelfTalkAgentic.loadAiSelfTalkCard = loadAiSelfTalkCard; 