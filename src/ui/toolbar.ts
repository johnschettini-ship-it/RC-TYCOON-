/**
 * Toolbar (Phase 0 §4.11, Phase 1 §7): bottom below 900 px, left side otherwise.
 * Buttons are at least 44 × 44 CSS px with aria-labels and visible labels. Owner: W1-B.
 * Tool buttons write the shared ToolState; the input controller reacts on its next frame.
 */
import { text } from '../data/strings/en';
import type { ToolId } from '../render/types';
import type { PanelKind, UiContext } from './context';
import { h, setAttr } from './dom';
import { icon, type IconName } from './icons';
import { mgmtIcon, type MgmtIconName } from './management/icons';
import { pathItemAction } from '../render/management/toolOptions';
import { toolbarEntries } from './extensions';

interface ButtonDef {
  id: string;
  label: string;
  /** Build 2 extension entries (`./extensions.ts`) bring their own icon element. */
  icon: IconName | { mgmt: MgmtIconName } | { el: () => Element };
  onClick: () => void;
  pressed: () => boolean;
}

export function createToolbar(ctx: UiContext): { el: HTMLElement; update(): void } {
  const { game } = ctx;
  const setTool = (tool: ToolId): void => {
    const t = game.tool;
    t.tool = tool;
    t.defId = null;
    t.ghost = null;
    t.drag = null;
  };
  const togglePanel = (kind: PanelKind): void => {
    if (ctx.activePanel()?.kind === kind) ctx.closePanel();
    else ctx.openPanel(kind);
  };
  const panelIs = (kind: PanelKind): boolean => ctx.activePanel()?.kind === kind;

  const defs: ButtonDef[] = [
    { id: 'inspect', label: text('ui.tool.inspect'), icon: 'inspect', onClick: () => setTool('inspect'), pressed: () => game.tool.tool === 'inspect' },
    { id: 'footpath', label: text('ui.tool.footpath'), icon: 'footpath', onClick: () => setTool('footpath'), pressed: () => game.tool.tool === 'footpath' },
    { id: 'queue', label: text('ui.tool.queue'), icon: 'queue', onClick: () => setTool('queue'), pressed: () => game.tool.tool === 'queue' },
    { id: 'rides', label: text('ui.tool.rides'), icon: 'rides', onClick: () => togglePanel('ridePicker'), pressed: () => game.tool.tool === 'placeRide' || panelIs('ridePicker') },
    { id: 'stalls', label: text('ui.tool.stalls'), icon: 'stalls', onClick: () => togglePanel('stallPicker'), pressed: () => game.tool.tool === 'placeStall' || panelIs('stallPicker') },
    {
      id: 'pathItems',
      label: text('ui.tool.pathItems'),
      icon: { mgmt: 'pathItems' },
      onClick: () => {
        // Phase 3 path item tool: keeps the last choice (Bench by default).
        const action = pathItemAction(game.tool);
        setTool('pathItem');
        game.tool.defId = action;
        // Phones: the bottom sheet would cover the path item bar and the map.
        if (ctx.root.dataset.layout === 'bottom') ctx.closePanel();
      },
      pressed: () => game.tool.tool === 'pathItem',
    },
    { id: 'demolish', label: text('ui.tool.demolish'), icon: 'demolish', onClick: () => setTool('demolish'), pressed: () => game.tool.tool === 'demolish' },
    { id: 'staff', label: text('ui.tool.staff'), icon: { mgmt: 'staff' }, onClick: () => togglePanel('staff'), pressed: () => panelIs('staff') || game.tool.tool === 'patrol' },
    { id: 'research', label: text('ui.tool.research'), icon: { mgmt: 'research' }, onClick: () => togglePanel('research'), pressed: () => panelIs('research') },
    { id: 'marketing', label: text('ui.tool.marketing'), icon: { mgmt: 'marketing' }, onClick: () => togglePanel('marketing'), pressed: () => panelIs('marketing') },
    { id: 'finance', label: text('ui.tool.finance'), icon: 'finance', onClick: () => togglePanel('finance'), pressed: () => panelIs('finance') },
    { id: 'park', label: text('ui.tool.park'), icon: 'park', onClick: () => togglePanel('park'), pressed: () => panelIs('park') },
  ];
  // Build 2 tools (Wave 3 extensions) go before Demolish, in registry order.
  const extra: ButtonDef[] = toolbarEntries().map((e) => ({ id: e.id, label: e.label, icon: { el: e.icon }, onClick: () => e.onClick(ctx), pressed: () => e.pressed(ctx) }));
  defs.splice(defs.findIndex((d) => d.id === 'demolish'), 0, ...extra);

  const buttons = defs.map((d) => {
    const ariaLabel = d.label;
    const b = h(
      'button',
      { type: 'button', class: 'tool-btn', 'data-tool': d.id, 'data-testid': `tool-${d.id}`, 'aria-label': ariaLabel, title: ariaLabel, 'aria-pressed': 'false', onclick: d.onClick },
      typeof d.icon === 'string' ? icon(d.icon) : 'el' in d.icon ? d.icon.el() : mgmtIcon(d.icon.mgmt),
      h('span', { class: 'tool-label', text: d.label, 'aria-hidden': 'true' }),
    );
    return { def: d, el: b };
  });
  const el = h('nav', { class: 'toolbar', role: 'toolbar', 'aria-label': text('ui.toolbar.label') }, ...buttons.map((b) => b.el));
  return {
    el,
    update() {
      for (const b of buttons) {
        setAttr(b.el, 'aria-pressed', b.def.pressed() ? 'true' : 'false');
      }
    },
  };
}
