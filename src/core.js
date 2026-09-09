(function exposePinterestArrowCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.PinterestArrowCore = api;
  }
})(typeof window !== "undefined" ? window : null, function createCore() {
  "use strict";

  const MAX_QUEUE_SIZE = 750;
  const MODES = Object.freeze(["source", "related", "smart"]);

  function isPinterestHostname(hostname) {
    return /(^|\.)pinterest\.com$/i.test(String(hostname || ""));
  }

  function parsePinUrl(value, baseUrl) {
    if (!value) return null;

    try {
      const parsed = new URL(value, baseUrl || "https://www.pinterest.com/");
      if (!isPinterestHostname(parsed.hostname)) return null;

      const match = parsed.pathname.match(/^\/pin\/(\d+)\/?$/);
      if (!match) return null;

      return {
        id: match[1],
        pinUrl: `${parsed.origin}/pin/${match[1]}/`
      };
    } catch (_error) {
      return null;
    }
  }

  function normalizeTopic(topic) {
    return String(topic || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function contextKey(value, selectedTopic) {
    try {
      const parsed = new URL(value, "https://www.pinterest.com/");
      const topic = normalizeTopic(selectedTopic);
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      return `${parsed.origin}${path}${parsed.search}|${topic}`;
    } catch (_error) {
      return `unknown|${normalizeTopic(selectedTopic)}`;
    }
  }

  function imageResolutionScore(value) {
    const url = String(value || "");
    if (/\/originals\//i.test(url)) return 5000;

    const size = url.match(/\/(\d+)x\//i);
    if (size) return Number(size[1]);

    return 0;
  }

  function derive1200Url(value) {
    const url = String(value || "");
    if (!/https:\/\/i\.pinimg\.com\//i.test(url)) return null;
    if (!/\/(?:\d+x|originals)\//i.test(url)) return null;
    return url.replace(/\/(?:\d+x|originals)\//i, "/1200x/");
  }

  function parseSrcset(srcset) {
    return String(srcset || "")
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function imageCandidates(source) {
    const input = source || {};
    const supplied = [
      input.currentSrc,
      input.src,
      ...parseSrcset(input.srcset)
    ].filter(Boolean);

    const derived = supplied.map(derive1200Url).filter(Boolean);
    const unique = Array.from(new Set([...derived, ...supplied]));

    return unique.sort((left, right) => {
      return imageResolutionScore(right) - imageResolutionScore(left);
    });
  }

  function bestImageCandidate(item) {
    const candidates = Array.isArray(item && item.imageCandidates)
      ? item.imageCandidates
      : [];
    return candidates[0] || (item && item.previewUrl) || "";
  }

  function mergeQueue(existing, incoming, maximum) {
    const limit = Number.isFinite(maximum) ? maximum : MAX_QUEUE_SIZE;
    const result = [];
    const byId = new Map();

    for (const candidate of [...(existing || []), ...(incoming || [])]) {
      if (!candidate || !candidate.id || !candidate.pinUrl) continue;

      const priorIndex = byId.get(candidate.id);
      if (priorIndex !== undefined) {
        result[priorIndex] = {
          ...result[priorIndex],
          ...candidate,
          imageCandidates: Array.from(
            new Set([
              ...(result[priorIndex].imageCandidates || []),
              ...(candidate.imageCandidates || [])
            ])
          )
        };
        continue;
      }

      byId.set(candidate.id, result.length);
      result.push({ ...candidate });
      if (result.length >= limit) break;
    }

    return result;
  }

  function moveIndex(index, direction, length) {
    const proposed = Number(index) + Number(direction);
    if (!Number.isFinite(proposed) || length <= 0) {
      return { index: -1, atBoundary: true };
    }

    if (proposed < 0) return { index: 0, atBoundary: true };
    if (proposed >= length) {
      return { index: Math.max(0, length - 1), atBoundary: true };
    }

    return { index: proposed, atBoundary: false };
  }

  function queueForMode(mode, sourceQueue, relatedQueue, smartStage) {
    if (mode === "related") return relatedQueue || [];
    if (mode === "smart" && smartStage === "related") return relatedQueue || [];
    return sourceQueue || [];
  }

  function isValidMode(mode) {
    return MODES.includes(mode);
  }

  function interactionFor(mode, onPinPage) {
    if (onPinPage) return "related-preview";
    if (mode === "related") return "navigate-related";
    return "source-preview";
  }

  function relatedContextChanged(previousPinId, currentPinId) {
    return String(previousPinId || "") !== String(currentPinId || "");
  }

  return Object.freeze({
    MAX_QUEUE_SIZE,
    MODES,
    bestImageCandidate,
    contextKey,
    derive1200Url,
    imageCandidates,
    imageResolutionScore,
    interactionFor,
    isPinterestHostname,
    isValidMode,
    mergeQueue,
    moveIndex,
    parsePinUrl,
    queueForMode,
    relatedContextChanged
  });
});
