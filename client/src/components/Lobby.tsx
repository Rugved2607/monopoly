import { useState } from 'react';
import type { ClientState } from '../../../shared/types';
import { inr } from '../lib/format';
import { net, useNet } from '../lib/net';

export default function Lobby({ state }: { state: ClientState }) {
  const { tokens } = useNet();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const isHost = state.hostId === state.youId;
  const me = state.players.find((p) => p.id === state.youId)!;
  const taken = new Set(state.players.filter((p) => p.id !== state.youId).map((p) => p.token));

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? state.roomCode : `${location.origin}/?room=${state.roomCode}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const set = (settings: Partial<ClientState['settings']>) => net.act({ type: 'setSettings', settings });

  return (
    <main className="mx-auto grid min-h-full max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1.2fr_1fr]">
      <section className="panel p-6">
        <h1 className="font-display text-3xl text-marigold-300">India Property Tycoon</h1>
        <p className="mt-1 text-white/70">Waiting for players. Share the room code so friends can join from any device.</p>

        <div className="mt-5 rounded-2xl border-2 border-dashed border-marigold-500/60 bg-night-950/50 p-4 text-center">
          <div className="text-sm font-semibold text-white/60">Room code</div>
          <div className="font-mono text-4xl font-extrabold tracking-[0.2em] text-white sm:text-5xl" data-testid="room-code">
            {state.roomCode}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button className="btn-primary btn-sm" onClick={() => copy('code')}>
              {copied === 'code' ? 'Copied' : 'Copy room code'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => copy('link')}>
              {copied === 'link' ? 'Link copied' : 'Copy invite link'}
            </button>
          </div>
        </div>

        <h2 className="mb-2 mt-6 text-lg font-bold">
          Players <span className="text-white/50">({state.players.length} of 8)</span>
        </h2>
        <ul className="space-y-2">
          {state.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-night-950/50 px-3 py-2">
              <span className="grid h-10 w-10 place-items-center rounded-full border-[3px] bg-paper-50 text-xl" style={{ borderColor: p.color }}>
                {tokens.find((t) => t.id === p.token)?.emoji}
              </span>
              <span className="flex-1 font-bold">
                {p.name}
                {p.id === state.youId && <span className="ml-1 text-white/50">(you)</span>}
                {p.id === state.hostId && <span className="chip ml-2 bg-marigold-500/20 text-marigold-300">Host</span>}
              </span>
              <span className={'h-2.5 w-2.5 rounded-full ' + (p.connected ? 'bg-emerald-400' : 'bg-white/30')} title={p.connected ? 'Online' : 'Offline'} />
              {isHost && p.id !== state.youId && (
                <button className="btn-ghost btn-sm" onClick={() => net.act({ type: 'kick', playerId: p.id })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {state.players.length < 2 && <p className="mt-3 text-sm text-white/60">You need at least one more player to start.</p>}
      </section>

      <section className="space-y-6">
        <div className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">Choose your token</h2>
          <div className="grid grid-cols-5 gap-2">
            {tokens.map((t) => (
              <button
                key={t.id}
                title={t.label}
                aria-label={t.label}
                aria-pressed={me.token === t.id}
                disabled={taken.has(t.id)}
                onClick={() => net.act({ type: 'setToken', token: t.id })}
                className={'grid aspect-square place-items-center rounded-xl border-2 bg-paper-50 text-2xl transition disabled:opacity-25 ' + (me.token === t.id ? 'border-marigold-500 ring-2 ring-marigold-300' : 'border-transparent hover:border-white/50')}
              >
                {t.emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-3 text-lg font-bold">{isHost ? 'Game settings' : 'Game settings (host only)'}</h2>
          <label className="mb-1 block text-sm text-white/70">Starting money</label>
          <select className="field mb-3" disabled={!isHost} value={state.settings.startingMoney} onChange={(e) => set({ startingMoney: Number(e.target.value) })}>
            {[7500, 10000, 15000, 20000, 30000].map((v) => (
              <option key={v} value={v}>
                {inr(v)}
              </option>
            ))}
          </select>
          <label className="mb-1 block text-sm text-white/70">GO salary</label>
          <select className="field mb-3" disabled={!isHost} value={state.settings.goSalary} onChange={(e) => set({ goSalary: Number(e.target.value) })}>
            {[1000, 2000, 3000, 4000].map((v) => (
              <option key={v} value={v}>
                {inr(v)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-marigold-500" disabled={!isHost} checked={state.settings.auctions} onChange={(e) => set({ auctions: e.target.checked })} />
            Auction a property when a player declines to buy it
          </label>
        </div>

        <div className="flex gap-3">
          <button className="btn-ghost" onClick={() => net.leave()}>
            Leave room
          </button>
          {isHost ? (
            <button className="btn-primary flex-1 text-lg" disabled={state.players.length < 2} onClick={() => net.act({ type: 'start' })}>
              Start game
            </button>
          ) : (
            <div className="flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-center font-semibold text-white/70">Waiting for the host to start…</div>
          )}
        </div>
      </section>
    </main>
  );
}
