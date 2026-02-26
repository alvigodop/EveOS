/**
 * selfTalkDefinitions.js
 * Helper functions for managing prompt and instruction lists.
 */

window.AiSelfTalkAgentic = window.AiSelfTalkAgentic || {};
window.AiSelfTalkAgentic.Definitions = window.AiSelfTalkAgentic.Definitions || {};

// Function to update the combined text from list items
window.AiSelfTalkAgentic.Definitions.updateCombinedText = function (listId) {
    const list = document.getElementById(listId);
    if (!list) return '';
    const items = list.querySelectorAll('.list-item .item-text');
    const combinedText = Array.from(items).map(item => item.textContent.trim()).join('\n');
    return combinedText;
};

// Function to parse text and add items to a list
window.AiSelfTalkAgentic.Definitions.parseTextToItems = function (text, listId) {
    const list = document.getElementById(listId);
    if (!list) return;

    // Clear current items
    list.innerHTML = '';

    if (text && typeof text === 'string') {
        const items = text.split('\n').filter(item => item.trim() !== '');
        items.forEach(item => window.AiSelfTalkAgentic.Definitions.addItemToList(item.trim(), listId));
    }
};

window.AiSelfTalkAgentic.Definitions.addItemToList = function (text, listId) {
    const list = document.getElementById(listId);
    if (!list) return;

    const item = document.createElement('div');
    item.className = 'list-item';

    const itemText = document.createElement('span');
    itemText.className = 'item-text';
    itemText.textContent = text;
    item.appendChild(itemText);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mdl-button mdl-js-button mdl-button--icon';
    deleteBtn.innerHTML = '<i class="material-icons">delete</i>';
    deleteBtn.onclick = function () {
        item.remove();
        window.AiSelfTalkAgentic.Definitions.updateCombinedText(listId);
    };
    item.appendChild(deleteBtn);

    list.appendChild(item);
    window.AiSelfTalkAgentic.Definitions.updateCombinedText(listId);
};

console.log("selfTalkDefinitions.js loaded.");
