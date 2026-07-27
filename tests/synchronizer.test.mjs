import assert from "node:assert/strict";
import test from "node:test";
import { VideoPairSynchronizer } from "../dist/index.js";

globalThis.HTMLMediaElement = {
  HAVE_NOTHING: 0,
  HAVE_METADATA: 1,
  HAVE_CURRENT_DATA: 2,
  HAVE_FUTURE_DATA: 3,
  HAVE_ENOUGH_DATA: 4,
};
globalThis.requestAnimationFrame = (callback) =>
  setTimeout(() => callback(performance.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

class FakeVideo extends EventTarget {
  constructor(name, calls) {
    super();
    this.name = name;
    this.calls = calls;
    this.src = `https://example.com/${name}.mp4`;
    this.currentSrc = this.src;
    this.readyState = HTMLMediaElement.HAVE_ENOUGH_DATA;
    this.duration = 10;
    this.currentTime = 0;
    this.paused = true;
    this.seeking = false;
    this.ended = false;
    this.error = null;
    this.loop = true;
    this.preload = "auto";
    this.muted = false;
    this.defaultMuted = false;
    this.playbackRate = 1;
  }

  play() {
    this.calls.push(`play:${this.name}`);
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }

  pause() {
    this.calls.push(`pause:${this.name}`);
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }

  setAttribute() {}

  requestVideoFrameCallback(callback) {
    return setTimeout(() => callback(performance.now(), {}), 0);
  }

  cancelVideoFrameCallback(id) {
    clearTimeout(id);
  }
}

test("pair playback starts master and follower in the same task", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  let visible = false;
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    onFollowerVisibilityChange: (nextVisible) => {
      visible = nextVisible;
    },
  });

  const playPromise = controller.play();
  assert.deepEqual(calls.slice(-2), ["play:enhanced", "play:original"]);
  await playPromise;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(controller.playbackState, "playing");
  assert.equal(visible, true);

  controller.pause();
  assert.equal(master.paused, true);
  assert.equal(follower.paused, true);
  assert.equal(controller.playbackState, "paused");
  controller.destroy();
});

test("disabled comparison only starts the master clock", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    enabled: false,
  });

  await controller.play();
  assert.ok(calls.includes("play:enhanced"));
  assert.equal(calls.includes("play:original"), false);
  controller.destroy();
});

test("paused source replacement settles back to paused and ignores old media events", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  const states = [];
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    onStateChange: (state) => states.push(state),
  });

  controller.updateExpectedSources(
    "https://example.com/next-enhanced.mp4",
    "https://example.com/next-original.mp4",
    { masterChanged: true, preservePlayback: false },
  );
  assert.equal(controller.playbackState, "loading");

  master.dispatchEvent(new Event("loadedmetadata"));
  follower.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(controller.playbackState, "loading");

  master.src = "https://example.com/next-enhanced.mp4";
  master.currentSrc = "https://cdn.example.com/redirected-enhanced.mp4";
  follower.src = "https://example.com/next-original.mp4";
  follower.currentSrc = "https://cdn.example.com/redirected-original.mp4";
  master.dispatchEvent(new Event("loadstart"));
  follower.dispatchEvent(new Event("loadstart"));
  master.dispatchEvent(new Event("loadedmetadata"));
  follower.dispatchEvent(new Event("loadedmetadata"));
  controller.notifySourcesAssigned();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(controller.playbackState, "paused");
  assert.equal(states.at(-1), "paused");
  assert.equal(master.paused, true);
  assert.equal(follower.paused, true);
  controller.destroy();
});

test("disabling comparison while pair start is pending resumes the master", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  follower.readyState = HTMLMediaElement.HAVE_METADATA;
  const controller = new VideoPairSynchronizer({ master, follower });

  const pendingPlay = controller.play();
  assert.equal(calls.includes("play:enhanced"), false);
  controller.setEnabled(false);
  await pendingPlay;

  assert.equal(master.paused, false);
  assert.ok(calls.includes("play:enhanced"));
  assert.equal(calls.includes("play:original"), false);
  controller.destroy();
});

test("autoplay rejection retries the synchronized pair muted", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  const originalPlay = master.play.bind(master);
  let attempts = 0;
  master.play = () => {
    attempts += 1;
    calls.push("play:enhanced");
    if (attempts === 1) {
      master.paused = true;
      const error = new Error("Autoplay is not allowed.");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
    calls.pop();
    return originalPlay();
  };
  let visible = false;
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    onFollowerVisibilityChange: (nextVisible) => {
      visible = nextVisible;
    },
  });

  await controller.play();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(master.muted, true);
  assert.equal(master.paused, false);
  assert.equal(follower.paused, false);
  assert.equal(calls.filter((call) => call === "play:enhanced").length, 2);
  assert.equal(calls.filter((call) => call === "play:original").length, 2);
  assert.equal(visible, true);
  controller.destroy();
});

test("toggle cancels a pending play request while the master is still paused", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  follower.readyState = HTMLMediaElement.HAVE_METADATA;
  const controller = new VideoPairSynchronizer({ master, follower });

  const pendingPlay = controller.play();
  await controller.toggle();
  await assert.rejects(pendingPlay, { name: "AbortError" });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(controller.isPlayingRequested, false);
  assert.equal(master.paused, true);
  assert.equal(calls.includes("play:enhanced"), false);
  controller.destroy();
});

test("preload none starts both media elements instead of waiting for future data", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  master.readyState = HTMLMediaElement.HAVE_METADATA;
  follower.readyState = HTMLMediaElement.HAVE_METADATA;
  master.preload = "none";
  follower.preload = "none";
  const controller = new VideoPairSynchronizer({ master, follower });

  await controller.play();

  assert.deepEqual(calls.slice(0, 2), ["play:enhanced", "play:original"]);
  assert.equal(controller.playbackState, "playing");
  controller.destroy();
});

test("a non-looping master returns to paused when playback ends", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    loop: false,
  });

  await controller.play();
  master.currentTime = master.duration;
  follower.currentTime = follower.duration;
  master.ended = true;
  master.paused = true;
  master.dispatchEvent(new Event("ended"));

  assert.equal(controller.playbackState, "paused");
  assert.equal(controller.isPlayingRequested, false);
  assert.equal(follower.paused, true);

  await controller.toggle();
  assert.equal(master.currentTime, 0);
  assert.equal(controller.playbackState, "playing");
  controller.destroy();
});

test("a native loop hides the stale follower and realigns it to the master", async () => {
  const calls = [];
  const master = new FakeVideo("enhanced", calls);
  const follower = new FakeVideo("original", calls);
  let visible = false;
  const controller = new VideoPairSynchronizer({
    master,
    follower,
    onFollowerVisibilityChange: (nextVisible) => {
      visible = nextVisible;
    },
  });

  await controller.play();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(visible, true);

  master.currentTime = 9.9;
  follower.currentTime = 9.9;
  master.dispatchEvent(new Event("timeupdate"));
  master.currentTime = 0;
  master.seeking = true;
  master.dispatchEvent(new Event("seeking"));
  assert.equal(visible, false);

  master.seeking = false;
  master.dispatchEvent(new Event("seeked"));
  assert.equal(follower.currentTime, 0);

  follower.dispatchEvent(new Event("seeked"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(visible, true);
  controller.destroy();
});
