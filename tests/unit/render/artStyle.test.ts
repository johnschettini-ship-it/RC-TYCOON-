import { describe, expect, it } from 'vitest';
import { artStyle, REAL_STEP_PX } from '../../../src/render/artStyle';

describe('artStyle', () => {
  it('defaults to classic', () => expect(artStyle('', undefined)).toBe('classic'));
  it('reads ?art=real', () => expect(artStyle('?art=real', undefined)).toBe('real'));
  it('reads VITE_ART', () => expect(artStyle('', 'real')).toBe('real'));
  it('?art wins over env', () => expect(artStyle('?art=real', 'classic')).toBe('real'));
  it('rejects unknown values', () => expect(artStyle('?art=pixel', 'pixel')).toBe('classic'));
  it('real step is 9.8', () => expect(REAL_STEP_PX).toBe(9.8));
});
