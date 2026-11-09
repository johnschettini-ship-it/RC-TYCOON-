/**
 * Content names (Phase 6 §4.8, Build 3 gate): one `content.<id>` string per catalog entry, generated from the
 * catalogs and registered in `en.ts`; the client shows names through `contentName(id)`, so `en-XA` translates them.
 * The simulation keeps ids and English (master R5, R27).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FLAT_RIDES, PATH_ITEMS, SCENERY, SCENERY_THEMES, SHOW_SITES, STAFF, STALLS, TRACK_RIDES } from '../../../src/data/catalog';
import { SCENARIOS } from '../../../src/data/scenarios';
import { CONTENT_CATALOGS, contentIdOfName, contentKey, contentStrings, scenarioDescriptionKey, scenarioNameKey } from '../../../src/data/strings/content';
import { en } from '../../../src/data/strings/en';
import { pseudoLocalize } from '../../../src/data/strings/en-XA';
import { LOCALES, setLocale } from '../../../src/data/strings/index';
import { MSG } from '../../../src/data/strings/management';
import { TRACK_RATING_WARN, fillTrackString } from '../../../src/data/strings/track';
import { ALL_TRACK_PIECES } from '../../../src/data/track';
import { CAMPAIGNS } from '../../../src/data/tuning/management';
import { localizeReason } from '../../../src/i18n';
import { contentName, localizeContentName, localizeContentParams, scenarioDescription, scenarioName } from '../../../src/ui/contentName';
import { messageLine } from '../../../src/ui/management/messages';
import { researchView } from '../../../src/ui/management/research';
import { showCards } from '../../../src/ui/shows/view';
import { makeTestWorld } from '../../helpers/world';

afterEach(() => setLocale('en'));

const ROOT = join(__dirname, '../../..');
const ALL = [...FLAT_RIDES, ...TRACK_RIDES, ...STALLS, ...PATH_ITEMS, ...STAFF, ...SCENERY_THEMES, ...SCENERY, ...SHOW_SITES, ...CAMPAIGNS, ...ALL_TRACK_PIECES];

describe('content.<id> strings', () => {
  it('every catalog entry has its name under content.<id>, registered in the English table', () => {
    expect(Object.keys(CONTENT_CATALOGS)).toEqual(['flatRides', 'trackRides', 'stalls', 'pathItems', 'staff', 'sceneryThemes', 'scenery', 'showSites', 'campaigns', 'trackPieces']);
    for (const d of ALL) {
      expect(contentStrings[contentKey(d.id)], d.id).toBe(d.name);
      expect(en[contentKey(d.id)], d.id).toBe(d.name);
    }
    expect(Object.keys(contentStrings)).toHaveLength(ALL.length + 2 * SCENARIOS.length);
  });

  it('every scenario has its name and description under content.scenario.<id>', () => {
    for (const d of SCENARIOS) {
      expect(en[scenarioNameKey(d.id)], d.id).toBe(d.nameKey);
      expect(en[scenarioDescriptionKey(d.id)], d.id).toBe(d.description);
    }
    expect(scenarioName({ id: 'meadow_start', nameKey: 'Meadow Start' })).toBe('Meadow Start');
    setLocale('en-XA');
    const meadow = SCENARIOS.find((d) => d.id === 'meadow_start');
    expect(meadow).toBeDefined();
    if (meadow) {
      expect(scenarioName(meadow)).toBe(pseudoLocalize(meadow.nameKey));
      expect(scenarioDescription(meadow)).toBe(pseudoLocalize(meadow.description));
    }
    // A scenario the table does not know keeps its English text.
    expect(scenarioName({ id: 'not_a_scenario', nameKey: 'Somewhere' })).toBe('Somewhere');
  });

  it('ids are unique across every catalog, so one key names one thing', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const [cat, list] of Object.entries(CONTENT_CATALOGS)) {
      for (const d of list) {
        const prev = seen.get(d.id);
        if (prev !== undefined) dup.push(`${d.id} in ${prev} and ${cat}`);
        seen.set(d.id, cat);
      }
    }
    expect(dup).toEqual([]);
  });

  it('content keys do not shadow any other string id', () => {
    const others = Object.keys(en).filter((k) => !k.startsWith('content.'));
    expect(others.filter((k) => contentStrings[k] !== undefined)).toEqual([]);
  });

  it('the pseudo-locale translates every content name', () => {
    const xa = LOCALES.find((l) => l.code === 'en-XA');
    for (const d of ALL) expect(xa?.strings[contentKey(d.id)], d.id).toBe(pseudoLocalize(d.name));
  });

  it('names and scenario descriptions follow master R4 (no final period)', () => {
    for (const d of ALL) expect(d.name.endsWith('.'), d.id).toBe(false);
    for (const d of SCENARIOS) expect(d.description.endsWith('.'), d.id).toBe(false);
  });
});

describe('contentName', () => {
  it('shows the English name, the pseudo-locale name after a switch, and an unknown id as is', () => {
    expect(contentName('carousel')).toBe('Carousel');
    expect(contentName('inverted_coaster')).toBe('Inverted Coaster');
    expect(contentName('no_such_thing')).toBe('no_such_thing');
    setLocale('en-XA');
    expect(contentName('carousel')).toBe(pseudoLocalize('Carousel'));
    expect(contentName('frost_peaks')).toBe(pseudoLocalize('Frost Peaks'));
    expect(contentName('no_such_thing')).toBe('no_such_thing');
  });

  it('maps an English catalog name back to its id; other text is unchanged', () => {
    expect(contentIdOfName('Lightshow Tower')).toBe('lightshow_tower');
    expect(contentIdOfName('Carousel 1')).toBeUndefined();
    setLocale('en-XA');
    expect(localizeContentName('Radio Jingle')).toBe(pseudoLocalize('Radio Jingle'));
    expect(localizeContentName('Carousel 1')).toBe('Carousel 1');
  });

  it('message parameters: research items by id, campaigns and pieces by their English name; instance names stay', () => {
    setLocale('en-XA');
    expect(localizeContentParams({ itemId: 'spiral_slide', name: 'Spiral Slide' })).toEqual({ itemId: 'spiral_slide', name: pseudoLocalize('Spiral Slide') });
    expect(localizeContentParams({ campaign: 'Snack Deal' })).toEqual({ campaign: pseudoLocalize('Snack Deal') });
    expect(localizeContentParams({ campaignId: 'snack_deal', campaign: 'Snack Deal' })?.campaign).toBe(pseudoLocalize('Snack Deal'));
    expect(localizeContentParams({ name: 'Carousel 2' })).toEqual({ name: 'Carousel 2' });
    expect(localizeContentParams(undefined)).toBeUndefined();
    const line = messageLine({ category: 'marketing', textId: MSG.campaignEnded, params: { campaign: 'Radio Jingle' }, tile: -1, entityId: -1 });
    expect(line).toContain(pseudoLocalize('Radio Jingle'));
    expect(line).not.toContain('Radio Jingle has');
  });

  it('a catalog name inside a sim reason is shown in the current locale', () => {
    const piece = ALL_TRACK_PIECES.find((p) => p.id === 'steep_up');
    expect(piece).toBeDefined();
    const reason = fillTrackString(TRACK_RATING_WARN.testFailedStop, { n: 4, name: piece?.name ?? '' });
    expect(localizeReason(reason)).toBe(reason);
    setLocale('en-XA');
    const shown = localizeReason(reason);
    expect(shown).toContain(pseudoLocalize(piece?.name ?? ''));
    expect(shown).toContain('4');
  });

  it('view models of the research tab and the show picker use the locale', () => {
    const world = makeTestWorld();
    setLocale('en-XA');
    const v = researchView(world);
    if (v.current !== null) expect(v.name).toBe(contentName(v.current));
    for (const c of showCards(world)) expect(c.name).toBe(pseudoLocalize(SHOW_SITES.find((d) => d.id === c.id)?.name ?? ''));
  });
});

describe('no client code shows a catalog name field', () => {
  /** `def.name`-style reads of catalog definitions in the client (instance names such as `ride.name` are game data). */
  const CATALOG_NAME = /\b(def|cat|themeDef|item|piece|theme|campaign|info|catalogDef)\??\.name\b|Def\([^)]*\)\??\.name\b|contentInfo\([^)]*\)\??\.name\b/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(name) ? [p] : [];
    });
  }

  it('ui/, a11y/, and input/ read names through contentName', () => {
    const hits: string[] = [];
    for (const dir of ['src/ui', 'src/a11y', 'src/input']) {
      for (const f of files(join(ROOT, dir))) {
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (CATALOG_NAME.test(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
