/**
 * The realistic title screen's poster cover (VITE_ART=real build only): `art/real/title/index.json` (the cover index,
 * `layout.ts`) and its poster files, decoded with `createImageBitmap` outside the set manager, only while the title
 * shows. One framing (one poster bitmap) is decoded at a time; `close()` closes every bitmap, including any still
 * decoding (closed as it lands).
 *
 * `createTitleSession` is the title's life cycle, without the DOM: `open` (the title shows) releases the park's art
 * first, then loads the index; `want` asks for a framing and keeps showing the old one until the new one is decoded
 * (no blank frame on a rotation), then closes the old; `close` (a park opens) closes everything. A failed index or
 * picture leaves no art (the sky fill and the menu stay) and never throws.
 */
import { checkCoverIndex, type CoverIndex, type Framing } from './layout';

/** What a decoded picture must offer (an ImageBitmap does). */
export interface TitleBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}
export interface TitleLoadDeps<B extends TitleBitmap> {
  fetch(url: string): Promise<Pick<Response, 'ok' | 'status' | 'json' | 'blob'>>;
  decode(blob: Blob): Promise<B>;
}
/** One framing's poster. A framing that uses the other framing's file decodes its own copy (closed with it). */
export interface FramingArt<B extends TitleBitmap = ImageBitmap> {
  framing: Framing;
  poster: B;
}
export interface TitleArt<B extends TitleBitmap = ImageBitmap> {
  readonly index: CoverIndex;
  /** Decodes `f` (once; the same promise while it decodes); null when closed or the file failed. */
  framing(f: Framing): Promise<FramingArt<B> | null>;
  /** Closes `f`'s poster. */
  drop(f: Framing): void;
  /** Bitmaps open now. */
  open(): number;
  /** Closes every bitmap; later `framing` calls give null. */
  close(): void;
}

const defaults: TitleLoadDeps<ImageBitmap> = {
  fetch: (url) => fetch(url),
  decode: (blob) => createImageBitmap(blob),
};

export async function loadTitleArt(base: string): Promise<TitleArt>;
export async function loadTitleArt<B extends TitleBitmap>(base: string, deps: TitleLoadDeps<B>): Promise<TitleArt<B>>;
export async function loadTitleArt(base: string, deps: TitleLoadDeps<TitleBitmap> = defaults as unknown as TitleLoadDeps<TitleBitmap>): Promise<TitleArt<TitleBitmap>> {
  const res = await deps.fetch(`${base}index.json`);
  if (!res.ok) throw new Error(`title index.json: HTTP ${res.status}`);
  const checked = checkCoverIndex(await res.json());
  if (checked instanceof Error) throw checked;
  const index = checked;
  let closed = false;
  const live = new Set<TitleBitmap>();
  const pending = new Map<Framing, Promise<FramingArt<TitleBitmap> | null>>();
  const done = new Map<Framing, FramingArt<TitleBitmap>>();

  const free = (b: TitleBitmap | undefined): void => {
    if (b && live.delete(b)) b.close();
  };
  /** Decodes `file`; a bitmap that lands after `close` is closed at once (and gives null). */
  const one = async (file: string): Promise<TitleBitmap | null> => {
    try {
      const r = await deps.fetch(base + file);
      if (!r.ok) throw new Error(`title ${file}: HTTP ${r.status}`);
      const b = await deps.decode(await r.blob());
      if (closed) {
        b.close();
        return null;
      }
      live.add(b);
      return b;
    } catch (err) {
      if (!closed) console.warn('[art=real] title', err);
      return null;
    }
  };

  return {
    index,
    framing(f) {
      if (closed) return Promise.resolve(null);
      const ready = done.get(f);
      if (ready) return Promise.resolve(ready);
      let p = pending.get(f);
      if (!p) {
        p = one(index[f].file).then((b) => {
          pending.delete(f);
          if (!b || closed) {
            free(b ?? undefined);
            return null;
          }
          const art: FramingArt<TitleBitmap> = { framing: f, poster: b };
          done.set(f, art);
          return art;
        });
        pending.set(f, p);
      }
      return p;
    },
    drop(f) {
      const a = done.get(f);
      if (!a) return;
      done.delete(f);
      free(a.poster);
    },
    open: () => live.size,
    close() {
      closed = true;
      done.clear();
      for (const b of [...live]) free(b);
    },
  };
}

export interface TitleSessionDeps<B extends TitleBitmap> {
  load(): Promise<TitleArt<B>>;
  /** Releases the park's art (`releasePark`); called before every load. */
  releasePark(): void;
  /** The art shown changed (a framing landed, or everything closed): draw again. */
  changed(): void;
}
export interface TitleSession<B extends TitleBitmap> {
  open(): void;
  want(f: Framing): void;
  /** The framing shown now, or null (the sky fill only). */
  current(): FramingArt<B> | null;
  index(): CoverIndex | null;
  close(): void;
}

export function createTitleSession<B extends TitleBitmap>(deps: TitleSessionDeps<B>): TitleSession<B> {
  let isOpen = false;
  /** Bumped on every open and close: work of an older title is thrown away. */
  let gen = 0;
  let art: TitleArt<B> | null = null;
  let shown: FramingArt<B> | null = null;
  let wanted: Framing | null = null;

  const fetchWanted = (): void => {
    const a = art;
    const f = wanted;
    if (!a || !f || shown?.framing === f) return;
    const g = gen;
    void a.framing(f).then((fa) => {
      if (g !== gen || !fa) return;
      if (wanted !== f) {
        // Asked for another framing meanwhile: keep what shows, drop this one.
        if (shown?.framing !== f) a.drop(f);
        return;
      }
      const old = shown;
      shown = fa;
      if (old && old.framing !== f) a.drop(old.framing);
      deps.changed();
    });
  };

  return {
    open() {
      if (isOpen) return;
      isOpen = true;
      const g = ++gen;
      deps.releasePark();
      let p: Promise<TitleArt<B>>;
      try {
        p = deps.load();
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then(
        (a) => {
          if (g !== gen) {
            a.close();
            return;
          }
          art = a;
          fetchWanted();
        },
        (err) => {
          if (g === gen) console.warn('[art=real] title art', err);
        },
      );
    },
    want(f) {
      wanted = f;
      if (isOpen) fetchWanted();
    },
    current: () => shown,
    index: () => art?.index ?? null,
    close() {
      if (!isOpen) return;
      isOpen = false;
      gen++;
      art?.close();
      art = null;
      shown = null;
      deps.changed();
    },
  };
}
