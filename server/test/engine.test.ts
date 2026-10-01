import { describe, expect, it } from 'vitest';
import { BOARD, BOARD_SIZE } from '../src/engine/boardData';
import {
  addPlayer,
  applyAction,
  calculateRent,
  createGame,
  currentPlayer,
  getPlayer,
  netWorth,
  type Ctx,
  type GameState,
} from '../src/engine/engine';
import { toClientState } from '../src/engine/view';

/** rng that yields a scripted sequence of dice faces (1-6), then 1s */
function scripted(faces: number[]): Ctx {
  let i = 0;
  return {
    now: 1_000_000,
    rng: () => {
      const f = i < faces.length ? faces[i] : 1;
      i++;
      return (f - 1) / 6 + 0.001;
    },
  };
}
const fixed = (): Ctx => ({ now: 1_000_000, rng: () => 0.5 });

function newGame(n = 3): GameState {
  const s = createGame('INDIA-TEST', 'p1');
  for (let i = 1; i <= n; i++) addPlayer(s, `p${i}`, `Player ${i}`);
  // start without shuffling turn order: keep deterministic by reordering after start
  applyAction(s, 'p1', { type: 'start' }, fixed());
  s.players.sort((a, b) => a.id.localeCompare(b.id));
  s.currentIndex = 0;
  return s;
}

/** Roll a specific d1+d2 for current player (shuffle-free RNG). Dice faces consumed: d1, d2. */
function roll(s: GameState, d1: number, d2: number, extra: number[] = []) {
  const pid = currentPlayer(s)!.id;
  return applyAction(s, pid, { type: 'roll' }, scripted([d1, d2, ...extra]));
}

describe('board', () => {
  it('has a large board with 56 spaces and sensible composition', () => {
    expect(BOARD_SIZE).toBe(56);
    const kinds = (k: string) => BOARD.spaces.filter((s) => s.kind === k).length;
    expect(kinds('property')).toBe(35);
    expect(kinds('transport')).toBe(5);
    expect(kinds('utility')).toBe(3);
    expect(kinds('tax')).toBe(2);
    expect(kinds('khazana') + kinds('bhagya')).toBe(7);
    expect(BOARD.spaces[0].kind).toBe('go');
    expect(BOARD.spaces[14].kind).toBe('jail');
    expect(BOARD.spaces[28].kind).toBe('freeParking');
    expect(BOARD.spaces[42].kind).toBe('goToJail');
  });
  it('has consistent groups and monotonic rent ladders', () => {
    for (const g of BOARD.groups) {
      const members = BOARD.spaces.filter((s) => s.groupId === g.id);
      expect(members.length).toBe(g.size);
      for (const m of members) {
        const r = m.rents!;
        for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
        expect(m.mortgage).toBe(m.price! / 2);
      }
    }
  });
});

describe('lobby & start', () => {
  it('rejects duplicate names, enforces host-only start and min players', () => {
    const s = createGame('X', 'p1');
    expect(addPlayer(s, 'p1', 'Rahul')).toBeNull();
    expect(addPlayer(s, 'p2', 'rahul')).toMatch(/taken/);
    expect(applyAction(s, 'p1', { type: 'start' }, fixed())).toMatch(/2 players/);
    addPlayer(s, 'p2', 'Amit');
    expect(applyAction(s, 'p2', { type: 'start' }, fixed())).toMatch(/host/);
    expect(applyAction(s, 'p1', { type: 'start' }, fixed())).toBeNull();
    expect(s.players.every((p) => p.money === 15000)).toBe(true);
  });
});

describe('turn flow', () => {
  it('only the current player can roll, and movement/purchase are validated', () => {
    const s = newGame();
    expect(applyAction(s, 'p2', { type: 'roll' }, fixed())).toMatch(/not your turn/);
    expect(roll(s, 1, 2)).toBeNull(); // -> position 3 (Ranchi)
    const p1 = getPlayer(s, 'p1')!;
    expect(p1.position).toBe(3);
    expect(s.phase).toBe('buy');
    // cannot buy as someone else or roll twice
    expect(applyAction(s, 'p2', { type: 'buy' }, fixed())).toMatch(/not your turn/);
    expect(applyAction(s, 'p1', { type: 'roll' }, fixed())).toMatch(/not available/);
    expect(applyAction(s, 'p1', { type: 'buy' }, fixed())).toBeNull();
    expect(s.props[3].owner).toBe('p1');
    expect(p1.money).toBe(15000 - 700);
    expect(s.phase).toBe('end');
    expect(applyAction(s, 'p1', { type: 'endTurn' }, fixed())).toBeNull();
    expect(currentPlayer(s)!.id).toBe('p2');
  });

  it('collects rent and doubles rent on full group', () => {
    const s = newGame();
    s.props[1].owner = 'p2'; // Patna
    s.props[3].owner = 'p2'; // Ranchi  (full brown set)
    roll(s, 1, 2); // p1 lands on Ranchi (3)
    const base = BOARD.spaces[3].rents![0];
    expect(getPlayer(s, 'p1')!.money).toBe(15000 - base * 2);
    expect(getPlayer(s, 'p2')!.money).toBe(15000 + base * 2);
  });

  it('awards GO salary when wrapping the board', () => {
    const s = newGame();
    getPlayer(s, 'p1')!.position = 52;
    roll(s, 3, 3, []); // doubles: 52+6 = 58 -> 2 (Khazana) ; passes GO
    expect(getPlayer(s, 'p1')!.money).toBeGreaterThanOrEqual(15000 + 2000 - 2000);
    expect(s.log.some((l) => /passed GO/.test(l.text))).toBe(true);
  });

  it('doubles grant another roll; three doubles send you to jail', () => {
    const s = newGame();
    roll(s, 2, 2); // -> 4 income tax, pays 2000 ; doubles => roll again
    expect(s.phase).toBe('roll');
    expect(currentPlayer(s)!.id).toBe('p1');
    roll(s, 1, 1); // doubles again -> pos 6 (Bhopal, unowned)
    expect(s.phase).toBe('buy');
    expect(applyAction(s, 'p1', { type: 'buy' }, fixed())).toBeNull();
    expect(s.phase).toBe('roll'); // doubles: roll again after resolving the landing
  });

  it('third consecutive double goes to jail', () => {
    const s = newGame();
    const p1 = getPlayer(s, 'p1')!;
    s.doublesCount = 2;
    s.rolledDoubles = true;
    roll(s, 4, 4);
    expect(p1.inJail).toBe(true);
    expect(p1.position).toBe(14);
    expect(s.phase).toBe('end');
  });
});

describe('jail', () => {
  it('pay fine, roll doubles, use card, and forced exit after three fails', () => {
    const s = newGame();
    const p1 = getPlayer(s, 'p1')!;
    p1.inJail = true;
    p1.position = 14;
    expect(applyAction(s, 'p1', { type: 'payJail' }, fixed())).toBeNull();
    expect(p1.inJail).toBe(false);
    expect(p1.money).toBe(14500);

    p1.inJail = true;
    p1.position = 14;
    roll(s, 3, 3); // doubles -> leaves & moves to 20 (Agra)
    expect(p1.inJail).toBe(false);
    expect(p1.position).toBe(20);
    expect(s.rolledDoubles).toBe(false); // no extra turn after leaving via doubles

    // three failures
    const s2 = newGame();
    const q = getPlayer(s2, 'p1')!;
    q.inJail = true;
    q.position = 14;
    roll(s2, 1, 2);
    expect(q.jailTurns).toBe(1);
    expect(s2.phase).toBe('end');
    applyAction(s2, 'p1', { type: 'endTurn' }, fixed());
    s2.currentIndex = 0;
    s2.phase = 'roll';
    q.jailTurns = 2;
    roll(s2, 1, 2);
    expect(q.inJail).toBe(false);
    expect(q.position).toBe(17);
    expect(s2.log.some((l) => /must pay the/.test(l.text))).toBe(true);
  });

  it('jail card releases the player and returns to deck', () => {
    const s = newGame();
    const p1 = getPlayer(s, 'p1')!;
    p1.inJail = true;
    p1.jailCards = ['khazana'];
    s.decks.khazana.held = [12];
    expect(applyAction(s, 'p1', { type: 'useJailCard' }, fixed())).toBeNull();
    expect(p1.inJail).toBe(false);
    expect(s.decks.khazana.held.length).toBe(0);
  });
});

describe('building and mortgages', () => {
  function ownBrown(s: GameState) {
    s.props[1].owner = 'p1';
    s.props[3].owner = 'p1';
  }
  it('requires full group, builds evenly, and computes rents', () => {
    const s = newGame();
    s.props[1].owner = 'p1';
    expect(applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed())).toMatch(/whole colour group/);
    ownBrown(s);
    expect(applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed())).toBeNull();
    expect(applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed())).toMatch(/evenly/);
    expect(applyAction(s, 'p1', { type: 'build', spaceId: 3 }, fixed())).toBeNull();
    expect(calculateRent(s, 1, 7)).toBe(BOARD.spaces[1].rents![1]);
    for (let i = 0; i < 3; i++) {
      applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed());
      applyAction(s, 'p1', { type: 'build', spaceId: 3 }, fixed());
    }
    expect(s.props[1].houses).toBe(4);
    expect(applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed())).toBeNull();
    expect(s.props[1].houses).toBe(5);
    expect(calculateRent(s, 1, 7)).toBe(BOARD.spaces[1].rents![5]);
  });
  it('blocks mortgage while buildings exist, unmortgage costs 10% more', () => {
    const s = newGame();
    s.props[1].owner = 'p1';
    s.props[3].owner = 'p1';
    applyAction(s, 'p1', { type: 'build', spaceId: 1 }, fixed());
    expect(applyAction(s, 'p1', { type: 'mortgage', spaceId: 3 }, fixed())).toMatch(/Sell all buildings/);
    expect(applyAction(s, 'p1', { type: 'sellHouse', spaceId: 1 }, fixed())).toBeNull();
    const before = getPlayer(s, 'p1')!.money;
    expect(applyAction(s, 'p1', { type: 'mortgage', spaceId: 3 }, fixed())).toBeNull();
    expect(getPlayer(s, 'p1')!.money).toBe(before + 350);
    expect(calculateRent(s, 3, 7)).toBe(0);
    expect(applyAction(s, 'p1', { type: 'unmortgage', spaceId: 3 }, fixed())).toBeNull();
    expect(getPlayer(s, 'p1')!.money).toBe(before + 350 - 390);
  });
  it('cannot act on properties you do not own', () => {
    const s = newGame();
    s.props[1].owner = 'p2';
    expect(applyAction(s, 'p1', { type: 'mortgage', spaceId: 1 }, fixed())).toMatch(/do not own/);
  });
});

describe('transport & utilities', () => {
  it('scales transport rent by count and utility by dice', () => {
    const s = newGame();
    s.props[5].owner = 'p2';
    expect(calculateRent(s, 5, 7)).toBe(250);
    s.props[15].owner = 'p2';
    expect(calculateRent(s, 5, 7)).toBe(500);
    s.props[10].owner = 'p2';
    expect(calculateRent(s, 10, 7)).toBe(7 * 40);
    s.props[24].owner = 'p2';
    expect(calculateRent(s, 10, 7)).toBe(7 * 100);
  });
});

describe('auctions', () => {
  it('declining triggers an auction; highest bidder wins', () => {
    const s = newGame();
    roll(s, 1, 2); // Ranchi
    expect(applyAction(s, 'p1', { type: 'declineBuy' }, fixed())).toBeNull();
    expect(s.phase).toBe('auction');
    expect(applyAction(s, 'p2', { type: 'bid', amount: 100 }, fixed())).toBeNull();
    expect(applyAction(s, 'p3', { type: 'bid', amount: 100 }, fixed())).toMatch(/at least/);
    expect(applyAction(s, 'p3', { type: 'bid', amount: 99999 }, fixed())).toMatch(/afford/);
    expect(applyAction(s, 'p3', { type: 'bid', amount: 300 }, fixed())).toBeNull();
    applyAction(s, 'p1', { type: 'passAuction' }, fixed());
    applyAction(s, 'p2', { type: 'passAuction' }, fixed());
    expect(s.auction).toBeNull();
    expect(s.props[3].owner).toBe('p3');
    expect(getPlayer(s, 'p3')!.money).toBe(14700);
    expect(s.phase).toBe('end');
  });
});

describe('trading', () => {
  it('requires both parties, validates ownership, and transfers assets', () => {
    const s = newGame();
    s.props[1].owner = 'p1';
    s.props[8].owner = 'p2';
    const empty = { cash: 0, props: [], jailCards: 0 };
    // cheating: offering a property you do not own
    expect(applyAction(s, 'p1', { type: 'proposeTrade', toId: 'p2', offer: { ...empty, props: [8] }, request: empty }, fixed())).toMatch(/does not own/);
    // cheating: offering more cash than you have
    expect(applyAction(s, 'p1', { type: 'proposeTrade', toId: 'p2', offer: { ...empty, cash: 99999 }, request: empty }, fixed())).toMatch(/does not have/);
    expect(applyAction(s, 'p1', { type: 'proposeTrade', toId: 'p2', offer: { cash: 500, props: [1], jailCards: 0 }, request: { ...empty, props: [8] } }, fixed())).toBeNull();
    const t = s.trades[0];
    // proposer cannot accept own terms
    expect(applyAction(s, 'p1', { type: 'acceptTrade', tradeId: t.id }, fixed())).toMatch(/Waiting/);
    // counter: p2 asks for more cash
    expect(applyAction(s, 'p2', { type: 'counterTrade', tradeId: t.id, offer: { cash: 800, props: [1], jailCards: 0 }, request: { ...empty, props: [8] } }, fixed())).toBeNull();
    expect(s.trades[0].agreed).toEqual({ from: false, to: true });
    // third party cannot touch it
    expect(applyAction(s, 'p3', { type: 'acceptTrade', tradeId: t.id }, fixed())).toMatch(/not found/);
    expect(applyAction(s, 'p1', { type: 'acceptTrade', tradeId: t.id }, fixed())).toBeNull();
    expect(s.trades.length).toBe(0);
    expect(s.props[1].owner).toBe('p2');
    expect(s.props[8].owner).toBe('p1');
    expect(getPlayer(s, 'p1')!.money).toBe(15000 - 800);
    expect(getPlayer(s, 'p2')!.money).toBe(15000 + 800);
  });
  it('drops stale trades when assets move', () => {
    const s = newGame();
    s.props[1].owner = 'p1';
    const empty = { cash: 0, props: [], jailCards: 0 };
    applyAction(s, 'p1', { type: 'proposeTrade', toId: 'p2', offer: { ...empty, props: [1] }, request: { ...empty, cash: 100 } }, fixed());
    expect(s.trades.length).toBe(1);
    s.props[1].owner = 'p3';
    applyAction(s, 'p1', { type: 'endTurn' }, fixed()); // errors, but... force a mutation
    applyAction(s, 'p1', { type: 'roll' }, scripted([1, 2]));
    expect(s.trades.length).toBe(0);
  });
});

describe('debt and bankruptcy', () => {
  it('opens a debt when cash is short but assets cover it, then auto-settles once cash is raised', () => {
    const s = newGame();
    const a = getPlayer(s, 'p1')!;
    a.money = 500;
    for (const id of [16, 18, 19]) s.props[id].owner = 'p1'; // mortgage values 650 + 650 + 700
    roll(s, 2, 2); // Income Tax 2000
    expect(s.phase).toBe('debt');
    expect(s.debt?.amount).toBe(2000);
    expect(applyAction(s, 'p1', { type: 'payDebt' }, fixed())).toMatch(/still need/);
    expect(applyAction(s, 'p1', { type: 'endTurn' }, fixed())).toMatch(/not available/);
    applyAction(s, 'p1', { type: 'mortgage', spaceId: 16 }, fixed());
    applyAction(s, 'p1', { type: 'mortgage', spaceId: 18 }, fixed());
    expect(s.phase).toBe('debt');
    applyAction(s, 'p1', { type: 'mortgage', spaceId: 19 }, fixed());
    expect(s.debt).toBeNull();
    expect(a.money).toBe(500 + 650 + 650 + 700 - 2000);
    expect(s.phase).toBe('roll'); // the roll was doubles
  });
  it('goes bankrupt when assets cannot cover the debt; creditor inherits', () => {
    const s = newGame();
    const p1 = getPlayer(s, 'p1')!;
    p1.money = 100;
    s.props[3].owner = 'p2';
    s.props[1].owner = 'p2';
    s.props[6].owner = 'p1';
    // p1 lands on Ranchi after building is impossible; force rent via houses
    s.props[3].houses = 5;
    roll(s, 1, 2);
    expect(p1.bankrupt).toBe(true);
    expect(s.props[6].owner).toBe('p2');
    expect(currentPlayer(s)!.id).toBe('p2');
    expect(s.status).toBe('playing');
  });
  it('last solvent player wins', () => {
    const s = newGame(2);
    expect(applyAction(s, 'p1', { type: 'resign' }, fixed())).toBeNull();
    expect(s.status).toBe('finished');
    expect(s.winnerId).toBe('p2');
    expect(applyAction(s, 'p2', { type: 'roll' }, fixed())).toMatch(/not in progress/);
  });
});

describe('cards', () => {
  it('draws cards and applies effects', () => {
    const s = newGame();
    s.decks.khazana.order = [1];
    s.decks.khazana.idx = 0;
    roll(s, 1, 1); // -> 2 Khazana, doubles
    expect(s.lastCard?.title).toBe('Festival Bonus');
    expect(getPlayer(s, 'p1')!.money).toBe(15500);
  });
});

describe('client view', () => {
  it('hides other players trades and deck order; exposes legal actions', () => {
    const s = newGame();
    const v = toClientState(s, 'p2', 5);
    expect((v as any).decks).toBeUndefined();
    expect(v.legal.canRoll).toBe(false);
    expect(toClientState(s, 'p1', 5).legal.canRoll).toBe(true);
    expect(netWorth(s, getPlayer(s, 'p1')!)).toBe(15000);
  });
});
