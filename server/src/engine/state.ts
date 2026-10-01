import type {
  Auction,
  CardEvent,
  ClientState,
  DeckName,
  Debt,
  Dice,
  GameStatus,
  LogEntry,
  MoveEvent,
  Phase,
  Player,
  PropertyState,
  Settings,
  Trade,
} from '../../../shared/types';

export interface Deck {
  order: number[];
  idx: number;
  /** card ids currently held by players (get-out-of-jail cards) */
  held: number[];
}

export interface DebtInternal extends Debt {
  /** continue a forced jail-exit move once the fine is paid */
  then?: { steps: number };
}

export interface GameState {
  roomCode: string;
  status: GameStatus;
  hostId: string;
  settings: Settings;
  players: Player[];
  props: Record<number, PropertyState>;
  currentIndex: number;
  phase: Phase;
  dice: Dice | null;
  doublesCount: number;
  rolledDoubles: boolean;
  log: LogEntry[];
  logSeq: number;
  auction: Auction | null;
  trades: Trade[];
  tradeSeq: number;
  debt: DebtInternal | null;
  winnerId: string | null;
  housesLeft: number;
  hotelsLeft: number;
  decks: Record<DeckName, Deck>;
  lastCard: CardEvent | null;
  lastMove: MoveEvent | null;
  eventSeq: number;
  turnNumber: number;
  version: number;
}

export interface Ctx {
  /** returns a float in [0,1). Injected so the engine is deterministic under test. */
  rng: () => number;
  now: number;
}

export type Result = string | null; // null = success, string = error message

export type { ClientState };
