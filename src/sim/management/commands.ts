/** Owner: W1-I. phase-3-management.md §6. Failure reasons are the exact spec strings (master R4). */
import { MANAGEMENT_ERRORS } from '../../data/strings/management';
import { RESEARCH_CATEGORIES } from '../../data/research';
import { RESEARCH_LEVELS } from '../../data/tuning/management';
import { fail, notImplemented, ok, type HandlerMap, type ManagementCommand } from '../commands/types';
import { borrow, repay } from '../finance/loans';
import { markMessagesRead } from '../notifications';
import { setResearchLevel } from '../research/update';

export const managementHandlers: HandlerMap<ManagementCommand> = {
  setResearchBudget: (world, cmd) => {
    if (!RESEARCH_LEVELS.includes(cmd.level)) return fail(MANAGEMENT_ERRORS.unknownBudget);
    setResearchLevel(world, cmd.level);
    return ok();
  },
  setResearchFocus: (world, cmd) => {
    if (!RESEARCH_CATEGORIES.includes(cmd.category)) return fail(MANAGEMENT_ERRORS.unknownCategory);
    world.state.management.research.focus[cmd.category] = cmd.on === true;
    return ok();
  },
  startCampaign: notImplemented,
  borrow: (world, cmd, ctx) => borrow(world, cmd.amount, ctx),
  repay: (world, cmd, ctx) => repay(world, cmd.amount, ctx),
  markMessagesRead: (world, cmd) => {
    markMessagesRead(world, cmd.upToId);
    return ok();
  },
};
