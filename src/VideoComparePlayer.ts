import { DEFAULT_ICONS, replaceIcon } from "./icons.js";
import { injectVideoComparePlayerStyles } from "./styles.js";
import {
  DEFAULT_SYNC_TUNING,
  VideoPairSynchronizer,
} from "./VideoPairSynchronizer.js";
import type {
  VideoCompareAttributes,
  VideoCompareControls,
  VideoCompareErrorDetail,
  VideoCompareIcon,
  VideoCompareIconName,
  VideoCompareLabels,
  VideoCompareMode,
  VideoCompareModeDetail,
  VideoComparePart,
  VideoComparePlaybackState,
  VideoComparePlayerEventMap,
  VideoComparePlayerProps,
  VideoComparePositionDetail,
  VideoCompareReadyDetail,
  VideoCompareSnapshot,
  VideoCompareSourceChangeOptions,
  VideoCompareSourceChangeResult,
  VideoCompareSources,
  VideoCompareStateDetail,
  VideoCompareTheme,
  VideoCompareTimeDetail,
} from "./types.js";

const DEFAULT_POSITION = 50;
const EDGE_SAFE_DISTANCE = 6;
const EDGE_DAMPING_START = 24;
const EDGE_OVERSCROLL = 24;
const EDGE_RESISTANCE_EXPONENT = 0.5;

export const DEFAULT_LABELS: Readonly<VideoCompareLabels> = Object.freeze({
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  unmute: "Unmute",
  fullscreen: "Enter fullscreen",
  exitFullscreen: "Exit fullscreen",
  enhancedMode: "Enhanced video",
  compareMode: "Compare videos",
  original: "Original",
  enhanced: "Enhanced",
  seek: "Seek video",
  volume: "Volume",
  dragHandle: "Drag to compare video quality",
});

export const DEFAULT_CONTROLS: Readonly<VideoCompareControls> = Object.freeze({
  enabled: true,
  play: true,
  progress: true,
  time: true,
  volume: true,
  fullscreen: true,
  modeSwitch: true,
  centerPlayButton: false,
  labels: false,
  autoHide: true,
  autoHideDelay: 2200,
  clickToToggle: true,
  keyboard: true,
});

const DISABLED_CONTROLS: Readonly<VideoCompareControls> = Object.freeze({
  ...DEFAULT_CONTROLS,
  enabled: false,
  play: false,
  progress: false,
  time: false,
  volume: false,
  fullscreen: false,
  modeSwitch: false,
  centerPlayButton: false,
  labels: false,
  autoHide: false,
  clickToToggle: false,
  keyboard: false,
});

const resolveControls = (
  controls: VideoComparePlayerProps["controls"],
): VideoCompareControls => {
  const resolved =
    controls === false
      ? { ...DISABLED_CONTROLS }
      : {
          ...DEFAULT_CONTROLS,
          ...(typeof controls === "object" ? controls : {}),
        };
  if (!Number.isFinite(resolved.autoHideDelay) || resolved.autoHideDelay < 0) {
    resolved.autoHideDelay = DEFAULT_CONTROLS.autoHideDelay;
  }
  return resolved;
};

export const DEFAULT_THEME: Readonly<VideoCompareTheme> = Object.freeze({
  accentColor: "#7657ff",
  backgroundColor: "#090a0c",
  textColor: "rgba(255, 255, 255, 0.94)",
  secondaryTextColor: "rgba(255, 255, 255, 0.68)",
  controlBackground: "rgba(0, 0, 0, 0.48)",
  controlHoverBackground: "rgba(255, 255, 255, 0.16)",
  dividerColor: "rgba(255, 255, 255, 0.95)",
  dividerShadow: "0 0 12px rgba(255, 255, 255, 0.45)",
  borderRadius: "0px",
  controlRadius: "8px",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

interface CompareFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SourceTransaction {
  generation: number;
  complete: (result: VideoCompareSourceChangeResult) => void;
}

interface VideoComparePlayerElements {
  root: HTMLDivElement;
  enhancedVideo: HTMLVideoElement;
  originalLayer: HTMLDivElement;
  originalVideo: HTMLVideoElement;
  divider: HTMLDivElement;
  handle: HTMLButtonElement;
  handleVisual: HTMLSpanElement;
  controls: HTMLDivElement;
  topLeft: HTMLDivElement;
  labels: HTMLDivElement;
  playButton: HTMLButtonElement;
  time: HTMLOutputElement;
  muteButton: HTMLButtonElement;
  volumeWrap: HTMLDivElement;
  enhancedModeButton: HTMLButtonElement;
  compareModeButton: HTMLButtonElement;
  modeSwitch: HTMLDivElement;
  centerPlayButton: HTMLButtonElement;
  progress: HTMLInputElement;
  volume: HTMLInputElement;
  fullscreenButton: HTMLButtonElement;
  loading: HTMLDivElement;
  spinner: HTMLSpanElement;
  originalLabel: HTMLSpanElement;
  enhancedLabel: HTMLSpanElement;
  topLeftSlot: HTMLDivElement;
}

const THEME_PROPERTIES: Readonly<Record<keyof VideoCompareTheme, string>> =
  Object.freeze({
    accentColor: "--vcp-accent",
    backgroundColor: "--vcp-background",
    textColor: "--vcp-text",
    secondaryTextColor: "--vcp-text-secondary",
    controlBackground: "--vcp-control-background",
    controlHoverBackground: "--vcp-control-hover-background",
    dividerColor: "--vcp-divider",
    dividerShadow: "--vcp-divider-shadow",
    borderRadius: "--vcp-radius",
    controlRadius: "--vcp-control-radius",
    fontFamily: "--vcp-font",
  });

const CONTROLLED_ATTRIBUTES = new Set([
  "class",
  "style",
  "src",
  "poster",
  "controls",
  "loop",
  "muted",
  "preload",
  "playsinline",
  "crossorigin",
]);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const canonicalMediaUrl = (
  url: string | null | undefined,
  baseUrl: string,
): string => {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
};

const mediaElementMatches = (
  video: HTMLVideoElement,
  expectedUrl: string | undefined,
): boolean =>
  canonicalMediaUrl(video.src, video.ownerDocument.baseURI) ===
  canonicalMediaUrl(expectedUrl, video.ownerDocument.baseURI);

const mediaSourceAssigned = (
  video: HTMLVideoElement,
  expectedUrl: string | undefined,
): boolean =>
  canonicalMediaUrl(video.src, video.ownerDocument.baseURI) ===
  canonicalMediaUrl(expectedUrl, video.ownerDocument.baseURI);

const isDocument = (node: Node): node is Document => node.nodeType === 9;

const isShadowRoot = (node: Node): node is ShadowRoot =>
  node.nodeType === 11 && "host" in node;

const cssLength = (value: string | number): string =>
  typeof value === "number" ? `${value}px` : value;

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const applyEdgeDamping = (position: number, width: number): number => {
  const safeDistance = Math.min(EDGE_SAFE_DISTANCE, width / 2);
  const dampingStart = Math.min(EDGE_DAMPING_START, width / 2);
  const dampingRange = dampingStart - safeDistance;
  const overscrollDistance = Math.min(EDGE_OVERSCROLL, dampingStart);
  if (dampingRange <= 0) return width / 2;

  const damp = (distanceFromEdge: number): number => {
    const progress = clamp(
      (distanceFromEdge + overscrollDistance) /
        (dampingStart + overscrollDistance),
      0,
      1,
    );
    return safeDistance + dampingRange * progress ** EDGE_RESISTANCE_EXPONENT;
  };

  if (position <= dampingStart) return damp(position);
  if (position >= width - dampingStart) return width - damp(width - position);
  return clamp(position, safeDistance, width - safeDistance);
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] => {
  const element = documentRef.createElement(tag);
  element.className = className;
  return element;
};

const setPart = (element: Element, part: VideoComparePart): void => {
  element.setAttribute(
    "part",
    part.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
  );
};

const setAttributes = (
  element: HTMLElement,
  attributes: VideoCompareAttributes | undefined,
): void => {
  if (!attributes) return;
  for (const [name, value] of Object.entries(attributes)) {
    if (CONTROLLED_ATTRIBUTES.has(name.toLowerCase())) continue;
    if (value === false || value === null || value === undefined) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value === true ? "" : String(value));
    }
  }
};

const setPoster = (video: HTMLVideoElement, poster: string): void => {
  if (poster) video.poster = poster;
  else video.removeAttribute("poster");
};

const applyInlineStyles = (
  element: HTMLElement,
  styles: Record<string, string | number | null | undefined> | undefined,
): void => {
  if (!styles) return;
  for (const [name, value] of Object.entries(styles)) {
    if (value === null || value === undefined) {
      element.style.removeProperty(name);
    } else if (name.startsWith("--") || name.includes("-")) {
      element.style.setProperty(name, String(value));
    } else {
      Reflect.set(element.style, name, String(value));
    }
  }
};

const resolveContainer = (
  container: HTMLElement | ShadowRoot | string,
): HTMLElement | ShadowRoot => {
  if (typeof document === "undefined") {
    throw new Error(
      "VideoComparePlayer can only be instantiated in a DOM environment.",
    );
  }
  if (typeof container === "string") {
    const match = document.querySelector<HTMLElement>(container);
    if (!match)
      throw new Error(`VideoComparePlayer container not found: ${container}`);
    return match;
  }
  return container;
};

export class VideoComparePlayer {
  private readonly elements: VideoComparePlayerElements;

  private readonly container: HTMLElement | ShadowRoot;
  private readonly documentRef: Document;
  private readonly props: VideoComparePlayerProps;
  private readonly controlsConfig: VideoCompareControls;
  private readonly labels: VideoCompareLabels;
  private readonly icons: Record<VideoCompareIconName, VideoCompareIcon>;
  private readonly listenerDisposers: Array<() => void> = [];
  private readonly subscribers = new Set<
    (snapshot: VideoCompareSnapshot) => void
  >();
  private readonly synchronizer: VideoPairSynchronizer;

  private state: VideoComparePlaybackState = "idle";
  private mode: VideoCompareMode;
  private position: number;
  private frame: CompareFrame | null = null;
  private originalFrameVisible = false;
  private destroyed = false;
  private dragging = false;
  private activePointerId: number | null = null;
  private controlsTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private sourceGeneration = 0;
  private readyGeneration = -1;
  private activeSourceTransaction: SourceTransaction | null = null;
  private slotAbortController: AbortController | null = null;
  private slotDispose: (() => void) | null = null;
  private previousBodyUserSelect = "";

  constructor(
    container: HTMLElement | ShadowRoot | string,
    props: VideoComparePlayerProps,
  ) {
    if (!props.enhancedSrc)
      throw new Error("VideoComparePlayer requires an enhancedSrc.");

    this.props = props;
    this.container = resolveContainer(container);
    this.documentRef = this.container.ownerDocument;
    this.controlsConfig = resolveControls(props.controls);
    this.labels = { ...DEFAULT_LABELS, ...props.labels };
    this.icons = { ...DEFAULT_ICONS, ...props.icons };
    this.mode = props.originalSrc ? (props.mode ?? "compare") : "enhanced";
    this.position = Number.isFinite(props.initialPosition)
      ? clamp(props.initialPosition ?? DEFAULT_POSITION, 0, 100)
      : DEFAULT_POSITION;

    if (props.injectStyles !== false) {
      const candidateRoot = this.container.getRootNode();
      const rootNode =
        isDocument(candidateRoot) || isShadowRoot(candidateRoot)
          ? candidateRoot
          : this.documentRef;
      injectVideoComparePlayerStyles(rootNode, props.styleNonce);
    }

    this.elements = this.createView();
    this.applyProps(props);
    this.assignInitialSources(props);

    this.synchronizer = new VideoPairSynchronizer({
      master: this.elements.enhancedVideo,
      follower: this.elements.originalVideo,
      enabled: this.mode === "compare" && Boolean(props.originalSrc),
      loop: props.loop ?? true,
      playbackRate: props.playbackRate ?? 1,
      tuning: { ...DEFAULT_SYNC_TUNING, ...props.sync },
      onFollowerVisibilityChange: (visible) => {
        this.originalFrameVisible = visible;
        this.updateComparisonVisuals();
      },
      onStateChange: (state) => this.handleStateChange(state),
      onError: (error, source, nativeEvent) =>
        this.handleError(error, source, nativeEvent),
    });
    this.state = this.synchronizer.playbackState;
    this.elements.root.dataset.state = this.state;
    const initialState = this.state;
    try {
      this.container.append(this.elements.root);
      queueMicrotask(() => {
        if (this.destroyed || this.state !== initialState) return;
        const detail: VideoCompareStateDetail = {
          state: initialState,
          previousState: "idle",
        };
        this.emit("videocompare:statechange", detail);
        this.notifySubscribers();
      });

      this.bindViewEvents();
      this.mountTopLeftSlot(props);
      this.updateModeVisuals();
      this.updateControls();
      this.updateFrame();
      this.maybeEmitReady();
    } catch (error) {
      try {
        this.destroy();
      } catch {
        // Preserve the construction error after best-effort cleanup.
      }
      throw error;
    }

    if (props.autoplay) {
      queueMicrotask(() => {
        if (!this.destroyed) void this.play().catch(() => undefined);
      });
    }
  }

  get root(): HTMLDivElement {
    return this.elements.root;
  }

  get playbackState(): VideoComparePlaybackState {
    return this.state;
  }

  get compareMode(): VideoCompareMode {
    return this.mode;
  }

  get comparePosition(): number {
    return this.position;
  }

  play(): Promise<void> {
    this.assertActive();
    this.showControls();
    return this.synchronizer.play().finally(() => this.scheduleControlsHide());
  }

  pause(): void {
    this.assertActive();
    this.synchronizer.pause();
    this.showControls();
  }

  toggle(): Promise<void> {
    this.assertActive();
    return this.synchronizer.toggle();
  }

  seek(seconds: number): void {
    this.synchronizer.seek(seconds);
    this.updateTimeDisplay();
  }

  setMode(mode: VideoCompareMode): void {
    this.assertActive();
    if (mode !== "compare" && mode !== "enhanced") return;
    const nextMode =
      mode === "compare" && !this.elements.originalVideo.src
        ? "enhanced"
        : mode;
    if (nextMode === this.mode) return;
    const previousMode = this.mode;
    this.mode = nextMode;
    this.synchronizer.setEnabled(nextMode === "compare");
    this.updateModeVisuals();
    const detail: VideoCompareModeDetail = { mode: nextMode, previousMode };
    this.emit("videocompare:modechange", detail);
    this.notifySubscribers();
  }

  setPosition(position: number): void {
    this.assertActive();
    if (!Number.isFinite(position)) return;
    const nextPosition = clamp(position, 0, 100);
    if (Math.abs(nextPosition - this.position) < 0.001) return;
    this.position = nextPosition;
    this.updatePositionAccessibility();
    this.updateComparisonVisuals();
    const detail: VideoComparePositionDetail = { position: nextPosition };
    this.emit("videocompare:positionchange", detail);
    this.notifySubscribers();
  }

  setVolume(volume: number): void {
    this.assertActive();
    if (!Number.isFinite(volume)) return;
    const nextVolume = clamp(volume, 0, 1);
    this.elements.enhancedVideo.volume = nextVolume;
    if (nextVolume > 0 && this.elements.enhancedVideo.muted) {
      this.elements.enhancedVideo.muted = false;
    }
    this.updateVolumeControls();
  }

  setMuted(muted: boolean): void {
    this.assertActive();
    this.elements.enhancedVideo.muted = muted;
    this.updateVolumeControls();
  }

  setPlaybackRate(rate: number): void {
    this.assertActive();
    this.synchronizer.setPlaybackRate(rate);
    this.notifySubscribers();
  }

  setLoop(loop: boolean): void {
    this.assertActive();
    this.synchronizer.setLoop(loop);
  }

  setControls(controls: boolean | Partial<VideoCompareControls>): void {
    this.assertActive();
    const next = resolveControls(controls);
    Object.assign(this.controlsConfig, next);
    this.showControls();
    this.updateModeVisuals();
  }

  setObjectFit(
    objectFit: NonNullable<VideoComparePlayerProps["objectFit"]>,
  ): void {
    this.assertActive();
    if (
      objectFit !== "contain" &&
      objectFit !== "cover" &&
      objectFit !== "fill" &&
      objectFit !== "none" &&
      objectFit !== "scale-down"
    )
      return;
    this.elements.root.style.setProperty("--vcp-object-fit", objectFit);
    this.updateFrame();
  }

  setAspectRatio(aspectRatio: string | number): void {
    this.assertActive();
    if (typeof aspectRatio === "number" && !Number.isFinite(aspectRatio))
      return;
    this.elements.root.style.aspectRatio = String(aspectRatio);
    this.updateFrame();
  }

  async setSources(
    sources: VideoCompareSources,
    options: VideoCompareSourceChangeOptions = {},
  ): Promise<VideoCompareSourceChangeResult> {
    this.assertActive();
    if (!sources.enhancedSrc)
      throw new Error("setSources requires an enhancedSrc.");

    const master = this.elements.enhancedVideo;
    const follower = this.elements.originalVideo;
    const oldTime = master.currentTime;
    const oldDuration = master.duration;
    const wasPlaying = this.synchronizer.isPlayingRequested;
    const forceReload = options.forceReload ?? false;
    let masterChanged =
      forceReload || !mediaElementMatches(master, sources.enhancedSrc);
    let followerChanged =
      forceReload || !mediaElementMatches(follower, sources.originalSrc);
    if (master.error) masterChanged = true;
    if (sources.originalSrc && follower.error) followerChanged = true;

    const existingMediaReady =
      master.readyState >= HTMLMediaElement.HAVE_METADATA &&
      !master.error &&
      (!sources.originalSrc ||
        (follower.readyState >= HTMLMediaElement.HAVE_METADATA &&
          !follower.error));
    if (
      !masterChanged &&
      !followerChanged &&
      !this.activeSourceTransaction &&
      existingMediaReady
    ) {
      if (sources.enhancedPoster !== undefined)
        setPoster(master, sources.enhancedPoster);
      if (sources.originalPoster !== undefined)
        setPoster(follower, sources.originalPoster);
      if (options.divider === "center") this.setPosition(DEFAULT_POSITION);
      if (options.time === "reset" && master.currentTime !== 0) this.seek(0);
      if (options.playback === "pause") this.pause();
      else if (options.playback === "play")
        void this.play().catch(() => undefined);
      return { status: "ready", generation: this.sourceGeneration };
    }

    const generation = ++this.sourceGeneration;

    this.activeSourceTransaction?.complete({
      status: "superseded",
      generation: this.activeSourceTransaction.generation,
    });

    const shouldPlay =
      options.playback === "play" ||
      (options.playback !== "pause" && wasPlaying);
    this.synchronizer.updateExpectedSources(
      sources.enhancedSrc,
      sources.originalSrc,
      {
        masterChanged,
        preservePlayback: shouldPlay,
      },
    );

    if (
      options.divider === "center" ||
      (options.divider === undefined && masterChanged)
    ) {
      this.setPosition(DEFAULT_POSITION);
    }

    if (sources.enhancedPoster !== undefined)
      setPoster(master, sources.enhancedPoster);
    if (sources.originalPoster !== undefined)
      setPoster(follower, sources.originalPoster);

    let timeApplied = !masterChanged && options.time !== "reset";
    let masterLoadStarted = !masterChanged;
    let followerLoadStarted = !followerChanged || !sources.originalSrc;
    let settled = false;
    const eventDisposers: Array<() => void> = [];

    const resultPromise = new Promise<VideoCompareSourceChangeResult>(
      (resolve) => {
        const complete = (result: VideoCompareSourceChangeResult): void => {
          if (settled) return;
          settled = true;
          for (const dispose of eventDisposers.splice(0)) dispose();
          if (this.activeSourceTransaction?.generation === generation) {
            this.activeSourceTransaction = null;
          }
          resolve(result);
        };
        this.activeSourceTransaction = { generation, complete };

        const isCurrentGeneration = (): boolean =>
          !this.destroyed && generation === this.sourceGeneration;
        const isMasterReady = (): boolean =>
          masterLoadStarted &&
          mediaSourceAssigned(master, sources.enhancedSrc) &&
          master.readyState >= HTMLMediaElement.HAVE_METADATA;
        const isFollowerReady = (): boolean =>
          !sources.originalSrc ||
          (followerLoadStarted &&
            mediaSourceAssigned(follower, sources.originalSrc) &&
            follower.readyState >= HTMLMediaElement.HAVE_METADATA);

        const checkReady = (): void => {
          if (!isCurrentGeneration() || !isMasterReady()) return;
          if (!timeApplied) {
            timeApplied = true;
            const timeMode = options.time ?? "reset";
            const targetTime =
              timeMode === "preserve-time"
                ? oldTime
                : timeMode === "preserve-progress" &&
                    Number.isFinite(oldDuration) &&
                    oldDuration > 0
                  ? master.duration * (oldTime / oldDuration)
                  : 0;
            try {
              master.currentTime = clamp(
                targetTime,
                0,
                Number.isFinite(master.duration) ? master.duration : targetTime,
              );
            } catch {
              // Metadata is ready, but a few WebViews still reject an immediate seek. Their seeked
              // event will be handled by the synchronizer once playback starts.
            }
          }
          if (!isFollowerReady()) return;
          this.synchronizer.notifySourcesAssigned();
          this.updateFrame();
          this.maybeEmitReady();
          complete({ status: "ready", generation });
        };

        const handleLoadStart = (event: Event): void => {
          if (!isCurrentGeneration()) return;
          if (
            event.currentTarget === master &&
            mediaSourceAssigned(master, sources.enhancedSrc)
          ) {
            masterLoadStarted = true;
          } else if (
            event.currentTarget === follower &&
            sources.originalSrc &&
            mediaSourceAssigned(follower, sources.originalSrc)
          ) {
            followerLoadStarted = true;
          }
        };

        const handleError = (event: Event): void => {
          if (!isCurrentGeneration()) return;
          const isMasterEvent = event.currentTarget === master;
          const eventBelongsToGeneration = isMasterEvent
            ? masterLoadStarted &&
              mediaSourceAssigned(master, sources.enhancedSrc)
            : Boolean(
                sources.originalSrc &&
                followerLoadStarted &&
                mediaSourceAssigned(follower, sources.originalSrc),
              );
          if (!eventBelongsToGeneration) return;
          const source = isMasterEvent ? "enhanced" : "original";
          const error = new Error(`The ${source} video could not be loaded.`);
          complete({ status: "error", generation, error });
        };

        const listen = (
          target: HTMLVideoElement,
          type: string,
          listener: EventListener,
        ): void => {
          target.addEventListener(type, listener);
          eventDisposers.push(() => target.removeEventListener(type, listener));
        };
        listen(master, "loadstart", handleLoadStart);
        listen(master, "loadedmetadata", checkReady);
        listen(master, "loadeddata", checkReady);
        listen(master, "error", handleError);
        listen(follower, "loadstart", handleLoadStart);
        listen(follower, "loadedmetadata", checkReady);
        listen(follower, "loadeddata", checkReady);
        listen(follower, "error", handleError);

        const timeout = Math.max(0, options.metadataTimeoutMs ?? 15_000);
        if (timeout > 0) {
          const timeoutId = setTimeout(() => {
            if (!isCurrentGeneration()) return;
            const source = isMasterReady() ? "original" : "enhanced";
            const error = new Error(
              `Timed out waiting for the ${source} video metadata.`,
            );
            this.handleError(error, source);
            complete({ status: "error", generation, error });
          }, timeout);
          eventDisposers.push(() => clearTimeout(timeoutId));
        }

        queueMicrotask(checkReady);
      },
    );

    if (masterChanged) {
      master.src = sources.enhancedSrc;
      master.load();
    }
    if (followerChanged) {
      if (sources.originalSrc) {
        follower.src = sources.originalSrc;
      } else {
        follower.removeAttribute("src");
      }
      follower.load();
    }

    if (!sources.originalSrc && this.mode === "compare")
      this.setMode("enhanced");
    this.synchronizer.notifySourcesAssigned();
    this.updateModeVisuals();
    return resultPromise;
  }

  getSnapshot(): VideoCompareSnapshot {
    const video = this.elements.enhancedVideo;
    return {
      state: this.state,
      mode: this.mode,
      position: this.position,
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      volume: video.volume,
      muted: video.muted,
      playbackRate: video.playbackRate,
    };
  }

  subscribe(listener: (snapshot: VideoCompareSnapshot) => void): () => void {
    this.assertActive();
    this.subscribers.add(listener);
    listener(this.getSnapshot());
    return () => this.subscribers.delete(listener);
  }

  on<K extends keyof VideoComparePlayerEventMap>(
    type: K,
    listener: (event: VideoComparePlayerEventMap[K]) => void,
  ): () => void {
    this.assertActive();
    const eventListener = listener as EventListener;
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      this.elements.root.removeEventListener(type, eventListener);
    };
    this.elements.root.addEventListener(type, eventListener);
    this.listenerDisposers.push(dispose);
    return dispose;
  }

  enterFullscreen(): Promise<void> {
    this.assertActive();
    const request = this.elements.root.requestFullscreen;
    if (!request) {
      const error = new Error("Fullscreen is not supported by this browser.");
      this.handleError(error, "fullscreen");
      return Promise.reject(error);
    }
    return request.call(this.elements.root).catch((reason: unknown) => {
      const error =
        reason instanceof Error
          ? reason
          : new Error("Unable to enter fullscreen.");
      this.handleError(error, "fullscreen");
      throw error;
    });
  }

  exitFullscreen(): Promise<void> {
    this.assertActive();
    return this.documentRef.fullscreenElement
      ? this.documentRef.exitFullscreen()
      : Promise.resolve();
  }

  toggleFullscreen(): Promise<void> {
    return this.documentRef.fullscreenElement
      ? this.exitFullscreen()
      : this.enterFullscreen();
  }

  getMediaElement(side: "original" | "enhanced"): HTMLVideoElement {
    return side === "enhanced"
      ? this.elements.enhancedVideo
      : this.elements.originalVideo;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    let firstError: unknown;
    let hasError = false;
    const clean = (action: () => void): void => {
      try {
        action();
      } catch (error) {
        if (!hasError) {
          hasError = true;
          firstError = error;
        }
      }
    };

    this.sourceGeneration += 1;
    const activeTransaction = this.activeSourceTransaction;
    this.activeSourceTransaction = null;
    if (activeTransaction) {
      clean(() =>
        activeTransaction.complete({
          status: "aborted",
          generation: activeTransaction.generation,
        }),
      );
    }
    clean(() => this.endDrag());
    clean(() => this.clearControlsTimer());
    clean(() => this.resizeObserver?.disconnect());
    this.resizeObserver = null;
    clean(() => this.synchronizer.destroy());
    clean(() => this.slotAbortController?.abort());
    this.slotAbortController = null;
    clean(() => this.slotDispose?.());
    this.slotDispose = null;
    for (const dispose of this.listenerDisposers.splice(0)) clean(dispose);
    this.subscribers.clear();

    for (const video of [
      this.elements.enhancedVideo,
      this.elements.originalVideo,
    ]) {
      clean(() => video.pause());
      clean(() => video.removeAttribute("src"));
      clean(() => video.load());
    }
    clean(() => this.elements.root.remove());
    if (hasError) throw firstError;
  }

  private createView(): VideoComparePlayerElements {
    const root = createElement(this.documentRef, "div", "vcp");
    root.tabIndex = 0;
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", this.labels.compareMode);
    root.dataset.state = "idle";
    setPart(root, "root");

    const enhancedVideo = createElement(
      this.documentRef,
      "video",
      "vcp__video vcp__video--enhanced",
    );
    const originalLayer = createElement(
      this.documentRef,
      "div",
      "vcp__original-layer",
    );
    const originalVideo = createElement(
      this.documentRef,
      "video",
      "vcp__video vcp__video--original",
    );
    setPart(enhancedVideo, "enhancedVideo");
    setPart(originalLayer, "originalLayer");
    setPart(originalVideo, "originalVideo");
    originalLayer.append(originalVideo);

    const divider = createElement(this.documentRef, "div", "vcp__divider");
    const handle = createElement(
      this.documentRef,
      "button",
      "vcp__handle-hit-area",
    );
    const handleVisual = createElement(
      this.documentRef,
      "span",
      "vcp__handle-visual",
    );
    handle.type = "button";
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-label", this.labels.dragHandle);
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.setAttribute("aria-valuenow", String(Math.round(this.position)));
    handle.setAttribute("aria-valuetext", `${Math.round(this.position)}%`);
    handle.append(handleVisual);
    replaceIcon(handleVisual, this.icons.dragHandle);
    setPart(divider, "divider");
    setPart(handle, "handle");
    setPart(handleVisual, "handleVisual");

    const topLeft = createElement(this.documentRef, "div", "vcp__top-left");
    setPart(topLeft, "topLeft");
    const modeSwitch = createElement(
      this.documentRef,
      "div",
      "vcp__mode-switch",
    );
    modeSwitch.setAttribute("role", "group");
    modeSwitch.setAttribute("aria-label", this.labels.compareMode);
    const enhancedModeButton = createElement(
      this.documentRef,
      "button",
      "vcp__mode-button",
    );
    enhancedModeButton.type = "button";
    enhancedModeButton.setAttribute("aria-label", this.labels.enhancedMode);
    enhancedModeButton.title = this.labels.enhancedMode;
    replaceIcon(enhancedModeButton, this.icons.enhancedMode);
    setPart(enhancedModeButton, "enhancedModeButton");
    const compareModeButton = createElement(
      this.documentRef,
      "button",
      "vcp__mode-button",
    );
    compareModeButton.type = "button";
    compareModeButton.setAttribute("aria-label", this.labels.compareMode);
    compareModeButton.title = this.labels.compareMode;
    replaceIcon(compareModeButton, this.icons.compareMode);
    setPart(compareModeButton, "compareModeButton");
    modeSwitch.append(enhancedModeButton, compareModeButton);
    setPart(modeSwitch, "modeSwitch");

    const topLeftSlot = createElement(
      this.documentRef,
      "div",
      "vcp__top-left-slot",
    );
    topLeftSlot.hidden = true;
    setPart(topLeftSlot, "topLeftSlot");
    topLeft.append(modeSwitch, topLeftSlot);

    const labels = createElement(this.documentRef, "div", "vcp__labels");
    setPart(labels, "labels");
    const originalLabel = createElement(this.documentRef, "span", "vcp__label");
    const enhancedLabel = createElement(this.documentRef, "span", "vcp__label");
    originalLabel.textContent = this.labels.original;
    enhancedLabel.textContent = this.labels.enhanced;
    setPart(originalLabel, "originalLabel");
    setPart(enhancedLabel, "enhancedLabel");
    labels.append(originalLabel, enhancedLabel);

    const loading = createElement(this.documentRef, "div", "vcp__loading");
    const spinner = createElement(this.documentRef, "span", "vcp__spinner");
    loading.append(spinner);
    setPart(loading, "loading");
    setPart(spinner, "spinner");

    const centerPlayButton = createElement(
      this.documentRef,
      "button",
      "vcp__center-play",
    );
    centerPlayButton.type = "button";
    centerPlayButton.setAttribute("aria-label", this.labels.play);
    replaceIcon(centerPlayButton, this.icons.centerPlay);
    setPart(centerPlayButton, "centerPlayButton");

    const controls = createElement(this.documentRef, "div", "vcp__controls");
    const playButton = createElement(
      this.documentRef,
      "button",
      "vcp__icon-button",
    );
    playButton.type = "button";
    playButton.setAttribute("aria-label", this.labels.play);
    replaceIcon(playButton, this.icons.play);
    setPart(playButton, "playButton");

    const progress = createElement(
      this.documentRef,
      "input",
      "vcp__range vcp__progress",
    );
    progress.type = "range";
    progress.min = "0";
    progress.max = "1000";
    progress.step = "1";
    progress.value = "0";
    progress.setAttribute("aria-label", this.labels.seek);
    setPart(progress, "progress");

    const time = createElement(this.documentRef, "output", "vcp__time");
    time.textContent = "0:00 / 0:00";
    setPart(time, "time");

    const volumeWrap = createElement(
      this.documentRef,
      "div",
      "vcp__volume-wrap",
    );
    setPart(volumeWrap, "volumeWrap");
    const muteButton = createElement(
      this.documentRef,
      "button",
      "vcp__icon-button",
    );
    muteButton.type = "button";
    muteButton.setAttribute("aria-label", this.labels.mute);
    replaceIcon(muteButton, this.icons.volume);
    setPart(muteButton, "muteButton");
    const volume = createElement(
      this.documentRef,
      "input",
      "vcp__range vcp__volume",
    );
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.01";
    volume.setAttribute("aria-label", this.labels.volume);
    volumeWrap.append(muteButton, volume);
    setPart(volume, "volume");

    const fullscreenButton = createElement(
      this.documentRef,
      "button",
      "vcp__icon-button",
    );
    fullscreenButton.type = "button";
    fullscreenButton.setAttribute("aria-label", this.labels.fullscreen);
    replaceIcon(fullscreenButton, this.icons.fullscreen);
    setPart(fullscreenButton, "fullscreenButton");

    controls.append(playButton, progress, time, volumeWrap, fullscreenButton);
    setPart(controls, "controls");

    root.append(
      enhancedVideo,
      originalLayer,
      divider,
      handle,
      labels,
      topLeft,
      loading,
      centerPlayButton,
      controls,
    );

    return {
      root,
      enhancedVideo,
      originalLayer,
      originalVideo,
      divider,
      handle,
      handleVisual,
      controls,
      topLeft,
      labels,
      playButton,
      time,
      muteButton,
      volumeWrap,
      enhancedModeButton,
      compareModeButton,
      modeSwitch,
      centerPlayButton,
      progress,
      volume,
      fullscreenButton,
      loading,
      spinner,
      originalLabel,
      enhancedLabel,
      topLeftSlot,
    };
  }

  private applyProps(props: VideoComparePlayerProps): void {
    const { root, enhancedVideo, originalVideo } = this.elements;
    if (props.className)
      root.classList.add(...props.className.split(/\s+/).filter(Boolean));
    root.style.setProperty("--vcp-object-fit", props.objectFit ?? "contain");
    if (props.width !== undefined) root.style.width = cssLength(props.width);
    if (props.height !== undefined) root.style.height = cssLength(props.height);
    if (props.aspectRatio !== undefined)
      root.style.aspectRatio = String(props.aspectRatio);

    const theme = { ...DEFAULT_THEME, ...props.theme };
    for (const key of Object.keys(THEME_PROPERTIES) as Array<
      keyof VideoCompareTheme
    >) {
      root.style.setProperty(THEME_PROPERTIES[key], theme[key]);
    }

    const partElements = this.getPartElements();
    for (const part of Object.keys(partElements) as VideoComparePart[]) {
      const customClass = props.classNames?.[part];
      if (customClass)
        partElements[part].classList.add(
          ...customClass.split(/\s+/).filter(Boolean),
        );
      applyInlineStyles(partElements[part], props.styles?.[part]);
    }

    setAttributes(root, props.attributes?.root);
    setAttributes(enhancedVideo, props.attributes?.enhancedVideo);
    setAttributes(originalVideo, props.attributes?.originalVideo);

    const preload = props.preload ?? "auto";
    const playsInline = props.playsInline ?? true;
    for (const video of [enhancedVideo, originalVideo]) {
      video.controls = false;
      video.preload = preload;
      video.playsInline = playsInline;
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      if (playsInline) {
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "true");
        video.setAttribute("x5-playsinline", "true");
        video.setAttribute("x5-video-player-type", "h5-page");
      }
      if (props.crossOrigin === null) video.removeAttribute("crossorigin");
      else if (props.crossOrigin !== undefined)
        video.crossOrigin = props.crossOrigin;
    }
    enhancedVideo.muted = props.muted ?? false;
    enhancedVideo.volume = Number.isFinite(props.volume)
      ? clamp(props.volume ?? 1, 0, 1)
      : 1;
    originalVideo.muted = true;
    originalVideo.defaultMuted = true;
  }

  private assignInitialSources(props: VideoComparePlayerProps): void {
    const { enhancedVideo, originalVideo } = this.elements;
    enhancedVideo.src = props.enhancedSrc;
    if (props.enhancedPoster) setPoster(enhancedVideo, props.enhancedPoster);
    if (props.originalSrc) originalVideo.src = props.originalSrc;
    if (props.originalPoster) setPoster(originalVideo, props.originalPoster);
  }

  private bindViewEvents(): void {
    const {
      root,
      enhancedVideo,
      originalVideo,
      handle,
      centerPlayButton,
      playButton,
      progress,
      muteButton,
      volume,
      fullscreenButton,
      enhancedModeButton,
      compareModeButton,
    } = this.elements;

    this.listen(
      centerPlayButton,
      "click",
      () => void this.play().catch(() => undefined),
    );
    this.listen(
      playButton,
      "click",
      () => void this.toggle().catch(() => undefined),
    );
    this.listen(enhancedModeButton, "click", () => this.setMode("enhanced"));
    this.listen(compareModeButton, "click", () => this.setMode("compare"));
    this.listen(muteButton, "click", () => this.setMuted(!enhancedVideo.muted));
    this.listen(
      fullscreenButton,
      "click",
      () => void this.toggleFullscreen().catch(() => undefined),
    );

    this.listen(progress, "input", () => {
      const duration = enhancedVideo.duration;
      if (Number.isFinite(duration) && duration > 0) {
        this.seek((Number(progress.value) / Number(progress.max)) * duration);
      }
    });
    this.listen(volume, "input", () => this.setVolume(Number(volume.value)));

    this.listen(enhancedVideo, "timeupdate", this.handleTimeUpdate);
    this.listen(enhancedVideo, "durationchange", this.handleTimeUpdate);
    this.listen(enhancedVideo, "loadedmetadata", this.handleMediaReady);
    this.listen(enhancedVideo, "resize", this.updateFrame);
    this.listen(originalVideo, "loadedmetadata", this.handleMediaReady);
    this.listen(enhancedVideo, "volumechange", this.handleVolumeChange);

    this.listen(handle, "pointerdown", this.handlePointerDown);
    this.listen(handle, "pointermove", this.handlePointerMove);
    this.listen(handle, "pointerup", this.handlePointerEnd);
    this.listen(handle, "pointercancel", this.handlePointerEnd);
    this.listen(handle, "keydown", this.handleDividerKeyDown);

    this.listen(root, "pointermove", this.handleRootPointerMove);
    this.listen(root, "pointerleave", this.scheduleControlsHide);
    this.listen(root, "focusin", this.showControls);
    this.listen(root, "focusout", this.scheduleControlsHide);
    this.listen(root, "click", this.handleRootClick);
    this.listen(root, "dblclick", this.handleRootDoubleClick);
    this.listen(root, "keydown", this.handleRootKeyDown);
    this.listen(
      this.documentRef,
      "fullscreenchange",
      this.updateFullscreenControl,
    );

    const ResizeObserverConstructor =
      this.documentRef.defaultView?.ResizeObserver;
    if (ResizeObserverConstructor) {
      this.resizeObserver = new ResizeObserverConstructor(this.updateFrame);
      this.resizeObserver.observe(root);
    } else if (this.documentRef.defaultView) {
      this.listen(this.documentRef.defaultView, "resize", this.updateFrame);
    }
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void {
    target.addEventListener(type, listener);
    this.listenerDisposers.push(() =>
      target.removeEventListener(type, listener),
    );
  }

  private mountTopLeftSlot(props: VideoComparePlayerProps): void {
    const slot = props.topLeftSlot;
    if (!slot) return;
    const host = this.elements.topLeftSlot;
    host.hidden = false;
    if (typeof slot !== "function") {
      host.append(slot);
      return;
    }
    this.slotAbortController = new AbortController();
    const dispose = slot(host, {
      player: this,
      signal: this.slotAbortController.signal,
    });
    if (typeof dispose === "function") this.slotDispose = dispose;
  }

  private getPartElements(): Record<VideoComparePart, HTMLElement> {
    const elements = this.elements;
    return {
      root: elements.root,
      enhancedVideo: elements.enhancedVideo,
      originalLayer: elements.originalLayer,
      originalVideo: elements.originalVideo,
      divider: elements.divider,
      handle: elements.handle,
      handleVisual: elements.handleVisual,
      topLeft: elements.topLeft,
      labels: elements.labels,
      controls: elements.controls,
      playButton: elements.playButton,
      time: elements.time,
      muteButton: elements.muteButton,
      volumeWrap: elements.volumeWrap,
      modeSwitch: elements.modeSwitch,
      enhancedModeButton: elements.enhancedModeButton,
      compareModeButton: elements.compareModeButton,
      centerPlayButton: elements.centerPlayButton,
      progress: elements.progress,
      volume: elements.volume,
      fullscreenButton: elements.fullscreenButton,
      loading: elements.loading,
      spinner: elements.spinner,
      originalLabel: elements.originalLabel,
      enhancedLabel: elements.enhancedLabel,
      topLeftSlot: elements.topLeftSlot,
    };
  }

  private readonly handleStateChange = (
    state: VideoComparePlaybackState,
  ): void => {
    if (this.destroyed && state !== "destroyed") return;
    const previousState = this.state;
    if (previousState === state) return;
    this.state = state;
    this.elements.root.dataset.state = state;
    this.updateControls();
    if (state === "playing") this.scheduleControlsHide();
    else this.showControls();
    const detail: VideoCompareStateDetail = { state, previousState };
    this.emit("videocompare:statechange", detail);
    this.notifySubscribers();
  };

  private readonly handleError = (
    error: Error,
    source: VideoCompareErrorDetail["source"],
    nativeEvent?: Event,
  ): void => {
    const detail: VideoCompareErrorDetail = nativeEvent
      ? { error, source, nativeEvent }
      : { error, source };
    this.emit("videocompare:error", detail);
  };

  private readonly handleMediaReady = (): void => {
    this.updateFrame();
    this.maybeEmitReady();
  };

  private maybeEmitReady(): void {
    if (this.readyGeneration === this.sourceGeneration) return;
    const { enhancedVideo, originalVideo } = this.elements;
    if (enhancedVideo.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (
      this.mode === "compare" &&
      originalVideo.src &&
      originalVideo.readyState < HTMLMediaElement.HAVE_METADATA
    )
      return;
    this.readyGeneration = this.sourceGeneration;
    const detail: VideoCompareReadyDetail = {
      player: this,
      enhancedVideo,
      originalVideo,
    };
    this.emit("videocompare:ready", detail);
  }

  private readonly handleTimeUpdate = (): void => {
    this.updateTimeDisplay();
    const video = this.elements.enhancedVideo;
    const detail: VideoCompareTimeDetail = {
      currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    };
    this.emit("videocompare:timeupdate", detail);
    this.notifySubscribers();
  };

  private updateTimeDisplay(): void {
    const { enhancedVideo, progress, time } = this.elements;
    const currentTime = Number.isFinite(enhancedVideo.currentTime)
      ? enhancedVideo.currentTime
      : 0;
    const duration = Number.isFinite(enhancedVideo.duration)
      ? enhancedVideo.duration
      : 0;
    const ratio = duration > 0 ? currentTime / duration : 0;
    progress.value = String(Math.round(ratio * Number(progress.max)));
    progress.style.setProperty(
      "--vcp-range-progress",
      `${clamp(ratio * 100, 0, 100)}%`,
    );
    progress.setAttribute(
      "aria-valuetext",
      `${formatTime(currentTime)} / ${formatTime(duration)}`,
    );
    time.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  }

  private readonly handleVolumeChange = (): void => {
    this.updateVolumeControls();
    this.notifySubscribers();
  };

  private readonly updateVolumeControls = (): void => {
    const { enhancedVideo, muteButton, volume } = this.elements;
    const muted = enhancedVideo.muted || enhancedVideo.volume === 0;
    volume.value = String(muted ? 0 : enhancedVideo.volume);
    volume.style.setProperty(
      "--vcp-range-progress",
      `${(muted ? 0 : enhancedVideo.volume) * 100}%`,
    );
    muteButton.setAttribute(
      "aria-label",
      muted ? this.labels.unmute : this.labels.mute,
    );
    muteButton.title = muted ? this.labels.unmute : this.labels.mute;
    replaceIcon(muteButton, muted ? this.icons.muted : this.icons.volume);
  };

  private updateControls(): void {
    const elements = this.elements;
    const playingRequested = this.synchronizer?.isPlayingRequested ?? false;
    const controls = this.controlsConfig;
    elements.controls.hidden = !controls.enabled;
    elements.playButton.hidden = !controls.play;
    elements.progress.hidden = !controls.progress;
    elements.time.hidden = !controls.time;
    elements.muteButton.parentElement!.hidden = !controls.volume;
    elements.fullscreenButton.hidden = !controls.fullscreen;
    elements.modeSwitch.hidden =
      !controls.modeSwitch || !elements.originalVideo.src;
    elements.originalLabel.parentElement!.hidden =
      !controls.labels || this.mode !== "compare";
    elements.centerPlayButton.hidden =
      !controls.centerPlayButton || playingRequested;
    elements.loading.hidden =
      this.state !== "loading" && this.state !== "buffering";

    elements.playButton.setAttribute(
      "aria-label",
      playingRequested ? this.labels.pause : this.labels.play,
    );
    elements.playButton.title = playingRequested
      ? this.labels.pause
      : this.labels.play;
    replaceIcon(
      elements.playButton,
      playingRequested ? this.icons.pause : this.icons.play,
    );
    replaceIcon(elements.centerPlayButton, this.icons.centerPlay);
    this.updateVolumeControls();
    this.updateFullscreenControl();
  }

  private updateModeVisuals(): void {
    const compare =
      this.mode === "compare" && Boolean(this.elements.originalVideo.src);
    this.elements.root.dataset.mode = compare ? "compare" : "enhanced";
    this.elements.enhancedModeButton.setAttribute(
      "aria-pressed",
      String(!compare),
    );
    this.elements.compareModeButton.setAttribute(
      "aria-pressed",
      String(compare),
    );
    this.elements.divider.hidden = !compare || !this.frame;
    this.elements.handle.hidden = !compare || !this.frame;
    this.updateComparisonVisuals();
    this.updateControls();
  }

  private readonly updateFrame = (): void => {
    const { root, enhancedVideo } = this.elements;
    if (enhancedVideo.videoWidth <= 0 || enhancedVideo.videoHeight <= 0) return;
    const rect = root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const fit = root.style.getPropertyValue("--vcp-object-fit") || "contain";
    const stageAspect = rect.width / rect.height;
    const videoAspect = enhancedVideo.videoWidth / enhancedVideo.videoHeight;
    let frame: CompareFrame;

    if (fit === "cover" || fit === "fill") {
      frame = { left: 0, top: 0, width: rect.width, height: rect.height };
    } else {
      const useIntrinsicSize =
        fit === "none" ||
        (fit === "scale-down" &&
          enhancedVideo.videoWidth <= rect.width &&
          enhancedVideo.videoHeight <= rect.height);
      if (useIntrinsicSize) {
        const left = (rect.width - enhancedVideo.videoWidth) / 2;
        const top = (rect.height - enhancedVideo.videoHeight) / 2;
        const right = clamp(left + enhancedVideo.videoWidth, 0, rect.width);
        const bottom = clamp(top + enhancedVideo.videoHeight, 0, rect.height);
        frame = {
          left: clamp(left, 0, rect.width),
          top: clamp(top, 0, rect.height),
          width: Math.max(0, right - clamp(left, 0, rect.width)),
          height: Math.max(0, bottom - clamp(top, 0, rect.height)),
        };
      } else if (stageAspect > videoAspect) {
        const width = rect.height * videoAspect;
        frame = {
          left: (rect.width - width) / 2,
          top: 0,
          width,
          height: rect.height,
        };
      } else {
        const height = rect.width / videoAspect;
        frame = {
          left: 0,
          top: (rect.height - height) / 2,
          width: rect.width,
          height,
        };
      }
    }

    if (
      this.frame &&
      Math.abs(this.frame.left - frame.left) < 0.5 &&
      Math.abs(this.frame.top - frame.top) < 0.5 &&
      Math.abs(this.frame.width - frame.width) < 0.5 &&
      Math.abs(this.frame.height - frame.height) < 0.5
    ) {
      return;
    }
    this.frame = frame;
    this.updateModeVisuals();
  };

  private updateComparisonVisuals(): void {
    const frame = this.frame;
    const compare =
      this.mode === "compare" && Boolean(this.elements.originalVideo.src);
    if (!frame || !compare) {
      this.elements.originalLayer.style.clipPath = "inset(0 100% 0 0)";
      return;
    }

    const x = frame.left + (frame.width * this.position) / 100;
    const rightClip = this.originalFrameVisible
      ? `calc(100% - ${x}px)`
      : "100%";
    this.elements.originalLayer.style.clipPath = `inset(0 ${rightClip} 0 0)`;
    this.elements.divider.style.left = `${x}px`;
    this.elements.divider.style.top = `${frame.top}px`;
    this.elements.divider.style.height = `${frame.height}px`;
    this.elements.handle.style.left = `${x}px`;
    this.elements.handle.style.top = `${frame.top}px`;
    this.elements.handle.style.height = `${frame.height}px`;
    this.elements.divider.hidden = false;
    this.elements.handle.hidden = false;
  }

  private updatePositionFromClientX(clientX: number): void {
    const frame = this.frame;
    if (!frame || frame.width <= 0) return;
    const rootRect = this.elements.root.getBoundingClientRect();
    const localPosition = clientX - rootRect.left - frame.left;
    const dampedPosition = applyEdgeDamping(localPosition, frame.width);
    this.setPosition((dampedPosition / frame.width) * 100);
  }

  private updatePositionAccessibility(): void {
    const value = Math.round(this.position);
    this.elements.handle.setAttribute("aria-valuenow", String(value));
    this.elements.handle.setAttribute("aria-valuetext", `${value}%`);
  }

  private readonly handlePointerDown = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    this.dragging = true;
    this.activePointerId = pointerEvent.pointerId;
    this.elements.handle.setPointerCapture(pointerEvent.pointerId);
    this.previousBodyUserSelect = this.documentRef.body.style.userSelect;
    this.documentRef.body.style.userSelect = "none";
    this.updatePositionFromClientX(pointerEvent.clientX);
    this.showControls();
  };

  private readonly handlePointerMove = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    if (!this.dragging || pointerEvent.pointerId !== this.activePointerId)
      return;
    this.updatePositionFromClientX(pointerEvent.clientX);
  };

  private readonly handlePointerEnd = (event: Event): void => {
    const pointerEvent = event as PointerEvent;
    if (this.activePointerId !== pointerEvent.pointerId) return;
    this.endDrag();
  };

  private endDrag(): void {
    if (!this.dragging && this.activePointerId === null) return;
    if (
      this.activePointerId !== null &&
      this.elements.handle.hasPointerCapture(this.activePointerId)
    ) {
      this.elements.handle.releasePointerCapture(this.activePointerId);
    }
    this.dragging = false;
    this.activePointerId = null;
    this.documentRef.body.style.userSelect = this.previousBodyUserSelect;
    this.scheduleControlsHide();
  }

  private readonly handleDividerKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === "Home" || keyboardEvent.key === "End") {
      keyboardEvent.preventDefault();
      this.setPosition(keyboardEvent.key === "Home" ? 0 : 100);
      return;
    }
    if (keyboardEvent.key !== "ArrowLeft" && keyboardEvent.key !== "ArrowRight")
      return;
    keyboardEvent.preventDefault();
    const direction = keyboardEvent.key === "ArrowLeft" ? -1 : 1;
    this.setPosition(
      this.position + direction * (keyboardEvent.shiftKey ? 5 : 1),
    );
  };

  private readonly handleRootClick = (event: Event): void => {
    if (!this.controlsConfig.clickToToggle) return;
    const target = event.target as Element | null;
    if (!target || target.closest('button, input, [role="button"]')) return;
    if (
      target === this.elements.enhancedVideo ||
      target === this.elements.originalVideo ||
      target === this.elements.root
    ) {
      void this.toggle().catch(() => undefined);
    }
  };

  private readonly handleRootDoubleClick = (event: Event): void => {
    if (!this.controlsConfig.fullscreen) return;
    const target = event.target as Element | null;
    if (target?.closest("button, input")) return;
    void this.toggleFullscreen().catch(() => undefined);
  };

  private readonly handleRootKeyDown = (event: Event): void => {
    if (!this.controlsConfig.keyboard) return;
    const keyboardEvent = event as KeyboardEvent;
    const target = keyboardEvent.target as HTMLElement;
    if (target !== this.elements.root) return;
    const key = keyboardEvent.key.toLowerCase();
    if ((key === " " || key === "k") && this.controlsConfig.play) {
      keyboardEvent.preventDefault();
      void this.toggle().catch(() => undefined);
    } else if (
      (key === "arrowleft" || key === "arrowright") &&
      this.controlsConfig.progress
    ) {
      keyboardEvent.preventDefault();
      this.seek(
        this.elements.enhancedVideo.currentTime +
          (key === "arrowleft" ? -5 : 5),
      );
    } else if (key === "m" && this.controlsConfig.volume) {
      this.setMuted(!this.elements.enhancedVideo.muted);
    } else if (key === "f" && this.controlsConfig.fullscreen) {
      void this.toggleFullscreen().catch(() => undefined);
    }
  };

  private readonly handleRootPointerMove = (): void => {
    this.showControls();
    this.scheduleControlsHide();
  };

  private readonly showControls = (): void => {
    this.clearControlsTimer();
    this.elements.root.dataset.controlsHidden = "false";
  };

  private readonly scheduleControlsHide = (): void => {
    this.clearControlsTimer();
    if (
      !this.controlsConfig.autoHide ||
      !this.synchronizer.isPlayingRequested ||
      this.dragging ||
      this.elements.root.matches(":focus-within")
    ) {
      return;
    }
    this.controlsTimer = setTimeout(() => {
      this.controlsTimer = null;
      this.elements.root.dataset.controlsHidden = "true";
    }, this.controlsConfig.autoHideDelay);
  };

  private clearControlsTimer(): void {
    if (this.controlsTimer !== null) {
      clearTimeout(this.controlsTimer);
      this.controlsTimer = null;
    }
  }

  private readonly updateFullscreenControl = (): void => {
    const fullscreen =
      this.documentRef.fullscreenElement === this.elements.root;
    const label = fullscreen
      ? this.labels.exitFullscreen
      : this.labels.fullscreen;
    this.elements.fullscreenButton.setAttribute("aria-label", label);
    this.elements.fullscreenButton.title = label;
    replaceIcon(
      this.elements.fullscreenButton,
      fullscreen ? this.icons.exitFullscreen : this.icons.fullscreen,
    );
  };

  private emit<K extends keyof VideoComparePlayerEventMap>(
    type: K,
    detail: VideoComparePlayerEventMap[K]["detail"],
  ): void {
    const CustomEventConstructor =
      this.documentRef.defaultView?.CustomEvent ?? CustomEvent;
    this.elements.root.dispatchEvent(
      new CustomEventConstructor(type, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
    switch (type) {
      case "videocompare:ready":
        this.props.onReady?.(detail as VideoCompareReadyDetail);
        break;
      case "videocompare:statechange":
        this.props.onStateChange?.(detail as VideoCompareStateDetail);
        break;
      case "videocompare:modechange":
        this.props.onModeChange?.(detail as VideoCompareModeDetail);
        break;
      case "videocompare:positionchange":
        this.props.onPositionChange?.(detail as VideoComparePositionDetail);
        break;
      case "videocompare:timeupdate":
        this.props.onTimeUpdate?.(detail as VideoCompareTimeDetail);
        break;
      case "videocompare:error":
        this.props.onError?.(detail as VideoCompareErrorDetail);
        break;
    }
  }

  private notifySubscribers(): void {
    if (this.destroyed) return;
    const snapshot = this.getSnapshot();
    for (const subscriber of this.subscribers) subscriber(snapshot);
  }

  private assertActive(): void {
    if (this.destroyed)
      throw new Error("VideoComparePlayer has been destroyed.");
  }
}

export const createVideoComparePlayer = (
  container: HTMLElement | ShadowRoot | string,
  props: VideoComparePlayerProps,
): VideoComparePlayer => new VideoComparePlayer(container, props);
