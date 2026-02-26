// js/modules/gemini/past_chats_state/pastChatsState.js
// This file initializes and manages the state related to past chat sessions.

console.log("js/modules/gemini/past_chats_state/pastChatsState.js started loading");

window.pastChats = []; // Stores an array of past chat objects, used by pastChatManager.js, newChatHandler.js, chatClearHandler.js
window.isPastChatsVisible = false; // Tracks the visibility of the past chats interface, used by pastChatsVisibilityToggler.js

console.log("Past chats state (pastChats, isPastChatsVisible) initialized by pastChatsState.js");

// Global variables are consistent with the project's current structure.
// Functions to get or set these variables can be added if a more modular approach is adopted later.
// e.g.:
// window.getPastChats = () => pastChats;
// window.setPastChats = (newPastChats) => { pastChats = newPastChats; };
// window.isPastChatsLogVisible = () => isPastChatsVisible;
// window.setPastChatsLogVisible = (visible) => { isPastChatsVisible = visible; };

console.log("js/modules/gemini/past_chats_state/pastChatsState.js finished loading and initial execution"); 