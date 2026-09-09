(function initializePinterestArrow() {
  "use strict";

  const Core = window.PinterestArrowCore;
  if (!Core || window.__pinterestArrowLoaded) return;
  window.__pinterestArrowLoaded = true;

  const LOAD_THRESHOLD = 4;
  const LOAD_ATTEMPTS = 3;
  const LOAD_WAIT_MS = 1500;
  const ROUTE_WAIT_MS = 7000;
  const OVERLAY_ID = "pinglide-overlay-root";

  const state = {
    enabled: false,
    mode: "smart",
    contextKey: "",
    sourceQueue: [],
    relatedQueue: [],
    activeIndex: -1,
    smartStage: "source",
    pinContextId: null,
    galleryContextLabel: "Current grid",
    sourceScrollY: 0,
    pendingNavigation: null,
    bypassPinId: null,
    overlay: null,
    lastUrl: location.href,
    discoverySequence: 0,
    scanTimer: null,
    persistTimer: null,
    loadPromise: null,
    navigationToken: 0
  };

  function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function safeRuntimeMessage(message) {
    try {
      return chrome.runtime.sendMessage(message).catch(() => null);
    } catch (_error) {
      return Promise.resolve(null);
    }
  }

  function selectedTopic() {
    const selected = Array.from(
      document.querySelectorAll('[role="tab"][aria-selected="true"]')
    ).find((element) => element.getBoundingClientRect().width > 0);
    return selected ? selected.textContent : "";
  }

  function currentContextKey() {
    return Core.contextKey(location.href, selectedTopic());
  }

  function sourceContextLabel() {
    const path = location.pathname;
    const topic = String(selectedTopic() || "").replace(/\s+/g, " ").trim();
    const heading = String(
      document.querySelector('[role="main"] h1')?.textContent || ""
    ).replace(/\s+/g, " ").trim();

    if (/^\/search\/pins\/?$/.test(path)) return "Search results";
    if (path === "/" || /^\/[a-z]{2}\/?$/.test(path)) {
      return topic && topic.toLowerCase() !== "all" ? topic : "Home feed";
    }
    if (/\/_pins\/?$/.test(path)) return "Saved Pins";
    if (heading && heading.toLowerCase() !== "home") return heading;
    return "Current grid";
  }

  function currentPinReference() {
    return Core.parsePinUrl(location.href, location.href);
  }

  function isPinPage() {
    return Boolean(currentPinReference());
  }

  function cardForAnchor(anchor) {
    return anchor.closest(
      '[data-test-id="pin"], [role="group"][aria-label="Pin card"]'
    );
  }

  function isPromotedCard(card) {
    if (!card) return false;
    const text = String(card.innerText || "").slice(0, 1200);
    return /(^|\n)\s*(sponsored|promoted|ad\s*[•·])\s*($|\n)/im.test(text);
  }

  function isVideoCard(card) {
    if (!card) return false;
    return Boolean(
      card.querySelector(
        'video, [data-test-id*="video" i], [aria-label*="video" i]'
      )
    );
  }

  function extractPinItem(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return null;

    const parsed = Core.parsePinUrl(anchor.href, location.href);
    const image = anchor.querySelector("img");
    const card = cardForAnchor(anchor);

    if (!parsed || !image || !card) return null;
    if (isPromotedCard(card) || isVideoCard(card)) return null;

    const candidates = Core.imageCandidates({
      src: image.getAttribute("src"),
      srcset: image.getAttribute("srcset"),
      currentSrc: image.currentSrc
    });

    if (!candidates.length) return null;

    state.discoverySequence += 1;
    return {
      id: parsed.id,
      pinUrl: parsed.pinUrl,
      imageCandidates: candidates,
      previewUrl: image.currentSrc || image.src || candidates[candidates.length - 1],
      altText: image.alt || anchor.getAttribute("aria-label") || "Pinterest image",
      discoveredAt: Date.now() + state.discoverySequence / 1000
    };
  }

  function collectGridItems() {
    const main = document.querySelector('[role="main"]') || document.body;
    const anchors = Array.from(main.querySelectorAll('a[href*="/pin/"]'));
    const found = [];
    const seen = new Set();

    for (const anchor of anchors) {
      const item = extractPinItem(anchor);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      found.push(item);
    }

    return found;
  }

  function largestImageWithin(container) {
    if (!container) return null;

    return Array.from(container.querySelectorAll("img"))
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width >= 180 && rect.height >= 180;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;
  }

  function currentPinItem() {
    const parsed = currentPinReference();
    if (!parsed) return null;

    const closeup =
      document.querySelector('[aria-label="Pin image and items to explore"]') ||
      document.querySelector('[role="group"][aria-label="Closeup content container"]');

    if (closeup && isVideoCard(closeup)) return null;

    const image = largestImageWithin(closeup);
    if (!image) return null;

    const candidates = Core.imageCandidates({
      src: image.getAttribute("src"),
      srcset: image.getAttribute("srcset"),
      currentSrc: image.currentSrc
    });

    if (!candidates.length) return null;

    return {
      id: parsed.id,
      pinUrl: parsed.pinUrl,
      imageCandidates: candidates,
      previewUrl: image.currentSrc || image.src || candidates[candidates.length - 1],
      altText: image.alt || "Pinterest image",
      discoveredAt: Date.now()
    };
  }

  function activeQueue() {
    return state.smartStage === "related"
      ? state.relatedQueue
      : state.sourceQueue;
  }

  function schedulePersist() {
    clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(() => {
      safeRuntimeMessage({
        type: "SAVE_TAB_SESSION",
        session: {
          enabled: state.enabled,
          mode: state.mode,
          contextKey: state.contextKey,
          sourceQueue: state.sourceQueue,
          relatedQueue: state.relatedQueue,
          activeIndex: state.activeIndex,
          smartStage: state.smartStage,
          sourceScrollY: state.sourceScrollY,
          pendingNavigation: state.pendingNavigation
        }
      });
    }, 180);
  }

  function scanPage(options) {
    const force = Boolean(options && options.force);
    if (!force && !state.enabled && !state.overlay && !state.pendingNavigation) {
      return 0;
    }

    const items = collectGridItems();

    if (isPinPage()) {
      const currentPin = currentPinReference();
      if (
        currentPin &&
        Core.relatedContextChanged(state.pinContextId, currentPin.id)
      ) {
        state.pinContextId = currentPin.id;
        state.relatedQueue = [];
      }
      state.relatedQueue = Core.mergeQueue(
        state.relatedQueue,
        items,
        Core.MAX_QUEUE_SIZE
      );
      schedulePersist();
      return state.relatedQueue.length;
    }

    const context = currentContextKey();
    state.pinContextId = null;
    if (context !== state.contextKey) {
      state.contextKey = context;
      state.sourceQueue = [];
      state.relatedQueue = [];
      state.smartStage = "source";
      state.activeIndex = -1;
    }

    state.sourceQueue = Core.mergeQueue(
      state.sourceQueue,
      items,
      Core.MAX_QUEUE_SIZE
    );
    schedulePersist();
    return state.sourceQueue.length;
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      checkRoute();
      scanPage();
    }, 120);
  }

  function modeLabel() {
    return state.galleryContextLabel;
  }

  function createOverlay() {
    const stale = document.getElementById(OVERLAY_ID);
    if (stale) stale.remove();

    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    const shadow = host.attachShadow({ mode: "open" });

    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        .backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: rgb(10 10 10 / 92%);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          animation: reveal 140ms ease-out;
        }
        @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
        .stage {
          display: grid;
          width: 100%;
          height: 100%;
          place-items: center;
          padding: 46px 56px 62px;
        }
        .image {
          display: block;
          max-width: min(92vw, 1500px);
          max-height: calc(100vh - 104px);
          border-radius: 18px;
          box-shadow: 0 28px 90px rgb(0 0 0 / 55%);
          object-fit: contain;
          opacity: 1;
          transform: scale(1);
          cursor: zoom-in;
          transition: opacity 105ms ease, transform 105ms ease;
          user-select: none;
          -webkit-user-drag: none;
        }
        .image.switching { opacity: 0.25; transform: scale(0.992); }
        .close {
          position: fixed;
          top: 16px;
          left: 16px;
          display: grid;
          width: 46px;
          height: 46px;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: rgb(255 255 255 / 92%);
          color: #111;
          font: 300 35px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease;
        }
        .close:hover { transform: scale(1.05); background: #fff; }
        .close:focus-visible, .image:focus-visible {
          outline: 3px solid #fff;
          outline-offset: 4px;
        }
        .meta {
          position: fixed;
          bottom: 18px;
          left: 50%;
          display: flex;
          align-items: center;
          gap: 9px;
          min-height: 32px;
          padding: 7px 12px;
          border: 1px solid rgb(255 255 255 / 14%);
          border-radius: 999px;
          background: rgb(0 0 0 / 42%);
          color: rgb(255 255 255 / 78%);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.01em;
          transform: translateX(-50%);
          backdrop-filter: blur(12px);
        }
        .dot { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .55; }
        .hint, .toast {
          position: fixed;
          top: 18px;
          left: 50%;
          padding: 9px 13px;
          border-radius: 999px;
          background: rgb(0 0 0 / 62%);
          color: rgb(255 255 255 / 88%);
          font-size: 12px;
          font-weight: 600;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 180ms ease;
          pointer-events: none;
        }
        .hint.visible, .toast.visible { opacity: 1; }
        .toast { top: auto; bottom: 62px; }
        @media (max-width: 700px) {
          .stage { padding: 58px 14px 64px; }
          .image { max-width: calc(100vw - 28px); max-height: calc(100vh - 122px); border-radius: 13px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .backdrop, .image, .hint, .toast { animation: none; transition: none; }
        }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-label="PinGlide gallery">
        <button class="close" type="button" aria-label="Close gallery">×</button>
        <div class="stage">
          <img class="image" tabindex="0" draggable="false" alt="" />
        </div>
        <div class="meta" aria-live="polite">
          <span class="mode"></span><span class="dot"></span><span class="counter"></span>
        </div>
        <div class="hint">← → browse&nbsp;&nbsp;·&nbsp;&nbsp;Enter open&nbsp;&nbsp;·&nbsp;&nbsp;Esc close</div>
        <div class="toast" role="status"></div>
      </div>
    `;

    document.documentElement.appendChild(host);

    const overlay = {
      host,
      shadow,
      backdrop: shadow.querySelector(".backdrop"),
      close: shadow.querySelector(".close"),
      image: shadow.querySelector(".image"),
      mode: shadow.querySelector(".mode"),
      counter: shadow.querySelector(".counter"),
      hint: shadow.querySelector(".hint"),
      toast: shadow.querySelector(".toast"),
      previousFocus: document.activeElement,
      renderToken: 0,
      hintTimer: null,
      toastTimer: null
    };

    overlay.close.addEventListener("click", () => closeOverlay({ restore: true }));
    overlay.image.addEventListener("click", () => openCurrentPin());
    overlay.image.addEventListener("dragstart", (event) => event.preventDefault());
    overlay.backdrop.addEventListener("click", (event) => {
      if (event.target === overlay.backdrop || event.target.classList.contains("stage")) {
        closeOverlay({ restore: true });
      }
    });
    overlay.backdrop.addEventListener("wheel", (event) => event.preventDefault(), {
      passive: false
    });
    overlay.backdrop.addEventListener("touchmove", (event) => event.preventDefault(), {
      passive: false
    });

    overlay.hint.classList.add("visible");
    overlay.hintTimer = setTimeout(() => overlay.hint.classList.remove("visible"), 2400);
    state.overlay = overlay;
    overlay.close.focus({ preventScroll: true });
    return overlay;
  }

  function showToast(message, duration) {
    if (!state.overlay) return;
    clearTimeout(state.overlay.toastTimer);
    state.overlay.toast.textContent = message;
    state.overlay.toast.classList.add("visible");
    state.overlay.toastTimer = setTimeout(() => {
      if (state.overlay) state.overlay.toast.classList.remove("visible");
    }, duration || 1300);
  }

  function setImageWithFallback(item, renderToken) {
    if (!state.overlay) return;
    const image = state.overlay.image;
    const candidates = Array.from(
      new Set([item.previewUrl, ...(item.imageCandidates || [])].filter(Boolean))
    );
    let fallbackIndex = 0;

    image.classList.add("switching");
    image.alt = item.altText || "Pinterest image";

    function applyCandidate(index) {
      if (!state.overlay || state.overlay.renderToken !== renderToken) return;
      const candidate = candidates[index];
      if (!candidate) {
        image.classList.remove("switching");
        showToast("This image could not be loaded");
        return;
      }
      fallbackIndex = index;
      image.src = candidate;
    }

    image.onload = () => {
      if (!state.overlay || state.overlay.renderToken !== renderToken) return;
      requestAnimationFrame(() => image.classList.remove("switching"));

      const best = Core.bestImageCandidate(item);
      if (best && image.src !== best) {
        const upgrade = new Image();
        upgrade.onload = () => {
          if (state.overlay && state.overlay.renderToken === renderToken) {
            image.src = best;
          }
        };
        upgrade.src = best;
      }
    };

    image.onerror = () => applyCandidate(fallbackIndex + 1);
    applyCandidate(0);
  }

  function preloadAdjacent(queue, index) {
    for (const adjacentIndex of [index - 1, index + 1]) {
      const item = queue[adjacentIndex];
      const url = Core.bestImageCandidate(item);
      if (!url) continue;
      const preload = new Image();
      preload.src = url;
    }
  }

  function renderCurrent() {
    const overlay = state.overlay;
    const queue = activeQueue();
    const item = queue[state.activeIndex];
    if (!overlay || !item) return;

    overlay.renderToken += 1;
    overlay.mode.textContent = modeLabel();
    overlay.counter.textContent = `${state.activeIndex + 1} / ${queue.length}`;
    overlay.image.dataset.pinId = item.id;
    setImageWithFallback(item, overlay.renderToken);
    preloadAdjacent(queue, state.activeIndex);
    schedulePersist();
  }

  function openOverlay(index, stage, contextLabel) {
    state.smartStage = stage || (state.mode === "related" ? "related" : "source");
    state.galleryContextLabel =
      contextLabel ||
      (state.smartStage === "related" ? "Related to this Pin" : sourceContextLabel());
    const queue = activeQueue();
    if (!queue.length) return false;

    state.sourceScrollY = window.scrollY;
    state.activeIndex = Math.min(Math.max(Number(index) || 0, 0), queue.length - 1);
    if (!state.overlay) createOverlay();
    renderCurrent();
    return true;
  }

  function findLiveAnchor(item) {
    if (!item) return null;
    return Array.from(document.querySelectorAll('a[href*="/pin/"]')).find((anchor) => {
      const parsed = Core.parsePinUrl(anchor.href, location.href);
      return parsed && parsed.id === item.id && anchor.querySelector("img");
    }) || null;
  }

  function closeOverlay(options) {
    const overlay = state.overlay;
    if (!overlay) return;

    const restore = !options || options.restore !== false;
    const queue = activeQueue();
    const item = queue[state.activeIndex];
    const previousFocus = overlay.previousFocus;

    clearTimeout(overlay.hintTimer);
    clearTimeout(overlay.toastTimer);
    overlay.host.remove();
    state.overlay = null;

    if (restore) {
      const liveAnchor = state.smartStage === "source" ? findLiveAnchor(item) : null;
      if (liveAnchor) {
        liveAnchor.scrollIntoView({ block: "center", inline: "nearest" });
      } else {
        window.scrollTo({ top: state.sourceScrollY, behavior: "auto" });
      }

      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    }
  }

  function navigateToPin(item) {
    if (!item) return;

    schedulePersist();
    const current = currentPinReference();
    if (current && current.id === item.id) {
      closeOverlay({ restore: false });
      return;
    }

    closeOverlay({ restore: false });
    const anchor = findLiveAnchor(item);
    if (!anchor) {
      location.assign(item.pinUrl);
      return;
    }

    state.bypassPinId = item.id;
    const previousUrl = location.href;
    anchor.click();

    setTimeout(() => {
      if (location.href === previousUrl) location.assign(item.pinUrl);
    }, 850);
  }

  function openCurrentPin() {
    const item = activeQueue()[state.activeIndex];
    navigateToPin(item);
  }

  function queueLengthForStage(stage) {
    return stage === "related" ? state.relatedQueue.length : state.sourceQueue.length;
  }

  async function waitForQueueGrowth(stage, oldLength) {
    const deadline = Date.now() + LOAD_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(120);
      scanPage({ force: true });
      if (queueLengthForStage(stage) > oldLength) return true;
    }
    return false;
  }

  async function loadMore(stage) {
    if (state.loadPromise) return state.loadPromise;

    state.loadPromise = (async () => {
      const stageMatchesPage =
        (stage === "source" && !isPinPage()) ||
        (stage === "related" && isPinPage());
      if (!stageMatchesPage) return false;

      for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
        const previousLength = queueLengthForStage(stage);
        window.scrollBy({
          top: Math.max(500, Math.round(window.innerHeight * 0.9)),
          behavior: "auto"
        });
        if (await waitForQueueGrowth(stage, previousLength)) return true;
      }

      return false;
    })();

    try {
      return await state.loadPromise;
    } finally {
      state.loadPromise = null;
    }
  }

  function prepareRelatedQueue() {
    scanPage({ force: true });
    const current = currentPinItem();
    state.relatedQueue = Core.mergeQueue(
      current ? [current] : [],
      state.relatedQueue,
      Core.MAX_QUEUE_SIZE
    );
    return state.relatedQueue;
  }

  async function waitForPinPageAndOpen(item, options) {
    const token = ++state.navigationToken;
    const deadline = Date.now() + ROUTE_WAIT_MS;
    const advance = Boolean(options && options.advance);
    const smart = Boolean(options && options.smart);

    while (Date.now() < deadline && token === state.navigationToken) {
      const current = currentPinReference();
      if (current && (!item || current.id === item.id)) {
        const queue = prepareRelatedQueue();
        if (queue.length > 1 || Date.now() > deadline - ROUTE_WAIT_MS + 1400) {
          state.pendingNavigation = null;
          state.smartStage = "related";
          state.mode = smart ? "smart" : "related";
          const index = advance && queue.length > 1 ? 1 : 0;
          openOverlay(index, "related", "Related to this Pin");
          schedulePersist();
          return true;
        }
      }
      await sleep(140);
    }

    state.pendingNavigation = null;
    return false;
  }

  function startRelatedFromGrid(item, options) {
    state.pendingNavigation = {
      kind: options && options.smart ? "smart-related" : "related",
      item
    };
    schedulePersist();
    void waitForPinPageAndOpen(item, options);
  }

  async function transitionSmartToRelated() {
    const item = activeQueue()[state.activeIndex];
    if (!item) return;

    showToast("Loading related Pins…", 2200);
    state.pendingNavigation = { kind: "smart-related", item };
    schedulePersist();
    closeOverlay({ restore: false });

    const waiting = waitForPinPageAndOpen(item, { smart: true, advance: true });
    navigateToPin(item);
    await waiting;
  }

  async function move(direction) {
    if (!state.overlay) return;

    let queue = activeQueue();
    const proposed = state.activeIndex + direction;

    if (proposed < 0) {
      showToast("Start of collection");
      return;
    }

    if (proposed >= queue.length) {
      showToast("Loading more…", 2000);
      const grew = await loadMore(state.smartStage);
      queue = activeQueue();

      if (!grew || proposed >= queue.length) {
        if (state.mode === "smart" && state.smartStage === "source") {
          await transitionSmartToRelated();
        } else {
          showToast("End of collection");
        }
        return;
      }
    }

    state.activeIndex = proposed;
    renderCurrent();

    if (queue.length - state.activeIndex <= LOAD_THRESHOLD) {
      void loadMore(state.smartStage).then((grew) => {
        if (grew && state.overlay) renderCurrent();
      });
    }
  }

  function isPlainPrimaryClick(event) {
    return (
      event.button === 0 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    );
  }

  function isViewLargerControl(element) {
    const control = element && element.closest('button, [role="button"]');
    if (!control) return false;

    const label = [
      control.getAttribute("aria-label"),
      control.textContent,
      control.querySelector("img") && control.querySelector("img").alt
    ]
      .filter(Boolean)
      .join(" ");

    return /view larger|full view|enlarge/i.test(label);
  }

  function openFromPinPage() {
    const queue = prepareRelatedQueue();
    const current = currentPinItem();
    if (!current || !queue.length) return false;

    state.smartStage = "related";
    const index = queue.findIndex((item) => item.id === current.id);
    return openOverlay(
      Math.max(index, 0),
      "related",
      "Related to this Pin"
    );
  }

  function handleDocumentClick(event) {
    if (!state.enabled || state.overlay || !isPlainPrimaryClick(event)) return;
    if (!(event.target instanceof Element)) return;

    if (isViewLargerControl(event.target)) {
      if (openFromPinPage()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    if (
      event.target.closest(
        'button, input, textarea, select, [contenteditable="true"]'
      )
    ) {
      return;
    }

    const anchor = event.target.closest('a[href*="/pin/"]');
    const item = extractPinItem(anchor);
    if (!item) return;

    if (state.bypassPinId === item.id) {
      state.bypassPinId = null;
      return;
    }

    scanPage({ force: true });

    // A Pin detail page owns its recommendation grid. Old Home, Search, or
    // Board queues must never leak into this new context.
    const interaction = Core.interactionFor(state.mode, isPinPage());

    if (interaction === "related-preview") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const queue = prepareRelatedQueue();
      const index = queue.findIndex((candidate) => candidate.id === item.id);
      state.smartStage = "related";
      openOverlay(
        Math.max(index, 0),
        "related",
        "Related to this Pin"
      );
      return;
    }

    if (interaction === "navigate-related") {
      startRelatedFromGrid(item, { smart: false, advance: false });
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    state.sourceQueue = Core.mergeQueue(
      state.sourceQueue,
      [item],
      Core.MAX_QUEUE_SIZE
    );
    const index = state.sourceQueue.findIndex((candidate) => candidate.id === item.id);
    state.smartStage = "source";
    openOverlay(index, "source", sourceContextLabel());
  }

  function handleKeydown(event) {
    if (!state.overlay || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopImmediatePropagation();
      void move(event.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openCurrentPin();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeOverlay({ restore: true });
    }
  }

  function checkRoute() {
    if (location.href === state.lastUrl) return;
    state.lastUrl = location.href;

    const pin = currentPinReference();
    if (!pin) {
      state.relatedQueue = [];
      state.pinContextId = null;
      state.smartStage = "source";
    } else if (Core.relatedContextChanged(state.pinContextId, pin.id)) {
      state.pinContextId = pin.id;
      state.relatedQueue = [];
    }

    if (state.pendingNavigation && isPinPage()) {
      const pending = state.pendingNavigation;
      void waitForPinPageAndOpen(pending.item, {
        smart: pending.kind === "smart-related",
        advance: pending.kind === "smart-related"
      });
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "GET_STATE") {
      const pinCount = scanPage({ force: true });
      sendResponse({
        supported: true,
        enabled: state.enabled,
        mode: state.mode,
        pinCount
      });
      return false;
    }

    if (message.type === "SET_ENABLED") {
      state.enabled = Boolean(message.enabled);
      if (state.enabled) {
        scanPage({ force: true });
      } else {
        closeOverlay({ restore: true });
        state.pendingNavigation = null;
        state.navigationToken += 1;
      }
      safeRuntimeMessage({ type: "UPDATE_BADGE", enabled: state.enabled });
      schedulePersist();
      sendResponse({
        ok: true,
        enabled: state.enabled,
        pinCount: isPinPage() ? state.relatedQueue.length : state.sourceQueue.length
      });
      return false;
    }

    if (message.type === "SET_MODE" && Core.isValidMode(message.mode)) {
      if (state.overlay) closeOverlay({ restore: true });
      state.mode = message.mode;
      state.smartStage = message.mode === "related" ? "related" : "source";
      state.pendingNavigation = null;
      state.navigationToken += 1;
      schedulePersist();
      sendResponse({ ok: true, mode: state.mode });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes.mode) return;
    const nextMode = changes.mode.newValue;
    if (Core.isValidMode(nextMode)) state.mode = nextMode;
  });

  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("popstate", scheduleScan);

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-selected"]
  });

  chrome.storage.sync.get({ mode: "smart" }).then((settings) => {
    if (Core.isValidMode(settings.mode)) state.mode = settings.mode;
  });

  // Restore only the per-tab on/off choice. Queues deliberately start empty so
  // an older grid can never leak into a new Pin after a reload.
  safeRuntimeMessage({ type: "GET_TAB_SESSION" }).then((response) => {
    state.enabled = Boolean(response && response.session && response.session.enabled);
    if (state.enabled) scanPage({ force: true });
    safeRuntimeMessage({ type: "UPDATE_BADGE", enabled: state.enabled });
    schedulePersist();
  });
})();
