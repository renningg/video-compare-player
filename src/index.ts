export {
  createVideoComparePlayer,
  DEFAULT_CONTROLS,
  DEFAULT_LABELS,
  DEFAULT_THEME,
  VideoComparePlayer,
} from "./VideoComparePlayer.js";
export {
  createVideoSyncController,
  DEFAULT_SYNC_TUNING,
  VideoPairSynchronizer,
} from "./VideoPairSynchronizer.js";
export {
  defineVideoComparePlayerElement,
  VideoComparePlayerElement,
} from "./custom-element.js";
export { DEFAULT_ICONS } from "./icons.js";
export { DEFAULT_STYLES, injectVideoComparePlayerStyles } from "./styles.js";
export * from "./types.js";

export const VERSION = __VIDEO_COMPARE_PLAYER_VERSION__;
