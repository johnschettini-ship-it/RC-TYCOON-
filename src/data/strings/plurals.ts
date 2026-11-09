/**
 * Owner: W4-G. English plural strings (Phase 6 §4.8): `t(key, { n })` picks the form with `Intl.PluralRules`.
 * A key here must not also be in `en`. Every locale gives the same keys (the `other` form at least), with the
 * same placeholders as English (`tests/unit/i18n/locales.test.ts`).
 */
import type { PluralTable } from './types';

export const enPlurals: PluralTable = {
  // Phase 6 §4.8 example.
  'hud.guests': { one: '{n} guest', other: '{n} guests' },
};
