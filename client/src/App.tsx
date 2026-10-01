import Home from './components/Home';
import Lobby from './components/Lobby';
import GameScreen from './components/GameScreen';
import { useNet } from './lib/net';

export default function App() {
  const { state, board, toasts } = useNet();
  return (
    <>
      {!state || !board ? <Home /> : state.status === 'lobby' ? <Lobby state={state} /> : <GameScreen state={state} board={board} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className={'animate-pop rounded-xl px-4 py-2.5 text-sm font-bold shadow-xl ' + (t.tone === 'error' ? 'bg-sindoor-500 text-white' : 'bg-marigold-500 text-night-950')}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}
