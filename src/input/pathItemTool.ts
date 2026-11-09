/**
 * Path item tool (Phase 3 §4.3–4.4, §6): ghost preview and the command a tap sends. Owner: W2-B. Pure.
 * The ghost is a local preview with the command's own failure texts; the command result is the final word.
 */
import { PATH_ITEMS } from '../data/catalog';
import { STAFF_ERRORS } from '../data/strings/staff';
import type { GhostState } from '../render/types';
import type { PathItemAction } from '../render/management/toolOptions';
import { isUnlocked } from '../sim/research/api';
import { isBroken, repairCost } from '../sim/litter/pathItems';
import { Content, PathItem } from '../sim/map';
import type { StaffCommand } from '../sim/commands/types';
import type { World } from '../sim/types';

/** The command a tap on `tile` sends for this action. */
export function pathItemCommand(world: World, action: PathItemAction, tile: number): StaffCommand {
  const w = world.state.map.width;
  const x = tile % w;
  const y = Math.floor(tile / w);
  if (action === 'remove') return { type: 'removePathItem', x, y };
  if (action === 'repair') return { type: 'repairPathItem', x, y };
  return { type: 'buildPathItem', x, y, itemType: action };
}

/** Ghost for the path item tool at `tile`: valid, or the reason the command would give. */
export function pathItemGhost(world: World, action: PathItemAction, tile: number): GhostState {
  const s = world.state;
  const map = s.map;
  const item = map.pathItem[tile] ?? PathItem.None;
  let reason: string | null = null;
  let cost = 0;
  if (action === 'remove') {
    if (item === PathItem.None) reason = STAFF_ERRORS.noItem;
  } else if (action === 'repair') {
    if (item === PathItem.None || !isBroken(map, tile)) reason = STAFF_ERRORS.notBroken;
    else {
      cost = repairCost(item);
      if (s.park.cash < cost) reason = STAFF_ERRORS.notEnoughCash;
    }
  } else {
    const def = PATH_ITEMS.find((d) => d.id === action);
    cost = def?.buildCost ?? 0;
    if (!def || !isUnlocked(world, def.id)) reason = STAFF_ERRORS.notUnlocked;
    else if (map.content[tile] !== Content.Footpath) reason = STAFF_ERRORS.needsFootpath;
    else if (item !== PathItem.None) reason = STAFF_ERRORS.tileHasItem;
    else if (s.park.cash < cost) reason = STAFF_ERRORS.notEnoughCash;
  }
  return { kind: 'pathItem', defId: action, tile, rotation: 0, valid: reason === null, reason, cost };
}
