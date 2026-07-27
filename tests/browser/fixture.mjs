const TAG_NAME = "video-compare-player";
const STYLE_NONCE = "vcp-browser-test";
const STYLE_MARKER = "data-video-compare-player-styles";
const MEDIA_A = "/tests/browser/media-a.mp4";
const MEDIA_B = "/tests/browser/media-b.mp4";
const MEDIA_C = "/tests/browser/media-c.mp4";

const results = [];
const policyViolations = [];
const unhandledErrors = [];

window.addEventListener("securitypolicyviolation", (event) => {
  policyViolations.push({
    directive: event.violatedDirective,
    blockedURI: event.blockedURI,
  });
});

window.addEventListener("error", (event) => {
  unhandledErrors.push(
    event.error?.stack || event.message || "Unknown window error",
  );
});

window.addEventListener("unhandledrejection", (event) => {
  unhandledErrors.push(
    event.reason instanceof Error
      ? event.reason.stack || event.reason.message
      : String(event.reason),
  );
  event.preventDefault();
});

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const equal = (actual, expected, message) => {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
};

const flush = async (turns = 4) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const test = async (name, callback) => {
  try {
    await callback();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({
      name,
      status: "failed",
      error:
        error instanceof Error ? error.stack || error.message : String(error),
    });
  }
};

const mediaStates = new WeakMap();
let nextFrameCallbackId = 1;
const frameCallbacks = new Map();

const installFakeMedia = (video) => {
  const state = {
    readyState: HTMLMediaElement.HAVE_NOTHING,
    currentSrc: "",
    duration: 12,
    currentTime: 0,
    paused: true,
    seeking: false,
    ended: false,
    error: null,
    videoWidth: 1280,
    videoHeight: 720,
    loadToken: 0,
  };
  mediaStates.set(video, state);

  Object.defineProperties(video, {
    readyState: { configurable: true, get: () => state.readyState },
    currentSrc: { configurable: true, get: () => state.currentSrc },
    duration: { configurable: true, get: () => state.duration },
    paused: { configurable: true, get: () => state.paused },
    seeking: { configurable: true, get: () => state.seeking },
    ended: { configurable: true, get: () => state.ended },
    error: { configurable: true, get: () => state.error },
    videoWidth: { configurable: true, get: () => state.videoWidth },
    videoHeight: { configurable: true, get: () => state.videoHeight },
    currentTime: {
      configurable: true,
      get: () => state.currentTime,
      set: (value) => {
        state.currentTime = Number(value) || 0;
        state.seeking = true;
        video.dispatchEvent(new Event("seeking"));
        queueMicrotask(() => {
          state.seeking = false;
          video.dispatchEvent(new Event("seeked"));
        });
      },
    },
  });

  Object.defineProperties(video, {
    load: {
      configurable: true,
      value: () => {
        const token = ++state.loadToken;
        const assignedSrc = video.src;
        state.readyState = HTMLMediaElement.HAVE_NOTHING;
        state.paused = true;
        state.ended = false;
        state.error = null;
        video.dispatchEvent(new Event("loadstart"));
        queueMicrotask(() => {
          if (token !== state.loadToken) return;
          state.currentSrc = assignedSrc;
          state.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
          video.dispatchEvent(new Event("durationchange"));
          video.dispatchEvent(new Event("loadedmetadata"));
          video.dispatchEvent(new Event("loadeddata"));
          video.dispatchEvent(new Event("canplay"));
          video.dispatchEvent(new Event("resize"));
        });
      },
    },
    play: {
      configurable: true,
      value: () => {
        if (state.readyState < HTMLMediaElement.HAVE_METADATA) video.load();
        state.paused = false;
        state.ended = false;
        queueMicrotask(() => video.dispatchEvent(new Event("playing")));
        return Promise.resolve();
      },
    },
    pause: {
      configurable: true,
      value: () => {
        const changed = !state.paused;
        state.paused = true;
        if (changed)
          queueMicrotask(() => video.dispatchEvent(new Event("pause")));
      },
    },
    requestVideoFrameCallback: {
      configurable: true,
      value: (callback) => {
        const id = nextFrameCallbackId++;
        const timeout = setTimeout(() => {
          frameCallbacks.delete(id);
          callback(performance.now(), {
            mediaTime: state.currentTime,
            presentedFrames: 1,
          });
        }, 0);
        frameCallbacks.set(id, timeout);
        return id;
      },
    },
    cancelVideoFrameCallback: {
      configurable: true,
      value: (id) => {
        const timeout = frameCallbacks.get(id);
        if (timeout !== undefined) clearTimeout(timeout);
        frameCallbacks.delete(id);
      },
    },
  });

  return video;
};

const nativeCreateElement = Document.prototype.createElement;
Document.prototype.createElement = function createElement(localName, options) {
  const element = nativeCreateElement.call(this, localName, options);
  return String(localName).toLowerCase() === "video"
    ? installFakeMedia(element)
    : element;
};

const primePlayer = async (player) => {
  player.getMediaElement("enhanced").load();
  player.getMediaElement("original").load();
  await flush();
};

const removeAndFlush = async (element) => {
  element.remove();
  await flush();
};

const createMountedElement = async ({
  enhancedSrc = MEDIA_A,
  originalSrc = MEDIA_B,
  lightDom = false,
  injectStyles = true,
} = {}) => {
  const element = document.createElement(TAG_NAME);
  element.props = {
    preload: "none",
    styleNonce: STYLE_NONCE,
    injectStyles,
  };
  if (lightDom) element.setAttribute("light-dom", "");
  if (!injectStyles) element.setAttribute("inject-styles", "false");
  element.setAttribute("enhanced-src", enhancedSrc);
  if (originalSrc) element.setAttribute("original-src", originalSrc);
  element.setAttribute("mode", "compare");
  document.querySelector("#test-root").append(element);
  await flush();
  assert(element.player, "custom element did not mount a player");
  await primePlayer(element.player);
  return element;
};

const preUpgradeElement = document.createElement(TAG_NAME);
preUpgradeElement.props = {
  enhancedSrc: MEDIA_A,
  originalSrc: MEDIA_B,
  preload: "none",
  styleNonce: STYLE_NONCE,
};
document.querySelector("#test-root").append(preUpgradeElement);

const { createVideoComparePlayer, defineVideoComparePlayerElement } =
  await import("../../dist/index.js");
defineVideoComparePlayerElement(TAG_NAME);
await customElements.whenDefined(TAG_NAME);

await test("pre-upgrade props mount exactly one player root", async () => {
  await flush();
  assert(
    preUpgradeElement.player,
    "pre-upgrade props were not replayed through the setter",
  );
  await primePlayer(preUpgradeElement.player);
  equal(
    preUpgradeElement.shadowRoot?.querySelectorAll(".vcp").length,
    1,
    "pre-upgrade element root count",
  );
  await removeAndFlush(preUpgradeElement);
  equal(
    preUpgradeElement.player,
    null,
    "pre-upgrade element should unmount after removal",
  );
});

await test("removal during slot construction leaves no detached player", async () => {
  const element = document.createElement(TAG_NAME);
  element.props = {
    enhancedSrc: MEDIA_A,
    originalSrc: MEDIA_B,
    preload: "none",
    styleNonce: STYLE_NONCE,
    topLeftSlot: () => {
      element.remove();
    },
  };
  document.querySelector("#test-root").append(element);
  await flush();
  equal(element.player, null, "construction removal left a player reference");
  equal(
    element.shadowRoot?.querySelectorAll(".vcp").length,
    0,
    "construction removal left a player root",
  );
});

await test("source and poster attributes remove and re-add without stale DOM", async () => {
  const element = await createMountedElement();
  const firstPlayer = element.player;

  element.removeAttribute("original-src");
  await flush();
  equal(
    element.player,
    firstPlayer,
    "removing original-src should not recreate the player",
  );
  equal(
    firstPlayer.compareMode,
    "enhanced",
    "removing original-src should disable compare mode",
  );

  element.setAttribute("original-src", MEDIA_C);
  await flush();
  equal(
    element.player,
    firstPlayer,
    "re-adding original-src should preserve the player",
  );
  equal(
    firstPlayer.compareMode,
    "compare",
    "re-adding original-src should restore compare mode",
  );

  element.setAttribute("enhanced-poster", "/tests/browser/poster-a.jpg");
  element.setAttribute("original-poster", "/tests/browser/poster-b.jpg");
  await flush();
  assert(
    firstPlayer.getMediaElement("enhanced").poster.endsWith("/poster-a.jpg"),
    "enhanced poster was not applied",
  );
  assert(
    firstPlayer.getMediaElement("original").poster.endsWith("/poster-b.jpg"),
    "original poster was not applied",
  );

  element.removeAttribute("enhanced-poster");
  element.removeAttribute("original-poster");
  await flush();
  equal(
    firstPlayer.getMediaElement("enhanced").hasAttribute("poster"),
    false,
    "enhanced poster should clear",
  );
  equal(
    firstPlayer.getMediaElement("original").hasAttribute("poster"),
    false,
    "original poster should clear",
  );

  element.setAttribute("enhanced-poster", "/tests/browser/poster-c.jpg");
  element.setAttribute("original-poster", "/tests/browser/poster-d.jpg");
  await flush();
  assert(
    firstPlayer.getMediaElement("enhanced").poster.endsWith("/poster-c.jpg"),
    "enhanced poster was not re-added",
  );
  assert(
    firstPlayer.getMediaElement("original").poster.endsWith("/poster-d.jpg"),
    "original poster was not re-added",
  );

  element.removeAttribute("enhanced-src");
  await flush();
  equal(
    element.player,
    null,
    "removing enhanced-src should unmount the player",
  );

  element.setAttribute("enhanced-src", MEDIA_C);
  await flush();
  assert(element.player, "re-adding enhanced-src should mount a player");
  assert(
    element.player !== firstPlayer,
    "re-adding the required source should create a fresh player",
  );
  equal(
    element.shadowRoot?.querySelectorAll(".vcp").length,
    1,
    "source re-add root count",
  );
  await primePlayer(element.player);
  await removeAndFlush(element);
});

await test("rapid A to B to A replacement follows the assigned source", async () => {
  const element = await createMountedElement();
  const player = element.player;
  const enhanced = player.getMediaElement("enhanced");

  const switchToB = player.setSources(
    { enhancedSrc: MEDIA_B, originalSrc: MEDIA_C },
    { metadataTimeoutMs: 100 },
  );
  const switchBackToA = player.setSources(
    { enhancedSrc: MEDIA_A, originalSrc: MEDIA_B },
    { metadataTimeoutMs: 100 },
  );

  assert(
    enhanced.src.endsWith(MEDIA_A),
    "rapid replacement left the intermediate source assigned",
  );
  const [firstResult, secondResult] = await Promise.all([
    switchToB,
    switchBackToA,
  ]);
  equal(firstResult.status, "superseded", "intermediate source result");
  equal(secondResult.status, "ready", "final source result");
  await removeAndFlush(element);
});

await test("mutable attributes update in place and retain playback position", async () => {
  const element = await createMountedElement();
  const player = element.player;
  const root = player.root;
  player.seek(3.25);
  await flush();

  element.setAttribute("controls", "false");
  element.setAttribute("object-fit", "cover");
  element.setAttribute("aspect-ratio", "4 / 3");
  element.setAttribute("muted", "");
  element.setAttribute("loop", "false");
  await flush();

  equal(
    element.player,
    player,
    "mutable attributes should preserve player identity",
  );
  equal(player.root, root, "mutable attributes should preserve root identity");
  equal(
    player.getMediaElement("enhanced").currentTime,
    3.25,
    "playback position changed",
  );
  equal(
    player.getMediaElement("enhanced").muted,
    true,
    "muted attribute did not apply",
  );
  equal(
    player.getMediaElement("enhanced").loop,
    false,
    "loop attribute did not apply",
  );
  equal(
    root.style.getPropertyValue("--vcp-object-fit"),
    "cover",
    "object-fit did not apply",
  );
  equal(root.style.aspectRatio, "4 / 3", "aspect-ratio did not apply");
  const controls = root.querySelector(".vcp__controls");
  assert(controls, "player controls element was not rendered");
  equal(controls.hidden, true, "controls=false did not hide controls");
  await removeAndFlush(element);
});

await test("synchronous reparent reconciles disconnected attribute changes", async () => {
  const parentA = document.createElement("section");
  const parentB = document.createElement("section");
  document.querySelector("#test-root").append(parentA, parentB);
  const element = await createMountedElement();
  parentA.append(element);
  await flush();
  const player = element.player;
  player.seek(4.5);
  await flush();

  element.remove();
  element.setAttribute("object-fit", "fill");
  element.setAttribute("muted", "");
  parentB.append(element);
  await flush();

  equal(
    element.player,
    player,
    "synchronous reparent should preserve player identity",
  );
  equal(
    player.getMediaElement("enhanced").currentTime,
    4.5,
    "reparent reset playback time",
  );
  equal(
    player.getMediaElement("enhanced").muted,
    true,
    "detached muted update was lost",
  );
  equal(
    player.root.style.getPropertyValue("--vcp-object-fit"),
    "fill",
    "detached object-fit update was lost",
  );

  await removeAndFlush(element);
  equal(
    element.player,
    null,
    "a genuinely disconnected element should unmount",
  );
  parentA.remove();
  parentB.remove();
});

await test("external player.destroy clears the element player reference", async () => {
  const element = await createMountedElement();
  const player = element.player;
  player.destroy();
  await flush();
  equal(
    element.player,
    null,
    "external destroy left a stale element.player reference",
  );
  equal(
    element.shadowRoot?.querySelectorAll(".vcp").length,
    0,
    "external destroy left a root",
  );
  await removeAndFlush(element);
});

await test("destroy completes cleanup when user callbacks throw", async () => {
  const host = document.createElement("div");
  document.querySelector("#test-root").append(host);
  const stateError = new Error("destroy state callback failed");
  const disposeError = new Error("slot disposer failed");
  const player = createVideoComparePlayer(host, {
    enhancedSrc: MEDIA_A,
    originalSrc: MEDIA_B,
    preload: "none",
    injectStyles: false,
    topLeftSlot: () => () => {
      throw disposeError;
    },
    onStateChange: ({ state }) => {
      if (state === "destroyed") throw stateError;
    },
  });
  await primePlayer(player);

  let thrown;
  try {
    player.destroy();
  } catch (error) {
    thrown = error;
  }
  equal(thrown, stateError, "destroy should rethrow the first cleanup error");
  equal(player.playbackState, "destroyed", "destroyed state was not retained");
  equal(host.querySelectorAll(".vcp").length, 0, "destroy left a root");
  equal(
    player.getMediaElement("enhanced").hasAttribute("src"),
    false,
    "destroy left the enhanced source",
  );
  equal(
    player.getMediaElement("original").hasAttribute("src"),
    false,
    "destroy left the original source",
  );
  host.remove();
});

await test("shadow styles carry the configured CSP nonce", async () => {
  const element = await createMountedElement();
  const style = element.shadowRoot?.querySelector(`style[${STYLE_MARKER}]`);
  assert(style, "shadow style was not injected");
  equal(style.nonce, STYLE_NONCE, "shadow style nonce");
  equal(
    getComputedStyle(element.player.root).position,
    "relative",
    "shadow styles did not apply",
  );
  await removeAndFlush(element);
});

await test("light DOM works with external CSS and disabled style injection", async () => {
  const element = await createMountedElement({
    lightDom: true,
    injectStyles: false,
  });
  assert(
    !element.shadowRoot,
    "light-dom element should not attach a shadow root",
  );
  equal(
    element.querySelectorAll(":scope > .vcp").length,
    1,
    "light-dom root count",
  );
  assert(
    !element.querySelector(`style[${STYLE_MARKER}]`),
    "light-dom fixture injected a style",
  );
  equal(
    getComputedStyle(element.player.root).position,
    "relative",
    "external CSS did not style light DOM",
  );
  await removeAndFlush(element);
});

await flush();
await test("CSP accepts the nonce-backed stylesheet", async () => {
  const styleElementViolations = policyViolations.filter(
    ({ directive }) =>
      directive === "style-src" || directive === "style-src-elem",
  );
  equal(
    styleElementViolations.length,
    0,
    "unexpected CSP style element violation",
  );
});

await test("lifecycle updates do not leak browser errors or rejected promises", async () => {
  equal(unhandledErrors.length, 0, "unexpected browser lifecycle error");
});

const failed = results.filter(({ status }) => status === "failed");
const output = document.querySelector("#results");
output.textContent = JSON.stringify(
  { results, policyViolations, unhandledErrors },
  null,
  2,
);
document.documentElement.dataset.vcpTestStatus =
  failed.length === 0 ? "passed" : "failed";
document.title =
  failed.length === 0 ? "VCP browser tests passed" : "VCP browser tests failed";
window.__VCP_BROWSER_RESULTS__ = {
  results,
  policyViolations,
  unhandledErrors,
};
