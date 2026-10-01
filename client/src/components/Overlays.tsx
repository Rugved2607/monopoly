import { useEffect, useState } from 'react';
import type { BoardDef, ClientState } from '../../../shared/types';
import { inr } from '../lib/format';
import { sfx } from '../lib/sfx';
import { net } from '../lib/net';
import { Modal } from './Modal';

/** Delay before showing results of a move so the token can finish walking first. */
export function settleDelay(state: ClientState) {
  const m = state.lastMove;
  const steps = m && m.mode === 'walk' ? (m.to - m.from + 56) % 56 : 0;
  return 900 + steps * 150 + 250;
}

export function CardToast({ state, tokens }: { state: ClientState; tokens: { id: string; emoji: string }[] }) {
  const [shown, setShown] = useState<ClientState['lastCard']>(null);
  const [seen, setSeen] = useState(state.lastCard?.seq ?? 0);

  useEffect(() => {
    const c = state.lastCard;
    if (!c || c.seq === seen) return;
    setSeen(c.seq);
    const t1 = setTimeout(() => {
      setShown(c);
      sfx.card();
    }, settleDelay(state));
    return () => clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastCard?.seq]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 5200);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const p = state.players.find((x) => x.id === shown.playerId);
  const k = shown.deck === 'khazana';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
      <button
        onClick={() => setShown(null)}
        className="pointer-events-auto w-full max-w-sm animate-pop overflow-hidden rounded-3xl border-4 border-white bg-paper-50 text-left text-night-950 shadow-2xl"
        aria-label="Dismiss card"
      >
        <div className="px-5 py-2 font-display text-xl text-white" style={{ background: k ? '#0d8f8a' : '#8a1f6b' }}>
          {k ? '🎁 Khazana' : '🎲 Bhagya'}
        </div>
        <div className="px-5 py-4">
          <div className="text-xs font-bold text-night-950/60">
            {tokens.find((t) => t.id === p?.token)?.emoji} {p?.name} drew
          </div>
          <div className="font-display text-2xl leading-tight">{shown.title}</div>
          <p className="mt-1 text-[15px] font-semibold">{shown.text}</p>
        </div>
      </button>
    </div>
  );
}

export function GameOver({ state, board, tokens }: { state: ClientState; board: BoardDef; tokens: { id: string; emoji: string }[] }) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const isHost = state.hostId === state.youId;
  const owned = winner ? Object.entries(state.props).filter(([, s]) => s.owner === winner.id) : [];
  const hotels = owned.filter(([, s]) => s.houses === 5).length;
  const houses = owned.reduce((n, [, s]) => n + (s.houses < 5 ? s.houses : 0), 0);
  void board;
  return (
    <Modal label="Game over">
      <div className="text-center">
        <div className="text-6xl">🏆</div>
        <div className="mt-1 text-sm font-semibold text-white/60">Game over</div>
        <h2 className="font-display text-4xl text-marigold-300">{winner ? `${winner.name} wins!` : 'No winner'}</h2>
        {winner && (
          <>
            <div className="mx-auto mt-3 grid h-16 w-16 place-items-center rounded-full border-4 bg-paper-50 text-4xl" style={{ borderColor: winner.color }}>
              {tokens.find((t) => t.id === winner.token)?.emoji}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2 text-left">
              {[
                ['Net worth', inr(state.netWorth[winner.id] ?? 0)],
                ['Properties', String(owned.length)],
                ['Hotels', String(hotels)],
                ['Houses', String(houses)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-night-950/60 px-3 py-2">
                  <dt className="text-xs text-white/60">{k}</dt>
                  <dd className="text-xl font-extrabold">{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {isHost ? (
          <>
            <button className="btn-primary flex-1" onClick={() => net.act({ type: 'playAgain' })}>
              Play again
            </button>
            <button className="btn-ghost flex-1" onClick={() => net.act({ type: 'returnToLobby' })}>
              Return to lobby
            </button>
          </>
        ) : (
          <p className="flex-1 rounded-xl bg-white/5 px-3 py-2.5 text-center text-sm font-semibold text-white/70">Waiting for the host to start another round…</p>
        )}
        <button className="btn-ghost" onClick={() => net.leave()}>
          Leave
        </button>
      </div>
    </Modal>
  );
}
