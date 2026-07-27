import type { VideoCompareIcon, VideoCompareIconName } from "./types.js";

const createSvgFromMarkup = (markup: string): SVGSVGElement => {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  const element = template.content.firstElementChild;
  if (!(element instanceof SVGSVGElement)) {
    throw new Error("Video compare icon markup must create an SVG element.");
  }
  return element;
};

const videoToPaused = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.8888 8.16052C15.8365 8.72653 16.3103 9.00953 16.4708 9.37593C16.6109 9.69569 16.6109 10.0595 16.4708 10.3792C16.3103 10.7456 15.8365 11.0286 14.8888 11.5946L8.16212 15.6122C7.17152 16.2038 6.67621 16.4997 6.26881 16.4611C5.91356 16.4275 5.58961 16.2436 5.37859 15.9559C5.13659 15.6259 5.13659 15.049 5.13659 13.8951V5.86002C5.13659 4.70619 5.13659 4.12927 5.37859 3.79927C5.58961 3.51152 5.91356 3.32767 6.26881 3.29405C6.67621 3.25549 7.17151 3.55132 8.16212 4.14296L14.8888 8.16052Z" fill="white" />
    </svg>
  `);

const videoToPlay = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4.58301" y="3.75" width="3.33333" height="12.5" rx="1.25" fill="white" />
      <rect x="12.083" y="3.75" width="3.33333" height="12.5" rx="1.25" fill="white" />
    </svg>
  `);

const videoBigPlay = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="60" height="60" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g filter="url(#vcp_video_big_play_blur)">
        <rect x="12.2725" y="13.6365" width="92.7273" height="92.7273" rx="46.3636" fill="url(#vcp_video_big_play_gradient)" fill-opacity="0.7" />
      </g>
      <path d="M71.7902 55.6397C74.2455 57.1061 75.4732 57.8394 75.8891 58.7887C76.2521 59.6172 76.2521 60.5597 75.8891 61.3881C75.4732 62.3374 74.2455 63.0707 71.7902 64.5372L55.7708 74.1049C53.2043 75.6378 51.921 76.4042 50.8654 76.3043C49.945 76.2172 49.1057 75.7409 48.559 74.9953C47.9319 74.1403 47.9319 72.6456 47.9319 69.6561V50.5207C47.9319 47.5312 47.9319 46.0365 48.559 45.1815C49.1057 44.436 49.945 43.9596 50.8654 43.8725C51.921 43.7726 53.2043 44.5391 55.7708 46.072L71.7902 55.6397Z" fill="white" fill-opacity="0.9" />
      <defs>
        <filter id="vcp_video_big_play_blur" x="8.27246" y="9.63647" width="100.727" height="100.727" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feGaussianBlur in="BackgroundImageFix" stdDeviation="2" />
          <feComposite in2="SourceAlpha" operator="in" result="effect1_backgroundBlur_1354_20720" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_backgroundBlur_1354_20720" result="shape" />
        </filter>
        <linearGradient id="vcp_video_big_play_gradient" x1="17.17" y1="12.2728" x2="131.723" y2="13.1457" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7657FF" />
          <stop offset="0.39107" stop-color="#7657FF" />
          <stop offset="0.862723" stop-color="#7657FF" />
          <stop offset="1" stop-color="#7657FF" />
        </linearGradient>
      </defs>
    </svg>
  `);

const voiceOn = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="20" height="20">
      <path d="M10.6667 5.99994C11.0994 6.57692 11.3333 7.2787 11.3333 7.99994C11.3333 8.72117 11.0994 9.42295 10.6667 9.99994M12.9093 12.2426C13.4665 11.6855 13.9085 11.024 14.21 10.2961C14.5115 9.5681 14.6667 8.78787 14.6667 7.99994C14.6667 7.212 14.5115 6.43178 14.21 5.70382C13.9085 4.97586 13.4665 4.31442 12.9093 3.75727M7.33334 3.1346C7.3332 3.04175 7.30556 2.95101 7.25391 2.87384C7.20226 2.79668 7.1289 2.73654 7.04311 2.70102C6.95731 2.6655 6.86291 2.6562 6.77183 2.67428C6.68075 2.69236 6.59706 2.73701 6.53134 2.8026L4.27534 5.05794C4.18827 5.14552 4.08469 5.21496 3.9706 5.26222C3.8565 5.30948 3.73416 5.33363 3.61067 5.33327H2C1.82319 5.33327 1.65362 5.40351 1.5286 5.52853C1.40357 5.65356 1.33334 5.82313 1.33334 5.99994V9.99994C1.33334 10.1767 1.40357 10.3463 1.5286 10.4713C1.65362 10.5964 1.82319 10.6666 2 10.6666H3.61067C3.73416 10.6662 3.8565 10.6904 3.9706 10.7377C4.08469 10.7849 4.18827 10.8544 4.27534 10.9419L6.53067 13.1979C6.5964 13.2638 6.68021 13.3087 6.77146 13.3269C6.86272 13.345 6.95732 13.3357 7.04329 13.3001C7.12925 13.2645 7.2027 13.2041 7.25433 13.1267C7.30597 13.0493 7.33347 12.9583 7.33334 12.8653V3.1346Z" stroke="#F5F7FF" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

const voiceOff = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" width="20" height="20">
      <path d="M14.6667 5.99994L10.6667 9.99994M10.6667 5.99994L14.6667 9.99994M7.33333 3.1346C7.33319 3.04175 7.30556 2.95101 7.2539 2.87384C7.20225 2.79668 7.1289 2.73654 7.0431 2.70102C6.9573 2.6655 6.8629 2.6562 6.77182 2.67428C6.68074 2.69236 6.59706 2.73701 6.53133 2.8026L4.27533 5.05794C4.18826 5.14552 4.08468 5.21496 3.97059 5.26222C3.8565 5.30948 3.73416 5.33363 3.61066 5.33327H1.99999C1.82318 5.33327 1.65361 5.40351 1.52859 5.52853C1.40357 5.65356 1.33333 5.82313 1.33333 5.99994V9.99994C1.33333 10.1767 1.40357 10.3463 1.52859 10.4713C1.65361 10.5964 1.82318 10.6666 1.99999 10.6666H3.61066C3.73416 10.6662 3.8565 10.6904 3.97059 10.7377C4.08468 10.7849 4.18826 10.8544 4.27533 10.9419L6.53066 13.1979C6.59639 13.2638 6.6802 13.3087 6.77146 13.3269C6.86271 13.345 6.95732 13.3357 7.04328 13.3001C7.12924 13.2645 7.20269 13.2041 7.25433 13.1267C7.30596 13.0493 7.33346 12.9583 7.33333 12.8653V3.1346Z" stroke="#F5F7FF" stroke-width="1.33333" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

const fullscreenPlay = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="#F5F7FF">
      <path d="M6.66667 2.5H4.16667C3.72464 2.5 3.30072 2.67559 2.98816 2.98816C2.67559 3.30072 2.5 3.72464 2.5 4.16667V6.66667M17.5 6.66667V4.16667C17.5 3.72464 17.3244 3.30072 17.0118 2.98816C16.6993 2.67559 16.2754 2.5 15.8333 2.5H13.3333M2.5 13.3333V15.8333C2.5 16.2754 2.67559 16.6993 2.98816 17.0118C3.30072 17.3244 3.72464 17.5 4.16667 17.5H6.66667M13.3333 17.5H15.8333C16.2754 17.5 16.6993 17.3244 17.0118 17.0118C17.3244 16.6993 17.5 16.2754 17.5 15.8333V13.3333" stroke="#F5F7FF" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

const fullscreenExit = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="20" height="20" viewBox="0 0 20 20" fill="#F5F7FF" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.66667 2.5V5C6.66667 5.44203 6.49107 5.86595 6.17851 6.17851C5.86595 6.49107 5.44203 6.66667 5 6.66667H2.5M17.5 6.66667H15C14.558 6.66667 14.134 6.49107 13.8215 6.17851C13.5089 5.86595 13.3333 5.44203 13.3333 5V2.5M2.5 13.3333H5C5.44203 13.3333 5.86595 13.5089 6.17851 13.8215C6.49107 14.134 6.66667 14.558 6.66667 15V17.5M13.3333 17.5V15C13.3333 14.558 13.5089 14.134 13.8215 13.8215C14.134 13.5089 14.558 13.3333 15 13.3333H17.5" stroke="#F5F7FF" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

const upscaleOriginalVideo = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M12.8571 0H2.14286C0.95939 0 0 0.95939 0 2.14286V12.8571C0 14.0406 0.95939 15 2.14286 15H12.8571C14.0406 15 15 14.0406 15 12.8571V2.14286C15 0.95939 14.0406 0 12.8571 0Z" fill="currentColor" />
    </svg>
  `);

const upscaleCompareVideo = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4.99919 3.33203H9.99919V16.6654H4.99919C4.55716 16.6654 4.13324 16.4898 3.82067 16.1772C3.50811 15.8646 3.33252 15.4407 3.33252 14.9987V4.9987C3.33252 4.55667 3.50811 4.13275 3.82067 3.82019C4.13324 3.50763 4.55716 3.33203 4.99919 3.33203Z" fill="currentColor" />
      <path d="M9.16585 3.33268H4.99919C4.55716 3.33268 4.13324 3.50828 3.82067 3.82084C3.50811 4.1334 3.33252 4.55732 3.33252 4.99935V14.9993C3.33252 15.4414 3.50811 15.8653 3.82067 16.1779C4.13324 16.4904 4.55716 16.666 4.99919 16.666H9.99919M12.5 3.33268H14.9992C15.4412 3.33268 15.8651 3.50828 16.1777 3.82084C16.4903 4.1334 16.6659 4.55732 16.6659 4.99935V5.83268M12.5 16.666H14.9992C15.4412 16.666 15.8651 16.4904 16.1777 16.1779C16.4903 15.8653 16.6659 15.4414 16.6659 14.9993V14.166V5.70896M9.99919 1.66602V18.3327" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `);

const upscaleCompareDragHandle = (): SVGSVGElement =>
  createSvgFromMarkup(`
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="40" viewBox="0 0 24 40" fill="none">
      <rect width="24" height="40" rx="6" fill="black" fill-opacity="0.25" />
      <rect x="0.75" y="0.75" width="22.5" height="38.5" rx="5.25" stroke="white" stroke-opacity="0.9" stroke-width="1.5" />
      <path d="M7 14C7 14.5523 7.44772 15 8 15C8.55228 15 9 14.5523 9 14C9 13.4477 8.55228 13 8 13C7.44772 13 7 13.4477 7 14Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
      <path d="M7 20C7 20.5523 7.44772 21 8 21C8.55228 21 9 20.5523 9 20C9 19.4477 8.55228 19 8 19C7.44772 19 7 19.4477 7 20Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
      <path d="M7 26C7 26.5523 7.44772 27 8 27C8.55228 27 9 26.5523 9 26C9 25.4477 8.55228 25 8 25C7.44772 25 7 25.4477 7 26Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
      <path d="M15 14C15 14.5523 15.4477 15 16 15C16.5523 15 17 14.5523 17 14C17 13.4477 16.5523 13 16 13C15.4477 13 15 13.4477 15 14Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
      <path d="M15 20C15 20.5523 15.4477 21 16 21C16.5523 21 17 20.5523 17 20C17 19.4477 16.5523 19 16 19C15.4477 19 15 19.4477 15 20Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
      <path d="M15 26C15 26.5523 15.4477 27 16 27C16.5523 27 17 26.5523 17 26C17 25.4477 16.5523 25 16 25C15.4477 25 15 25.4477 15 26Z" fill="#F5F7FF" stroke="#F5F7FF" stroke-width="1.5" />
    </svg>
  `);

export const DEFAULT_ICONS: Readonly<
  Record<VideoCompareIconName, () => SVGSVGElement>
> = Object.freeze({
  play: videoToPaused,
  pause: videoToPlay,
  centerPlay: videoBigPlay,
  volume: voiceOn,
  muted: voiceOff,
  fullscreen: fullscreenPlay,
  exitFullscreen: fullscreenExit,
  enhancedMode: upscaleOriginalVideo,
  compareMode: upscaleCompareVideo,
  dragHandle: upscaleCompareDragHandle,
});

export const renderIcon = (icon: VideoCompareIcon): Node => {
  const value = typeof icon === "function" ? icon() : icon;
  return value.cloneNode(true);
};

export const replaceIcon = (target: Element, icon: VideoCompareIcon): void => {
  target.replaceChildren(renderIcon(icon));
};
