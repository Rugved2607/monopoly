import type { ClientState } from '../../../shared/types';
import { legalActions, netWorth, type GameState } from './engine';

/** Build the per-player view of the authoritative state. Secrets (deck order) never leave the server. */
export function toClientState(s: GameState, viewerId: string, now: number): ClientState {
  const netWorthMap: Record<string, number> = {};
  for (const p of s.players) netWorthMap[p.id] = netWorth(s, p);
  return {
    roomCode: s.roomCode,
    status: s.status,
    hostId: s.hostId,
    settings: s.settings,
    players: s.players,
    props: s.props,
    currentPlayerId: s.status === 'playing' ? s.players[s.currentIndex]?.id ?? null : null,
    phase: s.phase,
    dice: s.dice,
    rolledDoubles: s.rolledDoubles,
    log: s.log.slice(-120),
    auction: s.auction ? { ...s.auction, serverNow: now } : null,
    trades: s.trades.filter((t) => t.fromId === viewerId || t.toId === viewerId),
    debt: s.debt ? { debtorId: s.debt.debtorId, creditorId: s.debt.creditorId, amount: s.debt.amount, reason: s.debt.reason } : null,
    winnerId: s.winnerId,
    housesLeft: s.housesLeft,
    hotelsLeft: s.hotelsLeft,
    lastCard: s.lastCard,
    lastMove: s.lastMove,
    turnNumber: s.turnNumber,
    version: s.version,
    youId: viewerId,
    legal: legalActions(s, viewerId),
    netWorth: netWorthMap,
  };
}
