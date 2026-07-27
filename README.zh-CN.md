# video-compare-player

[English](./README.md) | [简体中文](./README.zh-CN.md)

框架无关、零运行时依赖的视频画质对比播放器。超分视频是唯一主时钟和唯一声音源，原视频作为静音跟随层，适合超分、修复、调色、压缩前后等对比场景。

- 原生 DOM，不依赖 React、Vue、Tailwind、图标库或播放器 SDK
- 内置 SVG 图标、独立 CSS、控制栏和可访问性文案
- 同时提供 ESM、CommonJS、浏览器 IIFE global 和 Web Component
- 完整 TypeScript 声明
- 支持自定义文案、图标、主题、class、inline style、attributes 和 slot
- 安全处理暂停、继续、seek、loop、buffer 和快速切源

## 安装和入口

```bash
npm install video-compare-player
```

ESM：

```ts
import { createVideoComparePlayer } from "video-compare-player";

const player = createVideoComparePlayer("#player", {
  enhancedSrc: "/enhanced.mp4",
  originalSrc: "/original.mp4",
  mode: "compare",
  muted: true,
  labels: {
    original: "原视频",
    enhanced: "超分效果",
  },
});
```

CommonJS：

```js
const { createVideoComparePlayer } = require("video-compare-player");
```

浏览器直接引入，导出全局变量 `VideoCompare`：

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

可单独引入静态样式：

```ts
import "video-compare-player/style.css";
```

## 在线 demo

这个仓库会通过 GitHub Pages 发布一个在线演示站。根路径打开交互播放器示例，另有一个页面展示 Web Component 示例。

- [在线 demo](https://renningg.github.io/video-compare-player/)
- [Web Component demo](https://renningg.github.io/video-compare-player/custom-element.html)

GitHub Pages 会在推送到 `main` 后由 Actions 自动部署。

## 播放器 API

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

`destroy()` 可以重复调用。销毁后，其他实例方法会抛出错误。

### 安全切换素材

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
  // 新一组媒体 metadata 已匹配。
}
```

`status` 可能是：

- `ready`：新媒体已准备好
- `superseded`：被更新的一次切源覆盖
- `aborted`：播放器在等待期间被销毁
- `error`：媒体报错或 metadata 超时

旧媒体事件通过 generation 和已赋值 URL 双重校验，不会覆盖新素材状态。`enhancedPoster` / `originalPoster` 省略时保留现有封面，传空字符串时清空。

## Props

常用媒体和布局参数：

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

自定义能力：

- `controls`: `boolean | Partial<VideoCompareControls>`
- `labels`: 覆盖内置可访问性文案
- `icons`: 为任意图标传入 DOM `Node` 或返回 `Node` 的 factory（`play`、`pause`、`centerPlay`、`volume`、`muted`、`fullscreen`、`exitFullscreen`、`enhancedMode`、`compareMode`、`dragHandle`）
- `theme`: 覆盖主题 token
- `className` / `classNames`: 根节点或各部件的 class
- `styles`: 各部件的 inline style
- `attributes`: 根节点及两个 video 的安全附加属性
- `topLeftSlot`: DOM Node 或 mount 函数
- `injectStyles`: 是否自动注入内置 CSS，默认 `true`
- `styleNonce`: 注入 `<style>` 使用的 CSP nonce
- `sync`: 高级同步参数

`controls: false` 会关闭内置控制栏、点击播放、双击全屏和键盘操作。对象形式可以独立配置 `play`、`progress`、`time`、`volume`、`fullscreen`、`modeSwitch`、`centerPlayButton`、`labels`、`autoHide`、`autoHideDelay`、`clickToToggle` 和 `keyboard`。

## Web Component

包不会在 import 时自动注册元素：

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

支持动态更新以上 attributes；源、模式、位置、静音、循环、控制栏和布局变化不会重建播放器。删除 `enhanced-src` 会销毁当前实例，重新添加后再创建。删除 poster 会清除旧封面。

布尔 attribute 缺失时使用 props 或默认值；存在时除精确字符串 `"false"` 外都视为 `true`。

高级配置通过 `.props` 传入，实例通过 `.player` 读取：

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

可以在元素注册或连接前设置 `.props`。媒体和播放类 props 会增量更新；图标、文案、slot、主题等结构类 props 变化时会安全重建内部实例。

Web Component 默认使用开放 Shadow DOM。若希望使用页面外链 CSS，必须在元素首次连接前添加 `light-dom`，并关闭自动注入：

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

`light-dom`、`inject-styles` attribute 和 `style-nonce` attribute 是首次挂载配置，连接后不要动态切换。对应的 `.props` 结构配置变化会由组件安全重建。

## 样式和图标

主要 CSS 变量：

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

Shadow DOM 下可以使用 `::part()`。可用 part 包括：`root`、`enhanced-video`、`original-layer`、`original-video`、`divider`、`handle`、`handle-visual`、`top-left`、`top-left-slot`、`labels`、`original-label`、`enhanced-label`、`controls`、`play-button`、`time`、`mute-button`、`volume-wrap`、`volume`、`progress`、`mode-switch`、`enhanced-mode-button`、`compare-mode-button`、`center-play-button`、`fullscreen-button`、`loading` 和 `spinner`。

```css
video-compare-player::part(divider) {
  width: 2px;
}
```

图标不接收 HTML 字符串：

```ts
const customPlayIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // ...
  return svg;
};
```

`topLeftSlot(host, { player, signal })` 可以挂载任意框架 UI。组件销毁时 `signal` 会 abort；mount 函数也可以返回 disposer。

### CSP

`styleNonce` 只作用于自动注入的 `<style>`：

```ts
createVideoComparePlayer("#player", {
  enhancedSrc: "/enhanced.mp4",
  styleNonce: window.__CSP_NONCE__,
});
```

也可以调用 `injectVideoComparePlayerStyles(root, nonce)` 手动注入。需要注意：播放器为了分割线、裁切、主题和视频几何会动态写入 style attribute；nonce 不会授权 style attribute。若站点设置了 `style-src-attr 'none'`，当前组件不兼容。可采用允许动态 style attribute 的 CSP，或在评估后使用 `light-dom + inject-styles="false"` 管理静态 CSS。Document 外链 CSS 无法穿透默认 Shadow DOM。

## 事件

所有事件都 bubbles 且 composed，Web Component 宿主可以直接监听：

- `videocompare:ready`: `{ player, enhancedVideo, originalVideo }`
- `videocompare:statechange`: `{ state, previousState }`
- `videocompare:modechange`: `{ mode, previousMode }`
- `videocompare:positionchange`: `{ position }`
- `videocompare:timeupdate`: `{ currentTime, duration }`
- `videocompare:error`: `{ error, source, nativeEvent? }`

也可以使用 props 中对应的 `onReady`、`onStateChange`、`onModeChange`、`onPositionChange`、`onTimeUpdate` 和 `onError`，或者调用 `player.on()`。

## 同步策略

- `enhanced` 是唯一主时钟和唯一有声音的视频，`original` 只跟随。
- 两路 `play()` 在同一任务内发出，避免 Promise 串行造成固定落后一帧。
- 小漂移使用有限的 `playbackRate` 修正；大漂移只 seek 跟随视频，不中断主视频。
- 暂停、继续、seek、loop、buffering 和切源都会重新对齐。
- 对齐后通过 `requestVideoFrameCallback` 确认画面已解码，再显示原视频层；不支持时使用有界 RAF fallback。
- 循环跳回开头时暂隐跟随层并重新对齐，分割线和主视频 DOM 保持不变。

浏览器的双解码器无法对不同编码文件承诺数学意义上的逐帧一致。组件保证时间容差内同步，并且只在已对齐帧可展示后切入跟随层。

高级使用者可以直接使用 `createVideoSyncController()` / `VideoPairSynchronizer`。同步配置中时间字段明确带单位：`alignmentToleranceSeconds`、`resetRateThresholdSeconds`、`softDriftThresholdSeconds`、`hardDriftThresholdSeconds`、`loopBoundaryToleranceSeconds`、`checkIntervalMs`、`hardSyncCooldownMs`、`pairStartMaxWaitMs`、`pairStartRetryIntervalMs`、`alignmentTimeoutMs`、`sourcePlayRetryDelayMs` 和 `loopGraceMs`。无效的负数或非有限值会回退到安全默认值。

## 浏览器支持

构建目标为 ES2018，支持现代 Chrome、Edge、Firefox 和 Safari。Web Component 入口要求浏览器支持 Custom Elements 与 Shadow DOM；全屏功能按浏览器能力提供，`requestVideoFrameCallback` 不可用时会回退到有界 RAF 确认。

## 本地开发

```bash
npm install
npm run check
npm test
npm run test:browser
npm run pack:check
```

构建产物：

- `dist/index.js`：ESM
- `dist/index.cjs`：CommonJS
- `dist/index.global.js` / `index.global.min.js`：浏览器 global `VideoCompare`
- `dist/types/`：类型声明
- `dist/style.css`：独立样式

运行示例：

```bash
npm run build
python3 -m http.server 4173
# 打开 http://localhost:4173/examples/
```
