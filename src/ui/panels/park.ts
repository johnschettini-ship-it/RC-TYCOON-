/** Park panel (Phase 1 §7): name, open/close, entrance fee, rating, turned-away count. Owner: W1-B. */
import { text } from '../../data/strings/en';
import type { PanelView, UiContext } from '../context';
import { h, newId, setText } from '../dom';
import { formatMoney } from '../format';
import { PARK_NAME_MAX, validateParkName } from '../names';
import { priceSlider, section, statRow, toggleButton } from '../widgets';
import { UI_EXTENSIONS } from '../extensions';

/** Entrance fee range $0–$50 in $1 steps (Phase 1 §4.5). */
export const ENTRANCE_FEE_MAX = 5000;
export const ENTRANCE_FEE_STEP = 100;

export function createParkPanel(ctx: UiContext): PanelView {
  const { game } = ctx;
  const park = () => game.world.state.park;

  const nameId = newId('park-name');
  const nameInput = h('input', { id: nameId, type: 'text', class: 'text-input', maxlength: PARK_NAME_MAX, autocomplete: 'off', value: park().name });
  const nameError = h('p', { class: 'field-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'name-form',
      onsubmit: (e: Event) => {
        e.preventDefault();
        const v = validateParkName(nameInput.value);
        if (!v.ok) {
          setText(nameError, v.error);
          return;
        }
        setText(nameError, '');
        game.dispatch({ type: 'renamePark', name: v.name });
      },
    },
    h('label', { for: nameId, class: 'row-label', text: text('ui.park.name') }),
    h('div', { class: 'inline' }, nameInput, h('button', { type: 'submit', class: 'btn', text: text('ui.park.rename') })),
    nameError,
  );
  const openState = statRow(text('ui.park.title'));
  const openBtn = toggleButton(() => game.dispatch({ type: 'setParkOpen', open: !park().open }));
  const fee = priceSlider(text('ui.park.fee'), {
    max: ENTRANCE_FEE_MAX,
    step: ENTRANCE_FEE_STEP,
    format: formatMoney,
    onCommit: (cents) => game.dispatch({ type: 'setEntranceFee', fee: cents }),
  });
  const rating = statRow(text('ui.park.rating'));
  const guests = statRow(text('ui.park.guests'));
  const turned = statRow(text('ui.park.turnedAway'));

  const body = h(
    'div',
    { class: 'panel-content' },
    section(null, form),
    section(null, openState.el, openBtn.el),
    section(null, fee.el),
    section(null, rating.el, guests.el, turned.el),
  );
  // Build 2 park settings and records (Wave 3 extensions): After Dark switch, awards.
  const extra = UI_EXTENSIONS.flatMap((x) => (x.parkPanel ? [x.parkPanel(ctx)] : []));
  for (const p of extra) body.append(p.el);

  return {
    kind: 'park',
    id: null,
    title: park().name,
    titleNow: () => park().name,
    body,
    update() {
      const p = park();
      if (document.activeElement !== nameInput && nameInput.value !== p.name && nameError.textContent === '') nameInput.value = p.name;
      openState.set(text(p.open ? 'ui.park.isOpen' : 'ui.park.isClosed'));
      openBtn.set(text(p.open ? 'ui.park.close' : 'ui.park.open'), p.open);
      fee.set(p.entranceFee);
      rating.set(text('ui.park.ratingValue', { value: p.rating }));
      guests.set(String(game.world.state.guests.length));
      turned.set(String(p.turnedAway));
      const now = performance.now();
      for (const x of extra) x.update(now);
      return true;
    },
  };
}
