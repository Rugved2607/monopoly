import { useState } from 'react';
import type { BoardDef, ClientState, TradeSide } from '../../../shared/types';
import { inr } from '../lib/format';
import { net } from '../lib/net';
import { Modal } from './Modal';

export interface TradeDraft {
  /** set when editing/countering an existing trade */
  tradeId?: string;
  otherId: string;
  give: TradeSide;
  get: TradeSide;
}

export const emptySide = (): TradeSide => ({ cash: 0, props: [], jailCards: 0 });

function Side({ title, ownerId, side, onChange, state, board }: { title: string; ownerId: string; side: TradeSide; onChange: (s: TradeSide) => void; state: ClientState; board: BoardDef }) {
  const owner = state.players.find((p) => p.id === ownerId)!;
  const owned = Object.entries(state.props)
    .filter(([, st]) => st.owner === ownerId)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
  const toggle = (id: number) => onChange({ ...side, props: side.props.includes(id) ? side.props.filter((x) => x !== id) : [...side.props, id] });
  return (
    <div className="rounded-2xl bg-night-950/50 p-4">
      <h3 className="mb-2 flex items-center gap-2 font-bold">
        <span className="h-3 w-3 rounded-full" style={{ background: owner.color }} />
        {title}
      </h3>
      <label className="mb-1 block text-xs font-semibold text-white/60">Cash (you have {inr(owner.money)})</label>
      <input
        className="field mb-3"
        type="number"
        inputMode="numeric"
        min={0}
        step={10}
        max={owner.money}
        value={side.cash || ''}
        placeholder="₹0"
        onChange={(e) => onChange({ ...side, cash: Math.max(0, Math.min(owner.money, Math.floor(Number(e.target.value) || 0))) })}
      />
      <div className="mb-1 text-xs font-semibold text-white/60">Properties</div>
      <div className="max-h-48 space-y-1 overflow-y-auto pr-1 scroll-thin">
        {owned.length === 0 && <p className="text-sm text-white/50">No properties to trade.</p>}
        {owned.map((id) => {
          const sp = board.spaces[id];
          const st = state.props[id];
          const color = sp.groupId !== undefined ? board.groups[sp.groupId].color : '#64748b';
          const built = sp.kind === 'property' && board.spaces.some((o) => o.groupId === sp.groupId && (state.props[o.id]?.houses ?? 0) > 0);
          return (
            <label key={id} className={'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ' + (built ? 'opacity-40' : 'cursor-pointer hover:bg-white/10')}>
              <input type="checkbox" className="h-4 w-4 accent-marigold-500" disabled={built} checked={side.props.includes(id)} onChange={() => toggle(id)} />
              <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
              <span className="flex-1 font-semibold">{sp.name}</span>
              {st.mortgaged && <span className="chip">Mortgaged</span>}
              {built && <span className="chip">Has buildings</span>}
            </label>
          );
        })}
      </div>
      {owner.jailCards.length > 0 && (
        <label className="mt-3 flex items-center justify-between text-sm">
          Get Out of Jail Free cards
          <select className="rounded-lg bg-night-900 px-2 py-1" value={side.jailCards} onChange={(e) => onChange({ ...side, jailCards: Number(e.target.value) })}>
            {Array.from({ length: owner.jailCards.length + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export default function TradeModal({ draft, state, board, onClose }: { draft: TradeDraft; state: ClientState; board: BoardDef; onClose: () => void }) {
  const [otherId, setOtherId] = useState(draft.otherId);
  const [give, setGive] = useState(draft.give);
  const [get, setGet] = useState(draft.get);
  const [busy, setBusy] = useState(false);
  const others = state.players.filter((p) => p.id !== state.youId && !p.bankrupt);
  const editing = !!draft.tradeId;
  const existing = state.trades.find((t) => t.id === draft.tradeId);

  const send = async () => {
    setBusy(true);
    let ok: boolean;
    if (existing) {
      const iAmFrom = existing.fromId === state.youId;
      ok = await net.act({ type: 'counterTrade', tradeId: existing.id, offer: iAmFrom ? give : get, request: iAmFrom ? get : give });
    } else {
      ok = await net.act({ type: 'proposeTrade', toId: otherId, offer: give, request: get });
    }
    setBusy(false);
    if (ok) onClose();
  };

  const empty = !give.cash && !give.props.length && !give.jailCards && !get.cash && !get.props.length && !get.jailCards;

  return (
    <Modal onClose={onClose} wide label="Trade">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl text-marigold-300">{editing ? 'Counter-offer' : 'Propose a trade'}</h2>
        {!editing && (
          <select
            className="rounded-xl bg-night-950/60 px-3 py-2 font-semibold"
            value={otherId}
            onChange={(e) => {
              setOtherId(e.target.value);
              setGet(emptySide());
            }}
            aria-label="Trade partner"
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                Trade with {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Side title="You give" ownerId={state.youId} side={give} onChange={setGive} state={state} board={board} />
        <Side title={`${state.players.find((p) => p.id === otherId)?.name ?? 'They'} gives`} ownerId={otherId} side={get} onChange={setGet} state={state} board={board} />
      </div>
      <p className="mt-3 text-sm text-white/60">{editing ? 'Sending a counter-offer resets the other player’s acceptance. ' : ''}A trade only happens after both players accept the same terms. Mortgaged properties cost the receiver a 10% transfer fee.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={busy || empty} onClick={send}>
          {editing ? 'Send counter-offer' : 'Send offer'}
        </button>
      </div>
    </Modal>
  );
}
