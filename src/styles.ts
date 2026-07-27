import defaultStyles from "./style.css";

const STYLE_MARKER = "data-video-compare-player-styles";

const isDocument = (node: Document | ShadowRoot): node is Document =>
  node.nodeType === 9;

export const DEFAULT_STYLES = defaultStyles;

export const injectVideoComparePlayerStyles = (
  root: Document | ShadowRoot = document,
  nonce?: string,
): HTMLStyleElement => {
  const existing = root.querySelector<HTMLStyleElement>(
    `style[${STYLE_MARKER}]`,
  );
  if (
    existing &&
    existing.textContent === defaultStyles &&
    (!nonce || existing.nonce === nonce)
  )
    return existing;

  const documentRef = isDocument(root) ? root : root.ownerDocument;
  const style = documentRef.createElement("style");
  style.setAttribute(STYLE_MARKER, "");
  if (nonce) style.nonce = nonce;
  style.textContent = defaultStyles;
  if (existing) {
    existing.replaceWith(style);
    return style;
  }
  if (isDocument(root)) {
    (root.head ?? root.documentElement).append(style);
  } else {
    root.prepend(style);
  }
  return style;
};
