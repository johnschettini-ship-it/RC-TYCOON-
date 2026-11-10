/**
 * Audio in the browser (Phase 6 §4.1–4.2, §9). W4-A. The engine is `window.__tcAudio` (state and a debug log of the
 * sounds it played). Headless Chromium runs Web Audio with a silent output, so the context states are real.
 */
import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { centerOn, isPhone, newPark, openTool, setSpeed, tilePoint, watchErrors } from './helpers';

interface TcAudio {
  state(): string;
  debug(): { played: { id: string }[]; hidden: boolean; volumes: { master: number; muted: boolean } };
}

const audioState = (page: Page): Promise<string> => page.evaluate(() => (window as unknown as { __tcAudio: TcAudio }).__tcAudio.state());
const played = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __tcAudio: TcAudio }).__tcAudio.debug().played.map((p) => p.id));
const contexts = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __acMade?: number }).__acMade ?? 0);

test.beforeEach(async ({ page }) => {
  // Count AudioContext constructions (the game must make none before the first gesture).
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __acMade?: number };
    const Base = w.AudioContext;
    w.AudioContext = class extends Base {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        w.__acMade = (w.__acMade ?? 0) + 1;
      }
    };
  });
});

test.describe('audio unlock', () => {
  test('silent before the first gesture; the first tap or click moves AudioContext.state to running', async ({ page }, info) => {
    const watch = watchErrors(page);
    await page.goto('/');
    await page.waitForFunction(() => '__tcAudio' in window);
    await expect(page.getByTestId('title-new')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await audioState(page)).toBe('none');
    expect(await contexts(page)).toBe(0);
    const box = await page.locator('.title-screen h1, .title-screen h2').first().boundingBox();
    const at = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: 20, y: 20 };
    if (isPhone(info)) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await expect.poll(() => audioState(page)).toBe('running');
    expect(await contexts(page)).toBe(1);
    watch.expectNoErrors();
  });
});

test.describe('sounds in play', () => {
  test('button presses, panel opens, building, and command errors play their sounds', async ({ page }, info) => {
    const watch = watchErrors(page);
    await newPark(page, 'Audio Park');
    await expect.poll(() => audioState(page)).toBe('running');
    await setSpeed(page, 'Pause');
    await openTool(page, 'staff');
    await expect(page.locator('.panel[data-kind=staff]')).toBeVisible();
    await expect.poll(() => played(page)).toEqual(expect.arrayContaining(['ui_click', 'ui_open']));
    // A path tile (the cue table: path tile built → build_path). Phones build with tap + Confirm, so dispatch there.
    await centerOn(page, 31, 57);
    if (isPhone(info)) {
      await page.evaluate(() => (window as unknown as { __tc: { dispatch(c: unknown): unknown } }).__tc.dispatch({ type: 'buildPath', x: 29, y: 59, kind: 'footpath' }));
    } else {
      await openTool(page, 'footpath');
      const p = await tilePoint(page, 29, 59);
      await page.mouse.click(p.x, p.y);
    }
    await expect.poll(() => played(page)).toContain('build_path');
    // A failed command → ui_error (and its toast).
    await page.evaluate(() => (window as unknown as { __tc: { dispatch(c: unknown): unknown } }).__tc.dispatch({ type: 'placeRide', defId: 'no_such_ride', x: 1, y: 1, rotation: 0 }));
    await expect.poll(() => played(page)).toContain('ui_error');
    await expect(page.getByTestId('toast')).toBeVisible();
    watch.expectNoErrors();
  });

  test('a hidden tab goes quiet (suspended) and comes back when visible', async ({ page }) => {
    const watch = watchErrors(page);
    await newPark(page, 'Hidden Park');
    await expect.poll(() => audioState(page)).toBe('running');
    const setHidden = (hidden: boolean): Promise<void> =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { value: h, configurable: true });
        Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    await setHidden(true);
    await expect.poll(() => audioState(page)).toBe('suspended');
    await setHidden(false);
    await expect.poll(() => audioState(page)).toBe('running');
    watch.expectNoErrors();
  });

  test('mute and volumes follow the settings', async ({ page }) => {
    await newPark(page, 'Quiet Park');
    await page.evaluate(() => (window as unknown as { __tc: { settings: { set(k: string, v: unknown): boolean } } }).__tc.settings.set('muteAll', true));
    const vol = await page.evaluate(() => (window as unknown as { __tcAudio: TcAudio }).__tcAudio.debug().volumes);
    expect(vol.muted).toBe(true);
    expect(vol.master).toBe(80);
  });
});

test.describe('the build', () => {
  test('ships no audio files (all sounds are synthesized)', async ({}, info) => {
    test.skip(info.project.name !== 'desktop', 'one check of dist/ is enough');
    const AUDIO = new Set(['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.aac', '.flac', '.opus', '.weba', '.mid', '.midi']);
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = walk(join(process.cwd(), 'dist'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => AUDIO.has(extname(f).toLowerCase()))).toEqual([]);
    for (const f of files.filter((x) => x.endsWith('.js') || x.endsWith('.html') || x.endsWith('.css'))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/data:audio\//);
    }
  });
});
