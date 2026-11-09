/** Owner: W1-I. phase-3-management.md §6. */
import { notImplemented, ok, type HandlerMap, type ManagementCommand } from '../commands/types';
import { borrow, repay } from '../finance/loans';
import { markMessagesRead } from '../notifications';

export const managementHandlers: HandlerMap<ManagementCommand> = {
  setResearchBudget: notImplemented,
  setResearchFocus: notImplemented,
  startCampaign: notImplemented,
  borrow: (world, cmd, ctx) => borrow(world, cmd.amount, ctx),
  repay: (world, cmd, ctx) => repay(world, cmd.amount, ctx),
  markMessagesRead: (world, cmd) => {
    markMessagesRead(world, cmd.upToId);
    return ok();
  },
};
