import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ClientState } from '../../../shared/types';
import { BOARD_SIZE } from './geometry';
import { isMuted, sfx, subscribeMute } from './sfx';

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    h();
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}

export const useMuted = () => useSyncExternalStore(subscribeMute, isMuted);

export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Observe element size (used to fit the square board into its container). */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const DICE_HOLD_MS = 900;

/**
 * Animated token positions. The server sends the final position; the client walks
 * the token cell-by-cell (after the dice animation) or jumps for jail / card moves.
 */
export function useDisplayPositions(state: ClientState): Record<string, number> {
  const disp = useRef<Record<string, number>>({});
  const target = useRef<Record<string, number>>({});
  const mode = useRef<Record<string, 'walk' | 'jump'>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const holdUntil = useRef(0);
  const lastDice = useRef(state.dice?.seq ?? 0);
  const lastMoveSeq = useRef(state.lastMove?.seq ?? 0);
  const [, force] = useState(0);

  const stepFor = (id: string) => {
    const t = target.current[id];
    let cur = disp.current[id];
    if (cur === t) {
      timers.current[id] = undefined;
      return;
    }
    if (mode.current[id] === 'jump') cur = t;
    else {
      cur = (cur + 1) % BOARD_SIZE;
      sfx.step();
    }
    disp.current[id] = cur;
    force((n) => n + 1);
    timers.current[id] = cur === t ? undefined : setTimeout(() => stepFor(id), 150);
  };

  useEffect(() => {
    if (state.dice && state.dice.seq !== lastDice.current) {
      lastDice.current = state.dice.seq;
      holdUntil.current = Date.now() + DICE_HOLD_MS;
    }
    if (state.lastMove && state.lastMove.seq !== lastMoveSeq.current) {
      lastMoveSeq.current = state.lastMove.seq;
      mode.current[state.lastMove.playerId] = state.lastMove.mode;
    }
    for (const p of state.players) {
      target.current[p.id] = p.position;
      if (disp.current[p.id] === undefined) disp.current[p.id] = p.position;
      if (disp.current[p.id] !== p.position && !timers.current[p.id]) {
        const delay = mode.current[p.id] === 'jump' ? 350 : Math.max(0, holdUntil.current - Date.now());
        timers.current[p.id] = setTimeout(() => stepFor(p.id), delay);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version]);

  useEffect(() => () => Object.values(timers.current).forEach((t) => t && clearTimeout(t)), []);

  const out: Record<string, number> = {};
  for (const p of state.players) out[p.id] = disp.current[p.id] ?? p.position;
  return out;
}

/** Play sound effects from new log entries. */
export function useGameSounds(state: ClientState | null) {
  const lastLog = useRef<number | null>(null);
  const lastCard = useRef<number | null>(null);
  const lastTurn = useRef<string | null>(null);
  const won = useRef(false);

  useEffect(() => {
    if (!state) return;
    if (lastLog.current === null) {
      lastLog.current = state.log[state.log.length - 1]?.id ?? 0;
      lastCard.current = state.lastCard?.seq ?? 0;
      lastTurn.current = state.currentPlayerId;
      won.current = state.status === 'finished';
      return;
    }
    const fresh = state.log.filter((l) => l.id > lastLog.current!);
    if (fresh.length) lastLog.current = fresh[fresh.length - 1].id;
    const m = state.lastMove;
    const steps = m && m.mode === 'walk' ? (m.to - m.from + BOARD_SIZE) % BOARD_SIZE : 0;
    const settle = fresh.some((l) => l.kind === 'dice') ? 900 + steps * 150 : 0;
    const later = (fn: () => void) => (settle ? setTimeout(fn, settle) : fn());
    for (const l of fresh) {
      if (l.kind === 'dice') sfx.dice();
      else if (l.kind === 'property' && /purchased|won the auction/.test(l.text)) later(sfx.buy);
      else if (l.kind === 'property' && /built/.test(l.text)) later(sfx.build);
      else if (l.kind === 'money' && /rent|paid/.test(l.text)) later(sfx.rent);
      else if (l.kind === 'bankrupt') later(sfx.bankrupt);
    }
    if (state.lastCard) lastCard.current = state.lastCard.seq;
    if (state.status === 'playing' && state.currentPlayerId !== lastTurn.current) {
      lastTurn.current = state.currentPlayerId;
      if (state.currentPlayerId === state.youId) sfx.turn();
    }
    if (state.status === 'finished' && !won.current) {
      won.current = true;
      sfx.victory();
    }
    if (state.status !== 'finished') won.current = false;
  }, [state]);
}
