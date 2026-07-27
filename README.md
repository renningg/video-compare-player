# video-compare-player

[English](./README.md) | [简体中文](./README.zh-CN.md)

A framework-agnostic video quality comparison player with zero runtime dependencies. The enhanced video is the only master clock and audio source; the original video is a muted follower layer. It is designed for before/after comparisons such as upscaling, restoration, color grading, and compression.

- Native DOM: no React, Vue, Tailwind, icon library, or player SDK dependency
- Built-in SVG icons, standalone CSS, controls, and accessible labels
- ESM, CommonJS, browser IIFE global, and Web Component builds
- Complete TypeScript declarations
- Custom labels, icons, theme, classes, inline styles, attributes, and slots
- Robust handling of pause, resume, seek, loop, buffering, and rapid source changes

## Installation and entry points

```bash
npm install video-compare-player
```

ESM:

```ts
import { createVideoComparePlayer } from "video-compare-player";

const player = createVideoComparePlayer("#player", {
  enhancedSrc: "/enhanced.mp4",
  originalSrc: "/original.mp4",
  mode: "compare",
  muted: true,
  labels: {
    original: "Original",
    enhanced: "Enhanced",
  },
});
```

CommonJS:

```js
const { createVideoComparePlayer } = require("video-compare-player");
```

Use it directly in a browser. The IIFE exposes the `VideoCompare` global:

```html
<div id="player"></div>
<script src="https://unpkg.com/video-compare-player"></script>
<script>
  const player = VideoCompare.createVideoComparePlayer("#player", {
    enhancedSrc: "/enhanced.mp4",
    originalSrc: "/original.mp4",
  });
</script>
```

Import the static stylesheet separately when needed:

```ts
import "video-compare-player/style.css";
```

## Live demo

A GitHub Pages demo is published from this repository. The root page opens the interactive player demo, and a separate page shows the custom-element example.

- [Demo](https://renningg.github.io/video-compare-player/)
- [Custom element demo](https://renningg.github.io/video-compare-player/custom-element.html)

GitHub Pages is deployed by Actions after a push to `main`.

## Player API

```ts
await player.play();
player.pause();
await player.toggle();
player.seek(3.5);
player.setMode("compare");
player.setPosition(50);
player.setVolume(0.8);
player.setMuted(false);
player.setPlaybackRate(1);
player.setLoop(true);
player.setControls({ labels: true, autoHide: false });
player.setObjectFit("contain");
player.setAspectRatio("16 / 9");

const snapshot = player.getSnapshot();
const unsubscribe = player.subscribe((nextSnapshot) => {});
const enhancedVideo = player.getMediaElement("enhanced");

await player.enterFullscreen();
await player.exitFullscreen();
player.destroy();
```

`destroy()` is safe to call more than once. All other instance methods throw after destruction.

### Safe source replacement

```ts
const result = await player.setSources(
  {
    enhancedSrc: "/next-enhanced.mp4",
    originalSrc: "/next-original.mp4",
    enhancedPoster: "/next-enhanced.webp",
    originalPoster: "/next-original.webp",
  },
  {
    playback: "preserve",
    time: "reset",
    divider: "preserve",
    metadataTimeoutMs: 15_000,
  },
);

if (result.status === "ready") {
  // Metadata for the next pair is ready and matches the assigned sources.
}
```

Possible `status` values:

- `ready`: the next media pair is ready
- `superseded`: a later source update replaced this update
- `aborted`: the player was destroyed while waiting
- `error`: a media error occurred or the metadata wait timed out

Events from old media are prevented from overwriting the new state by checking both a generation and the assigned URL. Omit `enhancedPoster` or `originalPoster` to preserve the current poster; pass an empty string to remove it.

## Props

Common media and layout props:

```ts
interface VideoComparePlayerProps {
  enhancedSrc: string;
  originalSrc?: string;
  enhancedPoster?: string;
  originalPoster?: string;
  mode?: "compare" | "enhanced";
  initialPosition?: number; // 0..100
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number; // 0..1
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
  crossOrigin?: "" | "anonymous" | "use-credentials" | null;
  playsInline?: boolean;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  width?: string | number;
  height?: string | number;
  aspectRatio?: string | number;
}
```

Customization props:

- `controls`: `boolean | Partial<VideoCompareControls>`
- `labels`: override built-in accessible labels
- `icons`: provide a DOM `Node` or a factory that returns one for any icon (`play`, `pause`, `centerPlay`, `volume`, `muted`, `fullscreen`, `exitFullscreen`, `enhancedMode`, `compareMode`, `dragHandle`)
- `theme`: override theme tokens
- `className` / `classNames`: classes for the root or individual parts
- `styles`: inline styles for individual parts
- `attributes`: safe extra attributes for the root and both video elements
- `topLeftSlot`: a DOM node or mount function
- `injectStyles`: inject the bundled CSS automatically; defaults to `true`
- `styleNonce`: CSP nonce for the injected `<style>` element
- `sync`: advanced synchronization tuning

`controls: false` disables the built-in controls, click-to-play, double-click fullscreen, and keyboard controls. The object form configures `play`, `progress`, `time`, `volume`, `fullscreen`, `modeSwitch`, `centerPlayButton`, `labels`, `autoHide`, `autoHideDelay`, `clickToToggle`, and `keyboard` independently.

## Web Component

The package does not register the custom element on import:

```ts
import { defineVideoComparePlayerElement } from "video-compare-player";

defineVideoComparePlayerElement();
```

```html
<video-compare-player
  enhanced-src="/enhanced.mp4"
  original-src="/original.mp4"
  enhanced-poster="/enhanced.webp"
  original-poster="/original.webp"
  mode="compare"
  position="50"
  muted
  loop
  controls
  object-fit="contain"
  aspect-ratio="16 / 9"
></video-compare-player>
```

The attributes above can be updated dynamically. Source, mode, position, mute, loop, controls, and layout updates do not reconstruct the player. Removing `enhanced-src` destroys the current instance; adding it again creates a new one. Removing a poster attribute clears the existing poster.

When a boolean attribute is absent, the value from props or the default is used. When present, it is `true` except for the exact string `"false"`.

Use `.props` for advanced configuration and read `.player` for the instance:

```ts
const element = document.querySelector("video-compare-player");

element.props = {
  enhancedSrc: "/enhanced.mp4",
  originalSrc: "/original.mp4",
  icons: { play: customPlayIcon, centerPlay: customCenterPlayIcon },
  controls: { labels: true },
};

await element.player?.play();
```

You can set `.props` before the element is registered or connected. Media and playback props update incrementally. Structural props such as icons, labels, slots, and themes safely reconstruct the internal player.

The Web Component uses open Shadow DOM by default. To use a page-level external stylesheet, add `light-dom` and disable automatic style injection before the element first connects:

```html
<link
  rel="stylesheet"
  href="https://unpkg.com/video-compare-player/style.css"
/>
<video-compare-player
  light-dom
  inject-styles="false"
  enhanced-src="/enhanced.mp4"
></video-compare-player>
```

`light-dom`, the `inject-styles` attribute, and the `style-nonce` attribute are first-mount settings and should not be changed after connection. Changing the corresponding structural `.props` safely reconstructs the player.

## Styles and icons

Primary CSS variables:

```css
.my-player {
  --vcp-accent: #ffffff;
  --vcp-background: #090a0c;
  --vcp-text: rgba(255, 255, 255, 0.94);
  --vcp-divider: rgba(255, 255, 255, 0.95);
  --vcp-divider-shadow: 0 0 12px rgba(255, 255, 255, 0.45);
  --vcp-radius: 0px;
}
```

With Shadow DOM, use `::part()`. Available parts are `root`, `enhanced-video`, `original-layer`, `original-video`, `divider`, `handle`, `handle-visual`, `top-left`, `top-left-slot`, `labels`, `original-label`, `enhanced-label`, `controls`, `play-button`, `time`, `mute-button`, `volume-wrap`, `volume`, `progress`, `mode-switch`, `enhanced-mode-button`, `compare-mode-button`, `center-play-button`, `fullscreen-button`, `loading`, and `spinner`.

```css
video-compare-player::part(divider) {
  width: 2px;
}
```

Icons do not accept HTML strings:

```ts
const customPlayIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // ...
  return svg;
};
```

`topLeftSlot(host, { player, signal })` can mount UI from any framework. `signal` is aborted when the player is destroyed; the mount function can also return a disposer.

### CSP

`styleNonce` applies only to automatically injected `<style>` elements:

```ts
createVideoComparePlayer("#player", {
  enhancedSrc: "/enhanced.mp4",
  styleNonce: window.__CSP_NONCE__,
});
```

You can also call `injectVideoComparePlayerStyles(root, nonce)` manually. The player writes dynamic style attributes for the divider, clipping, theme, and video geometry; a nonce does not authorize those attributes. The component is incompatible with `style-src-attr 'none'`. Allow dynamic style attributes in the CSP, or evaluate using `light-dom + inject-styles="false"` to manage the static CSS yourself. A document-level stylesheet cannot cross the default Shadow DOM boundary.

## Events

All events bubble and are composed, so they can be listened to directly on the Web Component host:

- `videocompare:ready`: `{ player, enhancedVideo, originalVideo }`
- `videocompare:statechange`: `{ state, previousState }`
- `videocompare:modechange`: `{ mode, previousMode }`
- `videocompare:positionchange`: `{ position }`
- `videocompare:timeupdate`: `{ currentTime, duration }`
- `videocompare:error`: `{ error, source, nativeEvent? }`

You can also use the equivalent props: `onReady`, `onStateChange`, `onModeChange`, `onPositionChange`, `onTimeUpdate`, and `onError`; or call `player.on()`.

## Synchronization strategy

- `enhanced` is the only master clock and the only video with audio; `original` only follows.
- Both `play()` calls are issued in the same task, avoiding the fixed one-frame lag created by serial promises.
- Small drift is corrected through bounded `playbackRate` changes; large drift seeks only the follower and never interrupts the master.
- Pause, resume, seek, loop, buffering, and source changes all trigger re-alignment.
- After alignment, `requestVideoFrameCallback` confirms a decoded frame before the original layer is shown. A bounded RAF fallback is used where it is unavailable.
- At a loop boundary, the follower is temporarily hidden and realigned while the divider and master video DOM remain stable.

Two independent browser decoders cannot guarantee mathematically frame-perfect presentation for differently encoded files. The component keeps playback within its time tolerance and only reveals the follower after an aligned frame is ready to show.

Advanced consumers can use `createVideoSyncController()` or `VideoPairSynchronizer` directly. Every time-related synchronization option includes its unit in the name: `alignmentToleranceSeconds`, `resetRateThresholdSeconds`, `softDriftThresholdSeconds`, `hardDriftThresholdSeconds`, `loopBoundaryToleranceSeconds`, `checkIntervalMs`, `hardSyncCooldownMs`, `pairStartMaxWaitMs`, `pairStartRetryIntervalMs`, `alignmentTimeoutMs`, `sourcePlayRetryDelayMs`, and `loopGraceMs`. Invalid negative or non-finite values fall back to safe defaults.

## Browser support

The package targets ES2018 and supports current Chrome, Edge, Firefox, and Safari. The Web Component entry point requires Custom Elements and Shadow DOM support. Fullscreen is provided when the browser supports it. If `requestVideoFrameCallback` is unavailable, the player uses bounded RAF confirmation instead.

## Local development

```bash
npm install
npm run check
npm test
npm run test:browser
npm run pack:check
```

Build outputs:

- `dist/index.js`: ESM
- `dist/index.cjs`: CommonJS
- `dist/index.global.js` / `index.global.min.js`: browser global `VideoCompare`
- `dist/types/`: TypeScript declarations
- `dist/style.css`: standalone stylesheet

Run the examples:

```bash
npm run build
python3 -m http.server 4173
# Open http://localhost:4173/examples/
```
