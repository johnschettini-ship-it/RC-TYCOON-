/** Owner: W1-I. phase-3-management.md §6. */
import { notImplemented, ok, type HandlerMap, type ManagementCommand } from '../commands/types';
import { markMessagesRead } from '../notifications';

export const managementHandlers: HandlerMap<ManagementCommand> = {
  setResearchBudget: notImplemented,
  setResearchFocus: notImplemented,
  startCampaign: notImplemented,
  borrow: notImplemented,
  repay: notImplemented,
  markMessagesRead: (world, cmd) => {
    markMessagesRead(world, cmd.upToId);
    return ok();
  },
};
