"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const source = fs.readFileSync(require.resolve("../src/background.js"), "utf8");

function worker(options = {}) {
  let installed, listener;
  const settings = { ...options.settings };
  const requests = [];
  let reads = 0;
  const context = {
    URL, AbortSignal,
    chrome: {
      runtime: { onInstalled: { addListener: (fn) => installed = fn }, onMessage: { addListener: (fn) => listener = fn } },
      storage: { sync: { get: async () => settings, set: async (value) => Object.assign(settings, value) } },
      permissions: { contains: async () => options.granted !== false },
      cookies: { get: async () => { reads++; return options.signedIn === false ? null : { value: "test-session-only" }; } },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} }
    },
    fetch: async (url, request) => {
      requests.push({ url, ...request });
      if (options.fetch) return options.fetch();
      return { status: options.status || 201 };
    }
  };
  vm.runInNewContext(source, context);
  return { settings, requests, installed: () => installed(), cookieReads: () => reads,
    message: (message, sender = {}) => new Promise((resolve) => {
      const asyncResponse = listener(message, sender, resolve);
      if (!asyncResponse) resolve(undefined);
    }) };
}
const sender = { url: "https://at.pinterest.com/", tab: { id: 3 } };
const save = { type: "SAVE_TO_MYMIND", pinUrl: "https://at.pinterest.com/pin/123/", imageUrl: "https://i.pinimg.com/1200x/example.jpg", altText: "Example" };

test("install enables one automatic navigation mode, including older settings", async () => {
  const w = worker({ settings: { mode: "source", settingsVersion: 2 } });
  await w.installed();
  assert.equal(w.settings.enabled, true);
  assert.equal(w.settings.mode, "smart");
  assert.equal(w.settings.settingsVersion, 4);
  const restarted = worker({ settings: w.settings });
  assert.equal(restarted.settings.enabled, true);
});

test("updates preserve an intentional global pause", async () => {
  const w = worker({ settings: { enabled: false, mode: "related" } });
  await w.installed();
  assert.equal(w.settings.enabled, false);
  assert.equal(w.settings.mode, "smart");
});

test("save without optional permissions never reads a cookie or sends data", async () => {
  const w = worker({ granted: false });
  assert.equal((await w.message(save, sender)).code, "permission");
  assert.equal(w.cookieReads(), 0);
  assert.equal(w.requests.length, 0);
});

test("signed out save asks for sign-in without sending a request", async () => {
  const w = worker({ signedIn: false });
  assert.equal((await w.message(save, sender)).code, "signin");
  assert.equal(w.requests.length, 0);
});

test("saves the displayed image and Pin source; never returns the session", async () => {
  const w = worker();
  const result = await w.message(save, sender);
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(result).includes("test-session"), false);
  assert.equal(w.requests[0].url, "https://access.mymind.com/objects");
  assert.equal(w.requests[0].redirect, "error");
  assert.deepEqual(JSON.parse(w.requests[0].body), { type: "Media", url: save.imageUrl, alt: "Example", source: save.pinUrl });
});

test("rejects foreign senders, image hosts, credentials and incognito saves", async () => {
  const w = worker();
  for (const [message, from] of [
    [save, { ...sender, url: "https://example.com" }],
    [{ ...save, imageUrl: "https://i.pinimg.com.evil.com/x" }, sender],
    [{ ...save, imageUrl: "https://user:pass@i.pinimg.com/x" }, sender],
    [{ ...save, pinUrl: "https://example.com/pin/123/" }, sender],
    [save, { ...sender, tab: { id: 3, incognito: true } }]
  ]) assert.equal((await w.message(message, from)).code, "invalid");
  assert.equal(w.requests.length, 0);
  assert.equal(w.cookieReads(), 0);
});

test("deduplicates saves while one request is in flight", async () => {
  let finish;
  const w = worker({ fetch: () => new Promise((resolve) => finish = resolve) });
  const one = w.message(save, sender);
  const two = w.message(save, sender);
  await new Promise(setImmediate);
  assert.equal(w.requests.length, 1);
  finish({ status: 201 });
  assert.equal((await one).ok, true);
  assert.equal((await two).ok, true);
});

test("maps mymind responses and never automatically retries failed writes", async () => {
  for (const [status, code] of [[401,"signin"],[402,"subscription"],[403,"service"],[500,"service"]]) {
    const w = worker({ status });
    assert.equal((await w.message(save, sender)).code, code);
    assert.equal(w.requests.length, 1);
  }
  const existing = worker({ status: 200 });
  assert.equal((await existing.message(save, sender)).alreadySaved, true);
  const network = worker({ fetch: () => { throw Error("network"); } });
  assert.equal((await network.message(save, sender)).code, "network");
  assert.equal(network.requests.length, 1);
});
