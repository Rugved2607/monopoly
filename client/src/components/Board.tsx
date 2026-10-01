import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BoardDef, ClientState, Space } from '../../../shared/types';
import { cellCenter, cellXY, sideOf, type Side } from '../lib/geometry';
import { inr } from '../lib/format';

/* ---------- tokens ---------- */

function tokenEmoji(tokens: { id: string; emoji: string }[], id: string) {
  return tokens.find((t) => t.id === id)?.emoji ?? '🎲';
}

/* ---------- dice ---------- */

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <div className={'die ' + (rolling ? 'rolling' : '')} aria-label={`die showing ${value}`}>
      {Array.from({ length: 9 }, (_, i) => {
        const on = PIPS[value].includes(i + 1);
        return on ? <span key={i} className={'pip' + (value === 1 ? ' red' : '')} /> : <span key={i} />;
      })}
    </div>
  );
}

export function DicePair({ dice }: { dice: ClientState['dice'] }) {
  const seq = useRef(dice?.seq ?? 0);
  const [rolling, setRolling] = useState(false);
  const [faces, setFaces] = useState<[number, number]>([dice?.d1 ?? 1, dice?.d2 ?? 1]);

  useEffect(() => {
    if (!dice) return;
    if (dice.seq === seq.current) return;
    seq.current = dice.seq;
    setRolling(true);
    const iv = setInterval(() => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 85);
    const to = setTimeout(() => {
      clearInterval(iv);
      setFaces([dice.d1, dice.d2]);
      setRolling(false);
    }, 820);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [dice]);

  return (
    <div className="flex flex-col items-center" style={{ gap: 'calc(var(--u) * 0.8)' }}>
      <div className="flex" style={{ gap: 'calc(var(--u) * 1.2)' }}>
        <Die value={faces[0]} rolling={rolling} />
        <Die value={faces[1]} rolling={rolling} />
      </div>
      <div className="font-extrabold text-marigold-300" style={{ fontSize: 'calc(var(--u) * 1.9)', minHeight: 'calc(var(--u) * 2.4)' }}>
        {dice && !rolling ? `🎲 ${dice.d1} + ${dice.d2} = ${dice.d1 + dice.d2}` : rolling ? 'Rolling…' : ''}
      </div>
    </div>
  );
}

/* ---------- mandala ---------- */

function Mandala() {
  const petals = (n: number, d: string, fill: string, stroke: string, rot = 0) =>
    Array.from({ length: n }, (_, i) => <path key={i + d} d={d} fill={fill} stroke={stroke} strokeWidth="0.6" transform={`rotate(${rot + (360 / n) * i} 100 100)`} />);
  return (
    <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#14808a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#073b45" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#glow)" />
      {petals(24, 'M100 100 C 93 60, 93 30, 100 6 C 107 30, 107 60, 100 100Z', 'rgba(246,166,9,.05)', 'rgba(246,166,9,.35)')}
      {petals(16, 'M100 100 C 88 78, 88 52, 100 30 C 112 52, 112 78, 100 100Z', 'rgba(255,255,255,.04)', 'rgba(255,209,102,.4)', 11)}
      {petals(12, 'M100 100 C 91 88, 91 70, 100 56 C 109 70, 109 88, 100 100Z', 'rgba(216,55,43,.14)', 'rgba(239,90,74,.5)')}
      <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(246,166,9,.35)" strokeWidth="0.8" strokeDasharray="1.2 3.2" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,209,102,.22)" strokeWidth="0.6" />
      <circle cx="100" cy="100" r="36" fill="none" stroke="rgba(255,209,102,.25)" strokeWidth="0.6" />
    </svg>
  );
}

/* ---------- cells ---------- */

const BAND_SIZE = '24%';

function bandStyle(side: Side): { wrap: CSSProperties; band: CSSProperties } {
  switch (side) {
    case 'bottom':
      return { wrap: { flexDirection: 'column' }, band: { height: BAND_SIZE } };
    case 'top':
      return { wrap: { flexDirection: 'column-reverse' }, band: { height: BAND_SIZE } };
    case 'left':
      return { wrap: { flexDirection: 'row-reverse' }, band: { width: BAND_SIZE } };
    default:
      return { wrap: { flexDirection: 'row' }, band: { width: BAND_SIZE } };
  }
}

interface CellProps {
  sp: Space;
  side: Side;
  color?: string;
  houses: number;
  mortgaged: boolean;
  ownerColor?: string;
  ownerInitial?: string;
  current: boolean;
  onSelect: (id: number) => void;
}

const Cell = memo(function Cell({ sp, side, color, houses, mortgaged, ownerColor, ownerInitial, current, onSelect }: CellProps) {
  const { col, row } = cellXY(sp.id);
  const place: CSSProperties = { gridColumn: col + 1, gridRow: row + 1 };
  const corner = side === 'corner';
  const purchasable = sp.kind === 'property' || sp.kind === 'transport' || sp.kind === 'utility';
  const bs = bandStyle(side);
  const long = sp.short.length > 11;
  const nameStyle: CSSProperties = long ? { fontSize: '0.84em' } : {};

  return (
    <button
      type="button"
      className={['cell', corner ? 'corner' : '', mortgaged ? 'mortgaged' : '', current ? 'current' : ''].join(' ')}
      style={{ ...place, ...(corner ? {} : bs.wrap) }}
      onClick={() => onSelect(sp.id)}
      aria-label={sp.name}
      title={sp.name}
    >
      {sp.kind === 'property' && (
        <div className="cell-band" style={{ ...bs.band, background: color, flexDirection: side === 'left' || side === 'right' ? 'column' : 'row' }}>
          {houses === 5 ? (
            <span className="hotel" />
          ) : (
            Array.from({ length: houses }, (_, i) => <span key={i} className="house" />)
          )}
        </div>
      )}
      <div className="cell-body">
        {!purchasable || sp.kind !== 'property' ? <span className="cell-icon">{sp.icon}</span> : null}
        <span className="cell-name" style={nameStyle}>
          {sp.short}
        </span>
        {sp.kind === 'tax' && <span className="cell-price">Pay {inr(sp.amount!)}</span>}
        {purchasable && <span className="cell-price">{inr(sp.price!)}</span>}
        {corner && sp.kind === 'go' && <span className="cell-price">Collect salary</span>}
      </div>
      {ownerColor && (
        <span className="owner-flag" style={{ background: ownerColor, right: 'calc(var(--u) * 0.3)', bottom: 'calc(var(--u) * 0.3)' }}>
          <span style={{ color: '#fff', fontWeight: 800 }}>{ownerInitial}</span>
        </span>
      )}
    </button>
  );
});

/* ---------- board ---------- */

interface BoardProps {
  board: BoardDef;
  state: ClientState;
  tokens: { id: string; emoji: string }[];
  size: number;
  positions: Record<string, number>;
  onSelect: (spaceId: number) => void;
}

export function Board({ board, state, tokens, size, positions, onSelect }: BoardProps) {
  const cur = state.players.find((p) => p.id === state.currentPlayerId);
  const curPos = cur ? positions[cur.id] : -1;
  const byId = new Map(state.players.map((p) => [p.id, p]));

  // group tokens by cell to fan them out
  const perCell = new Map<number, string[]>();
  for (const p of state.players) {
    if (p.bankrupt) continue;
    const pos = positions[p.id] ?? p.position;
    perCell.set(pos, [...(perCell.get(pos) ?? []), p.id]);
  }

  return (
    <div className="board" style={{ ['--board-size' as any]: `${size}px` }} role="application" aria-label="Game board">
      <div className="board-grid">
        {board.spaces.map((sp) => {
          const st = state.props[sp.id];
          const owner = st?.owner ? byId.get(st.owner) : undefined;
          return (
            <Cell
              key={sp.id}
              sp={sp}
              side={sideOf(sp.id)}
              color={sp.groupId !== undefined ? board.groups[sp.groupId].color : undefined}
              houses={st?.houses ?? 0}
              mortgaged={!!st?.mortgaged}
              ownerColor={owner?.color}
              ownerInitial={owner?.name.charAt(0).toUpperCase()}
              current={state.status === 'playing' && state.phase === 'buy' && curPos === sp.id}
              onSelect={onSelect}
            />
          );
        })}
        <div className="relative" style={{ gridColumn: '2 / 15', gridRow: '2 / 15', borderRadius: 'calc(var(--u) * 0.8)', overflow: 'hidden', background: '#0a4a52' }}>
          <Mandala />
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: 'calc(var(--u) * 2.2)' }}>
            <div className="text-center">
              <div className="font-display text-marigold-300" style={{ fontSize: 'calc(var(--u) * 4.4)', lineHeight: 1, letterSpacing: '0.01em', textShadow: '0 2px 0 rgba(0,0,0,.35)' }}>
                India Property
              </div>
              <div className="font-display text-white" style={{ fontSize: 'calc(var(--u) * 6)', lineHeight: 1.05, textShadow: '0 3px 0 rgba(0,0,0,.35)' }}>
                Tycoon
              </div>
            </div>
            <DicePair dice={state.dice} />
            <div className="text-center font-semibold text-white/85" style={{ fontSize: 'calc(var(--u) * 1.7)', minHeight: 'calc(var(--u) * 2.2)' }}>
              {state.status === 'playing' && cur ? (
                <span>
                  {tokenEmoji(tokens, cur.token)} {cur.name}
                  {cur.id === state.youId ? ' (you)' : ''} · {phaseLabel(state.phase)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {state.players.map((p) => {
        if (p.bankrupt) return null;
        const pos = positions[p.id] ?? p.position;
        const { x, y } = cellCenter(pos);
        const group = perCell.get(pos)!;
        const n = group.length;
        const i = group.indexOf(p.id);
        const r = n === 1 ? 0 : n === 2 ? 1.25 : 1.9;
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const dx = n === 1 ? 0 : Math.cos(a) * r;
        const dy = n === 1 ? 0 : Math.sin(a) * r;
        return (
          <div
            key={p.id}
            className={'token' + (p.id === state.currentPlayerId && state.status === 'playing' ? ' active' : '')}
            style={{ ['--pc' as any]: p.color, left: `calc(${x}% + var(--u) * ${dx.toFixed(2)})`, top: `calc(${y}% + var(--u) * ${dy.toFixed(2)})` }}
            title={p.name}
          >
            {tokenEmoji(tokens, p.token)}
          </div>
        );
      })}
    </div>
  );
}

export function phaseLabel(phase: ClientState['phase']) {
  switch (phase) {
    case 'roll':
      return 'rolling';
    case 'buy':
      return 'deciding to buy';
    case 'auction':
      return 'auction in progress';
    case 'debt':
      return 'raising cash';
    default:
      return 'finishing turn';
  }
}
