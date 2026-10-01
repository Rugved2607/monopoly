import { useEffect, useRef } from 'react';
import type { BoardDef, ClientState, Trade, TradeSide } from '../../../shared/types';
import { inr } from '../lib/format';
import { net } from '../lib/net';
import type { TradeDraft } from './TradeModal';

type Tok = { id: string; emoji: string }[];
const emojiOf = (tokens: Tok, id: string) => tokens.find((t) => t.id === id)?.emoji ?? '🎲';

export function TokenDot({ tokens, token, color, size = 'h-9 w-9 text-lg' }: { tokens: Tok; token: string; color: string; size?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full border-[3px] bg-paper-50 ${size}`} style={{ borderColor: color }}>
      {emojiOf(tokens, token)}
    </span>
  );
}

function Swatch({ spaceId, board, state, onSelect }: { spaceId: number; board: BoardDef; state: ClientState; onSelect: (id: number) => void }) {
  const sp = board.spaces[spaceId];
  const st = state.props[spaceId];
  const color = sp.groupId !== undefined ? board.groups[sp.groupId].color : sp.kind === 'transport' ? '#3b4a8c' : '#64748b';
  return (
    <button
      type="button"
      onClick={() => onSelect(spaceId)}
      title={`${sp.name}${st.mortgaged ? ' (mortgaged)' : ''}${st.houses ? (st.houses === 5 ? ' · hotel' : ` · ${st.houses} house${st.houses > 1 ? 's' : ''}`) : ''}`}
      aria-label={sp.name}
      className="relative h-5 w-4 rounded-[3px] border border-white/60"
      style={{ background: color, opacity: st.mortgaged ? 0.4 : 1 }}
    >
      {st.houses > 0 && <span className="absolute -bottom-1 -right-1 grid h-3 w-3 place-items-center rounded-full bg-white text-[8px] font-extrabold text-night-950">{st.houses === 5 ? 'H' : st.houses}</span>}
    </button>
  );
}

export function PlayersPanel({ state, board, tokens, onSelect }: { state: ClientState; board: BoardDef; tokens: Tok; onSelect: (id: number) => void }) {
  return (
    <ul className="space-y-2">
      {state.players.map((p) => {
        const owned = Object.entries(state.props)
          .filter(([, st]) => st.owner === p.id)
          .map(([id]) => Number(id))
          .sort((a, b) => a - b);
        const isCur = p.id === state.currentPlayerId && state.status === 'playing';
        const houses = owned.reduce((n, id) => n + (state.props[id].houses < 5 ? state.props[id].houses : 0), 0);
        const hotels = owned.filter((id) => state.props[id].houses === 5).length;
        return (
          <li key={p.id} className={'rounded-2xl border p-3 ' + (isCur ? 'border-marigold-500 bg-marigold-500/10' : 'border-white/10 bg-night-950/40') + (p.bankrupt ? ' opacity-50' : '')}>
            <div className="flex items-center gap-3">
              <TokenDot tokens={tokens} token={p.token} color={p.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className={'truncate ' + (p.bankrupt ? 'line-through' : '')}>{p.name}</span>
                  {p.id === state.youId && <span className="text-xs text-white/50">(you)</span>}
                  {p.id === state.hostId && <span title="Host">👑</span>}
                  {!p.connected && !p.bankrupt && <span className="chip bg-sindoor-500/25 text-sindoor-400">Offline</span>}
                  {p.inJail && <span className="chip bg-white/15">⛓️ Jail</span>}
                  {p.bankrupt && <span className="chip bg-sindoor-500/25 text-sindoor-400">Bankrupt</span>}
                  {p.jailCards.length > 0 && <span className="chip" title="Get Out of Jail Free cards">🗝️ {p.jailCards.length}</span>}
                </div>
                <div className="text-xs text-white/60">{p.bankrupt ? 'Out of the game' : `At ${board.spaces[p.position].name}`}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-extrabold">{inr(p.money)}</div>
                <div className="text-xs text-white/50">Worth {inr(state.netWorth[p.id] ?? 0)}</div>
              </div>
            </div>
            {owned.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {owned.map((id) => (
                  <Swatch key={id} spaceId={id} board={board} state={state} onSelect={onSelect} />
                ))}
                {(houses > 0 || hotels > 0) && (
                  <span className="ml-1 text-xs text-white/60">
                    {houses > 0 && `🏠 ${houses}`} {hotels > 0 && `🏨 ${hotels}`}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AssetsPanel({ state, board, onSelect }: { state: ClientState; board: BoardDef; onSelect: (id: number) => void }) {
  const owned = Object.entries(state.props)
    .filter(([, st]) => st.owner === state.youId)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
  if (owned.length === 0) return <p className="rounded-xl bg-night-950/40 p-4 text-sm text-white/60">You do not own any properties yet. Land on an unowned space and buy it, or win one at auction.</p>;
  return (
    <ul className="space-y-2">
      {owned.map((id) => {
        const sp = board.spaces[id];
        const st = state.props[id];
        const a = state.legal.props[id];
        const color = sp.groupId !== undefined ? board.groups[sp.groupId].color : '#64748b';
        return (
          <li key={id} className="rounded-xl border border-white/10 bg-night-950/40 p-2.5">
            <div className="flex items-center gap-2">
              <span className="h-8 w-2 rounded-full" style={{ background: color }} />
              <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(id)}>
                <div className="truncate font-bold">{sp.name}</div>
                <div className="text-xs text-white/60">
                  {st.mortgaged ? 'Mortgaged' : st.houses === 5 ? 'Hotel' : st.houses ? `${st.houses} house${st.houses > 1 ? 's' : ''}` : sp.kind === 'property' ? 'No buildings' : sp.kind === 'transport' ? 'Transport hub' : 'Utility'}
                </div>
              </button>
            </div>
            {a && (a.build || a.sell || a.mortgage || a.unmortgage) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.build && (
                  <button className="btn-peacock btn-sm" onClick={() => net.act({ type: 'build', spaceId: id })}>
                    Build {inr(sp.houseCost!)}
                  </button>
                )}
                {a.sell && (
                  <button className="btn-ghost btn-sm" onClick={() => net.act({ type: 'sellHouse', spaceId: id })}>
                    Sell +{inr(sp.houseCost! / 2)}
                  </button>
                )}
                {a.mortgage && (
                  <button className="btn-ghost btn-sm" onClick={() => net.act({ type: 'mortgage', spaceId: id })}>
                    Mortgage +{inr(sp.mortgage!)}
                  </button>
                )}
                {a.unmortgage && (
                  <button className="btn-primary btn-sm" onClick={() => net.act({ type: 'unmortgage', spaceId: id })}>
                    Unmortgage {inr(Math.ceil((sp.mortgage! * 1.1) / 10) * 10)}
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function describe(side: TradeSide, board: BoardDef) {
  const parts = [side.cash ? inr(side.cash) : '', ...side.props.map((id) => board.spaces[id].name), side.jailCards ? `${side.jailCards} jail card${side.jailCards > 1 ? 's' : ''}` : ''].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function TradesPanel({ state, board, onNew, onEdit }: { state: ClientState; board: BoardDef; onNew: () => void; onEdit: (d: TradeDraft) => void }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?';
  const view = (t: Trade) => {
    const iAmFrom = t.fromId === state.youId;
    return { otherId: iAmFrom ? t.toId : t.fromId, give: iAmFrom ? t.offer : t.request, get: iAmFrom ? t.request : t.offer };
  };
  return (
    <div className="space-y-3">
      <button className="btn-primary w-full" disabled={!state.legal.canTrade} onClick={onNew}>
        New trade
      </button>
      {state.trades.length === 0 && <p className="rounded-xl bg-night-950/40 p-4 text-sm text-white/60">No open trades. Offer cash or properties to another player, and both of you confirm before anything moves.</p>}
      {state.trades.map((t) => {
        const v = view(t);
        const myTurn = t.lastEditorId !== state.youId;
        return (
          <div key={t.id} className={'rounded-2xl border p-3 ' + (myTurn ? 'border-marigold-500 bg-marigold-500/10' : 'border-white/10 bg-night-950/40')}>
            <div className="mb-1 text-sm font-bold">
              {myTurn ? `${name(t.lastEditorId)} sent you an offer` : `Waiting for ${name(v.otherId)}`}
            </div>
            <div className="space-y-1 text-sm">
              <div>
                <span className="text-white/60">You give: </span>
                {describe(v.give, board)}
              </div>
              <div>
                <span className="text-white/60">You get: </span>
                {describe(v.get, board)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {myTurn && (
                <button className="btn-primary btn-sm" onClick={() => net.act({ type: 'acceptTrade', tradeId: t.id })}>
                  Accept
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={() => onEdit({ tradeId: t.id, otherId: v.otherId, give: v.give, get: v.get })}>
                {myTurn ? 'Counter' : 'Edit'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => net.act({ type: 'rejectTrade', tradeId: t.id })}>
                {myTurn ? 'Reject' : 'Cancel'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const LOG_ICON: Record<string, string> = { dice: '🎲', move: '👣', money: '💰', property: '🏠', card: '🃏', jail: '⛓️', trade: '🤝', bankrupt: '💥', system: '📣', info: '•' };

export function LogPanel({ state }: { state: ClientState }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [state.log.length]);
  return (
    <ol className="space-y-1.5 text-sm" aria-live="polite">
      {state.log.map((l) => {
        const p = l.playerId ? state.players.find((x) => x.id === l.playerId) : undefined;
        return (
          <li key={l.id} className="flex gap-2 rounded-lg px-2 py-1" style={{ borderLeft: `3px solid ${p?.color ?? 'transparent'}`, background: 'rgba(255,255,255,.04)' }}>
            <span aria-hidden>{LOG_ICON[l.kind] ?? '•'}</span>
            <span className="text-white/90">{l.text}</span>
          </li>
        );
      })}
      <div ref={end} />
    </ol>
  );
}
