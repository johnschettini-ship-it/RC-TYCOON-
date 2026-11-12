/** Phase 8 stage 0 prototype (never merged): the art style switch (spec §5.2, §9.2). */

export type ArtStyle = 'classic' | 'pixel';
export type ArtStyleSetting = 'auto' | ArtStyle;

/** The style that `'auto'` follows. */
export const ART_STYLE_AUTO: ArtStyle = 'classic';

function asStyle(v: string | null | undefined): ArtStyle | null {
  return v === 'classic' || v === 'pixel' ? v : null;
}

/** Address flag, then the stored setting, then the build value, then auto (§9.2). */
export function resolveArtStyle(setting: ArtStyleSetting, search: string, buildDefault: string | undefined): ArtStyle {
  const flag = asStyle(new URLSearchParams(search).get('art'));
  if (flag) return flag;
  const stored = asStyle(setting);
  if (stored) return stored;
  const build = asStyle(buildDefault);
  if (build) return build;
  return ART_STYLE_AUTO;
}

// The start value is classic, so Node tests run Classic.
let style: ArtStyle = 'classic';
let version = 0;

export function setArtStyle(s: ArtStyle): void {
  if (s === style) return;
  style = s;
  version++;
}

export function artStyle(): ArtStyle {
  return style;
}

/** Bumps on every change, so the renderer re-plans once. */
export function artStyleVersion(): number {
  return version;
}
