"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/core.js");

function item(id, extras) {
  return {
    id: String(id),
    pinUrl: `https://at.pinterest.com/pin/${id}/`,
    imageCandidates: [`https://i.pinimg.com/736x/${id}.jpg`],
    altText: `Pin ${id}`,
    discoveredAt: Number(id),
    ...(extras || {})
  };
}

test("parsePinUrl accepts localized Pinterest hosts", () => {
  assert.deepEqual(Core.parsePinUrl("/pin/123456/", "https://at.pinterest.com/"), {
    id: "123456",
    pinUrl: "https://at.pinterest.com/pin/123456/"
  });
});

test("parsePinUrl rejects external and non-numeric URLs", () => {
  assert.equal(Core.parsePinUrl("https://example.com/pin/123/"), null);
  assert.equal(Core.parsePinUrl("https://pinterest.com/pin/not-a-pin/"), null);
});

test("contextKey includes route, search, and selected Home topic", () => {
  assert.equal(
    Core.contextKey("https://at.pinterest.com/search/pins/?q=chairs", "Architecture"),
    "https://at.pinterest.com/search/pins?q=chairs|architecture"
  );
});

test("imageCandidates derives 1200px and keeps fallbacks", () => {
  const result = Core.imageCandidates({
    src: "https://i.pinimg.com/236x/a/b/c.jpg",
    srcset:
      "https://i.pinimg.com/474x/a/b/c.jpg 2x, https://i.pinimg.com/originals/a/b/c.jpg 4x"
  });

  assert.equal(result[0], "https://i.pinimg.com/originals/a/b/c.jpg");
  assert.ok(result.includes("https://i.pinimg.com/1200x/a/b/c.jpg"));
  assert.ok(result.includes("https://i.pinimg.com/236x/a/b/c.jpg"));
});

test("mergeQueue preserves discovery order and enriches duplicates", () => {
  const result = Core.mergeQueue(
    [item(1), item(2)],
    [item(2, { altText: "Updated", imageCandidates: ["original-2"] }), item(3)]
  );

  assert.deepEqual(result.map((entry) => entry.id), ["1", "2", "3"]);
  assert.equal(result[1].altText, "Updated");
  assert.deepEqual(result[1].imageCandidates, [
    "https://i.pinimg.com/736x/2.jpg",
    "original-2"
  ]);
});

test("mergeQueue enforces its maximum", () => {
  assert.deepEqual(
    Core.mergeQueue([], [item(1), item(2), item(3)], 2).map((entry) => entry.id),
    ["1", "2"]
  );
});

test("moveIndex never wraps at collection boundaries", () => {
  assert.deepEqual(Core.moveIndex(1, 1, 3), { index: 2, atBoundary: false });
  assert.deepEqual(Core.moveIndex(2, 1, 3), { index: 2, atBoundary: true });
  assert.deepEqual(Core.moveIndex(0, -1, 3), { index: 0, atBoundary: true });
});

test("queueForMode selects source, related, and Smart-stage queues", () => {
  const source = [item(1)];
  const related = [item(2)];

  assert.equal(Core.queueForMode("source", source, related), source);
  assert.equal(Core.queueForMode("related", source, related), related);
  assert.equal(Core.queueForMode("smart", source, related, "source"), source);
  assert.equal(Core.queueForMode("smart", source, related, "related"), related);
});

test("interactionFor makes the current Pin page own its related gallery", () => {
  assert.equal(Core.interactionFor("source", true), "related-preview");
  assert.equal(Core.interactionFor("smart", true), "related-preview");
  assert.equal(Core.interactionFor("related", false), "navigate-related");
  assert.equal(Core.interactionFor("smart", false), "source-preview");
});

test("relatedContextChanged resets recommendations only for a new Pin", () => {
  assert.equal(Core.relatedContextChanged("123", "123"), false);
  assert.equal(Core.relatedContextChanged("123", "456"), true);
  assert.equal(Core.relatedContextChanged(null, "456"), true);
});
