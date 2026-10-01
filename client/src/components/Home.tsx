import { useState } from 'react';
import { net, useNet } from '../lib/net';

const PARADE = ['🛺', '🚆', '🛵', '🕌', '🐘', '🏏', '🏛️', '🏍️', '✈️', '🪷'];

export default function Home() {
  const { connection, resuming } = useNet();
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState<'create' | 'join'>(params.get('room') ? 'join' : 'create');
  const [name, setName] = useState(() => localStorage.getItem('ipt.name') ?? '');
  const [code, setCode] = useState(params.get('room') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name first.');
    if (mode === 'join' && !code.trim()) return setError('Enter the room code your friend shared.');
    setBusy(true);
    localStorage.setItem('ipt.name', name.trim());
    const err = mode === 'create' ? await net.create(name.trim()) : await net.join(code.trim(), name.trim());
    setBusy(false);
    if (err) setError(err);
    else history.replaceState(null, '', location.pathname);
  };

  if (resuming) {
    return (
      <div className="grid h-full place-items-center">
        <p className="animate-pulse text-lg font-semibold text-white/80">Rejoining your game…</p>
      </div>
    );
  }

  return (
    <main className="mx-auto grid min-h-full max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_1fr]">
      <section>
        <div className="mb-6 flex flex-wrap gap-2 text-3xl" aria-hidden>
          {PARADE.map((t, i) => (
            <span key={t} className="grid h-12 w-12 place-items-center rounded-full border-2 border-marigold-500/70 bg-paper-50 shadow-lg" style={{ transform: `rotate(${(i % 2 ? 1 : -1) * 4}deg)` }}>
              {t}
            </span>
          ))}
        </div>
        <h1 className="font-display text-5xl leading-[1.02] text-marigold-300 sm:text-7xl">
          India Property
          <br />
          <span className="text-white">Tycoon</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/80">
          Buy Bengaluru, bargain for Jaipur, and charge rent on Mumbai. A 56-space board of Indian cities, played live with friends. Create a room, share the code, and start rolling.
        </p>
        <ul className="mt-6 grid max-w-xl grid-cols-2 gap-3 text-sm text-white/75">
          <li className="panel px-3 py-2">35 cities in 12 colour groups, plus metros, airways and utilities</li>
          <li className="panel px-3 py-2">2 to 8 players, any device, nothing to install</li>
          <li className="panel px-3 py-2">Trades, auctions, mortgages and hotels</li>
          <li className="panel px-3 py-2">Drop out and rejoin without losing your place</li>
        </ul>
      </section>

      <section className="panel p-6 shadow-2xl">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-night-950/60 p-1" role="tablist">
          {(['create', 'join'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={'rounded-lg py-2 font-bold transition ' + (mode === m ? 'bg-marigold-500 text-night-950' : 'text-white/70 hover:text-white')}>
              {m === 'create' ? 'Create a game' : 'Join a game'}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm font-semibold text-white/80" htmlFor="name">
          Your name
        </label>
        <input id="name" className="field mb-4" value={name} maxLength={16} placeholder="Rahul" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="nickname" />

        {mode === 'join' && (
          <>
            <label className="mb-1 block text-sm font-semibold text-white/80" htmlFor="code">
              Room code
            </label>
            <input id="code" className="field mb-4 font-mono text-lg uppercase tracking-widest" value={code} placeholder="INDIA-7X42" maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </>
        )}

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-sindoor-500/20 px-3 py-2 text-sm font-semibold text-sindoor-400">
            {error}
          </p>
        )}

        <button className="btn-primary w-full text-lg" disabled={busy || connection !== 'online'} onClick={submit}>
          {connection !== 'online' ? 'Connecting to server…' : busy ? 'One moment…' : mode === 'create' ? 'Create room' : 'Join room'}
        </button>
        <p className="mt-3 text-center text-xs text-white/50">You will get a room code like INDIA-7X42 to share.</p>
      </section>
    </main>
  );
}
