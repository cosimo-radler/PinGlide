"use strict";

const panel = document.querySelector(".glass");
const enabledInput = document.querySelector("#enabled");
const enabledLabel = document.querySelector("#enabled-label");
const homeView = document.querySelector("#home-view");
const settingsView = document.querySelector("#settings-view");
const openSettings = document.querySelector("#open-settings");
const closeSettings = document.querySelector("#close-settings");
const connectButton = document.querySelector("#connect-mymind");
const mindStatus = document.querySelector("#mymind-status");
const disconnectButton = document.querySelector("#disconnect-mymind");
const notice = document.querySelector("#notice");
const mindPermissions = { permissions: ["cookies"], origins: ["https://access.mymind.com/*"] };
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let connectionState = "permission";
let savedEnabled = true;
let changeRevision = 0;
let writeQueue = Promise.resolve();
let pulse = null;

function reflectEnabled(enabled) {
  enabledInput.checked = enabled;
  enabledLabel.textContent = enabled ? "On" : "Off";
  panel.dataset.enabled = String(enabled);
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

async function refreshMymind() {
  connectButton.disabled = true;
  try {
    const status = await chrome.runtime.sendMessage({ type: "MYMIND_STATUS" });
    connectionState = status?.ok ? "connected" : status?.code || "unavailable";
    connectButton.hidden = connectionState === "connected";
    connectButton.textContent = connectionState === "signin" ? "Sign in" : "Connect";
    disconnectButton.hidden = !(await chrome.permissions.contains(mindPermissions));
    mindStatus.textContent = connectionState === "connected" ? "Connected" :
      connectionState === "signin" ? "Sign in to your mymind account." :
      connectionState === "permission" ? "Save images with M." : "Connection unavailable. Try again.";
  } catch (_error) {
    mindStatus.textContent = "Couldn’t check the connection. Try again.";
  } finally {
    connectButton.disabled = false;
  }
}

function showSettings(visible) {
  homeView.hidden = visible;
  settingsView.hidden = !visible;
  openSettings.setAttribute("aria-expanded", String(visible));
  showNotice("");
  const incoming = visible ? settingsView : homeView;
  incoming.style.setProperty("--slide", visible ? "8px" : "-8px");
  incoming.classList.remove("entering");
  // Only the incoming view animates; hidden controls leave the focus order.
  incoming.classList.add("entering");
  (visible ? closeSettings : openSettings).focus({ preventScroll: true });
  if (visible) void refreshMymind();
}

openSettings.addEventListener("click", () => showSettings(true));
closeSettings.addEventListener("click", () => showSettings(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsView.hidden) {
    event.preventDefault();
    event.stopPropagation();
    showSettings(false);
  }
});

// Serialize writes without disabling the switch: quick reversals remain smooth,
// and an older storage write can never overtake the most recent choice.
enabledInput.addEventListener("change", () => {
  const enabled = enabledInput.checked;
  const revision = ++changeRevision;
  reflectEnabled(enabled);
  showNotice("");
  pulse?.cancel();
  if (!reducedMotion.matches && enabled) {
    pulse = document.querySelector(".switch-halo").animate([
      { opacity: 0, transform: "scale(.85)" },
      { opacity: .7, offset: .22 },
      { opacity: 0, transform: "scale(1.22)" }
    ], { duration: 650, easing: "cubic-bezier(.2,.7,.2,1)" });
  }
  writeQueue = writeQueue.then(async () => {
    try {
      await chrome.storage.sync.set({ enabled });
      savedEnabled = enabled;
    } catch (_error) {
      if (revision === changeRevision) {
        reflectEnabled(savedEnabled);
        showNotice("Couldn’t save. Please try again.");
      }
    }
  });
});
reducedMotion.addEventListener("change", () => { if (reducedMotion.matches) pulse?.cancel(); });

connectButton.addEventListener("click", async () => {
  try {
    if (connectionState === "signin") {
      await chrome.tabs.create({ url: "https://access.mymind.com/" });
      return;
    }
    // Chrome requires this request to originate directly from a click.
    const request = chrome.permissions.request(mindPermissions);
    connectButton.disabled = true;
    if (!(await request)) {
      mindStatus.textContent = "Not connected.";
      return;
    }
    await refreshMymind();
  } catch (_error) {
    mindStatus.textContent = "Couldn’t connect. Try again.";
  } finally {
    connectButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  disconnectButton.disabled = true;
  try {
    await chrome.permissions.remove(mindPermissions);
    await refreshMymind();
  } catch (_error) {
    mindStatus.textContent = "Couldn’t disconnect. Try again.";
  } finally {
    disconnectButton.disabled = false;
  }
});

chrome.storage.sync.get({ enabled: true }).then((settings) => {
  savedEnabled = settings.enabled !== false;
  reflectEnabled(savedEnabled);
  enabledInput.disabled = false;
}).catch(() => showNotice("Couldn’t load settings. Reopen to retry."));
