import { VideoComparePlayer } from "./VideoComparePlayer.js";
import type {
  VideoCompareMode,
  VideoCompareObjectFit,
  VideoComparePlayerProps,
  VideoCompareSources,
  VideoCompareStateDetail,
} from "./types.js";

const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined"
    ? (class {} as typeof HTMLElement)
    : HTMLElement;

const MUTABLE_PROP_KEYS = new Set<keyof VideoComparePlayerProps>([
  "enhancedSrc",
  "originalSrc",
  "enhancedPoster",
  "originalPoster",
  "mode",
  "initialPosition",
  "autoplay",
  "loop",
  "muted",
  "volume",
  "playbackRate",
  "objectFit",
  "width",
  "height",
  "aspectRatio",
  "controls",
]);

const booleanAttribute = (
  element: Element,
  name: string,
  fallback: boolean,
): boolean => {
  if (!element.hasAttribute(name)) return fallback;
  return element.getAttribute(name) !== "false";
};

const numberAttribute = (
  element: Element,
  name: string,
): number | undefined => {
  const value = element.getAttribute(name);
  if (value === null || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const cssLength = (value: string | number): string =>
  typeof value === "number" ? `${value}px` : value;

const reportLifecycleError = (error: unknown): void => {
  const globalWithReportError = globalThis as typeof globalThis & {
    reportError?: (reason: unknown) => void;
  };
  if (typeof globalWithReportError.reportError === "function") {
    globalWithReportError.reportError(error);
  } else {
    console.error(error);
  }
};

const needsRemount = (
  previous: Partial<VideoComparePlayerProps>,
  next: Partial<VideoComparePlayerProps>,
): boolean => {
  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ] as Array<keyof VideoComparePlayerProps>);
  for (const key of keys) {
    if (!MUTABLE_PROP_KEYS.has(key) && previous[key] !== next[key]) {
      return true;
    }
  }
  return false;
};

export class VideoComparePlayerElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return [
      "enhanced-src",
      "original-src",
      "enhanced-poster",
      "original-poster",
      "mode",
      "position",
      "autoplay",
      "loop",
      "muted",
      "controls",
      "object-fit",
      "aspect-ratio",
    ];
  }

  private instance: VideoComparePlayer | null = null;
  private assignedProps: Partial<VideoComparePlayerProps> = {};
  private appliedProps: VideoComparePlayerProps | null = null;
  private renderMode: "light" | "shadow" | null = null;
  private mounting = false;
  private updateScheduled = false;
  private remountRequested = false;
  private connectionVersion = 0;
  private observedPlayer:
    | {
        player: VideoComparePlayer;
        listener: EventListener;
      }
    | undefined;

  get player(): VideoComparePlayer | null {
    return this.instance;
  }

  get props(): Partial<VideoComparePlayerProps> {
    return { ...this.assignedProps };
  }

  set props(value: Partial<VideoComparePlayerProps>) {
    const next = value && typeof value === "object" ? { ...value } : {};
    const requiresRemount = needsRemount(this.assignedProps, next);
    this.assignedProps = next;
    this.requestUpdate(requiresRemount);
  }

  connectedCallback(): void {
    this.connectionVersion += 1;
    this.upgradeProperty("props");
    const wasMounted = Boolean(this.instance);
    this.mount();
    if (wasMounted) this.requestUpdate(false);
  }

  disconnectedCallback(): void {
    const version = ++this.connectionVersion;
    queueMicrotask(() => {
      if (this.isConnected || version !== this.connectionVersion) return;
      this.unmount();
    });
  }

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    if (oldValue === newValue) return;
    this.requestUpdate(false);
  }

  private upgradeProperty(name: "props"): void {
    if (!Object.prototype.hasOwnProperty.call(this, name)) return;
    const value = this[name];
    delete (this as unknown as Record<string, unknown>)[name];
    this[name] = value;
  }

  private requestUpdate(requiresRemount: boolean): void {
    this.remountRequested ||= requiresRemount;
    if (!this.isConnected || this.updateScheduled) return;
    this.updateScheduled = true;
    queueMicrotask(() => {
      this.updateScheduled = false;
      if (!this.isConnected) return;
      if (this.mounting) {
        this.requestUpdate(requiresRemount);
        return;
      }
      const shouldRemount = this.remountRequested;
      this.remountRequested = false;
      if (shouldRemount) this.remount();
      else this.reconcile();
    });
  }

  private mount(): void {
    if (this.instance || this.mounting || !this.isConnected) return;
    const props = this.readResolvedProps();
    if (!props.enhancedSrc) return;

    this.remountRequested = false;
    this.mounting = true;
    let player: VideoComparePlayer | null = null;
    try {
      player = new VideoComparePlayer(this.getRenderRoot(), props);
      if (!this.isConnected) {
        this.destroyPlayer(player);
        return;
      }
      this.instance = player;
      this.appliedProps = props;
      this.observePlayer(player);
    } finally {
      this.mounting = false;
      if (this.remountRequested) this.requestUpdate(false);
    }
  }

  private remount(): void {
    this.unmount();
    this.mount();
  }

  private unmount(): void {
    const player = this.instance;
    this.instance = null;
    this.appliedProps = null;
    if (player) this.destroyPlayer(player);
    else this.stopObservingPlayer();
  }

  private destroyPlayer(player: VideoComparePlayer): void {
    try {
      player.destroy();
    } catch (error) {
      reportLifecycleError(error);
    } finally {
      if (this.instance === player) this.instance = null;
      this.appliedProps = null;
      if (this.observedPlayer?.player === player) this.stopObservingPlayer();
    }
  }

  private observePlayer(player: VideoComparePlayer): void {
    this.stopObservingPlayer();
    const listener: EventListener = (event) => {
      const detail = (event as CustomEvent<VideoCompareStateDetail>).detail;
      if (detail?.state !== "destroyed" || this.instance !== player) return;
      this.instance = null;
      this.appliedProps = null;
      this.stopObservingPlayer();
    };
    player.root.addEventListener("videocompare:statechange", listener);
    this.observedPlayer = { player, listener };
  }

  private stopObservingPlayer(): void {
    if (!this.observedPlayer) return;
    const { player, listener } = this.observedPlayer;
    player.root.removeEventListener("videocompare:statechange", listener);
    this.observedPlayer = undefined;
  }

  private reconcile(): void {
    const next = this.readResolvedProps();
    if (!next.enhancedSrc) {
      this.unmount();
      return;
    }
    if (!this.instance || !this.appliedProps) {
      this.mount();
      return;
    }

    const player = this.instance;
    const previous = this.appliedProps;
    this.appliedProps = next;

    const sourcesChanged =
      previous.enhancedSrc !== next.enhancedSrc ||
      previous.originalSrc !== next.originalSrc ||
      previous.enhancedPoster !== next.enhancedPoster ||
      previous.originalPoster !== next.originalPoster;
    if (sourcesChanged) {
      void player
        .setSources(this.toSources(next), {
          playback: "preserve",
          divider:
            previous.enhancedSrc !== next.enhancedSrc ? "center" : "preserve",
        })
        .then(() => {
          if (this.instance === player) player.setMode(this.readMode());
        })
        .catch(reportLifecycleError);
    }

    player.setMode(next.mode ?? "compare");
    if (previous.initialPosition !== next.initialPosition)
      player.setPosition(next.initialPosition ?? 50);
    if (previous.muted !== next.muted) player.setMuted(next.muted ?? false);
    if (previous.loop !== next.loop) player.setLoop(next.loop ?? true);
    if (previous.volume !== next.volume) player.setVolume(next.volume ?? 1);
    if (previous.playbackRate !== next.playbackRate)
      player.setPlaybackRate(next.playbackRate ?? 1);
    if (previous.controls !== next.controls)
      player.setControls(next.controls ?? true);
    if (previous.objectFit !== next.objectFit)
      player.setObjectFit(next.objectFit ?? "contain");
    if (previous.aspectRatio !== next.aspectRatio)
      player.setAspectRatio(next.aspectRatio ?? "16 / 9");
    if (previous.width !== next.width)
      this.setDimension(player.root, "width", next.width);
    if (previous.height !== next.height)
      this.setDimension(player.root, "height", next.height);
    if (!previous.autoplay && next.autoplay)
      void player.play().catch(() => undefined);
  }

  private getRenderRoot(): HTMLElement | ShadowRoot {
    this.renderMode ??= this.hasAttribute("light-dom") ? "light" : "shadow";
    if (this.renderMode === "light") return this;
    return this.shadowRoot ?? this.attachShadow({ mode: "open" });
  }

  private readResolvedProps(): VideoComparePlayerProps {
    const assigned = this.assignedProps;
    const position =
      numberAttribute(this, "position") ?? assigned.initialPosition;
    const objectFit = this.readObjectFit();
    const aspectRatio =
      this.getAttribute("aspect-ratio") ?? assigned.aspectRatio ?? "16 / 9";
    const controls = this.hasAttribute("controls")
      ? booleanAttribute(this, "controls", true)
      : (assigned.controls ?? true);
    const injectStyles = booleanAttribute(
      this,
      "inject-styles",
      assigned.injectStyles ?? true,
    );
    const styleNonce = this.getAttribute("style-nonce") ?? assigned.styleNonce;

    const resolved: VideoComparePlayerProps = {
      ...assigned,
      ...this.readSources(),
      mode: this.readMode(),
      initialPosition: position ?? 50,
      autoplay: booleanAttribute(this, "autoplay", assigned.autoplay ?? false),
      loop: booleanAttribute(this, "loop", assigned.loop ?? true),
      muted: booleanAttribute(this, "muted", assigned.muted ?? false),
      volume: assigned.volume ?? 1,
      playbackRate: assigned.playbackRate ?? 1,
      controls,
      objectFit,
      aspectRatio,
      injectStyles,
    };
    if (styleNonce) resolved.styleNonce = styleNonce;
    else delete resolved.styleNonce;
    return resolved;
  }

  private readMode(): VideoCompareMode {
    const value = this.getAttribute("mode") ?? this.assignedProps.mode;
    return value === "enhanced" ? "enhanced" : "compare";
  }

  private readObjectFit(): VideoCompareObjectFit {
    const value =
      this.getAttribute("object-fit") ??
      this.assignedProps.objectFit ??
      "contain";
    return value === "cover" ||
      value === "fill" ||
      value === "none" ||
      value === "scale-down"
      ? value
      : "contain";
  }

  private readSources(): VideoCompareSources {
    const enhancedSrc = this.readString("enhanced-src", "enhancedSrc") ?? "";
    const originalSrc = this.readString("original-src", "originalSrc");
    const enhancedPoster =
      this.readString("enhanced-poster", "enhancedPoster") ?? "";
    const originalPoster =
      this.readString("original-poster", "originalPoster") ?? "";
    return {
      enhancedSrc,
      originalSrc: originalSrc ?? "",
      enhancedPoster,
      originalPoster,
    };
  }

  private readString(
    attribute: string,
    prop: "enhancedSrc" | "originalSrc" | "enhancedPoster" | "originalPoster",
  ): string | undefined {
    return this.hasAttribute(attribute)
      ? (this.getAttribute(attribute) ?? "")
      : this.assignedProps[prop];
  }

  private toSources(props: VideoComparePlayerProps): VideoCompareSources {
    return {
      enhancedSrc: props.enhancedSrc,
      ...(props.originalSrc ? { originalSrc: props.originalSrc } : {}),
      enhancedPoster: props.enhancedPoster ?? "",
      originalPoster: props.originalPoster ?? "",
    };
  }

  private setDimension(
    root: HTMLElement,
    property: "width" | "height",
    value: string | number | undefined,
  ): void {
    if (value === undefined) root.style.removeProperty(property);
    else root.style.setProperty(property, cssLength(value));
  }
}

export const defineVideoComparePlayerElement = (
  tagName = "video-compare-player",
): typeof VideoComparePlayerElement => {
  if (typeof customElements === "undefined") return VideoComparePlayerElement;
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof VideoComparePlayerElement;
  customElements.define(tagName, VideoComparePlayerElement);
  return VideoComparePlayerElement;
};

declare global {
  interface HTMLElementTagNameMap {
    "video-compare-player": VideoComparePlayerElement;
  }
}
