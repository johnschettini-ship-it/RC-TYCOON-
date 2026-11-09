/**
 * Owner: W1-I. Reference integrity for the management slice (Phase 3 §5).
 * Demolish (W1-C) and staff removal (W1-H) should call this when an entity is removed, so campaign
 * and message targets clear at once. Hour-start sweeps (`hourlyMarketing`, `pruneMessages`) catch any miss.
 */
import { endCampaignsForTarget } from '../marketing/campaigns';
import { forgetEntityInMessages } from '../notifications';
import type { World } from '../types';
import type { EntityId } from '../units';

export function forgetManagementEntity(world: World, entityId: EntityId): void {
  endCampaignsForTarget(world, entityId);
  forgetEntityInMessages(world, entityId);
}
