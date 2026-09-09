"use strict";

const DEFAULT_MODE = "smart";
const enabledInput = document.querySelector("#enabled");
const availability = document.querySelector("#availability");
const modeFieldset = document.querySelector("#mode-fieldset");
const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));

let activeTabId = null;

async function sendToActiveTab(message) {
  if (!Number.isInteger(activeTabId)) return null;

  try {
    return await chrome.tabs.sendMessage(activeTabId, message);
  } catch (_error) {
    return null;
  }
}

async function initialize() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = activeTab && activeTab.id;

  const settings = await chrome.storage.sync.get({ mode: DEFAULT_MODE });
  const selectedMode = modeInputs.find((input) => input.value === settings.mode);
  (selectedMode || modeInputs[0]).checked = true;

  const state = await sendToActiveTab({ type: "GET_STATE" });
  if (!state || !state.supported) {
    availability.textContent = "Open Pinterest to use this extension";
    return;
  }

  enabledInput.disabled = false;
  enabledInput.checked = Boolean(state.enabled);
  modeFieldset.disabled = false;
  availability.textContent = state.pinCount
    ? `${state.pinCount} image${state.pinCount === 1 ? "" : "s"} ready`
    : "Ready — open a Pin grid";
}

enabledInput.addEventListener("change", async () => {
  const response = await sendToActiveTab({
    type: "SET_ENABLED",
    enabled: enabledInput.checked
  });

  if (!response || !response.ok) {
    enabledInput.checked = false;
    availability.textContent = "Pinterest did not respond — reload the page";
    return;
  }

  availability.textContent = response.pinCount
    ? `${response.pinCount} image${response.pinCount === 1 ? "" : "s"} ready`
    : "Ready — open a Pin grid";
});

for (const input of modeInputs) {
  input.addEventListener("change", async () => {
    if (!input.checked) return;
    await chrome.storage.sync.set({ mode: input.value });
    await sendToActiveTab({ type: "SET_MODE", mode: input.value });
  });
}

initialize();
