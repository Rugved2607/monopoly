import { useState } from 'react';
import type { BoardDef, ClientState } from '../../../shared/types';
import { inr } from '../lib/format';
import { useNow } from '../lib/hooks';
import { net, useNet } from '../lib/net';
import { Modal } from './Modal';

export default function AuctionModal({ state, board }: { state: ClientState; board: BoardDef }) {
  const a = state.auction!;
  const { clockOffset } = useNet();
  const now = useNow(200);
  const sp = board.spaces[a.spaceId];
  const me = state.players.find((p) => p.id === state.youId)!;
  const high = a.highBidderId ? state.players.find((p) => p.id === a.highBidderId) : undefined;
  const remaining = Math.max(0, Math.ceil((a.endsAt - (now - clockOffset)) / 1000));
  const [custom, setCustom] = useState('');
  const min = a.currentBid + 10;
  const bid = (amount: number) => net.act({ type: 'bid', amount });
  const can = state.legal.canBid;

  return (
    <Modal label="Auction">
      <div className="text-center">
        <div className="text-sm font-semibold text-white/60">Auction</div>
        <h2 className="font-display text-3xl text-marigold-300">{sp.name}</h2>
        <div className="mt-1 text-white/70">List price {inr(sp.price!)}</div>
      </div>

      <div className="my-4 rounded-2xl bg-night-950/60 p-4 text-center">
        <div className="text-4xl font-extrabold" data-testid="current-bid">
          {a.currentBid ? inr(a.currentBid) : 'No bids yet'}
        </div>
        <div className="mt-1 text-white/70">{high ? `Highest bidder: ${high.name}` : 'Be the first to bid'}</div>
        <div className={'mx-auto mt-3 grid h-12 w-12 place-items-center rounded-full border-4 text-lg font-extrabold ' + (remaining <= 5 ? 'border-sindoor-500 text-sindoor-400' : 'border-marigold-500 text-marigold-300')} aria-live="polite" aria-label={`${remaining} seconds left`}>
          {remaining}
        </div>
      </div>

      {can ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[100, 500, 1000].map((inc) => {
              const amount = a.currentBid + inc;
              return (
                <button key={inc} className="btn-peacock btn-sm" disabled={amount > me.money} onClick={() => bid(amount)}>
                  +{inr(inc)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="field" type="number" inputMode="numeric" min={min} step={10} placeholder={`${inr(min)} or more`} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn-primary" disabled={!custom || Number(custom) < min || Number(custom) > me.money} onClick={() => bid(Math.floor(Number(custom))).then(() => setCustom(''))}>
              Bid
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-white/60">
            <span>Your cash: {inr(me.money)}</span>
            {state.legal.canPassAuction ? (
              <button className="btn-ghost btn-sm" onClick={() => net.act({ type: 'passAuction' })}>
                Drop out
              </button>
            ) : (
              <span className="font-semibold text-marigold-300">You are the highest bidder</span>
            )}
          </div>
        </>
      ) : (
        <p className="text-center text-white/60">{me.bankrupt ? 'You are out of the game.' : 'You dropped out. Waiting for the auction to end…'}</p>
      )}
      <p className="mt-3 text-center text-xs text-white/40">Each bid gives everyone at least 10 more seconds.</p>
    </Modal>
  );
}
