import { useEffect, useRef, useState } from 'react';
import type { BoardDef, ClientState } from '../../../shared/types';
import { inr } from '../lib/format';
import { useDisplayPositions, useElementSize, useGameSounds, useMedia, useMuted } from '../lib/hooks';
import { cellCenter } from '../lib/geometry';
import { net, useNet } from '../lib/net';
import { setMuted } from '../lib/sfx';
import ActionBar from './ActionBar';
import AuctionModal from './AuctionModal';
import { Board } from './Board';
import { AssetsPanel, LogPanel, PlayersPanel, TokenDot, TradesPanel } from './Panels';
import { CardToast, GameOver } from './Overlays';
import PropertyModal from './PropertyModal';
import TradeModal, { emptySide, type TradeDraft } from './TradeModal';

type Tab = 'players' | 'assets' | 'trades' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'players', label: 'Players' },
  { id: 'assets', label: 'My assets' },
  { id: 'trades', label: 'Trades' },
  { id: 'log', label: 'Log' },
];

export default function GameScreen({ state, board }: { state: ClientState; board: BoardDef }) {
  const { tokens, connection } = useNet();
  const muted = useMuted();
  const desktop = useMedia('(min-width: 1024px)');
  const [tab, setTab] = useState<Tab>('players');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<TradeDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const [wrapRef, wrap] = useElementSize<HTMLDivElement>();
  const boardBox = useRef<HTMLDivElement>(null);
  const positions = useDisplayPositions(state);
  useGameSounds(state);

  const me = state.players.find((p) => p.id === state.youId)!;
  const incoming = state.trades.filter((t) => t.lastEditorId !== state.youId).length;
  const fit = Math.max(0, Math.floor(Math.min(wrap.w, wrap.h)) - 12);
  const minSize = 0;
  const size = Math.round(Math.max(fit, minSize) * (desktop ? 1 : zoom));

  // when zoomed in on small screens, keep the moving token in view
  const cur = state.players.find((p) => p.id === state.currentPlayerId);
  const curPos = cur ? positions[cur.id] : undefined;
  useEffect(() => {
    const el = wrapRef.current;
    const box = boardBox.current;
    if (desktop || !el || !box || curPos === undefined) return;
    if (size <= Math.min(wrap.w, wrap.h) + 20) return;
    const { x, y } = cellCenter(curPos);
    el.scrollTo({ left: box.offsetLeft + (x / 100) * size - wrap.w / 2, top: box.offsetTop + (y / 100) * size - wrap.h / 2, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curPos, size, desktop]);

  const openTrade = (otherId?: string, wantSpace?: number) => {
    const target = otherId ?? state.players.find((p) => p.id !== state.youId && !p.bankrupt)?.id;
    if (!target) return;
    setSelected(null);
    setDraft({ otherId: target, give: emptySide(), get: { ...emptySide(), props: wantSpace !== undefined ? [wantSpace] : [] } });
    setSheetOpen(false);
  };

  const panel = (
    <>
      {tab === 'players' && <PlayersPanel state={state} board={board} tokens={tokens} onSelect={setSelected} />}
      {tab === 'assets' && <AssetsPanel state={state} board={board} onSelect={setSelected} />}
      {tab === 'trades' && <TradesPanel state={state} board={board} onNew={() => openTrade()} onEdit={(d) => setDraft(d)} />}
      {tab === 'log' && <LogPanel state={state} />}
    </>
  );

  const tabBar = (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-night-950/60 p-1" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => setTab(t.id)}
          className={'relative rounded-lg px-1 py-1.5 text-sm font-bold transition ' + (tab === t.id ? 'bg-marigold-500 text-night-950' : 'text-white/70 hover:text-white')}
        >
          {t.label}
          {t.id === 'trades' && incoming > 0 && <span className="absolute -right-0.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sindoor-500 px-1 text-[10px] text-white">{incoming}</span>}
        </button>
      ))}
    </div>
  );

  const auctionOpen = !!state.auction && state.status === 'playing';
  const tradeModalOpen = !!draft && !auctionOpen;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 bg-night-900/90 px-3 py-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <h1 className="font-display text-base leading-none text-marigold-300 sm:text-2xl">India Property Tycoon</h1>
        <button
          className="chip ml-1 whitespace-nowrap font-mono text-xs tracking-wider sm:text-sm"
          title="Copy room code"
          onClick={() => navigator.clipboard?.writeText(state.roomCode).then(() => net.toast('Room code copied', 'info'))}
        >
          <span className="hidden sm:inline">Room&nbsp;</span>{state.roomCode}
        </button>
        {connection !== 'online' && <span className="chip bg-sindoor-500/30 text-sindoor-400">Reconnecting…</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-white/60 sm:inline">
            Houses {state.housesLeft} · Hotels {state.hotelsLeft} left
          </span>
          {!desktop && (
            <>
              <button className="btn-ghost btn-sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}>
                −
              </button>
              <button className="btn-ghost btn-sm" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}>
                +
              </button>
            </>
          )}
          <button className="btn-ghost btn-sm" aria-pressed={muted} onClick={() => setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={wrapRef} className="relative flex min-h-0 flex-1 overflow-auto p-1.5 scroll-thin">
            <div ref={boardBox} className="m-auto">
              {size > 0 && <Board board={board} state={state} tokens={tokens} size={size} positions={positions} onSelect={setSelected} />}
            </div>
          </div>
          <ActionBar state={state} board={board} tokens={tokens} />
          {!desktop && (
            <nav className="grid grid-cols-4 border-t border-white/10 bg-night-950/95" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={'relative py-2.5 text-sm font-bold ' + (sheetOpen && tab === t.id ? 'text-marigold-300' : 'text-white/70')}
                  onClick={() => {
                    if (sheetOpen && tab === t.id) setSheetOpen(false);
                    else {
                      setTab(t.id);
                      setSheetOpen(true);
                    }
                  }}
                >
                  {t.label}
                  {t.id === 'trades' && incoming > 0 && <span className="absolute right-3 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sindoor-500 px-1 text-[10px] text-white">{incoming}</span>}
                </button>
              ))}
            </nav>
          )}
        </div>

        {desktop && (
          <aside className="flex w-[380px] shrink-0 flex-col gap-3 border-l border-white/10 bg-night-900/60 p-3">
            <div className="panel flex items-center gap-3 p-3">
              <TokenDot tokens={tokens} token={me.token} color={me.color} size="h-12 w-12 text-2xl" />
              <div className="flex-1">
                <div className="font-bold">{me.name}</div>
                <div className="text-xs text-white/60">Net worth {inr(state.netWorth[me.id] ?? 0)}</div>
              </div>
              <div className="font-mono text-2xl font-extrabold text-marigold-300" data-testid="my-money">
                {inr(me.money)}
              </div>
            </div>
            {tabBar}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 scroll-thin">{panel}</div>
          </aside>
        )}
      </div>

      {!desktop && sheetOpen && (
        <div className="fixed inset-x-0 z-30 max-h-[40dvh] animate-sheet overflow-y-auto rounded-t-3xl border-t border-white/15 bg-night-900 p-3 shadow-2xl scroll-thin" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 150px)' }}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-bold text-white/70">
              {me.name} · <span className="font-mono text-marigold-300">{inr(me.money)}</span>
            </span>
            <button className="btn-ghost btn-sm" onClick={() => setSheetOpen(false)}>
              Close
            </button>
          </div>
          {panel}
        </div>
      )}

      <CardToast state={state} tokens={tokens} />
      {selected !== null && !auctionOpen && <PropertyModal spaceId={selected} board={board} state={state} onClose={() => setSelected(null)} onTrade={(id) => openTrade(state.props[id]?.owner ?? undefined, id)} />}
      {tradeModalOpen && <TradeModal draft={draft!} state={state} board={board} onClose={() => setDraft(null)} />}
      {auctionOpen && <AuctionModal state={state} board={board} />}
      {state.status === 'finished' && <GameOver state={state} board={board} tokens={tokens} />}
    </div>
  );
}
