import { describe, expect, it } from 'vitest';
import { REVIEW_COLOURS, reviewPage } from '../../../tools/art3d/reviewPage';

const items = [
  { id: 'carousel', name: 'Carousel', shots: [
    { look: 'classic' as const, turn: 0, file: 'carousel-classic-t0.png' },
    { look: 'classic' as const, turn: 1, file: 'carousel-classic-t1.png' },
    { look: 'real' as const, turn: 0, file: 'carousel-real-t0.png' },
    { look: 'real' as const, turn: 1, file: 'carousel-real-t1.png' },
  ] },
  { id: 'bench', name: 'Bench <b>', shots: [
    { look: 'classic' as const, turn: 0, file: 'bench-classic-t0.png' },
    { look: 'real' as const, turn: 0, file: 'bench-real-t0.png' },
  ] },
];

describe('reviewPage', () => {
  it('one row per item with both looks', () => {
    const html = reviewPage(items);
    expect(html.match(/<section class="item"/g)).toHaveLength(2);
    for (const s of items.flatMap((i) => i.shots)) expect(html).toContain(`src="${s.file}"`);
    expect(html).toContain('Today');
    expect(html).toContain('Realistic');
    expect(html).toContain('Bench &lt;b&gt;');
  });

  it('fits 390 px wide', () => {
    const html = reviewPage(items);
    expect(html).toContain('name="viewport"');
    const widths = [...html.matchAll(/(?<![-\w])(?:min-|max-)?width\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(widths.filter((w) => w > 390)).toEqual([]);
    expect(html).not.toMatch(/\bwidth="(\d+)"/);
  });
});

describe('reviewPage: ride colours', () => {
  const colourShots = (look: 'classic' | 'real') => REVIEW_COLOURS.map((c) => ({ look, turn: 0, colour: c, file: `carousel-${look}-c${c}.png` }));
  const withColours = [{ ...items[0]!, shots: [...items[0]!.shots, ...colourShots('classic'), ...colourShots('real')] }, items[1]!];

  it('the six colours of the colour command, as TRACK_PALETTE indices', () => {
    expect(REVIEW_COLOURS).toEqual([0, 1, 2, 3, 4, 7]);
  });

  it('a ride shot in the colours gets one colour row per look under its original rows, each picture named by its colour', () => {
    const html = reviewPage(withColours, { colours: 'shot' });
    const ride = html.slice(html.indexOf('id="carousel"'), html.indexOf('id="bench"'));
    expect(ride.match(/class="colours /g)).toHaveLength(2);
    for (const s of colourShots('real')) expect(ride).toContain(`src="${s.file}"`);
    expect(ride).toContain('alt="Carousel, Realistic, sky"');
    expect(ride).toContain('>grape<');
    // the original rows stay first and unchanged
    expect(ride.indexOf('carousel-real-t1.png')).toBeLessThan(ride.indexOf('carousel-classic-c0.png'));
    expect(html.slice(html.indexOf('id="bench"'))).not.toContain('class="colours ');
  });

  it('colours asked for but not in the build: the page says so, and the original rows still show', () => {
    const html = reviewPage(items, { colours: 'unsupported' });
    expect(html).toContain('Ride colours were not shot: this build has no setRideColour command');
    for (const s of items.flatMap((i) => i.shots)) expect(html).toContain(`src="${s.file}"`);
    expect(reviewPage(items)).not.toContain('Ride colours');
  });

  it('still fits 390 px wide with colour rows', () => {
    const html = reviewPage(withColours, { colours: 'shot' });
    const widths = [...html.matchAll(/(?<![-\w])(?:min-|max-)?width\s*:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(widths.filter((w) => w > 390)).toEqual([]);
  });
});
