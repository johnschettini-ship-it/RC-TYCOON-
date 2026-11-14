import { describe, expect, it } from 'vitest';
import { reviewPage } from '../../../tools/art3d/reviewPage';

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
