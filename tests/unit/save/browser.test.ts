import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserStore, deserialize, exportFile, exportFileName, importFile, serialize, type KeyValueStore } from '../../../src/save';
import { makeRichWorld } from './fixture';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportFile', () => {
  it('downloads <park-name>.tcsave.json through a Blob and an anchor', async () => {
    const { world } = makeRichWorld();
    const clicked: Array<{ href: string; download: string }> = [];
    const anchor = {
      href: '',
      download: '',
      rel: '',
      style: { display: '' },
      click(): void {
        clicked.push({ href: this.href, download: this.download });
      },
      remove: vi.fn(),
    };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } });
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:tc-test';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.useFakeTimers();

    exportFile(world);

    expect(clicked).toEqual([{ href: 'blob:tc-test', download: 'Frosty Peaks.tcsave.json' }]);
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.remove).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:tc-test');
    vi.useRealTimers();

    expect(blob?.type).toBe('application/json');
    const r = deserialize(await blob!.text());
    if (!r.ok) throw new Error(r.error);
    expect(r.world.state).toStrictEqual(world.state);
  });

  it('makes the park name safe for file systems', () => {
    expect(exportFileName('Frosty Peaks')).toBe('Frosty Peaks.tcsave.json');
    expect(exportFileName('A/B\\C:D*E?F"G<H>I|J')).toBe('A-B-C-D-E-F-G-H-I-J.tcsave.json');
    expect(exportFileName('   ')).toBe('park.tcsave.json');
    expect(exportFileName('..hidden')).toBe('hidden.tcsave.json');
    expect(exportFileName('Tab\tand\nnewline')).toBe('Tab-and-newline.tcsave.json');
    expect(exportFileName('x'.repeat(100))).toBe(`${'x'.repeat(64)}.tcsave.json`);
  });
});

describe('importFile', () => {
  it('reads the picked file and loads it', async () => {
    const { world } = makeRichWorld();
    const file = new File([serialize(world, '0.1.0', '2026-11-09T00:00:00.000Z')], 'Frosty Peaks.tcsave.json', { type: 'application/json' });
    const r = await importFile(file);
    if (!r.ok) throw new Error(r.error);
    expect(r.world.state).toStrictEqual(world.state);
  });

  it('rejects a foreign file with the exact message', async () => {
    const file = new File(['{"hello":"world"}'], 'notes.json');
    expect(await importFile(file)).toEqual({ ok: false, error: 'This file is not a Thrills & Chills save' });
  });

  it('reports a file that cannot be read, without throwing', async () => {
    const file = { text: () => Promise.reject(new Error('NotReadableError')) } as unknown as File;
    expect(await importFile(file)).toEqual({ ok: false, error: 'This save could not be read' });
  });
});

describe('browserStore', () => {
  it('is null when localStorage is missing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(browserStore()).toBeNull();
  });

  it('is null when localStorage is blocked', () => {
    const blocked: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => undefined,
    };
    vi.stubGlobal('localStorage', blocked);
    expect(browserStore()).toBeNull();
  });

  it('returns localStorage when it works', () => {
    const data = new Map<string, string>();
    const ok: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
    vi.stubGlobal('localStorage', ok);
    expect(browserStore()).toBe(ok);
    expect(data.size).toBe(0);
  });
});
