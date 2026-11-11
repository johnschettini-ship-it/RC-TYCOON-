/** Phase 8 stage 0 prototype (never merged): tests of the art style switch. */
import { afterEach, describe, expect, it } from 'vitest';
import { ART_STYLE_AUTO, artStyle, artStyleVersion, resolveArtStyle, setArtStyle } from '../../../../src/render/pixel/style';

afterEach(() => setArtStyle('classic'));

describe('art style (§9.2)', () => {
  it('a fresh import starts in classic', () => {
    expect(artStyle()).toBe('classic');
    expect(ART_STYLE_AUTO).toBe('classic');
  });
  it('takes the address flag, then the setting, then the build value, then auto', () => {
    expect(resolveArtStyle('classic', '?art=pixel', 'classic')).toBe('pixel');
    expect(resolveArtStyle('pixel', '?x=1&art=classic', 'pixel')).toBe('classic');
    expect(resolveArtStyle('pixel', '', 'classic')).toBe('pixel');
    expect(resolveArtStyle('auto', '', 'pixel')).toBe('pixel');
    expect(resolveArtStyle('auto', '?art=bogus', 'bogus')).toBe('classic');
    expect(resolveArtStyle('auto', '', undefined)).toBe(ART_STYLE_AUTO);
  });
  it('setArtStyle raises the version only on a change', () => {
    const v = artStyleVersion();
    setArtStyle('classic');
    expect(artStyleVersion()).toBe(v);
    setArtStyle('pixel');
    expect(artStyleVersion()).toBe(v + 1);
    setArtStyle('pixel');
    expect(artStyleVersion()).toBe(v + 1);
  });
});
