/**
 * In-game menu (Phase 1 §4.7): Save (3 slots), Load, Export, Import, Quit to title
 * (confirm when the game has unsaved changes), and Settings (Phase 6 §4.9). The game pauses while the menu is open.
 * Task 24: on the upright phone the HUD passes `extra` items (Messages with its unread count, the objectives of a
 * scenario) for the controls its one top row has no room for; they follow Resume, and the menu closes before they run.
 * Owner: W1-B (Build 3: W4-F).
 */
import { text } from '../data/strings/en';
import { exportFile } from '../save';
import type { UiContext } from './context';
import type { MenuItem } from './extensions';
import { confirmDialog, openDialog, type DialogAction, type DialogHandle } from './dialogs';
import { openSettingsScreen } from './settings';
import { localizeReason } from '../i18n';

export function openMenu(ctx: UiContext, extra: readonly MenuItem[] = []): void {
  const { game, saves, root } = ctx;
  const speedBefore = game.speed;
  let resume = true;
  game.setSpeed(0);

  let menu: DialogHandle | null = null;
  const closeAll = (keepPaused: boolean): void => {
    if (keepPaused) resume = false;
    menu?.close();
  };

  const slotDialog = (mode: 'save' | 'load'): void => {
    const actions: DialogAction[] = saves.slots().map(({ slot, info }) => ({
      label: text('ui.slot.label', { n: slot }),
      detail: info ? text('ui.slot.info', { park: info.parkName, date: info.gameDate }) : text('ui.slot.empty'),
      testId: `slot-${slot}`,
      onClick: () => {
        d.close();
        if (mode === 'save') {
          if (saves.save(slot)) closeAll(false);
        } else if (saves.load(slot)) {
          closeAll(true);
        }
      },
    }));
    if (mode === 'load') {
      const auto = saves.autosaveInfo();
      if (auto) {
        actions.push({
          label: text('ui.slot.auto'),
          detail: text('ui.slot.info', { park: auto.parkName, date: auto.gameDate }),
          testId: 'slot-auto',
          onClick: () => {
            d.close();
            if (saves.load('auto')) closeAll(true);
          },
        });
      }
    }
    actions.push({ label: text('ui.dialog.cancel'), onClick: () => d.close() });
    const d = openDialog(root, { title: text(mode === 'save' ? 'ui.save.title' : 'ui.load.title'), actions, className: 'slot-dialog' });
  };

  const quit = (): void => {
    const go = (): void => {
      closeAll(true);
      ctx.showTitle();
    };
    if (game.dirty) confirmDialog(root, text('ui.quit.confirm'), text('ui.quit.yes'), text('ui.quit.no'), go);
    else go();
  };

  menu = openDialog(root, {
    title: text('ui.menu.title'),
    className: 'menu-dialog',
    onClose: () => {
      if (resume) game.setSpeed(speedBefore);
    },
    actions: [
      { label: text('ui.menu.resume'), kind: 'primary', testId: 'menu-resume', onClick: () => closeAll(false) },
      ...extra.map((item): DialogAction => ({
        label: item.label,
        detail: item.detail,
        testId: item.testId,
        onClick: () => {
          closeAll(false);
          item.onClick();
        },
      })),
      { label: text('ui.menu.save'), testId: 'menu-save', onClick: () => slotDialog('save') },
      { label: text('ui.menu.load'), testId: 'menu-load', onClick: () => slotDialog('load') },
      {
        label: text('ui.menu.export'),
        testId: 'menu-export',
        onClick: () => {
          try {
            exportFile(game.world);
            ctx.toast(text('ui.export.done'), 'info');
          } catch (e) {
            ctx.toast(localizeReason(e instanceof Error ? e.message : String(e)), 'error');
          }
        },
      },
      { label: text('ui.menu.import'), testId: 'menu-import', onClick: () => ctx.importSave(() => closeAll(true)) },
      // Phase 6 §4.9: the settings screen opens over the menu; Back returns here.
      { label: text('ui.menu.settings'), testId: 'menu-settings', onClick: () => openSettingsScreen(ctx) },
      { label: text('ui.menu.quit'), kind: 'danger', testId: 'menu-quit', onClick: quit },
    ],
  });
}
