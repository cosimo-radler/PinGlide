"use strict";

const MYMIND_ORIGIN = "https://access.mymind.com";
const MYMIND_PERMISSIONS = { permissions: ["cookies"], origins: [`${MYMIND_ORIGIN}/*`] };
const savesInFlight = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(["enabled"]);
  await chrome.storage.sync.set({
    mode: "smart",
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : true,
    settingsVersion: 4
  });
});

async function mymindStatus() {
  if (!(await chrome.permissions.contains(MYMIND_PERMISSIONS))) {
    return { ok: false, code: "permission" };
  }
  const cookie = await chrome.cookies.get({ url: MYMIND_ORIGIN, name: "_jwt" });
  return cookie ? { ok: true } : { ok: false, code: "signin" };
}

function validSave(message, sender) {
  try {
    const page = new URL(sender.url);
    const source = new URL(message.pinUrl);
    const image = new URL(message.imageUrl);
    return Number.isInteger(sender.tab?.id) && !sender.tab.incognito &&
      page.protocol === "https:" && /(^|\.)pinterest\.com$/i.test(page.hostname) &&
      source.protocol === "https:" && /(^|\.)pinterest\.com$/i.test(source.hostname) &&
      /^\/pin\/\d+\/$/.test(source.pathname) &&
      image.protocol === "https:" && image.hostname === "i.pinimg.com" &&
      !image.username && !image.password && !image.port;
  } catch (_error) {
    return false;
  }
}

async function saveImage(message) {
  if (!(await chrome.permissions.contains(MYMIND_PERMISSIONS))) {
    return { ok: false, code: "permission" };
  }
  // The session stays inside the worker, never in storage or content scripts.
  // Request format verified against the installed mymind extension, v3.3.
  const cookie = await chrome.cookies.get({ url: MYMIND_ORIGIN, name: "_jwt" });
  if (!cookie) return { ok: false, code: "signin" };
  try {
    const response = await fetch(`${MYMIND_ORIGIN}/objects`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${cookie.value}`
      },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        type: "Media",
        url: message.imageUrl,
        alt: String(message.altText || "").slice(0, 2000),
        source: message.pinUrl
      })
    });
    if (response.status === 200 || response.status === 201) {
      return { ok: true, alreadySaved: response.status === 200 };
    }
    return { ok: false, code: response.status === 401 ? "signin" :
      response.status === 402 ? "subscription" : "service" };
  } catch (_error) {
    // A timeout may have reached the server; never retry a write automatically.
    return { ok: false, code: "network" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;
  let result;
  if (message.type === "MYMIND_STATUS") {
    result = mymindStatus();
  } else if (message.type === "SAVE_TO_MYMIND") {
    if (!validSave(message, sender)) {
      sendResponse({ ok: false, code: "invalid" });
      return false;
    }
    const key = `${sender.tab.id}:${message.pinUrl}`;
    if (!savesInFlight.has(key)) {
      savesInFlight.set(key, saveImage(message).finally(() => savesInFlight.delete(key)));
    }
    result = savesInFlight.get(key);
  } else if (message.type === "UPDATE_BADGE" && Number.isInteger(sender.tab?.id)) {
    const tabId = sender.tab.id;
    result = Promise.all([
      chrome.action.setBadgeText({ tabId, text: message.enabled ? "" : "OFF" }),
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#77716a" })
    ]).then(() => ({ ok: true }));
  } else {
    return false;
  }
  Promise.resolve(result).then(sendResponse, () => sendResponse({ ok: false, code: "unavailable" }));
  return true;
});
