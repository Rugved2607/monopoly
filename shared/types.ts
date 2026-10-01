/**
 * Types shared by the game server (authoritative engine) and the React client.
 * Type-only module: nothing here exists at runtime.
 */

export type SpaceKind =
  | 'go'
  | 'property'
  | 'transport'
  | 'utility'
  | 'tax'
  | 'khazana' // community-chest style deck
  | 'bhagya' // chance style deck
  | 'jail'
  | 'freeParking'
  | 'goToJail';

export type DeckName = 'khazana' | 'bhagya';

export interface Group {
  id: number;
  name: string;
  color: string;
  size: number;
}

export interface Space {
  id: number;
  kind: SpaceKind;
  name: string;
  /** Short label that fits inside a board cell */
  short: string;
  subtitle?: string;
  groupId?: number;
  price?: number;
  /** property: [base, 1 house, 2, 3, 4, hotel]. transport: rent by number owned [0,1..n]. */
  rents?: number[];
  houseCost?: number;
  mortgage?: number;
  /** tax amount */
  amount?: number;
  icon?: string;
}

export interface BoardDef {
  spaces: Space[];
  groups: Group[];
  jailIndex: number;
  goToJailIndex: number;
  jailFine: number;
  mortgageInterestPct: number;
  utilityMultipliers: number[];
}

export interface PropertyState {
  owner: string | null;
  /** 0-4 houses, 5 = hotel */
  houses: number;
  mortgaged: boolean;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  color: string;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: DeckName[];
  bankrupt: boolean;
  connected: boolean;
}

export type Phase = 'roll' | 'buy' | 'auction' | 'debt' | 'end';
export type GameStatus = 'lobby' | 'playing' | 'finished';

export interface Settings {
  startingMoney: number;
  goSalary: number;
  auctions: boolean;
}

export interface Dice {
  d1: number;
  d2: number;
  seq: number;
}

export interface Auction {
  spaceId: number;
  currentBid: number;
  highBidderId: string | null;
  participants: string[];
  passed: string[];
  endsAt: number;
  serverNow: number;
}

export interface TradeSide {
  cash: number;
  props: number[];
  jailCards: number;
}

export interface Trade {
  id: string;
  fromId: string;
  toId: string;
  /** what `from` gives to `to` */
  offer: TradeSide;
  /** what `to` gives to `from` */
  request: TradeSide;
  agreed: { from: boolean; to: boolean };
  lastEditorId: string;
}

export interface Debt {
  debtorId: string;
  creditorId: string | null;
  amount: number;
  reason: string;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'info' | 'dice' | 'move' | 'money' | 'property' | 'card' | 'jail' | 'trade' | 'bankrupt' | 'system';
  playerId?: string;
}

export interface CardEvent {
  seq: number;
  playerId: string;
  deck: DeckName;
  title: string;
  text: string;
}

export interface MoveEvent {
  seq: number;
  playerId: string;
  from: number;
  to: number;
  mode: 'walk' | 'jump';
}

export interface PropertyActions {
  build: boolean;
  sell: boolean;
  mortgage: boolean;
  unmortgage: boolean;
}

/** Legal actions for the viewing player, computed by the server engine. */
export interface Legal {
  canRoll: boolean;
  canBuy: boolean;
  canDeclineBuy: boolean;
  canEndTurn: boolean;
  canPayJail: boolean;
  canUseJailCard: boolean;
  canPayDebt: boolean;
  canResign: boolean;
  canBid: boolean;
  canPassAuction: boolean;
  canTrade: boolean;
  props: Record<number, PropertyActions>;
}

export interface ClientState {
  roomCode: string;
  status: GameStatus;
  hostId: string;
  settings: Settings;
  players: Player[];
  props: Record<number, PropertyState>;
  currentPlayerId: string | null;
  phase: Phase;
  dice: Dice | null;
  rolledDoubles: boolean;
  log: LogEntry[];
  auction: Auction | null;
  trades: Trade[];
  debt: Debt | null;
  winnerId: string | null;
  housesLeft: number;
  hotelsLeft: number;
  lastCard: CardEvent | null;
  lastMove: MoveEvent | null;
  turnNumber: number;
  version: number;
  youId: string;
  legal: Legal;
  netWorth: Record<string, number>;
}

/* ---------- socket protocol ---------- */

export type ClientAction =
  | { type: 'setToken'; token: string }
  | { type: 'setSettings'; settings: Partial<Settings> }
  | { type: 'kick'; playerId: string }
  | { type: 'start' }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'declineBuy' }
  | { type: 'endTurn' }
  | { type: 'payJail' }
  | { type: 'useJailCard' }
  | { type: 'build'; spaceId: number }
  | { type: 'sellHouse'; spaceId: number }
  | { type: 'mortgage'; spaceId: number }
  | { type: 'unmortgage'; spaceId: number }
  | { type: 'bid'; amount: number }
  | { type: 'passAuction' }
  | { type: 'payDebt' }
  | { type: 'resign' }
  | { type: 'proposeTrade'; toId: string; offer: TradeSide; request: TradeSide }
  | { type: 'counterTrade'; tradeId: string; offer: TradeSide; request: TradeSide }
  | { type: 'acceptTrade'; tradeId: string }
  | { type: 'rejectTrade'; tradeId: string }
  | { type: 'returnToLobby' }
  | { type: 'playAgain' };

export interface JoinedPayload {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  board: BoardDef;
  tokens: { id: string; label: string; emoji: string }[];
}

export type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };
