import type { Cents, EntityId } from '../units';
import type { Dir } from '../map';

export interface Stall {
  id: EntityId;
  defId: string;
  name: string;
  x: number;
  y: number;
  /** Service side direction. */
  rotation: Dir;
  /** Footpath tile in front of the service side. */
  serviceTile: number;
  price: Cents;
  open: boolean;
  /** Guest id being served, or −1. */
  servingGuest: EntityId;
  totals: { sales: number; income: Cents; salesThisMonth: number; incomeThisMonth: Cents };
  builtTick: number;
  hoursThisMonth: number;
  totalBuildCost: Cents;
}
