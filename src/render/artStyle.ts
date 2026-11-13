/** Which drawing path the game uses: today's pixel look ('classic') or the realistic test look ('real'). */
export type ArtStyle = 'classic' | 'real';

/** Screen px per metre of height in the realistic look (classic is 8). */
export const REAL_STEP_PX = 9.8;

/** `?art=real` wins over the build-time `VITE_ART`; anything else is classic. */
export function artStyle(search: string = globalThis.location?.search ?? '', env: string | undefined = import.meta.env.VITE_ART): ArtStyle {
  const q = new URLSearchParams(search).get('art');
  if (q === 'real') return 'real';
  if (q === null && env === 'real') return 'real';
  return 'classic';
}
