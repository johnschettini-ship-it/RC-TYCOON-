/**
 * Toolbar (Phase 0 §4.11, Phase 1 §7): bottom below 900 px, left side otherwise.
 * Buttons are at least 44 × 44 CSS px with aria-labels and visible labels. Owner: W1-B.
 * Tool buttons write the shared ToolState; the input controller reacts on its next frame.
 */
import { text } from '../data/strings/en';
import type { ToolId } from '../render/types';
import type { PanelKind, UiContext } from './context';
import { h, setAttr, setText } from './dom';
import { icon, type IconName } from './icons';
import { mgmtIcon, type MgmtIconName } from './management/icons';
import { pathItemAction } from '../render/management/toolOptions';
import { unreadCount } from '../sim/notifications';

interface ButtonDef {
  id: string;
  label: string;
  icon: IconName | { mgmt: MgmtIconName };
  onClick: () => void;
  pressed: () => boolean;
}

export function createToolbar(ctx: UiContext, openMenu: () => void): { el: HTMLElement; update(): void } {
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
    { id: 'messages', label: text('ui.tool.messages'), icon: { mgmt: 'messages' }, onClick: () => togglePanel('messages'), pressed: () => panelIs('messages') },
    {
      id: 'temperament',
      label: text('ui.tool.temperament'),
      icon: 'temperament',
      onClick: () => {
        game.tool.overlay = game.tool.overlay === 'temperament' ? 'none' : 'temperament';
      },
      pressed: () => game.tool.overlay === 'temperament',
    },
    { id: 'menu', label: text('ui.tool.menu'), icon: 'menu', onClick: openMenu, pressed: () => false },
  ];

  const buttons = defs.map((d) => {
    const ariaLabel = d.id === 'temperament' ? text('ui.tool.temperamentLong') : d.label;
    const b = h(
      'button',
      { type: 'button', class: 'tool-btn', 'data-tool': d.id, 'data-testid': `tool-${d.id}`, 'aria-label': ariaLabel, title: ariaLabel, 'aria-pressed': 'false', onclick: d.onClick },
      typeof d.icon === 'string' ? icon(d.icon) : mgmtIcon(d.icon.mgmt),
      h('span', { class: 'tool-label', text: d.label, 'aria-hidden': 'true' }),
    );
    return { def: d, el: b };
  });
  // The menu opens a dialog: it is not a toggle.
  const menu = buttons.find((b) => b.def.id === 'menu');
  if (menu) {
    menu.el.removeAttribute('aria-pressed');
    menu.el.setAttribute('aria-haspopup', 'dialog');
  }

  // Unread badge on Messages (Phase 3 §4.14: `messagesReadUpTo` drives it).
  const badge = h('span', { class: 'tool-badge', 'data-testid': 'messages-badge', 'aria-hidden': 'true', hidden: true });
  const messages = buttons.find((b) => b.def.id === 'messages');
  messages?.el.append(badge);
  let lastUnread = -1;

  const el = h('nav', { class: 'toolbar', role: 'toolbar', 'aria-label': text('ui.toolbar.label') }, ...buttons.map((b) => b.el));
  return {
    el,
    update() {
      for (const b of buttons) {
        if (b.def.id === 'menu') continue;
        setAttr(b.el, 'aria-pressed', b.def.pressed() ? 'true' : 'false');
      }
      const unread = unreadCount(game.world);
      if (unread !== lastUnread && messages) {
        lastUnread = unread;
        badge.hidden = unread === 0;
        setText(badge, unread > 99 ? '99+' : String(unread));
        const label = unread > 0 ? text('ui.tool.messagesUnread', { count: unread }) : text('ui.tool.messages');
        setAttr(messages.el, 'aria-label', label);
        setAttr(messages.el, 'title', label);
      }
    },
  };
}
