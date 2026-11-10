/**
 * Tool cards (Phase 7 §4.4): every old toolbar tool that moves into a deck, with the icon, label, press, and pressed
 * state of its toolbar button. The temporary Rides and Stalls cards open today's picker panels until the ride and
 * stall cards replace them.
 */
import { text } from '../../data/strings/en';
import { pathItemAction } from '../../render/management/toolOptions';
import type { ToolId } from '../../render/types';
import type { PanelKind, UiContext } from '../context';
import { toolbarEntries } from '../extensions';
import { icon } from '../icons';
import { mgmtIcon } from '../management/icons';
import { orderToolCards, type DeckId } from './model';

export interface ToolCardDef {
  /** `data-tool` and `data-testid="tool-<id>"`: the id of the toolbar button the card replaces. */
  id: string;
  deck: DeckId;
  label: string;
  icon(): Element;
  onClick(ctx: UiContext): void;
  pressed(ctx: UiContext): boolean;
}

/** Selects a tool with no def, ghost, or drag (the toolbar's tool buttons). */
export function selectTool(ctx: UiContext, tool: ToolId): void {
  const t = ctx.game.tool;
  t.tool = tool;
  t.defId = null;
  t.ghost = null;
  t.drag = null;
}

const togglePanel = (ctx: UiContext, kind: PanelKind): void => {
  if (ctx.activePanel()?.kind === kind) ctx.closePanel();
  else ctx.openPanel(kind);
};
const panelIs = (ctx: UiContext, kind: PanelKind): boolean => ctx.activePanel()?.kind === kind;

/** The panel each panel card opens; a second press closes it. */
const PANEL_OF: Readonly<Partial<Record<string, PanelKind>>> = {
  rides: 'ridePicker',
  stalls: 'stallPicker',
  staff: 'staff',
  research: 'research',
  marketing: 'marketing',
  finance: 'finance',
  park: 'park',
};

/** The temporary cards that stand where the ride and stall cards go: first in their deck. */
const STAND_INS: ReadonlySet<string> = new Set(['rides', 'stalls']);

/** The base cards, the temporary Rides and Stalls cards, and every extension entry. */
export function allToolCards(_ctx: UiContext): ToolCardDef[] {
  const base: ToolCardDef[] = [
    { id: 'rides', deck: 'rides', label: text('ui.tool.rides'), icon: () => icon('rides'), onClick: (c) => togglePanel(c, 'ridePicker'), pressed: (c) => c.game.tool.tool === 'placeRide' || panelIs(c, 'ridePicker') },
    { id: 'stalls', deck: 'stalls', label: text('ui.tool.stalls'), icon: () => icon('stalls'), onClick: (c) => togglePanel(c, 'stallPicker'), pressed: (c) => c.game.tool.tool === 'placeStall' || panelIs(c, 'stallPicker') },
    { id: 'footpath', deck: 'paths', label: text('ui.tool.footpath'), icon: () => icon('footpath'), onClick: (c) => selectTool(c, 'footpath'), pressed: (c) => c.game.tool.tool === 'footpath' },
    { id: 'queue', deck: 'paths', label: text('ui.tool.queue'), icon: () => icon('queue'), onClick: (c) => selectTool(c, 'queue'), pressed: (c) => c.game.tool.tool === 'queue' },
    {
      id: 'pathItems',
      deck: 'paths',
      label: text('ui.tool.pathItems'),
      icon: () => mgmtIcon('pathItems'),
      onClick: (c) => {
        // Phase 3 path item tool: keeps the last choice (Bench by default).
        const action = pathItemAction(c.game.tool);
        selectTool(c, 'pathItem');
        c.game.tool.defId = action;
        // Phones: the bottom sheet would cover the path item bar and the map.
        if (c.root.dataset.layout === 'bottom') c.closePanel();
      },
      pressed: (c) => c.game.tool.tool === 'pathItem',
    },
    { id: 'staff', deck: 'manage', label: text('ui.tool.staff'), icon: () => mgmtIcon('staff'), onClick: (c) => togglePanel(c, 'staff'), pressed: (c) => panelIs(c, 'staff') || c.game.tool.tool === 'patrol' },
    { id: 'research', deck: 'manage', label: text('ui.tool.research'), icon: () => mgmtIcon('research'), onClick: (c) => togglePanel(c, 'research'), pressed: (c) => panelIs(c, 'research') },
    { id: 'marketing', deck: 'manage', label: text('ui.tool.marketing'), icon: () => mgmtIcon('marketing'), onClick: (c) => togglePanel(c, 'marketing'), pressed: (c) => panelIs(c, 'marketing') },
    { id: 'finance', deck: 'manage', label: text('ui.tool.finance'), icon: () => icon('finance'), onClick: (c) => togglePanel(c, 'finance'), pressed: (c) => panelIs(c, 'finance') },
    { id: 'park', deck: 'manage', label: text('ui.tool.park'), icon: () => icon('park'), onClick: (c) => togglePanel(c, 'park'), pressed: (c) => panelIs(c, 'park') },
  ];
  const extra: ToolCardDef[] = toolbarEntries().map((e) => ({
    id: e.id,
    deck: e.deck,
    label: e.label,
    icon: () => e.icon(),
    onClick: (c) => e.onClick(c),
    pressed: (c) => e.pressed(c),
  }));
  return [...base, ...extra];
}

/** The cards of one deck, in hand order: the temporary card first, then the tool cards by `TOOL_CARD_ORDER`. */
export function cardsOfDeck(deck: DeckId, cards: readonly ToolCardDef[]): ToolCardDef[] {
  const own = cards.filter((c) => c.deck === deck);
  return [...own.filter((c) => STAND_INS.has(c.id)), ...orderToolCards(deck, own.filter((c) => !STAND_INS.has(c.id)))];
}

/**
 * Put back (a press on Put back or on the held card). A card whose press opens a panel, a picker, or the overlay chips
 * and leaves `ToolState.tool` alone does what its second press does: it closes them. A card held through its tool (a
 * tool card, or the Rides card while a ride is placed) selects Inspect.
 */
export function putBack(ctx: UiContext, def: ToolCardDef): void {
  const panel = PANEL_OF[def.id];
  const t = ctx.game.tool.tool;
  const ownOpen =
    panel !== undefined ? panelIs(ctx, panel)
    : def.id === 'overlays' ? true
    : def.id === 'shows' ? t !== 'placeShowSite'
    : false;
  if (ownOpen) {
    def.onClick(ctx);
    return;
  }
  selectTool(ctx, 'inspect');
}
