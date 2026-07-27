import type {
  VideoCompareErrorDetail,
  VideoComparePlaybackState,
  VideoCompareSyncTuning,
  VideoPairSynchronizerOptions,
} from "./types.js";

export const DEFAULT_SYNC_TUNING: Readonly<VideoCompareSyncTuning> =
  Object.freeze({
    alignmentToleranceSeconds: 0.02,
    resetRateThresholdSeconds: 0.02,
    softDriftThresholdSeconds: 0.025,
    hardDriftThresholdSeconds: 0.16,
    slowRate: 0.97,
    fastRate: 1.03,
    catchUpRate: 1.2,
    catchUpFrames: 60,
    checkIntervalMs: 250,
    hardSyncCooldownMs: 500,
    pairStartMaxWaitMs: 300,
    pairStartRetryIntervalMs: 25,
    alignmentTimeoutMs: 1000,
    sourcePlayRetryDelayMs: 300,
    sourcePlayRetries: 2,
    loopGraceMs: 500,
    loopBoundaryToleranceSeconds: 0.25,
  });

type AlignmentAction = "start-pair" | "resume-follower" | "show-paused";

interface AlignmentRequest {
  action: AlignmentAction;
  generation: number;
  targetTime: number;
  refreshed: boolean;
  keepVisible: boolean;
  timeoutAttempts: number;
}

interface PendingPlay {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

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
  expectedUrl: string,
): boolean => {
  const baseUrl = video.ownerDocument?.baseURI ?? "http://localhost/";
  const expected = canonicalMediaUrl(expectedUrl, baseUrl);
  return (
    canonicalMediaUrl(video.currentSrc, baseUrl) === expected ||
    canonicalMediaUrl(video.src, baseUrl) === expected
  );
};

const mediaSourceAssigned = (
  video: HTMLVideoElement,
  expectedUrl: string,
): boolean => {
  const baseUrl = video.ownerDocument?.baseURI ?? "http://localhost/";
  return (
    canonicalMediaUrl(video.src, baseUrl) ===
    canonicalMediaUrl(expectedUrl, baseUrl)
  );
};

const getErrorName = (error: unknown): string =>
  typeof error === "object" && error !== null && "name" in error
    ? String(error.name)
    : "";

const toError = (error: unknown, fallback: string): Error =>
  error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : fallback);

const createAbortError = (): Error => {
  try {
    return new DOMException("Playback request was superseded.", "AbortError");
  } catch {
    const error = new Error("Playback request was superseded.");
    error.name = "AbortError";
    return error;
  }
};

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const nonNegativeOr = (value: number, fallback: number): number => {
  const finite = finiteOr(value, fallback);
  return finite >= 0 ? finite : fallback;
};

const positiveOr = (value: number, fallback: number): number => {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
};

const normalizeTuning = (
  tuning: VideoCompareSyncTuning,
): VideoCompareSyncTuning => ({
  alignmentToleranceSeconds: nonNegativeOr(
    tuning.alignmentToleranceSeconds,
    DEFAULT_SYNC_TUNING.alignmentToleranceSeconds,
  ),
  resetRateThresholdSeconds: nonNegativeOr(
    tuning.resetRateThresholdSeconds,
    DEFAULT_SYNC_TUNING.resetRateThresholdSeconds,
  ),
  softDriftThresholdSeconds: nonNegativeOr(
    tuning.softDriftThresholdSeconds,
    DEFAULT_SYNC_TUNING.softDriftThresholdSeconds,
  ),
  hardDriftThresholdSeconds: nonNegativeOr(
    tuning.hardDriftThresholdSeconds,
    DEFAULT_SYNC_TUNING.hardDriftThresholdSeconds,
  ),
  slowRate: positiveOr(tuning.slowRate, DEFAULT_SYNC_TUNING.slowRate),
  fastRate: positiveOr(tuning.fastRate, DEFAULT_SYNC_TUNING.fastRate),
  catchUpRate: positiveOr(tuning.catchUpRate, DEFAULT_SYNC_TUNING.catchUpRate),
  catchUpFrames: Math.max(
    0,
    Math.floor(
      finiteOr(tuning.catchUpFrames, DEFAULT_SYNC_TUNING.catchUpFrames),
    ),
  ),
  checkIntervalMs: Math.max(
    16,
    nonNegativeOr(tuning.checkIntervalMs, DEFAULT_SYNC_TUNING.checkIntervalMs),
  ),
  hardSyncCooldownMs: nonNegativeOr(
    tuning.hardSyncCooldownMs,
    DEFAULT_SYNC_TUNING.hardSyncCooldownMs,
  ),
  pairStartMaxWaitMs: nonNegativeOr(
    tuning.pairStartMaxWaitMs,
    DEFAULT_SYNC_TUNING.pairStartMaxWaitMs,
  ),
  pairStartRetryIntervalMs: Math.max(
    4,
    nonNegativeOr(
      tuning.pairStartRetryIntervalMs,
      DEFAULT_SYNC_TUNING.pairStartRetryIntervalMs,
    ),
  ),
  alignmentTimeoutMs: nonNegativeOr(
    tuning.alignmentTimeoutMs,
    DEFAULT_SYNC_TUNING.alignmentTimeoutMs,
  ),
  sourcePlayRetryDelayMs: nonNegativeOr(
    tuning.sourcePlayRetryDelayMs,
    DEFAULT_SYNC_TUNING.sourcePlayRetryDelayMs,
  ),
  sourcePlayRetries: Math.max(
    0,
    Math.floor(
      finiteOr(tuning.sourcePlayRetries, DEFAULT_SYNC_TUNING.sourcePlayRetries),
    ),
  ),
  loopGraceMs: nonNegativeOr(
    tuning.loopGraceMs,
    DEFAULT_SYNC_TUNING.loopGraceMs,
  ),
  loopBoundaryToleranceSeconds: nonNegativeOr(
    tuning.loopBoundaryToleranceSeconds,
    DEFAULT_SYNC_TUNING.loopBoundaryToleranceSeconds,
  ),
});

const playMedia = (video: HTMLVideoElement): Promise<void> => {
  const result = video.play();
  return result && typeof result.then === "function"
    ? result
    : Promise.resolve();
};

export class VideoPairSynchronizer {
  readonly master: HTMLVideoElement;
  readonly follower: HTMLVideoElement;

  private readonly tuning: VideoCompareSyncTuning;
  private readonly callbacks: {
    onFollowerVisibilityChange: VideoPairSynchronizerOptions["onFollowerVisibilityChange"];
    onStateChange: VideoPairSynchronizerOptions["onStateChange"];
    onError: VideoPairSynchronizerOptions["onError"];
  };
  private readonly listenerDisposers: Array<() => void> = [];

  private enabled: boolean;
  private loop: boolean;
  private basePlaybackRate: number;
  private desiredPlaying = false;
  private destroyed = false;
  private followerVisible = false;
  private followerHasPresentedFrame = false;
  private masterWaiting = false;
  private state: VideoComparePlaybackState = "idle";
  private generation = 0;
  private frameGeneration = 0;
  private expectedMasterUrl: string;
  private expectedFollowerUrl: string;
  private masterLoadStarted = true;
  private followerLoadStarted = true;
  private alignment: AlignmentRequest | null = null;
  private pendingPlay: PendingPlay | null = null;
  private pairStartWaitStartedAt: number | null = null;
  private masterPlayPending = false;
  private followerPlayPending = false;
  private followerPlayToken = 0;
  private followerPlayRetries = 0;
  private lastHardSyncAt = -Infinity;
  private lastMasterTime = 0;
  private lastMasterLoopAt = -Infinity;

  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private pairStartTimer: ReturnType<typeof setTimeout> | null = null;
  private alignmentTimer: ReturnType<typeof setTimeout> | null = null;
  private followerRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private frameCallbackId: number | null = null;
  private frameRafId: number | null = null;
  private frameFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: VideoPairSynchronizerOptions) {
    this.master = options.master;
    this.follower = options.follower;
    this.enabled = options.enabled ?? true;
    this.loop = options.loop ?? true;
    this.basePlaybackRate = positiveOr(options.playbackRate ?? 1, 1);
    this.tuning = normalizeTuning({
      ...DEFAULT_SYNC_TUNING,
      ...options.tuning,
    });
    this.callbacks = {
      onFollowerVisibilityChange: options.onFollowerVisibilityChange,
      onStateChange: options.onStateChange,
      onError: options.onError,
    };
    this.expectedMasterUrl = canonicalMediaUrl(
      this.master.currentSrc || this.master.src,
      this.master.ownerDocument?.baseURI ?? "http://localhost/",
    );
    this.expectedFollowerUrl = canonicalMediaUrl(
      this.follower.currentSrc || this.follower.src,
      this.follower.ownerDocument?.baseURI ?? "http://localhost/",
    );
    this.lastMasterTime = this.master.currentTime;

    this.configureElements();
    this.bindEvents();
    this.state =
      this.master.readyState >= HTMLMediaElement.HAVE_METADATA
        ? "paused"
        : "loading";
  }

  get playbackState(): VideoComparePlaybackState {
    return this.state;
  }

  get isPlayingRequested(): boolean {
    return this.desiredPlaying;
  }

  get isFollowerVisible(): boolean {
    return this.followerVisible;
  }

  play(): Promise<void> {
    this.assertActive();
    if (this.master.ended && !this.loop) {
      this.master.currentTime = 0;
      if (this.hasFollowerMetadata()) this.follower.currentTime = 0;
      this.followerHasPresentedFrame = false;
      this.setFollowerVisible(false);
    }
    if (this.desiredPlaying) this.startDriftCorrection();
    if (this.desiredPlaying && this.pendingPlay) {
      const pendingPlay = this.pendingPlay;
      this.requestStart();
      return pendingPlay.promise;
    }
    if (this.desiredPlaying && !this.master.paused) return Promise.resolve();

    this.desiredPlaying = true;
    this.masterWaiting = false;
    this.clearPairStartWait();
    this.startDriftCorrection();

    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    this.pendingPlay = { promise, resolve, reject };
    this.requestStart();
    return promise;
  }

  pause(): void {
    if (this.destroyed) return;
    this.desiredPlaying = false;
    this.generation += 1;
    this.rejectPendingPlay(createAbortError());
    this.cancelTransientWork({ keepAlignment: false });
    this.master.pause();
    this.follower.pause();
    this.restorePlaybackRates();
    this.setState("paused");

    if (this.enabled && this.hasActiveMetadata()) {
      this.alignFollower("show-paused", this.followerHasPresentedFrame);
    }
  }

  toggle(): Promise<void> {
    if (this.desiredPlaying) {
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  }

  seek(time: number): void {
    this.assertActive();
    if (!Number.isFinite(time)) return;

    const duration = this.master.duration;
    const target =
      Number.isFinite(duration) && duration > 0
        ? Math.min(Math.max(0, time), duration)
        : Math.max(0, time);
    this.generation += 1;
    this.rejectPendingPlay(createAbortError());
    this.cancelTransientWork({ keepAlignment: false });
    this.setFollowerVisible(false);
    this.followerHasPresentedFrame = false;

    try {
      this.master.currentTime = target;
    } catch (error) {
      this.reportError(
        toError(error, "Unable to seek the enhanced video."),
        "enhanced",
      );
      return;
    }

    if (this.enabled && this.hasFollowerMetadata()) {
      this.alignFollower(
        this.desiredPlaying ? "resume-follower" : "show-paused",
        false,
      );
    }
    if (this.desiredPlaying) {
      void this.play().catch(() => undefined);
    }
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || this.enabled === enabled) return;
    this.enabled = enabled;
    this.generation += 1;
    this.cancelTransientWork({ keepAlignment: false });

    if (!enabled) {
      this.follower.pause();
      this.restorePlaybackRates();
      this.setFollowerVisible(false);
      if (this.desiredPlaying && this.master.paused)
        void this.play().catch(() => undefined);
      return;
    }

    if (this.desiredPlaying) {
      this.requestStart();
    } else if (this.hasActiveMetadata()) {
      this.setState("paused");
      this.alignFollower("show-paused", false);
    }
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
    this.master.loop = loop;
    this.follower.loop = loop;
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.basePlaybackRate = rate;
    this.restorePlaybackRates();
  }

  updateExpectedSources(
    masterSrc: string,
    followerSrc: string | undefined,
    options: { masterChanged: boolean; preservePlayback?: boolean },
  ): void {
    if (this.destroyed) return;
    const shouldResume = options.preservePlayback ?? this.desiredPlaying;
    const nextMasterUrl = canonicalMediaUrl(
      masterSrc,
      this.master.ownerDocument?.baseURI ?? "http://localhost/",
    );
    const nextFollowerUrl = canonicalMediaUrl(
      followerSrc,
      this.follower.ownerDocument?.baseURI ?? "http://localhost/",
    );
    const followerChanged = this.expectedFollowerUrl !== nextFollowerUrl;
    this.generation += 1;
    if (!shouldResume) this.rejectPendingPlay(createAbortError());
    this.expectedMasterUrl = nextMasterUrl;
    this.expectedFollowerUrl = nextFollowerUrl;
    this.masterLoadStarted = !options.masterChanged;
    this.followerLoadStarted = !followerChanged || !nextFollowerUrl;
    this.cancelTransientWork({ keepAlignment: false });
    this.follower.pause();
    this.followerHasPresentedFrame = false;
    this.setFollowerVisible(false);
    this.restorePlaybackRates();

    if (options.masterChanged || !shouldResume) {
      this.master.pause();
      this.lastMasterTime = 0;
      this.setState("loading");
    }

    this.desiredPlaying = shouldResume;
    if (!shouldResume && options.masterChanged) this.setState("loading");
  }

  notifySourcesAssigned(): void {
    if (this.destroyed) return;
    if (this.desiredPlaying) {
      this.requestStart();
    } else if (this.hasActiveMetadata()) {
      this.setState("paused");
      this.alignFollower("show-paused", false);
    }
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

    this.desiredPlaying = false;
    this.generation += 1;
    clean(() => this.rejectPendingPlay(createAbortError()));
    clean(() => this.cancelTransientWork({ keepAlignment: false }));
    clean(() => this.master.pause());
    clean(() => this.follower.pause());
    clean(() => this.restorePlaybackRates());
    for (const dispose of this.listenerDisposers.splice(0)) clean(dispose);
    clean(() => this.setFollowerVisible(false));
    clean(() => this.setState("destroyed"));
    if (hasError) throw firstError;
  }

  private configureElements(): void {
    this.master.loop = this.loop;
    this.follower.loop = this.loop;
    this.follower.muted = true;
    this.follower.defaultMuted = true;
    this.follower.setAttribute("muted", "");
    this.restorePlaybackRates();
  }

  private bindEvents(): void {
    this.listen(this.master, "loadstart", this.handleMasterLoadStart);
    this.listen(this.master, "loadedmetadata", this.handleMasterCanPlay);
    this.listen(this.master, "loadeddata", this.handleMasterCanPlay);
    this.listen(this.master, "canplay", this.handleMasterCanPlay);
    this.listen(this.master, "playing", this.handleMasterPlaying);
    this.listen(this.master, "waiting", this.handleMasterWaiting);
    this.listen(this.master, "pause", this.handleMasterPause);
    this.listen(this.master, "seeking", this.handleMasterSeeking);
    this.listen(this.master, "seeked", this.handleMasterSeeked);
    this.listen(this.master, "timeupdate", this.handleMasterTimeUpdate);
    this.listen(this.master, "ended", this.handleMasterEnded);
    this.listen(this.master, "error", this.handleMasterError);

    this.listen(this.follower, "loadstart", this.handleFollowerLoadStart);
    this.listen(this.follower, "loadedmetadata", this.handleFollowerCanPlay);
    this.listen(this.follower, "loadeddata", this.handleFollowerCanPlay);
    this.listen(this.follower, "canplay", this.handleFollowerCanPlay);
    this.listen(this.follower, "waiting", this.handleFollowerWaiting);
    this.listen(this.follower, "seeked", this.handleFollowerSeeked);
    this.listen(this.follower, "error", this.handleFollowerError);
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

  private readonly handleMasterLoadStart = (): void => {
    if (!mediaSourceAssigned(this.master, this.expectedMasterUrl)) return;
    this.masterLoadStarted = true;
    if (this.desiredPlaying) this.requestStart();
  };

  private readonly handleFollowerLoadStart = (): void => {
    if (!mediaSourceAssigned(this.follower, this.expectedFollowerUrl)) return;
    this.followerLoadStarted = true;
    if (this.desiredPlaying) this.requestStart();
  };

  private readonly handleMasterCanPlay = (): void => {
    if (!this.isMasterActive()) return;
    this.masterWaiting = false;
    if (this.desiredPlaying) {
      this.requestStart();
    } else {
      this.setState("paused");
      if (this.enabled && this.hasActiveMetadata() && !this.follower.seeking) {
        this.alignFollower("show-paused", this.followerHasPresentedFrame);
      }
    }
  };

  private readonly handleFollowerCanPlay = (): void => {
    if (!this.isFollowerActive()) return;
    if (this.alignment) {
      this.finishAlignment();
      return;
    }
    if (!this.enabled) return;
    if (this.desiredPlaying) {
      if (this.master.paused) this.requestStart();
      else
        this.alignFollower("resume-follower", this.followerHasPresentedFrame);
    } else if (this.hasActiveMetadata()) {
      this.setState("paused");
      this.alignFollower("show-paused", this.followerHasPresentedFrame);
    }
  };

  private readonly handleMasterPlaying = (): void => {
    if (!this.isMasterActive() || !this.desiredPlaying) return;
    this.masterWaiting = false;
    this.setState("playing");
    this.resolvePendingPlay();
    this.startDriftCorrection();
    if (
      this.enabled &&
      this.follower.paused &&
      !this.followerPlayPending &&
      !this.alignment
    ) {
      this.alignFollower("resume-follower", this.followerHasPresentedFrame);
    }
  };

  private readonly handleMasterWaiting = (): void => {
    if (!this.isMasterActive() || !this.desiredPlaying) return;
    this.masterWaiting = true;
    this.setState("buffering");
    this.clearPairStartWait();
    this.clearFollowerRetry();
    this.clearAlignment();
    if (this.isWithinLoopGrace()) return;
    this.follower.pause();
    this.restorePlaybackRates();
    this.setFollowerVisible(false);
  };

  private readonly handleFollowerWaiting = (): void => {
    if (!this.isFollowerActive() || !this.desiredPlaying || !this.enabled)
      return;
    if (
      this.follower.seeking ||
      this.alignment ||
      this.isWithinLoopGrace() ||
      this.isNearLoopBoundary(this.follower)
    )
      return;
    this.follower.pause();
    this.restorePlaybackRates();
    this.setFollowerVisible(false);
    this.scheduleFollowerRetry();
  };

  private readonly handleMasterPause = (): void => {
    if (
      !this.isMasterActive() ||
      !this.desiredPlaying ||
      this.master.seeking ||
      this.master.error
    )
      return;
    this.follower.pause();
    this.restorePlaybackRates();
    this.setFollowerVisible(false);
    queueMicrotask(() => this.requestStart());
  };

  private readonly handleMasterSeeking = (): void => {
    if (!this.isMasterActive()) return;
    if (this.isNativeLoopTransition()) {
      this.lastMasterLoopAt = performance.now();
      this.clearAlignment();
      this.clearPairStartWait();
      this.follower.pause();
      this.restorePlaybackRates();
      this.setFollowerVisible(false);
      return;
    }
    this.clearAlignment();
    this.clearPairStartWait();
    this.follower.pause();
    this.restorePlaybackRates();
    if (!this.followerHasPresentedFrame) this.setFollowerVisible(false);
    if (this.desiredPlaying) this.setState("buffering");
  };

  private readonly handleMasterSeeked = (): void => {
    if (!this.isMasterActive() || this.master.seeking) return;
    if (this.isNativeLoopTransition()) {
      this.lastMasterLoopAt = performance.now();
      this.lastMasterTime = this.master.currentTime;
      if (this.enabled) {
        this.alignFollower(
          this.desiredPlaying ? "resume-follower" : "show-paused",
          false,
        );
      } else if (this.desiredPlaying && this.master.paused) {
        this.requestStart();
      }
      return;
    }
    this.lastMasterTime = this.master.currentTime;
    if (!this.enabled) {
      if (this.desiredPlaying && this.master.paused) this.requestStart();
      return;
    }
    this.alignFollower(
      this.desiredPlaying ? "resume-follower" : "show-paused",
      this.followerHasPresentedFrame,
    );
  };

  private readonly handleMasterTimeUpdate = (): void => {
    if (!this.isMasterActive()) return;
    const currentTime = this.master.currentTime;
    if (
      this.loop &&
      Number.isFinite(this.master.duration) &&
      this.lastMasterTime >=
        this.master.duration - this.tuning.loopBoundaryToleranceSeconds &&
      currentTime <= this.tuning.loopBoundaryToleranceSeconds
    ) {
      this.lastMasterLoopAt = performance.now();
      if (this.enabled) {
        this.clearAlignment();
        this.follower.pause();
        this.restorePlaybackRates();
        this.setFollowerVisible(false);
        this.alignFollower(
          this.desiredPlaying ? "resume-follower" : "show-paused",
          false,
        );
      }
    }
    this.lastMasterTime = currentTime;
  };

  private readonly handleFollowerSeeked = (): void => {
    if (!this.isFollowerActive()) return;
    this.finishAlignment();
  };

  private readonly handleMasterEnded = (): void => {
    if (!this.isMasterActive() || this.loop) return;
    this.desiredPlaying = false;
    this.generation += 1;
    this.rejectPendingPlay(createAbortError());
    this.cancelTransientWork({ keepAlignment: false });
    this.follower.pause();
    this.restorePlaybackRates();
    this.setState("paused");
    if (this.enabled && this.hasActiveMetadata()) {
      this.alignFollower("show-paused", this.followerHasPresentedFrame);
    }
  };

  private readonly handleMasterError = (event: Event): void => {
    if (!this.isMasterActive()) return;
    this.desiredPlaying = false;
    this.rejectPendingPlay(
      new Error("The enhanced video could not be played."),
    );
    this.follower.pause();
    this.setFollowerVisible(false);
    this.setState("error");
    this.reportError(
      new Error("The enhanced video could not be loaded."),
      "enhanced",
      event,
    );
  };

  private readonly handleFollowerError = (event: Event): void => {
    if (!this.isFollowerActive()) return;
    this.clearAlignment();
    this.clearFollowerRetry();
    this.follower.pause();
    this.restorePlaybackRates();
    this.setFollowerVisible(false);
    this.reportError(
      new Error("The original video could not be loaded."),
      "original",
      event,
    );
  };

  private requestStart(): void {
    if (this.destroyed || !this.desiredPlaying || !this.isMasterActive())
      return;
    this.startDriftCorrection();
    if (this.master.seeking) {
      this.setState("loading");
      return;
    }
    if (this.master.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      this.setState("loading");
      if (
        this.enabled &&
        this.expectedFollowerUrl &&
        this.isFollowerActive() &&
        !this.follower.error
      ) {
        this.startPair();
      } else {
        this.startMasterOnly();
      }
      return;
    }

    if (
      !this.enabled ||
      !this.expectedFollowerUrl ||
      !this.isFollowerActive() ||
      this.follower.error
    ) {
      this.startMasterOnly();
      return;
    }

    if (
      this.follower.seeking ||
      this.follower.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      if (
        !this.follower.seeking &&
        (this.master.preload !== "auto" || this.follower.preload !== "auto")
      ) {
        this.clearPairStartWait();
        this.startPair();
        return;
      }
      const now = performance.now();
      this.pairStartWaitStartedAt ??= now;
      if (now - this.pairStartWaitStartedAt < this.tuning.pairStartMaxWaitMs) {
        if (this.pairStartTimer === null) {
          this.pairStartTimer = setTimeout(() => {
            this.pairStartTimer = null;
            this.requestStart();
          }, this.tuning.pairStartRetryIntervalMs);
        }
        return;
      }
      this.clearPairStartWait();
      this.startMasterOnly();
      return;
    }

    this.clearPairStartWait();
    const drift = Math.abs(this.follower.currentTime - this.master.currentTime);
    if (this.follower.ended || drift > this.tuning.alignmentToleranceSeconds) {
      this.alignFollower("start-pair", false);
      return;
    }
    this.startPair();
  }

  private startMasterOnly(): void {
    if (this.destroyed || !this.desiredPlaying) return;
    if (!this.master.paused) {
      this.setState("playing");
      this.resolvePendingPlay();
      return;
    }
    if (this.masterPlayPending) return;

    const generation = this.generation;
    this.masterPlayPending = true;
    this.master.playbackRate = this.basePlaybackRate;
    try {
      playMedia(this.master)
        .then(() => {
          if (!this.isGenerationActive(generation) || !this.desiredPlaying)
            return;
          this.masterPlayPending = false;
          this.setState("playing");
          this.resolvePendingPlay();
        })
        .catch((error: unknown) => {
          if (!this.isGenerationActive(generation)) return;
          this.masterPlayPending = false;
          this.handleMasterPlayFailure(error, generation, true);
        });
    } catch (error) {
      this.masterPlayPending = false;
      this.handleMasterPlayFailure(error, generation, true);
    }
  }

  private startPair(): void {
    if (this.destroyed || !this.desiredPlaying || this.masterPlayPending)
      return;
    const generation = this.generation;
    this.masterPlayPending = true;
    this.restorePlaybackRates();
    const followerToken = ++this.followerPlayToken;
    this.followerPlayPending = true;

    let masterPromise: Promise<void>;
    try {
      masterPromise = playMedia(this.master);
    } catch (error) {
      this.masterPlayPending = false;
      this.followerPlayPending = false;
      this.handleMasterPlayFailure(error, generation, true);
      return;
    }

    try {
      playMedia(this.follower)
        .then(() => {
          if (
            !this.isGenerationActive(generation) ||
            followerToken !== this.followerPlayToken
          )
            return;
          this.followerPlayPending = false;
          this.followerPlayRetries = 0;
          this.revealFollowerAfterFrame(false);
        })
        .catch(() => {
          if (
            !this.isGenerationActive(generation) ||
            followerToken !== this.followerPlayToken
          )
            return;
          this.followerPlayPending = false;
          this.follower.pause();
          this.setFollowerVisible(false);
          this.scheduleFollowerRetry();
        });
    } catch {
      this.followerPlayPending = false;
      this.setFollowerVisible(false);
      this.scheduleFollowerRetry();
    }

    masterPromise
      .then(() => {
        if (!this.isGenerationActive(generation) || !this.desiredPlaying)
          return;
        this.masterPlayPending = false;
        this.setState("playing");
        this.resolvePendingPlay();
      })
      .catch((error: unknown) => {
        if (!this.isGenerationActive(generation)) return;
        this.masterPlayPending = false;
        this.handleMasterPlayFailure(error, generation, true);
      });
  }

  private handleMasterPlayFailure(
    error: unknown,
    generation: number,
    allowMutedRetry: boolean,
  ): void {
    if (!this.isGenerationActive(generation)) return;
    if (
      allowMutedRetry &&
      getErrorName(error) === "NotAllowedError" &&
      !this.master.muted
    ) {
      this.master.muted = true;
      this.follower.pause();
      this.setFollowerVisible(false);
      this.requestStart();
      return;
    }
    if (getErrorName(error) === "AbortError" && this.desiredPlaying) {
      queueMicrotask(() => this.requestStart());
      return;
    }

    this.desiredPlaying = false;
    this.follower.pause();
    this.setFollowerVisible(false);
    this.setState("error");
    const playbackError = toError(error, "Unable to start video playback.");
    this.rejectPendingPlay(playbackError);
    this.reportError(playbackError, "playback");
  }

  private alignFollower(action: AlignmentAction, keepVisible: boolean): void {
    if (this.destroyed || !this.enabled || !this.hasActiveMetadata()) return;
    if (this.master.seeking || this.follower.seeking) return;

    const sourceDuration = this.follower.duration;
    const requestedTime = this.master.currentTime;
    const targetTime =
      Number.isFinite(sourceDuration) && sourceDuration > 0
        ? Math.max(
            0,
            Math.min(requestedTime, Math.max(0, sourceDuration - 0.03)),
          )
        : Math.max(0, requestedTime);
    const drift = Math.abs(this.follower.currentTime - targetTime);

    this.clearAlignment();
    this.alignment = {
      action,
      generation: this.generation,
      targetTime,
      refreshed: false,
      keepVisible,
      timeoutAttempts: 0,
    };

    if (
      !this.follower.ended &&
      drift <= this.tuning.alignmentToleranceSeconds
    ) {
      this.finishAlignment();
      return;
    }

    this.follower.pause();
    this.restorePlaybackRates();
    this.followerHasPresentedFrame = false;
    if (!keepVisible) this.setFollowerVisible(false);
    try {
      this.follower.currentTime = targetTime;
      this.scheduleAlignmentTimeout();
    } catch (error) {
      this.clearAlignment();
      this.setFollowerVisible(false);
      this.reportError(
        toError(error, "Unable to align the original video."),
        "original",
      );
    }
  }

  private finishAlignment(): void {
    const request = this.alignment;
    if (
      !request ||
      !this.isGenerationActive(request.generation) ||
      this.master.seeking ||
      this.follower.seeking ||
      !this.hasActiveMetadata()
    ) {
      return;
    }

    if (
      request.action !== "show-paused" &&
      !this.master.paused &&
      !request.refreshed &&
      Math.abs(this.master.currentTime - request.targetTime) >
        this.tuning.alignmentToleranceSeconds
    ) {
      request.refreshed = true;
      const duration = this.follower.duration;
      const target = Number.isFinite(duration)
        ? Math.min(this.master.currentTime, Math.max(0, duration - 0.03))
        : this.master.currentTime;
      request.targetTime = Math.max(0, target);
      if (
        Math.abs(this.follower.currentTime - request.targetTime) >
        this.tuning.alignmentToleranceSeconds
      ) {
        try {
          this.follower.currentTime = request.targetTime;
          this.scheduleAlignmentTimeout();
          return;
        } catch {
          this.clearAlignment();
          this.setFollowerVisible(false);
          return;
        }
      }
    }

    const action = request.action;
    this.clearAlignment();
    if (action === "show-paused") {
      this.setState("paused");
      this.follower.pause();
      this.restorePlaybackRates();
      this.revealFollowerAfterFrame(true);
    } else if (this.master.paused) {
      this.requestStart();
    } else {
      this.resumeFollower();
    }
  }

  private resumeFollower(): void {
    this.startDriftCorrection();
    if (
      this.destroyed ||
      !this.enabled ||
      !this.desiredPlaying ||
      this.master.paused ||
      this.masterWaiting ||
      !this.hasFollowerData()
    ) {
      return;
    }
    const generation = this.generation;
    const token = ++this.followerPlayToken;
    this.followerPlayPending = true;
    try {
      playMedia(this.follower)
        .then(() => {
          if (
            !this.isGenerationActive(generation) ||
            token !== this.followerPlayToken
          )
            return;
          this.followerPlayPending = false;
          this.followerPlayRetries = 0;
          this.revealFollowerAfterFrame(false);
        })
        .catch(() => {
          if (
            !this.isGenerationActive(generation) ||
            token !== this.followerPlayToken
          )
            return;
          this.followerPlayPending = false;
          this.setFollowerVisible(false);
          this.scheduleFollowerRetry();
        });
    } catch {
      this.followerPlayPending = false;
      this.setFollowerVisible(false);
      this.scheduleFollowerRetry();
    }
  }

  private revealFollowerAfterFrame(allowPaused: boolean): void {
    this.cancelFrameConfirmation();
    const frameGeneration = ++this.frameGeneration;
    const mediaGeneration = this.generation;
    let attempts = 0;
    let catchUpFrames = 0;

    const reveal = (): void => {
      if (
        this.destroyed ||
        frameGeneration !== this.frameGeneration ||
        !this.isGenerationActive(mediaGeneration) ||
        (!allowPaused && (!this.desiredPlaying || this.master.paused))
      ) {
        return;
      }
      if (
        !this.follower.seeking &&
        this.follower.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        if (!allowPaused) {
          const drift = this.follower.currentTime - this.master.currentTime;
          if (Math.abs(drift) > this.tuning.alignmentToleranceSeconds) {
            if (
              !this.follower.paused &&
              catchUpFrames < this.tuning.catchUpFrames
            ) {
              this.follower.playbackRate =
                this.basePlaybackRate *
                (drift < 0
                  ? this.tuning.catchUpRate
                  : Math.max(0.1, 2 - this.tuning.catchUpRate));
              catchUpFrames += 1;
              this.frameRafId = requestAnimationFrame(() => {
                this.frameRafId = null;
                reveal();
              });
              return;
            }
            this.restorePlaybackRates();
            this.alignFollower(
              "resume-follower",
              this.followerHasPresentedFrame,
            );
            return;
          }
        }
        this.restorePlaybackRates();
        this.cancelFrameConfirmation();
        this.followerHasPresentedFrame = true;
        this.setFollowerVisible(true);
        return;
      }
      if (attempts >= 5) return;
      attempts += 1;
      this.frameRafId = requestAnimationFrame(() => {
        this.frameRafId = null;
        reveal();
      });
    };

    if (typeof this.follower.requestVideoFrameCallback === "function") {
      this.frameCallbackId = this.follower.requestVideoFrameCallback(() => {
        this.frameCallbackId = null;
        reveal();
      });
      this.frameFallbackTimer = setTimeout(() => {
        this.frameFallbackTimer = null;
        if (frameGeneration !== this.frameGeneration) return;
        if (this.frameCallbackId !== null) {
          this.follower.cancelVideoFrameCallback?.(this.frameCallbackId);
          this.frameCallbackId = null;
        }
        reveal();
      }, 300);
    } else {
      this.frameRafId = requestAnimationFrame(() => {
        this.frameRafId = null;
        reveal();
      });
    }
  }

  private correctFollowerDrift = (): void => {
    this.handleMasterTimeUpdate();
    if (
      this.destroyed ||
      !this.enabled ||
      !this.desiredPlaying ||
      this.master.paused ||
      this.masterWaiting ||
      this.follower.paused ||
      this.master.seeking ||
      this.follower.seeking ||
      this.alignment
    ) {
      return;
    }
    if (
      this.isWithinLoopGrace() ||
      this.isNearLoopBoundary(this.master) ||
      this.isNearLoopBoundary(this.follower)
    ) {
      this.restorePlaybackRates();
      return;
    }

    const drift = this.follower.currentTime - this.master.currentTime;
    const absoluteDrift = Math.abs(drift);
    if (absoluteDrift <= this.tuning.resetRateThresholdSeconds) {
      this.restorePlaybackRates();
      return;
    }
    if (absoluteDrift < this.tuning.softDriftThresholdSeconds) return;
    if (absoluteDrift < this.tuning.hardDriftThresholdSeconds) {
      this.follower.playbackRate =
        this.basePlaybackRate *
        (drift < 0 ? this.tuning.fastRate : this.tuning.slowRate);
      return;
    }
    if (
      performance.now() - this.lastHardSyncAt <
      this.tuning.hardSyncCooldownMs
    )
      return;

    this.lastHardSyncAt = performance.now();
    this.alignFollower("resume-follower", this.followerHasPresentedFrame);
  };

  private scheduleFollowerRetry(): void {
    if (
      this.destroyed ||
      this.followerRetryTimer !== null ||
      this.follower.error ||
      !this.desiredPlaying ||
      this.master.paused ||
      this.masterWaiting ||
      this.followerPlayRetries >= this.tuning.sourcePlayRetries
    ) {
      return;
    }
    this.followerPlayRetries += 1;
    this.followerRetryTimer = setTimeout(() => {
      this.followerRetryTimer = null;
      if (!this.destroyed && this.desiredPlaying && !this.master.paused) {
        this.alignFollower("resume-follower", false);
      }
    }, this.tuning.sourcePlayRetryDelayMs);
  }

  private scheduleAlignmentTimeout(): void {
    if (!this.alignment) return;
    if (this.alignmentTimer !== null) clearTimeout(this.alignmentTimer);
    this.alignment.timeoutAttempts += 1;
    const requestGeneration = this.alignment.generation;
    this.alignmentTimer = setTimeout(() => {
      this.alignmentTimer = null;
      const request = this.alignment;
      if (
        !request ||
        request.generation !== requestGeneration ||
        !this.isGenerationActive(requestGeneration)
      )
        return;
      if (this.follower.seeking && request.timeoutAttempts < 3) {
        this.scheduleAlignmentTimeout();
        return;
      }
      this.clearAlignment();
      this.follower.pause();
      this.restorePlaybackRates();
      this.setFollowerVisible(false);
      if (this.desiredPlaying) this.requestStart();
    }, this.tuning.alignmentTimeoutMs);
  }

  private startDriftCorrection(): void {
    if (this.driftTimer === null) {
      this.driftTimer = setInterval(
        this.correctFollowerDrift,
        this.tuning.checkIntervalMs,
      );
    }
  }

  private stopDriftCorrection(): void {
    if (this.driftTimer !== null) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
  }

  private clearPairStartWait(): void {
    this.pairStartWaitStartedAt = null;
    if (this.pairStartTimer !== null) {
      clearTimeout(this.pairStartTimer);
      this.pairStartTimer = null;
    }
  }

  private clearFollowerRetry(): void {
    this.followerPlayRetries = 0;
    if (this.followerRetryTimer !== null) {
      clearTimeout(this.followerRetryTimer);
      this.followerRetryTimer = null;
    }
  }

  private clearAlignment(): void {
    this.alignment = null;
    if (this.alignmentTimer !== null) {
      clearTimeout(this.alignmentTimer);
      this.alignmentTimer = null;
    }
  }

  private cancelFrameConfirmation(): void {
    this.frameGeneration += 1;
    if (this.frameCallbackId !== null) {
      this.follower.cancelVideoFrameCallback?.(this.frameCallbackId);
      this.frameCallbackId = null;
    }
    if (this.frameRafId !== null) {
      cancelAnimationFrame(this.frameRafId);
      this.frameRafId = null;
    }
    if (this.frameFallbackTimer !== null) {
      clearTimeout(this.frameFallbackTimer);
      this.frameFallbackTimer = null;
    }
  }

  private cancelTransientWork(options: { keepAlignment: boolean }): void {
    this.clearPairStartWait();
    this.clearFollowerRetry();
    if (!options.keepAlignment) this.clearAlignment();
    this.cancelFrameConfirmation();
    this.stopDriftCorrection();
    this.followerPlayToken += 1;
    this.masterPlayPending = false;
    this.followerPlayPending = false;
  }

  private restorePlaybackRates(): void {
    this.master.playbackRate = this.basePlaybackRate;
    this.follower.playbackRate = this.basePlaybackRate;
  }

  private isMasterActive(): boolean {
    return (
      !this.expectedMasterUrl ||
      (this.masterLoadStarted &&
        mediaSourceAssigned(this.master, this.expectedMasterUrl) &&
        mediaElementMatches(this.master, this.expectedMasterUrl))
    );
  }

  private isFollowerActive(): boolean {
    return (
      !this.expectedFollowerUrl ||
      (this.followerLoadStarted &&
        mediaSourceAssigned(this.follower, this.expectedFollowerUrl) &&
        mediaElementMatches(this.follower, this.expectedFollowerUrl))
    );
  }

  private hasMasterMetadata(): boolean {
    return (
      this.isMasterActive() &&
      this.master.readyState >= HTMLMediaElement.HAVE_METADATA
    );
  }

  private hasFollowerMetadata(): boolean {
    return (
      this.isFollowerActive() &&
      this.follower.readyState >= HTMLMediaElement.HAVE_METADATA
    );
  }

  private hasFollowerData(): boolean {
    return (
      this.isFollowerActive() &&
      this.follower.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    );
  }

  private hasActiveMetadata(): boolean {
    return this.hasMasterMetadata() && this.hasFollowerMetadata();
  }

  private isGenerationActive(generation: number): boolean {
    return !this.destroyed && generation === this.generation;
  }

  private isWithinLoopGrace(): boolean {
    return performance.now() - this.lastMasterLoopAt < this.tuning.loopGraceMs;
  }

  private isNearLoopBoundary(video: HTMLVideoElement): boolean {
    return (
      this.loop &&
      Number.isFinite(video.duration) &&
      (video.currentTime <= this.tuning.loopBoundaryToleranceSeconds ||
        video.currentTime >=
          video.duration - this.tuning.loopBoundaryToleranceSeconds)
    );
  }

  private isNativeLoopTransition(): boolean {
    return (
      this.loop &&
      Number.isFinite(this.master.duration) &&
      (this.isWithinLoopGrace() ||
        (this.master.currentTime <= this.tuning.loopBoundaryToleranceSeconds &&
          this.lastMasterTime >=
            this.master.duration - this.tuning.loopBoundaryToleranceSeconds))
    );
  }

  private setFollowerVisible(visible: boolean): void {
    if (this.followerVisible === visible) return;
    this.followerVisible = visible;
    this.callbacks.onFollowerVisibilityChange?.(visible);
  }

  private setState(state: VideoComparePlaybackState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private resolvePendingPlay(): void {
    if (!this.pendingPlay) return;
    const pending = this.pendingPlay;
    this.pendingPlay = null;
    pending.resolve();
  }

  private rejectPendingPlay(reason: unknown): void {
    if (!this.pendingPlay) return;
    const pending = this.pendingPlay;
    this.pendingPlay = null;
    pending.reject(reason);
  }

  private reportError(
    error: Error,
    source: VideoCompareErrorDetail["source"],
    nativeEvent?: Event,
  ): void {
    this.callbacks.onError?.(error, source, nativeEvent);
  }

  private assertActive(): void {
    if (this.destroyed)
      throw new Error("VideoPairSynchronizer has been destroyed.");
  }
}

export const createVideoSyncController = (
  options: VideoPairSynchronizerOptions,
): VideoPairSynchronizer => new VideoPairSynchronizer(options);
