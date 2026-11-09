/** Management slice (Phase 3). Owner: W1-I. Shapes follow phase-3-management.md §4.6–4.15 and §5. */
import type { Cents, EntityId } from '../units';
import type { ResearchCategory, WeatherKey } from '../../data/catalog/types';

export type ResearchLevel = 'none' | 'low' | 'medium' | 'high';
export type MessageCategory = 'breakdown' | 'research' | 'weather' | 'finance' | 'staff' | 'marketing' | 'park';

export interface Message {
  id: number;
  tick: number;
  category: MessageCategory;
  /** String table id (master R5). */
  textId: string;
  params?: Record<string, string | number>;
  /** Tile to locate, or −1. */
  tile: number;
  /** Entity to locate, or −1. */
  entityId: EntityId;
}

export interface ManagementSlice {
  research: {
    level: ResearchLevel;
    focus: Record<ResearchCategory, boolean>;
    /** Item id in progress, or null when everything is unlocked. */
    current: string | null;
    progress: number;
    unlocked: string[];
    hoursThisMonth: number;
  };
  campaigns: { type: string; targetId: EntityId; endTick: number }[];
  loan: { balance: Cents };
  weather: { current: WeatherKey; next: WeatherKey; nextChangeTick: number };
  parkValue: Cents;
  messages: Message[];
  nextMessageId: number;
  messagesReadUpTo: number;
}

export function createManagementSlice(): ManagementSlice {
  return {
    research: {
      level: 'medium',
      focus: { gentle: true, thrill: true, coasters: true, shops: true, water: true, scenery: true },
      current: null,
      progress: 0,
      unlocked: [],
      hoursThisMonth: 0,
    },
    campaigns: [],
    loan: { balance: 0 },
    weather: { current: 'sunny', next: 'sunny', nextChangeTick: 0 },
    parkValue: 0,
    messages: [],
    nextMessageId: 1,
    messagesReadUpTo: 0,
  };
}
