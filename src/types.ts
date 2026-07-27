export type VideoCompareMode = "compare" | "enhanced";

export type VideoComparePlaybackState =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "buffering"
  | "error"
  | "destroyed";

export type VideoCompareObjectFit =
  "contain" | "cover" | "fill" | "none" | "scale-down";

export type VideoComparePart =
  | "root"
  | "enhancedVideo"
  | "originalLayer"
  | "originalVideo"
  | "divider"
  | "handle"
  | "handleVisual"
  | "topLeft"
  | "labels"
  | "controls"
  | "playButton"
  | "time"
  | "muteButton"
  | "volumeWrap"
  | "modeSwitch"
  | "enhancedModeButton"
  | "compareModeButton"
  | "centerPlayButton"
  | "progress"
  | "volume"
  | "fullscreenButton"
  | "loading"
  | "spinner"
  | "originalLabel"
  | "enhancedLabel"
  | "topLeftSlot";

export type VideoCompareIconName =
  | "play"
  | "pause"
  | "centerPlay"
  | "volume"
  | "muted"
  | "fullscreen"
  | "exitFullscreen"
  | "enhancedMode"
  | "compareMode"
  | "dragHandle";

export type VideoCompareIcon = Node | (() => Node);

export type VideoCompareSlotDispose = () => void;

export interface VideoCompareSlotContext {
  player: import("./VideoComparePlayer.js").VideoComparePlayer;
  signal: AbortSignal;
}

export type VideoCompareSlotMount = (
  host: HTMLElement,
  context: VideoCompareSlotContext,
) => void | VideoCompareSlotDispose;

export type VideoCompareSlot = Node | VideoCompareSlotMount;

export type VideoCompareInlineStyle = Record<
  string,
  string | number | null | undefined
>;

export type VideoCompareAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface VideoCompareLabels {
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  fullscreen: string;
  exitFullscreen: string;
  enhancedMode: string;
  compareMode: string;
  original: string;
  enhanced: string;
  seek: string;
  volume: string;
  dragHandle: string;
}

export interface VideoCompareControls {
  enabled: boolean;
  play: boolean;
  progress: boolean;
  time: boolean;
  volume: boolean;
  fullscreen: boolean;
  modeSwitch: boolean;
  centerPlayButton: boolean;
  labels: boolean;
  autoHide: boolean;
  autoHideDelay: number;
  clickToToggle: boolean;
  keyboard: boolean;
}

export interface VideoCompareTheme {
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  controlBackground: string;
  controlHoverBackground: string;
  dividerColor: string;
  dividerShadow: string;
  borderRadius: string;
  controlRadius: string;
  fontFamily: string;
}

export interface VideoCompareSyncTuning {
  alignmentToleranceSeconds: number;
  resetRateThresholdSeconds: number;
  softDriftThresholdSeconds: number;
  hardDriftThresholdSeconds: number;
  slowRate: number;
  fastRate: number;
  catchUpRate: number;
  catchUpFrames: number;
  checkIntervalMs: number;
  hardSyncCooldownMs: number;
  pairStartMaxWaitMs: number;
  pairStartRetryIntervalMs: number;
  alignmentTimeoutMs: number;
  sourcePlayRetryDelayMs: number;
  sourcePlayRetries: number;
  loopGraceMs: number;
  loopBoundaryToleranceSeconds: number;
}

export interface VideoCompareClassNames extends Partial<
  Record<VideoComparePart, string>
> {}

export interface VideoCompareStyles extends Partial<
  Record<VideoComparePart, VideoCompareInlineStyle>
> {}

export interface VideoCompareElementAttributes {
  root?: VideoCompareAttributes;
  enhancedVideo?: VideoCompareAttributes;
  originalVideo?: VideoCompareAttributes;
}

export interface VideoCompareReadyDetail {
  player: import("./VideoComparePlayer.js").VideoComparePlayer;
  enhancedVideo: HTMLVideoElement;
  originalVideo: HTMLVideoElement;
}

export interface VideoCompareStateDetail {
  state: VideoComparePlaybackState;
  previousState: VideoComparePlaybackState;
}

export interface VideoCompareModeDetail {
  mode: VideoCompareMode;
  previousMode: VideoCompareMode;
}

export interface VideoComparePositionDetail {
  position: number;
}

export interface VideoCompareTimeDetail {
  currentTime: number;
  duration: number;
}

export interface VideoCompareErrorDetail {
  error: Error;
  source: "enhanced" | "original" | "playback" | "fullscreen";
  nativeEvent?: Event;
}

export interface VideoComparePlayerProps {
  enhancedSrc: string;
  originalSrc?: string;
  enhancedPoster?: string;
  originalPoster?: string;
  mode?: VideoCompareMode;
  initialPosition?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  playbackRate?: number;
  preload?: "none" | "metadata" | "auto";
  crossOrigin?: "" | "anonymous" | "use-credentials" | null;
  playsInline?: boolean;
  objectFit?: VideoCompareObjectFit;
  width?: string | number;
  height?: string | number;
  aspectRatio?: string | number;
  controls?: boolean | Partial<VideoCompareControls>;
  labels?: Partial<VideoCompareLabels>;
  icons?: Partial<Record<VideoCompareIconName, VideoCompareIcon>>;
  theme?: Partial<VideoCompareTheme>;
  className?: string;
  classNames?: VideoCompareClassNames;
  styles?: VideoCompareStyles;
  attributes?: VideoCompareElementAttributes;
  topLeftSlot?: VideoCompareSlot;
  injectStyles?: boolean;
  styleNonce?: string;
  sync?: Partial<VideoCompareSyncTuning>;
  onReady?: (detail: VideoCompareReadyDetail) => void;
  onStateChange?: (detail: VideoCompareStateDetail) => void;
  onModeChange?: (detail: VideoCompareModeDetail) => void;
  onPositionChange?: (detail: VideoComparePositionDetail) => void;
  onTimeUpdate?: (detail: VideoCompareTimeDetail) => void;
  onError?: (detail: VideoCompareErrorDetail) => void;
}

export interface VideoCompareSources {
  enhancedSrc: string;
  originalSrc?: string;
  enhancedPoster?: string;
  originalPoster?: string;
}

export interface VideoCompareSourceChangeOptions {
  time?: "reset" | "preserve-time" | "preserve-progress";
  playback?: "preserve" | "pause" | "play";
  divider?: "preserve" | "center";
  forceReload?: boolean;
  metadataTimeoutMs?: number;
}

export type VideoCompareSourceChangeResult =
  | { status: "ready"; generation: number }
  | { status: "superseded" | "aborted"; generation: number }
  | { status: "error"; generation: number; error: Error };

export interface VideoCompareSnapshot {
  state: VideoComparePlaybackState;
  mode: VideoCompareMode;
  position: number;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
}

export interface VideoPairSynchronizerCallbacks {
  onFollowerVisibilityChange?: (visible: boolean) => void;
  onStateChange?: (state: VideoComparePlaybackState) => void;
  onError?: (
    error: Error,
    source: VideoCompareErrorDetail["source"],
    nativeEvent?: Event,
  ) => void;
}

export interface VideoPairSynchronizerOptions extends VideoPairSynchronizerCallbacks {
  master: HTMLVideoElement;
  follower: HTMLVideoElement;
  enabled?: boolean;
  loop?: boolean;
  playbackRate?: number;
  tuning?: Partial<VideoCompareSyncTuning>;
}

export interface VideoComparePlayerEventMap {
  "videocompare:ready": CustomEvent<VideoCompareReadyDetail>;
  "videocompare:statechange": CustomEvent<VideoCompareStateDetail>;
  "videocompare:modechange": CustomEvent<VideoCompareModeDetail>;
  "videocompare:positionchange": CustomEvent<VideoComparePositionDetail>;
  "videocompare:timeupdate": CustomEvent<VideoCompareTimeDetail>;
  "videocompare:error": CustomEvent<VideoCompareErrorDetail>;
}
