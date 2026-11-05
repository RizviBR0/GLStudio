import type { CSSProperties } from 'react';

/** Resolve opaque CSS colors without adding nodes to the document. */
export function getButtonColorStyles(color: string): CSSProperties {
  if (typeof document === 'undefined' || !CSS.supports('color', color) || /var\(|currentcolor|inherit|revert|unset/i.test(color)) return {};
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return {};
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
  // Translucent colors depend on the backdrop; use the theme defaults instead.
  if (alpha !== 255) return {};
  const linear = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  // Choose the larger WCAG contrast ratio, rather than a brightness threshold.
  const foreground = (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
  return {
    '--raised-button-bg': `rgb(${r}, ${g}, ${b})`,
    '--raised-button-text': foreground,
    '--raised-button-shadow': `rgba(${r}, ${g}, ${b}, 0.24)`,
  } as CSSProperties;
}
