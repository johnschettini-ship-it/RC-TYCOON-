/**
 * `localizeReason` (master R27): command reasons and warnings stay English text in the simulation; the client maps
 * them back to a string id (exact text, or a template with `{…}` placeholders) and shows the current locale.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { en, text } from '../../../src/data/strings/en';
import { pseudoLocalize } from '../../../src/data/strings/en-XA';
import { setLocale } from '../../../src/data/strings/index';
import { LAND_ERR } from '../../../src/data/strings/land';
import { MANAGEMENT_ERRORS } from '../../../src/data/strings/management';
import { PATH_ERR } from '../../../src/data/strings/paths';
import { SCENARIO_ERR } from '../../../src/data/strings/scenario';
import { SCENERY_ERR } from '../../../src/data/strings/scenery';
import { STAFF_ERRORS } from '../../../src/data/strings/staff';
import { TERRAIN_ERR, TERRAIN_INPUT_ERR } from '../../../src/data/strings/terrain';
import { TRACK_ERR, TRACK_RATING_WARN, TRACK_WARN, fillTrackString } from '../../../src/data/strings/track';
import { localizeReason, reasonId } from '../../../src/i18n';
import { BUILD_STRINGS } from '../../../src/sim/commands/build/strings';
import { PRICE_ERRORS } from '../../../src/sim/commands/prices/index';
import { NOT_IMPLEMENTED, type CommandResult } from '../../../src/sim/commands/types';
import { executeCommand } from '../../../src/sim/commands';
import { ONLY_RIGHTS_HERE, OUTSIDE_THE_PARK } from '../../../src/sim/land/api';
import { toastForResult } from '../../../src/ui/toasts';
import { makeTestWorld } from '../../helpers/world';

afterEach(() => setLocale('en'));

const groups: Record<string, Record<string, string>> = {
  TRACK_ERR,
  TRACK_WARN,
  TRACK_RATING_WARN,
  LAND_ERR,
  TERRAIN_ERR,
  TERRAIN_INPUT_ERR,
  SCENERY_ERR,
  STAFF_ERRORS,
  SCENARIO_ERR,
  PATH_ERR,
  MANAGEMENT_ERRORS,
  BUILD_STRINGS,
  PRICE_ERRORS,
  sim: { OUTSIDE_THE_PARK, ONLY_RIGHTS_HERE, NOT_IMPLEMENTED },
};

describe('every reason the simulation returns has a string id', () => {
  it('data and sim reason constants map back to an id with the same English text', () => {
    const missing: string[] = [];
    for (const [g, entries] of Object.entries(groups)) {
      for (const [k, reason] of Object.entries(entries)) {
        const m = reasonId(reason);
        if (!m) missing.push(`${g}.${k}: ${reason}`);
        else if (m.params && Object.keys(m.params).length === 0) expect(en[m.id], `${g}.${k}`).toBe(reason);
      }
    }
    expect(missing).toEqual([]);
  });

  it('a real command failure maps to an id', () => {
    const world = makeTestWorld();
    const r = executeCommand(world, { type: 'setRidePrice', rideId: 99999, price: 100 } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(reasonId(r.reason)).not.toBeNull();
    expect(reasonId('Unknown command fly')).toEqual({ id: 'reason.command.unknown', params: { type: 'fly' } });
  });
});

describe('localizeReason', () => {
  it('in English returns the reason unchanged', () => {
    expect(localizeReason('Not enough cash')).toBe('Not enough cash');
    expect(localizeReason('Something no table has')).toBe('Something no table has');
  });

  it('exact reasons show in the current locale', () => {
    setLocale('en-XA');
    expect(localizeReason(BUILD_STRINGS.inTheWay)).toBe(pseudoLocalize('Something is in the way'));
    expect(localizeReason(MANAGEMENT_ERRORS.loanLimit)).toBe(pseudoLocalize('Loan limit reached'));
    // Text from the string table resolves to its own id.
    expect(localizeReason(en['ui.ghost.noCash'] as string)).toBe(text('ui.ghost.noCash'));
  });

  it('templated reasons keep their parameters', () => {
    const reason = fillTrackString(TRACK_ERR.tooHigh, { n: 40 });
    expect(reasonId(reason)).toEqual({ id: 'reason.track.tooHigh', params: { n: '40' } });
    expect(reasonId(fillTrackString(TRACK_ERR.carsRange, { min: 2, max: 7 }))).toEqual({ id: 'reason.track.carsRange', params: { min: '2', max: '7' } });
    setLocale('en-XA');
    expect(localizeReason(reason)).toBe(pseudoLocalize(TRACK_ERR.tooHigh).replace('{n}', '40'));
  });

  it('a reason inside a reason is localized too', () => {
    const reason = TERRAIN_ERR.skipped.replace('{n}', '3').replace('{reason}', TERRAIN_ERR.pathInWay);
    setLocale('en-XA');
    expect(localizeReason(reason)).toBe(pseudoLocalize(TERRAIN_ERR.skipped).replace('{n}', '3').replace('{reason}', pseudoLocalize(TERRAIN_ERR.pathInWay)));
  });

  it('unknown text (a player-typed name, or text already localized) is shown as is', () => {
    setLocale('en-XA');
    expect(localizeReason('Smoke Park')).toBe('Smoke Park');
    const already = text('night.warnDarkPaths');
    expect(localizeReason(already)).toBe(already);
  });

  it('toasts for command results use it for reasons and warnings', () => {
    setLocale('en-XA');
    const fail: CommandResult = { ok: false, reason: BUILD_STRINGS.notOwned };
    expect(toastForResult(fail)?.message).toBe(pseudoLocalize(BUILD_STRINGS.notOwned));
    const warn: CommandResult = { ok: true, cost: 0, warnings: [TRACK_WARN.entranceNeedsQueue, TRACK_WARN.exitNeedsFootpath] };
    expect(toastForResult(warn)?.message).toBe(`${pseudoLocalize(TRACK_WARN.entranceNeedsQueue)} · ${pseudoLocalize(TRACK_WARN.exitNeedsFootpath)}`);
  });
});
