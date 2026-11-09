/** Park panel After Dark switch text and state (Phase 4 §7). Owner: W3-F. */
import { describe, expect, it } from 'vitest';
import { afterDarkView } from '../../../src/ui/afterDark/view';
import { afterDarkUi } from '../../../src/ui/afterDark';
import { UI_EXTENSIONS } from '../../../src/ui/extensions';
import { makeTestWorld } from '../../helpers/world';

describe('After Dark switch (park panel)', () => {
  it('shows On with the help line, and the lit share as a percentage', () => {
    const s = makeTestWorld().state;
    expect(afterDarkView(s, 0.643, null)).toEqual({
      label: 'After Dark: On',
      pressed: true,
      disabled: false,
      help: 'Day and night cycle. At night guests want lit paths and love spooky rides',
      litPaths: '64%',
    });
  });

  it('shows Off with its own help line', () => {
    const s = makeTestWorld().state;
    s.park.afterDark = false;
    expect(afterDarkView(s, 1, null)).toMatchObject({ label: 'After Dark: Off', pressed: false, help: 'Always daytime. Lamps still work as decoration', litPaths: '100%' });
  });

  it('is disabled with the scenario reason when the scenario fixes it', () => {
    const s = makeTestWorld().state;
    expect(afterDarkView(s, 0, 'After Dark is always on here')).toMatchObject({ disabled: true, help: 'After Dark is always on here', litPaths: '0%' });
  });

  it('is registered as a park panel section', () => {
    expect(UI_EXTENSIONS).toContain(afterDarkUi);
    expect(typeof afterDarkUi.parkPanel).toBe('function');
  });
});
