"use strict";

const DEFAULT_SETTINGS = Object.freeze({ mode: "smart", settingsVersion: 2 });
const SESSION_PREFIX = "pinglide-tab-";

function sessionKey(tabId) {
  return `${SESSION_PREFIX}${tabId}`;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(["mode", "settingsVersion"]);
  if (!stored.settingsVersion || stored.settingsVersion < 2) {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(sessionKey(tabId));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  const tabId = sender.tab && sender.tab.id;

  if (message.type === "SAVE_TAB_SESSION" && Number.isInteger(tabId)) {
    chrome.storage.session
      .set({ [sessionKey(tabId)]: message.session || null })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "GET_TAB_SESSION" && Number.isInteger(tabId)) {
    chrome.storage.session.get(sessionKey(tabId)).then((stored) => {
      sendResponse({ session: stored[sessionKey(tabId)] || null });
    });
    return true;
  }

  if (message.type === "CLEAR_TAB_SESSION" && Number.isInteger(tabId)) {
    chrome.storage.session
      .remove(sessionKey(tabId))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "UPDATE_BADGE" && Number.isInteger(tabId)) {
    const enabled = Boolean(message.enabled);
    Promise.all([
      chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" }),
      chrome.action.setBadgeBackgroundColor({
        tabId,
        color: enabled ? "#e60023" : "#777777"
      })
    ]).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
