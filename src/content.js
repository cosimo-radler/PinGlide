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
    loadPromise: null,
    navigationToken: 0,
    moveToken: 0,
    imageCache: new Map(),
    savingPins: new Set(),
    savedPins: new Set()
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
      return state.relatedQueue.length;
    }

    const context = currentContextKey();
    state.pinContextId = null;
    if (context !== state.contextKey) {
      closeOverlay({ restore: false });
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
    return state.sourceQueue.length;
  }

  function scheduleScan() {
    if (state.scanTimer || document.hidden) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      checkRoute();
      scanPage();
    }, 120);
  }

  function modeLabel() {
    return state.galleryContextLabel;
  }

  function createOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
    const previousFocus = document.activeElement;
    const host = document.createElement("div");
    host.id = OVERLAY_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; }
        button { font: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        .backdrop {
          position: fixed; inset: 0; z-index: 2147483647;
          display: grid; place-items: center; overflow: hidden;
          background: rgb(18 17 16 / 96%);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #f5f1e9; animation: reveal 180ms ease-out;
        }
        @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
        @keyframes arrive { from { opacity: .6; transform: translateX(var(--entry, 0px)) scale(.995); } to { opacity: 1; transform: none; } }
        .stage { display: grid; width: 100%; height: 100%; place-items: center; padding: 80px 80px 94px; min-height: 0; }
        .image {
          display: block; max-width: min(calc(100vw - 160px), 1500px); max-height: calc(100dvh - 174px);
          border-radius: 12px; box-shadow: 0 24px 80px rgb(0 0 0 / 35%);
          object-fit: contain; cursor: zoom-in; user-select: none; -webkit-user-drag: none;
          transition: opacity 140ms ease;
        }
        .image:not([src]) { visibility: hidden; }
        .image.switching { opacity: .45; cursor: wait; }
        .image.arriving { animation: arrive 180ms ease-out; }
        .topbar { position: absolute; inset: 20px 24px auto; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
        .brand { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 650; letter-spacing: -.02em; color: #e8e3da; }
        .brand-mark { color: #ffb68f; font-size: 24px; }
        .top-actions { display: flex; gap: 10px; align-items: center; }
        .close, .nav, .save {
          display: inline-flex; align-items: center; justify-content: center; gap: 10px;
          border: 1px solid rgb(255 255 255 / 12%); background: rgb(255 255 255 / 5%); color: #f5f1e9;
          transition: background 150ms ease, transform 150ms ease, border-color 150ms ease;
        }
        .close { width: 38px; height: 38px; border-radius: 50%; font-size: 25px; font-weight: 300; }
        .nav { position: absolute; top: 50%; width: 44px; height: 54px; border-radius: 16px; font-size: 22px; margin-top: -27px; }
        .previous { left: 20px; } .next { right: 20px; }
        .save { min-height: 38px; padding: 0 14px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        .save[data-state="saved"] { background: #293c30; color: #c5e4ca; border-color: #48604d; }
        .save[data-state="saving"] { color: #ffbd98; }
        button:hover:not(:disabled) { background: rgb(255 255 255 / 13%); border-color: rgb(255 255 255 / 25%); }
        button:active:not(:disabled) { transform: scale(.95); }
        button:disabled { opacity: .4; cursor: default; }
        .save:disabled { opacity: .75; }
        button:focus-visible, .image:focus-visible { outline: 2px solid #ffbd98; outline-offset: 5px; }
        .footer { position: absolute; bottom: 19px; left: 50%; transform: translateX(-50%); display: grid; justify-items: center; gap: 11px; max-width: calc(100vw - 32px); }
        .meta { display: flex; align-items: center; gap: 12px; min-height: 28px; color: #d5cfc6; font-size: 12px; }
        .mode { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 45vw; }
        .counter { white-space: nowrap; font-variant-numeric: tabular-nums; color: #fff7e9; }
        .dot { width: 3px; height: 3px; border-radius: 50%; background: #827c73; }
        .hint { color: #a8a199; font-size: 11px; white-space: nowrap; }
        kbd { font: inherit; color: #d8d1c8; }
        .progress { width: 112px; height: 2px; border-radius: 2px; background: #3c3731; overflow: hidden; }
        .progress-fill { width: 100%; height: 100%; background: #ffb68f; transform-origin: left; transition: transform 180ms ease; }
        .toast { position: absolute; bottom: 104px; left: 50%; max-width: calc(100vw - 40px); padding: 11px 17px; border: 1px solid #635345; border-radius: 14px; background: #302820; box-shadow: 0 8px 32px #0005; color: #fff1df; font-size: 13px; line-height: 1.5; text-align: center; transform: translate(-50%, 6px); opacity: 0; transition: opacity 160ms ease, transform 160ms ease; pointer-events: none; }
        .toast.visible { opacity: 1; transform: translate(-50%, 0); }
        @media (max-width: 700px) {
          .topbar { inset: 16px 14px auto; }
          .stage { padding: 74px 14px 140px; }
          .image { max-width: calc(100vw - 28px); max-height: calc(100dvh - 214px); border-radius: 10px; }
          .nav { top: auto; bottom: 85px; height: 38px; width: 44px; border-radius: 12px; }
          .previous { left: calc(50% - 52px); } .next { right: calc(50% - 52px); }
          .toast { bottom: 136px; } .save { padding: 0 10px; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
      </style>
      <div class="backdrop" tabindex="-1" role="dialog" aria-modal="true" aria-label="PinGlide gallery" aria-describedby="gallery-hint">
        <div class="topbar">
          <div class="brand"><span class="brand-mark" aria-hidden="true">↗</span> PinGlide</div>
          <div class="top-actions">
            <button class="save" type="button" aria-keyshortcuts="m"><span class="save-label">Save to mymind</span><kbd>M</kbd></button>
            <button class="close" type="button" aria-label="Close gallery" title="Close · Esc">×</button>
          </div>
        </div>
        <div class="stage"><img class="image" tabindex="0" role="button" aria-label="Open this Pin" draggable="false" alt="" /></div>
        <button class="nav previous" type="button" aria-label="Previous image" title="Previous · ←">←</button>
        <button class="nav next" type="button" aria-label="Next image" title="Next · →">→</button>
        <div class="footer">
          <div class="meta" aria-live="polite" aria-atomic="true"><span class="mode"></span><span class="dot"></span><span class="counter"></span></div>
          <div class="progress" aria-hidden="true"><div class="progress-fill"></div></div>
          <div class="hint" id="gallery-hint"><kbd>← →</kbd> browse &nbsp;·&nbsp; <kbd>Enter</kbd> open &nbsp;·&nbsp; <kbd>M</kbd> save &nbsp;·&nbsp; <kbd>Esc</kbd> close</div>
        </div>
        <div class="toast" role="status"></div>
      </div>
    `;
    document.body.appendChild(host);
    const backgroundElements = Array.from(document.body.children).filter((element) => element !== host)
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of backgroundElements) element.inert = true;
    const overlay = { host, shadow, previousFocus, backgroundElements, renderToken: 0, toastTimer: null, displayedPinId: null };
    for (const name of ["backdrop", "close", "image", "mode", "counter", "toast", "previous", "next", "save"]) {
      overlay[name] = shadow.querySelector(`.${name}`);
    }
    overlay.close.addEventListener("click", () => closeOverlay({ restore: true }));
    overlay.image.addEventListener("click", openCurrentPin);
    overlay.previous.addEventListener("click", () => void move(-1));
    overlay.next.addEventListener("click", () => void move(1));
    overlay.save.addEventListener("click", () => void saveToMymind());
    overlay.image.addEventListener("dragstart", (event) => event.preventDefault());
    overlay.image.addEventListener("contextmenu", (event) => {
      if (overlay.displayedPinId !== activeQueue()[state.activeIndex]?.id) event.preventDefault();
    });
    overlay.backdrop.addEventListener("click", (event) => {
      if (event.target === overlay.backdrop || event.target.classList.contains("stage")) closeOverlay({ restore: true });
    });
    overlay.backdrop.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
    overlay.backdrop.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
    state.overlay = overlay;
    overlay.backdrop.focus({ preventScroll: true });
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

  function loadImage(url) {
    if (state.imageCache.has(url)) return state.imageCache.get(url).promise;
    const entry = { ready: false, promise: null };
    entry.promise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = "async";
      const timer = setTimeout(() => finish(false), 12000);
      function finish(ok) {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        entry.ready = ok;
        resolve(ok ? url : null);
      }
      image.onload = () => image.decode().then(() => finish(true), () => finish(true));
      image.onerror = () => finish(false);
      image.src = url;
    });
    state.imageCache.set(url, entry);
    while (state.imageCache.size > 12) state.imageCache.delete(state.imageCache.keys().next().value);
    return entry.promise;
  }

  async function setImageWithFallback(item, renderToken) {
    const overlay = state.overlay;
    const image = overlay.image;
    const best = Core.bestImageCandidate(item);
    const candidates = Array.from(new Set([
      ...(state.imageCache.get(best)?.ready ? [best] : []),
      item.previewUrl, ...(item.imageCandidates || [])
    ].filter(Boolean)));
    const isCurrent = () => state.overlay === overlay && overlay.renderToken === renderToken;
    image.classList.remove("arriving");
    image.classList.add("switching");
    overlay.displayedPinId = null;
    overlay.backdrop.setAttribute("aria-busy", "true");
    updateSaveButton();
    for (const candidate of candidates) {
      const loaded = await loadImage(candidate);
      if (!isCurrent()) return;
      if (!loaded) continue;
      image.src = loaded;
      image.alt = item.altText || "Pinterest image";
      overlay.displayedPinId = item.id;
      image.classList.remove("switching");
      image.classList.add("arriving");
      overlay.backdrop.setAttribute("aria-busy", "false");
      updateSaveButton();
      if (best && best !== loaded) {
        const upgraded = await loadImage(best);
        if (upgraded && isCurrent()) image.src = upgraded;
      }
      return;
    }
    if (isCurrent()) {
      image.removeAttribute("src");
      image.classList.remove("switching");
      overlay.backdrop.setAttribute("aria-busy", "false");
      showToast("This image could not be loaded. Use → to keep browsing.", 3000);
    }
  }

  function preloadAdjacent(queue, index) {
    if (navigator.connection?.saveData) return;
    for (const offset of [-1, 1, 2]) {
      const url = Core.bestImageCandidate(queue[index + offset]);
      if (url) void loadImage(url);
    }
  }

  function updateSaveButton() {
    const overlay = state.overlay;
    const item = activeQueue()[state.activeIndex];
    if (!overlay || !item) return;
    const saving = state.savingPins.has(item.id);
    const saved = state.savedPins.has(item.id);
    overlay.save.dataset.state = saving ? "saving" : saved ? "saved" : "ready";
    overlay.save.disabled = saving || overlay.displayedPinId !== item.id;
    overlay.shadow.querySelector(".save-label").textContent = saving ? "Saving…" : saved ? "Saved to mymind ✓" : "Save to mymind";
  }

  async function saveToMymind() {
    const overlay = state.overlay;
    const item = activeQueue()[state.activeIndex];
    if (!overlay || !item || state.savingPins.has(item.id)) return;
    if (overlay.displayedPinId !== item.id) {
      showToast("Let this image finish loading, then press M.", 2500);
      return;
    }
    if (state.savedPins.has(item.id)) {
      showToast("Already saved to mymind");
      return;
    }
    state.savingPins.add(item.id);
    updateSaveButton();
    const response = await safeRuntimeMessage({
      type: "SAVE_TO_MYMIND", pinUrl: item.pinUrl,
      imageUrl: overlay.image.currentSrc || overlay.image.src, altText: item.altText
    });
    state.savingPins.delete(item.id);
    if (response?.ok) state.savedPins.add(item.id);
    updateSaveButton();
    if (state.overlay !== overlay || activeQueue()[state.activeIndex]?.id !== item.id) return;
    const errors = {
      permission: "Connect mymind in PinGlide Settings, then press M again.",
      signin: "Sign in at access.mymind.com, then press M again.",
      subscription: "Check your mymind subscription to continue saving.",
      network: "Save could not be confirmed. Check mymind before trying again.",
      invalid: "This image cannot be saved here. Try the image’s right-click menu.",
      service: "mymind could not save this image. Try its right-click menu."
    };
    showToast(response?.ok ? (response.alreadySaved ? "Already in your mind ✓" : "Saved to your mind ✓") :
      (errors[response?.code] || "PinGlide could not connect. Reload this page and try again."), response?.ok ? 1800 : 5500);
  }

  function updateOverlayMeta() {
    const overlay = state.overlay;
    const queue = activeQueue();
    if (!overlay) return;
    overlay.mode.textContent = modeLabel();
    overlay.counter.textContent = `${state.activeIndex + 1} / ${queue.length}`;
    overlay.previous.disabled = state.activeIndex <= 0;
    overlay.shadow.querySelector(".progress-fill").style.transform = `scaleX(${(state.activeIndex + 1) / Math.max(1, queue.length)})`;
  }

  function renderCurrent(direction = 0) {
    const overlay = state.overlay;
    const queue = activeQueue();
    const item = queue[state.activeIndex];
    if (!overlay || !item) return;
    overlay.renderToken += 1;
    updateOverlayMeta();
    clearTimeout(overlay.toastTimer);
    overlay.toast.classList.remove("visible");
    overlay.image.dataset.pinId = item.id;
    overlay.image.style.setProperty("--entry", `${direction * 8}px`);
    void setImageWithFallback(item, overlay.renderToken);
    preloadAdjacent(queue, state.activeIndex);
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

    clearTimeout(overlay.toastTimer);
    overlay.host.remove();
    for (const { element, inert } of overlay.backgroundElements) element.inert = inert;
    state.overlay = null;
    state.moveToken += 1;

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
    if (state.overlay?.displayedPinId === item?.id) navigateToPin(item);
  }

  function queueLengthForStage(stage) {
    return stage === "related" ? state.relatedQueue.length : state.sourceQueue.length;
  }

  async function waitForQueueGrowth(stage, oldLength, overlay, context) {
    const deadline = Date.now() + LOAD_WAIT_MS;
    while (Date.now() < deadline) {
      await sleep(120);
      if (state.overlay !== overlay || !state.enabled || currentContextKey() !== context) return false;
      scanPage({ force: true });
      if (queueLengthForStage(stage) > oldLength) return true;
    }
    return false;
  }

  async function loadMore(stage) {
    if (state.loadPromise) return state.loadPromise;

    const overlay = state.overlay;
    const context = currentContextKey();
    state.loadPromise = (async () => {
      const stageMatchesPage =
        (stage === "source" && !isPinPage()) ||
        (stage === "related" && isPinPage());
      if (!stageMatchesPage) return false;

      for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
        if (!overlay || state.overlay !== overlay || !state.enabled || currentContextKey() !== context) return false;
        const previousLength = queueLengthForStage(stage);
        window.scrollBy({
          top: Math.max(500, Math.round(window.innerHeight * 0.9)),
          behavior: "auto"
        });
        if (await waitForQueueGrowth(stage, previousLength, overlay, context)) return true;
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

    while (state.enabled && Date.now() < deadline && token === state.navigationToken) {
      const current = currentPinReference();
      if (current && (!item || current.id === item.id)) {
        const queue = prepareRelatedQueue();
        if (queue.length > 1 || Date.now() > deadline - ROUTE_WAIT_MS + 1400) {
          state.pendingNavigation = null;
          state.smartStage = "related";
          state.mode = smart ? "smart" : "related";
          const index = advance && queue.length > 1 ? 1 : 0;
          openOverlay(index, "related", "Related to this Pin");
          return true;
        }
      }
      await sleep(140);
    }

    if (token === state.navigationToken) state.pendingNavigation = null;
    return false;
  }

  function startRelatedFromGrid(item, options) {
    state.pendingNavigation = {
      kind: options && options.smart ? "smart-related" : "related",
      item
    };
    void waitForPinPageAndOpen(item, options);
  }

  async function transitionSmartToRelated() {
    const item = activeQueue()[state.activeIndex];
    if (!item) return;

    showToast("Loading related Pins…", 2200);
    state.pendingNavigation = { kind: "smart-related", item };
    closeOverlay({ restore: false });

    const waiting = waitForPinPageAndOpen(item, { smart: true, advance: true });
    navigateToPin(item);
    await waiting;
  }

  async function move(direction) {
    if (!state.overlay) return;

    const overlay = state.overlay;
    const token = ++state.moveToken;
    let queue = activeQueue();
    const proposed = state.activeIndex + direction;

    if (proposed < 0) {
      showToast("Start of collection");
      return;
    }

    if (proposed >= queue.length) {
      showToast("Loading more…", 2000);
      const grew = await loadMore(state.smartStage);
      if (state.overlay !== overlay || token !== state.moveToken) return;
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
    renderCurrent(direction);

    if (queue.length - state.activeIndex <= LOAD_THRESHOLD) {
      void loadMore(state.smartStage).then((grew) => {
        if (grew && state.overlay === overlay) updateOverlayMeta();
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
    if (!state.overlay || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.composedPath()[0];
    if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    const overlay = state.overlay;
    if (event.key === "Tab") {
      const controls = Array.from(overlay.shadow.querySelectorAll('button:not(:disabled), [tabindex="0"]'));
      const index = controls.indexOf(overlay.shadow.activeElement);
      const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls[next]?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopImmediatePropagation();
      void move(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) void saveToMymind();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Keep native keyboard activation for Close, Previous, Next, and Save.
      if (target instanceof HTMLButtonElement) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) openCurrentPin();
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
    closeOverlay({ restore: false });

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

  function applyEnabled(enabled) {
    state.enabled = enabled !== false;
    if (state.enabled) {
      scanPage({ force: true });
    } else {
      closeOverlay({ restore: true });
      state.pendingNavigation = null;
      state.navigationToken += 1;
      state.imageCache.clear();
    }
    void safeRuntimeMessage({ type: "UPDATE_BADGE", enabled: state.enabled });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_STATE") {
      sendResponse({ supported: true, enabled: state.enabled, mode: state.mode,
        pinCount: scanPage({ force: true }) });
    }
    return false;
  });

  let settingsRevision = 0;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    settingsRevision += 1;
    if (changes.enabled) applyEnabled(changes.enabled.newValue);
  });

  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("popstate", scheduleScan);
  document.addEventListener("visibilitychange", scheduleScan);

  const observer = new MutationObserver((mutations) => {
    if (!state.enabled && !state.pendingNavigation) return;
    if (mutations.some((mutation) => mutation.target.id !== OVERLAY_ID &&
      (mutation.type !== "childList" || [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.id !== OVERLAY_ID)))) scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["aria-selected", "src", "srcset"]
  });

  // Preferences survive new tabs and browser restarts. Queues are rebuilt from
  // the current page; a previous session can never restore an unrelated grid.
  const initialRevision = settingsRevision;
  chrome.storage.sync.get({ enabled: true }).then((settings) => {
    if (initialRevision !== settingsRevision) return;
    applyEnabled(settings.enabled);
  }).catch(() => applyEnabled(true));
})();
