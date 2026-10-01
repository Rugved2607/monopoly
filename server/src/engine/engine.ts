import type {
  ClientAction,
  DeckName,
  Legal,
  Player,
  PropertyActions,
  Settings,
  Space,
  Trade,
  TradeSide,
} from '../../../shared/types';
import { BOARD, BOARD_SIZE, JAIL_FINE, JAIL_INDEX, MORTGAGE_INTEREST_PCT, TRANSPORT_RENTS, UTILITY_MULTIPLIERS } from './boardData';
import { CARD_BY_ID, DECK_IDS, type CardDef } from './cards';
import { PLAYER_COLORS, TOKENS } from './tokens';
import type { Ctx, DebtInternal, GameState, Result } from './state';

export type { GameState, Ctx, Result } from './state';

/* ------------------------------------------------------------------ */
/* constants & lookups                                                 */
/* ------------------------------------------------------------------ */

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const HOUSE_SUPPLY = 60;
export const HOTEL_SUPPLY = 24;
export const AUCTION_MS = 25_000;
export const AUCTION_BID_EXTEND_MS = 10_000;

export const DEFAULT_SETTINGS: Settings = { startingMoney: 15000, goSalary: 2000, auctions: true };

const GROUP_SPACES: Record<number, number[]> = {};
for (const sp of BOARD.spaces) {
  if (sp.kind === 'property' && sp.groupId !== undefined) (GROUP_SPACES[sp.groupId] ??= []).push(sp.id);
}
const SPACES_OF_KIND = (kind: Space['kind']) => BOARD.spaces.filter((s) => s.kind === kind).map((s) => s.id);

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

const roll6 = (ctx: Ctx) => 1 + Math.floor(ctx.rng() * 6);
const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;

export const getPlayer = (s: GameState, id: string) => s.players.find((p) => p.id === id);
export const currentPlayer = (s: GameState): Player | undefined => s.players[s.currentIndex];
const alive = (s: GameState) => s.players.filter((p) => !p.bankrupt);

function log(s: GameState, text: string, kind: import('../../../shared/types').LogEntry['kind'] = 'info', playerId?: string) {
  s.log.push({ id: ++s.logSeq, text, kind, playerId });
  if (s.log.length > 250) s.log.splice(0, s.log.length - 250);
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

function shuffle<T>(arr: T[], ctx: Ctx): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshProps(): GameState['props'] {
  const props: GameState['props'] = {};
  for (const sp of BOARD.spaces) {
    if (sp.kind === 'property' || sp.kind === 'transport' || sp.kind === 'utility') {
      props[sp.id] = { owner: null, houses: 0, mortgaged: false };
    }
  }
  return props;
}

export function unmortgageCost(sp: Space): number {
  return roundUp10(((sp.mortgage ?? 0) * (100 + MORTGAGE_INTEREST_PCT)) / 100);
}
const mortgageFee = (sp: Space) => roundUp10(((sp.mortgage ?? 0) * MORTGAGE_INTEREST_PCT) / 100);

/* ------------------------------------------------------------------ */
/* construction & lobby                                                */
/* ------------------------------------------------------------------ */

export function createGame(roomCode: string, hostId: string): GameState {
  return {
    roomCode,
    status: 'lobby',
    hostId,
    settings: { ...DEFAULT_SETTINGS },
    players: [],
    props: freshProps(),
    currentIndex: 0,
    phase: 'roll',
    dice: null,
    doublesCount: 0,
    rolledDoubles: false,
    log: [],
    logSeq: 0,
    auction: null,
    trades: [],
    tradeSeq: 0,
    debt: null,
    winnerId: null,
    housesLeft: HOUSE_SUPPLY,
    hotelsLeft: HOTEL_SUPPLY,
    decks: {
      khazana: { order: DECK_IDS.khazana.slice(), idx: 0, held: [] },
      bhagya: { order: DECK_IDS.bhagya.slice(), idx: 0, held: [] },
    },
    lastCard: null,
    lastMove: null,
    eventSeq: 0,
    turnNumber: 0,
    version: 0,
  };
}

export function cleanName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 16);
}

export function addPlayer(s: GameState, id: string, rawName: string): Result {
  if (s.status !== 'lobby') return 'The game has already started';
  if (s.players.length >= MAX_PLAYERS) return 'This room is full';
  const name = cleanName(rawName);
  if (!name) return 'Enter a name';
  if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'That name is already taken in this room';
  const usedTokens = new Set(s.players.map((p) => p.token));
  const usedColors = new Set(s.players.map((p) => p.color));
  const token = TOKENS.find((t) => !usedTokens.has(t.id))!.id;
  const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];
  s.players.push({
    id,
    name,
    token,
    color,
    money: 0,
    position: 0,
    inJail: false,
    jailTurns: 0,
    jailCards: [],
    bankrupt: false,
    connected: true,
  });
  if (!s.hostId || !getPlayer(s, s.hostId)) s.hostId = id;
  log(s, `${name} joined the room.`, 'system', id);
  return null;
}

export function removePlayer(s: GameState, id: string): Result {
  if (s.status !== 'lobby') return 'Players can only leave before the game starts';
  const p = getPlayer(s, id);
  if (!p) return 'Player not found';
  s.players = s.players.filter((x) => x.id !== id);
  log(s, `${p.name} left the room.`, 'system');
  if (s.hostId === id && s.players.length) {
    s.hostId = s.players[0].id;
    log(s, `${s.players[0].name} is now the host.`, 'system');
  }
  return null;
}

function setToken(s: GameState, pid: string, token: string): Result {
  if (s.status !== 'lobby') return 'Tokens can only be changed in the lobby';
  if (!TOKENS.some((t) => t.id === token)) return 'Unknown token';
  if (s.players.some((p) => p.token === token && p.id !== pid)) return 'That token is taken';
  const p = getPlayer(s, pid);
  if (!p) return 'Player not found';
  p.token = token;
  return null;
}

function setSettings(s: GameState, pid: string, patch: Partial<Settings>): Result {
  if (pid !== s.hostId) return 'Only the host can change settings';
  if (s.status !== 'lobby') return 'Settings are locked once the game starts';
  const next = { ...s.settings };
  if (patch.startingMoney !== undefined) {
    const v = Number(patch.startingMoney);
    if (!Number.isInteger(v) || v < 1000 || v > 100000) return 'Starting money must be between ₹1,000 and ₹1,00,000';
    next.startingMoney = v;
  }
  if (patch.goSalary !== undefined) {
    const v = Number(patch.goSalary);
    if (!Number.isInteger(v) || v < 0 || v > 10000) return 'GO salary must be between ₹0 and ₹10,000';
    next.goSalary = v;
  }
  if (patch.auctions !== undefined) next.auctions = !!patch.auctions;
  s.settings = next;
  return null;
}

function resetForNewGame(s: GameState) {
  s.props = freshProps();
  s.currentIndex = 0;
  s.phase = 'roll';
  s.dice = null;
  s.doublesCount = 0;
  s.rolledDoubles = false;
  s.auction = null;
  s.trades = [];
  s.debt = null;
  s.winnerId = null;
  s.housesLeft = HOUSE_SUPPLY;
  s.hotelsLeft = HOTEL_SUPPLY;
  s.lastCard = null;
  s.lastMove = null;
  s.turnNumber = 0;
  for (const p of s.players) {
    p.money = 0;
    p.position = 0;
    p.inJail = false;
    p.jailTurns = 0;
    p.jailCards = [];
    p.bankrupt = false;
  }
}

function startGame(s: GameState, pid: string, ctx: Ctx): Result {
  if (pid !== s.hostId) return 'Only the host can start the game';
  if (s.status !== 'lobby') return 'The game has already started';
  if (s.players.length < MIN_PLAYERS) return 'At least 2 players are needed';
  resetForNewGame(s);
  s.players = shuffle(s.players, ctx);
  for (const p of s.players) p.money = s.settings.startingMoney;
  s.decks = {
    khazana: { order: shuffle(DECK_IDS.khazana, ctx), idx: 0, held: [] },
    bhagya: { order: shuffle(DECK_IDS.bhagya, ctx), idx: 0, held: [] },
  };
  s.status = 'playing';
  s.turnNumber = 1;
  log(s, `The game begins with ${s.players.length} players and ${inr(s.settings.startingMoney)} each.`, 'system');
  log(s, `${s.players[0].name} goes first.`, 'system', s.players[0].id);
  return null;
}

function returnToLobby(s: GameState, pid: string): Result {
  if (pid !== s.hostId) return 'Only the host can do that';
  if (s.status !== 'finished') return 'The game is not finished';
  resetForNewGame(s);
  s.status = 'lobby';
  log(s, 'Back to the lobby.', 'system');
  return null;
}

function playAgain(s: GameState, pid: string, ctx: Ctx): Result {
  if (pid !== s.hostId) return 'Only the host can do that';
  if (s.status !== 'finished') return 'The game is not finished';
  s.status = 'lobby';
  return startGame(s, pid, ctx);
}

/* ------------------------------------------------------------------ */
/* economy helpers                                                     */
/* ------------------------------------------------------------------ */

export function ownedSpaces(s: GameState, pid: string): number[] {
  return Object.entries(s.props)
    .filter(([, st]) => st.owner === pid)
    .map(([id]) => Number(id));
}

export function netWorth(s: GameState, p: Player): number {
  if (p.bankrupt) return 0;
  let total = p.money;
  for (const id of ownedSpaces(s, p.id)) {
    const sp = BOARD.spaces[id];
    const st = s.props[id];
    total += st.mortgaged ? sp.mortgage ?? 0 : sp.price ?? 0;
    total += st.houses * (sp.houseCost ?? 0);
  }
  return total;
}

/** cash the player could raise by selling buildings and mortgaging everything */
function liquidationValue(s: GameState, p: Player): number {
  let total = 0;
  for (const id of ownedSpaces(s, p.id)) {
    const sp = BOARD.spaces[id];
    const st = s.props[id];
    total += (st.houses * (sp.houseCost ?? 0)) / 2;
    if (!st.mortgaged) total += sp.mortgage ?? 0;
  }
  return total;
}

function ownsWholeGroup(s: GameState, pid: string, groupId: number) {
  return GROUP_SPACES[groupId].every((id) => s.props[id].owner === pid);
}

export function calculateRent(s: GameState, spaceId: number, diceTotal: number, opts: { doubleTransport?: boolean; utilityTen?: boolean } = {}): number {
  const sp = BOARD.spaces[spaceId];
  const st = s.props[spaceId];
  if (!st || !st.owner || st.mortgaged) return 0;
  if (sp.kind === 'property') {
    const rents = sp.rents!;
    if (st.houses > 0) return rents[st.houses];
    return ownsWholeGroup(s, st.owner, sp.groupId!) ? rents[0] * 2 : rents[0];
  }
  if (sp.kind === 'transport') {
    const n = SPACES_OF_KIND('transport').filter((id) => s.props[id].owner === st.owner).length;
    return TRANSPORT_RENTS[n] * (opts.doubleTransport ? 2 : 1);
  }
  if (sp.kind === 'utility') {
    const n = SPACES_OF_KIND('utility').filter((id) => s.props[id].owner === st.owner).length;
    const mult = opts.utilityTen ? 10 : UTILITY_MULTIPLIERS[n];
    return mult * diceTotal;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* turn flow                                                           */
/* ------------------------------------------------------------------ */

function finishAction(s: GameState) {
  if (s.status !== 'playing') return;
  const p = currentPlayer(s);
  s.phase = s.rolledDoubles && p && !p.inJail && !p.bankrupt ? 'roll' : 'end';
}

function nextTurn(s: GameState) {
  s.doublesCount = 0;
  s.rolledDoubles = false;
  if (s.status !== 'playing') return;
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (s.currentIndex + i) % n;
    if (!s.players[idx].bankrupt) {
      s.currentIndex = idx;
      break;
    }
  }
  s.phase = 'roll';
  s.turnNumber++;
  log(s, `${currentPlayer(s)!.name}'s turn.`, 'system', currentPlayer(s)!.id);
}

function turnGuard(s: GameState, pid: string, phase: GameState['phase']): Result {
  if (s.status !== 'playing') return 'The game is not in progress';
  const p = currentPlayer(s);
  if (!p || p.id !== pid) return 'It is not your turn';
  if (p.bankrupt) return 'You are bankrupt';
  if (s.phase !== phase) return 'That action is not available right now';
  return null;
}

function movePlayer(s: GameState, p: Player, steps: number, mode: 'walk' | 'jump' = 'walk') {
  const from = p.position;
  const to = (((from + steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  if (steps > 0 && to < from) passGo(s, p);
  p.position = to;
  s.lastMove = { seq: ++s.eventSeq, playerId: p.id, from, to, mode };
  log(s, `${p.name} moved to ${BOARD.spaces[to].name}.`, 'move', p.id);
}

function moveForwardTo(s: GameState, p: Player, pos: number) {
  const steps = (pos - p.position + BOARD_SIZE) % BOARD_SIZE;
  movePlayer(s, p, steps === 0 ? BOARD_SIZE : steps);
}

function passGo(s: GameState, p: Player) {
  p.money += s.settings.goSalary;
  log(s, `${p.name} passed GO and collected ${inr(s.settings.goSalary)}.`, 'money', p.id);
}

export function sendToJail(s: GameState, p: Player) {
  const from = p.position;
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  s.rolledDoubles = false;
  s.doublesCount = 0;
  s.lastMove = { seq: ++s.eventSeq, playerId: p.id, from, to: JAIL_INDEX, mode: 'jump' };
  log(s, `${p.name} was sent to jail.`, 'jail', p.id);
}

type PayOutcome = 'paid' | 'debt' | 'bankrupt';

/** Transfer money now if possible, otherwise open a debt or go bankrupt. */
function pay(s: GameState, debtorId: string, creditorId: string | null, amount: number, reason: string, ctx: Ctx, then?: DebtInternal['then']): PayOutcome {
  const d = getPlayer(s, debtorId)!;
  if (amount <= 0) return 'paid';
  const creditor = creditorId ? getPlayer(s, creditorId) : null;
  if (d.money >= amount) {
    d.money -= amount;
    if (creditor) creditor.money += amount;
    log(s, `${d.name} paid ${inr(amount)} ${creditor ? 'to ' + creditor.name : 'to the bank'} ${reason}.`, 'money', d.id);
    return 'paid';
  }
  if (d.money + liquidationValue(s, d) < amount) {
    log(s, `${d.name} owes ${inr(amount)} ${reason} and cannot cover it.`, 'bankrupt', d.id);
    declareBankrupt(s, d.id, creditorId, ctx);
    return 'bankrupt';
  }
  s.debt = { debtorId, creditorId, amount, reason, then };
  s.phase = 'debt';
  log(s, `${d.name} owes ${inr(amount)} ${reason}. Raise cash by mortgaging or selling buildings.`, 'money', d.id);
  return 'debt';
}

function settleDebtIfPossible(s: GameState, ctx: Ctx): boolean {
  const debt = s.debt;
  if (!debt) return false;
  const d = getPlayer(s, debt.debtorId);
  if (!d || d.money < debt.amount) return false;
  s.debt = null;
  const out = pay(s, debt.debtorId, debt.creditorId, debt.amount, debt.reason, ctx);
  if (out !== 'paid') return true;
  if (debt.then) {
    d.inJail = false;
    d.jailTurns = 0;
    const total = debt.then.steps;
    movePlayer(s, d, total);
    resolveLanding(s, d, ctx, total);
  } else {
    finishAction(s);
  }
  return true;
}

function resolveLanding(s: GameState, p: Player, ctx: Ctx, diceTotal: number, opts: { doubleTransport?: boolean; utilityTen?: boolean } = {}): void {
  const sp = BOARD.spaces[p.position];
  switch (sp.kind) {
    case 'property':
    case 'transport':
    case 'utility': {
      const st = s.props[sp.id];
      if (!st.owner) {
        s.phase = 'buy';
        log(s, `${p.name} landed on ${sp.name} (${inr(sp.price!)}), which is unowned.`, 'property', p.id);
        return;
      }
      if (st.owner === p.id) {
        log(s, `${p.name} landed on their own ${sp.name}.`, 'info', p.id);
        return finishAction(s);
      }
      const owner = getPlayer(s, st.owner)!;
      if (st.mortgaged) {
        log(s, `${sp.name} is mortgaged, so ${p.name} pays no rent.`, 'info', p.id);
        return finishAction(s);
      }
      let total = diceTotal;
      if (sp.kind === 'utility' && opts.utilityTen) {
        const d1 = roll6(ctx);
        const d2 = roll6(ctx);
        total = d1 + d2;
        s.dice = { d1, d2, seq: (s.dice?.seq ?? 0) + 1 };
        log(s, `${p.name} rolled ${d1} + ${d2} = ${total} for the utility bill.`, 'dice', p.id);
      }
      const amount = calculateRent(s, sp.id, total, opts);
      if (pay(s, p.id, owner.id, amount, `in rent for ${sp.name}`, ctx) === 'paid') finishAction(s);
      return;
    }
    case 'tax': {
      if (pay(s, p.id, null, sp.amount!, `for ${sp.name}`, ctx) === 'paid') finishAction(s);
      return;
    }
    case 'khazana':
    case 'bhagya':
      return drawCard(s, p, sp.kind, ctx);
    case 'goToJail':
      sendToJail(s, p);
      return finishAction(s);
    default:
      return finishAction(s);
  }
}

function drawCard(s: GameState, p: Player, deckName: DeckName, ctx: Ctx): void {
  const deck = s.decks[deckName];
  let card: CardDef | undefined;
  for (let i = 0; i < deck.order.length; i++) {
    const id = deck.order[deck.idx % deck.order.length];
    deck.idx = (deck.idx + 1) % deck.order.length;
    if (!deck.held.includes(id)) {
      card = CARD_BY_ID.get(id);
      break;
    }
  }
  if (!card) return finishAction(s);
  s.lastCard = { seq: ++s.eventSeq, playerId: p.id, deck: deckName, title: card.title, text: card.text };
  log(s, `${p.name} drew "${card.title}": ${card.text}`, 'card', p.id);
  const e = card.effect;
  switch (e.t) {
    case 'money':
      if (e.amount >= 0) {
        p.money += e.amount;
        return finishAction(s);
      }
      if (pay(s, p.id, null, -e.amount, `(${card.title})`, ctx) === 'paid') finishAction(s);
      return;
    case 'moveTo':
      moveForwardTo(s, p, e.pos);
      return resolveLanding(s, p, ctx, 0);
    case 'moveBy':
      movePlayer(s, p, e.n, 'jump');
      return resolveLanding(s, p, ctx, 0);
    case 'nearest': {
      const targets = SPACES_OF_KIND(e.kind);
      let best = targets[0];
      let bestDist = Infinity;
      for (const t of targets) {
        const dist = (t - p.position + BOARD_SIZE) % BOARD_SIZE;
        if (dist > 0 && dist < bestDist) {
          best = t;
          bestDist = dist;
        }
      }
      moveForwardTo(s, p, best);
      return resolveLanding(s, p, ctx, 0, e.kind === 'transport' ? { doubleTransport: true } : { utilityTen: true });
    }
    case 'jail':
      sendToJail(s, p);
      return finishAction(s);
    case 'jailFree':
      deck.held.push(card.id);
      p.jailCards.push(deckName);
      return finishAction(s);
    case 'collectAll': {
      let got = 0;
      for (const o of alive(s)) {
        if (o.id === p.id) continue;
        const amt = Math.min(o.money, e.amount);
        o.money -= amt;
        got += amt;
      }
      p.money += got;
      log(s, `${p.name} collected ${inr(got)} from the other players.`, 'money', p.id);
      return finishAction(s);
    }
    case 'repairs': {
      let houses = 0;
      let hotels = 0;
      for (const id of ownedSpaces(s, p.id)) {
        const h = s.props[id].houses;
        if (h === 5) hotels++;
        else houses += h;
      }
      const cost = houses * e.house + hotels * e.hotel;
      if (cost === 0) return finishAction(s);
      if (pay(s, p.id, null, cost, `for repairs on ${houses} houses and ${hotels} hotels`, ctx) === 'paid') finishAction(s);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* player actions                                                      */
/* ------------------------------------------------------------------ */

function rollDice(s: GameState, pid: string, ctx: Ctx): Result {
  const err = turnGuard(s, pid, 'roll');
  if (err) return err;
  const p = currentPlayer(s)!;
  const d1 = roll6(ctx);
  const d2 = roll6(ctx);
  const total = d1 + d2;
  const dbl = d1 === d2;
  s.dice = { d1, d2, seq: (s.dice?.seq ?? 0) + 1 };
  log(s, `${p.name} rolled ${d1} + ${d2} = ${total}${dbl ? ' (doubles)' : ''}.`, 'dice', p.id);

  if (p.inJail) {
    if (dbl) {
      p.inJail = false;
      p.jailTurns = 0;
      s.rolledDoubles = false;
      log(s, `${p.name} rolled doubles and leaves jail.`, 'jail', p.id);
      movePlayer(s, p, total);
      resolveLanding(s, p, ctx, total);
      return null;
    }
    p.jailTurns++;
    s.rolledDoubles = false;
    if (p.jailTurns >= 3) {
      log(s, `${p.name} failed to roll doubles three times and must pay the ${inr(JAIL_FINE)} fine.`, 'jail', p.id);
      const out = pay(s, p.id, null, JAIL_FINE, 'to leave jail', ctx, { steps: total });
      if (out === 'paid') {
        p.inJail = false;
        p.jailTurns = 0;
        movePlayer(s, p, total);
        resolveLanding(s, p, ctx, total);
      }
      return null;
    }
    log(s, `${p.name} stays in jail (attempt ${p.jailTurns} of 3).`, 'jail', p.id);
    s.phase = 'end';
    return null;
  }

  if (dbl) {
    s.doublesCount++;
    if (s.doublesCount >= 3) {
      log(s, `${p.name} rolled doubles three times in a row and goes to jail!`, 'jail', p.id);
      sendToJail(s, p);
      finishAction(s);
      return null;
    }
  } else {
    s.doublesCount = 0;
  }
  s.rolledDoubles = dbl;
  movePlayer(s, p, total);
  resolveLanding(s, p, ctx, total);
  return null;
}

function buyProperty(s: GameState, pid: string): Result {
  const err = turnGuard(s, pid, 'buy');
  if (err) return err;
  const p = currentPlayer(s)!;
  const sp = BOARD.spaces[p.position];
  const st = s.props[sp.id];
  if (!st || st.owner) return 'This property is not for sale';
  if (p.money < sp.price!) return 'You cannot afford this property';
  p.money -= sp.price!;
  st.owner = p.id;
  log(s, `${p.name} purchased ${sp.name} for ${inr(sp.price!)}.`, 'property', p.id);
  finishAction(s);
  return null;
}

function declineBuy(s: GameState, pid: string, ctx: Ctx): Result {
  const err = turnGuard(s, pid, 'buy');
  if (err) return err;
  const p = currentPlayer(s)!;
  const sp = BOARD.spaces[p.position];
  log(s, `${p.name} passed on ${sp.name}.`, 'property', p.id);
  if (s.settings.auctions && alive(s).length > 1) {
    s.auction = {
      spaceId: sp.id,
      currentBid: 0,
      highBidderId: null,
      participants: alive(s).map((x) => x.id),
      passed: [],
      endsAt: ctx.now + AUCTION_MS,
      serverNow: ctx.now,
    };
    s.phase = 'auction';
    log(s, `Auction started for ${sp.name}.`, 'property');
  } else {
    finishAction(s);
  }
  return null;
}

function bid(s: GameState, pid: string, amount: number, ctx: Ctx): Result {
  const a = s.auction;
  if (!a || s.phase !== 'auction') return 'There is no auction right now';
  const p = getPlayer(s, pid);
  if (!p || p.bankrupt || !a.participants.includes(pid)) return 'You are not in this auction';
  if (a.passed.includes(pid)) return 'You already passed on this auction';
  if (!Number.isInteger(amount)) return 'Invalid bid';
  if (amount < a.currentBid + 10) return `Bid at least ${inr(a.currentBid + 10)}`;
  if (amount > p.money) return 'You cannot afford that bid';
  a.currentBid = amount;
  a.highBidderId = pid;
  a.endsAt = Math.max(a.endsAt, ctx.now + AUCTION_BID_EXTEND_MS);
  log(s, `${p.name} bid ${inr(amount)} for ${BOARD.spaces[a.spaceId].name}.`, 'property', pid);
  return null;
}

function passAuction(s: GameState, pid: string, ctx: Ctx): Result {
  const a = s.auction;
  if (!a || s.phase !== 'auction') return 'There is no auction right now';
  if (!a.participants.includes(pid)) return 'You are not in this auction';
  if (a.passed.includes(pid)) return 'You already passed';
  if (a.highBidderId === pid) return 'You are the highest bidder';
  a.passed.push(pid);
  log(s, `${getPlayer(s, pid)!.name} dropped out of the auction.`, 'property', pid);
  const active = a.participants.filter((x) => !a.passed.includes(x));
  if (active.length === 0 || (active.length === 1 && a.highBidderId === active[0])) finalizeAuction(s, ctx);
  return null;
}

export function finalizeAuction(s: GameState, _ctx?: Ctx) {
  const a = s.auction;
  if (!a) return;
  const sp = BOARD.spaces[a.spaceId];
  if (a.highBidderId) {
    const w = getPlayer(s, a.highBidderId)!;
    w.money -= a.currentBid;
    s.props[a.spaceId].owner = w.id;
    log(s, `${w.name} won the auction for ${sp.name} at ${inr(a.currentBid)}.`, 'property', w.id);
  } else {
    log(s, `Nobody bid on ${sp.name}. It stays with the bank.`, 'property');
  }
  s.auction = null;
  finishAction(s);
}

/** Called by the server timer. Returns true if the state changed. */
export function tickAuction(s: GameState, ctx: Ctx): boolean {
  if (s.auction && ctx.now >= s.auction.endsAt) {
    finalizeAuction(s, ctx);
    afterMutation(s, ctx);
    return true;
  }
  return false;
}

function endTurn(s: GameState, pid: string): Result {
  const err = turnGuard(s, pid, 'end');
  if (err) return err;
  nextTurn(s);
  return null;
}

function payJail(s: GameState, pid: string): Result {
  const err = turnGuard(s, pid, 'roll');
  if (err) return err;
  const p = currentPlayer(s)!;
  if (!p.inJail) return 'You are not in jail';
  if (p.money < JAIL_FINE) return `You need ${inr(JAIL_FINE)} to pay the fine`;
  p.money -= JAIL_FINE;
  p.inJail = false;
  p.jailTurns = 0;
  log(s, `${p.name} paid ${inr(JAIL_FINE)} to leave jail.`, 'jail', p.id);
  return null;
}

function useJailCard(s: GameState, pid: string): Result {
  const err = turnGuard(s, pid, 'roll');
  if (err) return err;
  const p = currentPlayer(s)!;
  if (!p.inJail) return 'You are not in jail';
  const deck = p.jailCards.pop();
  if (!deck) return 'You have no Get Out of Jail Free card';
  releaseJailCard(s, deck);
  p.inJail = false;
  p.jailTurns = 0;
  log(s, `${p.name} used a Get Out of Jail Free card.`, 'jail', p.id);
  return null;
}

function releaseJailCard(s: GameState, deck: DeckName) {
  const d = s.decks[deck];
  const i = d.held.findIndex((id) => CARD_BY_ID.get(id)?.deck === deck);
  if (i >= 0) d.held.splice(i, 1);
}

/* ---------- building / mortgage ---------- */

function manageGuard(s: GameState, pid: string): Result {
  if (s.status !== 'playing') return 'The game is not in progress';
  if (s.phase === 'auction') return 'Wait for the auction to finish';
  const p = getPlayer(s, pid);
  if (!p || p.bankrupt) return 'You are not an active player';
  return null;
}

function buildError(s: GameState, pid: string, id: number): Result {
  const g = manageGuard(s, pid);
  if (g) return g;
  if (s.phase === 'debt') return 'Settle your debt before building';
  const p = getPlayer(s, pid)!;
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  if (!sp || sp.kind !== 'property' || !st) return 'Only city properties can be developed';
  if (st.owner !== pid) return 'You do not own this property';
  const group = GROUP_SPACES[sp.groupId!];
  if (!group.every((x) => s.props[x].owner === pid)) return 'You need the whole colour group to build';
  if (group.some((x) => s.props[x].mortgaged)) return 'Unmortgage the whole group first';
  if (st.houses >= 5) return 'This property already has a hotel';
  if (st.houses > Math.min(...group.map((x) => s.props[x].houses))) return 'Build evenly across the group';
  if (p.money < sp.houseCost!) return 'Not enough cash';
  if (st.houses < 4 && s.housesLeft < 1) return 'The bank has no houses left';
  if (st.houses === 4 && s.hotelsLeft < 1) return 'The bank has no hotels left';
  return null;
}

function sellError(s: GameState, pid: string, id: number): Result {
  const g = manageGuard(s, pid);
  if (g) return g;
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  if (!sp || sp.kind !== 'property' || !st) return 'Only city properties have buildings';
  if (st.owner !== pid) return 'You do not own this property';
  if (st.houses < 1) return 'No buildings to sell';
  const group = GROUP_SPACES[sp.groupId!];
  if (st.houses < Math.max(...group.map((x) => s.props[x].houses))) return 'Sell evenly across the group';
  if (st.houses === 5 && s.housesLeft < 4) return 'The bank does not have 4 houses to replace the hotel';
  return null;
}

function mortgageError(s: GameState, pid: string, id: number): Result {
  const g = manageGuard(s, pid);
  if (g) return g;
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  if (!st) return 'That space cannot be mortgaged';
  if (st.owner !== pid) return 'You do not own this property';
  if (st.mortgaged) return 'Already mortgaged';
  if (sp.kind === 'property' && GROUP_SPACES[sp.groupId!].some((x) => s.props[x].houses > 0)) return 'Sell all buildings in this colour group first';
  return null;
}

function unmortgageError(s: GameState, pid: string, id: number): Result {
  const g = manageGuard(s, pid);
  if (g) return g;
  if (s.phase === 'debt') return 'Settle your debt first';
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  if (!st) return 'That space cannot be mortgaged';
  if (st.owner !== pid) return 'You do not own this property';
  if (!st.mortgaged) return 'This property is not mortgaged';
  if (getPlayer(s, pid)!.money < unmortgageCost(sp)) return 'Not enough cash to unmortgage';
  return null;
}

function build(s: GameState, pid: string, id: number): Result {
  const err = buildError(s, pid, id);
  if (err) return err;
  const p = getPlayer(s, pid)!;
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  p.money -= sp.houseCost!;
  if (st.houses === 4) {
    st.houses = 5;
    s.housesLeft += 4;
    s.hotelsLeft--;
    log(s, `${p.name} built a hotel on ${sp.name}.`, 'property', pid);
  } else {
    st.houses++;
    s.housesLeft--;
    log(s, `${p.name} built a house on ${sp.name} (${st.houses}).`, 'property', pid);
  }
  return null;
}

function sellHouse(s: GameState, pid: string, id: number): Result {
  const err = sellError(s, pid, id);
  if (err) return err;
  const p = getPlayer(s, pid)!;
  const sp = BOARD.spaces[id];
  const st = s.props[id];
  p.money += sp.houseCost! / 2;
  if (st.houses === 5) {
    st.houses = 4;
    s.hotelsLeft++;
    s.housesLeft -= 4;
    log(s, `${p.name} sold the hotel on ${sp.name}.`, 'property', pid);
  } else {
    st.houses--;
    s.housesLeft++;
    log(s, `${p.name} sold a house on ${sp.name}.`, 'property', pid);
  }
  return null;
}

function mortgage(s: GameState, pid: string, id: number): Result {
  const err = mortgageError(s, pid, id);
  if (err) return err;
  const p = getPlayer(s, pid)!;
  const sp = BOARD.spaces[id];
  s.props[id].mortgaged = true;
  p.money += sp.mortgage!;
  log(s, `${p.name} mortgaged ${sp.name} for ${inr(sp.mortgage!)}.`, 'property', pid);
  return null;
}

function unmortgage(s: GameState, pid: string, id: number): Result {
  const err = unmortgageError(s, pid, id);
  if (err) return err;
  const p = getPlayer(s, pid)!;
  const sp = BOARD.spaces[id];
  const cost = unmortgageCost(sp);
  p.money -= cost;
  s.props[id].mortgaged = false;
  log(s, `${p.name} paid ${inr(cost)} to unmortgage ${sp.name}.`, 'property', pid);
  return null;
}

/* ---------- debt & bankruptcy ---------- */

function payDebt(s: GameState, pid: string, ctx: Ctx): Result {
  const d = s.debt;
  if (!d || s.phase !== 'debt') return 'You have no debt to pay';
  if (d.debtorId !== pid) return 'That debt is not yours';
  const p = getPlayer(s, pid)!;
  if (p.money < d.amount) return `You still need ${inr(d.amount - p.money)} more`;
  settleDebtIfPossible(s, ctx);
  return null;
}

function resign(s: GameState, pid: string, ctx: Ctx): Result {
  if (s.status !== 'playing') return 'The game is not in progress';
  if (s.phase === 'auction') return 'Wait for the auction to finish';
  const p = getPlayer(s, pid);
  if (!p || p.bankrupt) return 'You are not an active player';
  const creditor = s.debt?.debtorId === pid ? s.debt.creditorId : null;
  log(s, `${p.name} declared bankruptcy.`, 'bankrupt', pid);
  declareBankrupt(s, pid, creditor, ctx);
  return null;
}

export function declareBankrupt(s: GameState, id: string, creditorId: string | null, _ctx?: Ctx) {
  const d = getPlayer(s, id);
  if (!d || d.bankrupt) return;
  const wasCurrent = currentPlayer(s)?.id === id;

  // 1. liquidate buildings at half price (supply returns to the bank)
  for (const sid of ownedSpaces(s, id)) {
    const sp = BOARD.spaces[sid];
    const st = s.props[sid];
    if (st.houses > 0) {
      d.money += (st.houses * (sp.houseCost ?? 0)) / 2;
      if (st.houses === 5) s.hotelsLeft++;
      else s.housesLeft += st.houses;
      st.houses = 0;
    }
  }

  const creditor = creditorId ? getPlayer(s, creditorId) : undefined;
  if (creditor && !creditor.bankrupt) {
    creditor.money += d.money;
    for (const sid of ownedSpaces(s, id)) {
      const sp = BOARD.spaces[sid];
      const st = s.props[sid];
      st.owner = creditor.id;
      if (st.mortgaged) {
        const fee = Math.min(creditor.money, mortgageFee(sp));
        creditor.money -= fee;
      }
    }
    creditor.jailCards.push(...d.jailCards);
    log(s, `${d.name} is bankrupt. Everything goes to ${creditor.name}.`, 'bankrupt', id);
  } else {
    for (const sid of ownedSpaces(s, id)) {
      const st = s.props[sid];
      st.owner = null;
      st.mortgaged = false;
    }
    for (const deck of d.jailCards) releaseJailCard(s, deck);
    log(s, `${d.name} is bankrupt. Their properties return to the bank.`, 'bankrupt', id);
  }
  d.money = 0;
  d.jailCards = [];
  d.bankrupt = true;
  d.inJail = false;
  if (s.debt?.debtorId === id) s.debt = null;
  s.trades = s.trades.filter((t) => t.fromId !== id && t.toId !== id);

  const left = alive(s);
  if (left.length <= 1) {
    s.status = 'finished';
    s.winnerId = left[0]?.id ?? null;
    s.phase = 'end';
    s.auction = null;
    s.debt = null;
    if (left[0]) log(s, `${left[0].name} wins the game!`, 'system', left[0].id);
    return;
  }
  if (wasCurrent) nextTurn(s);
}

function kick(s: GameState, pid: string, targetId: string, ctx: Ctx): Result {
  if (pid !== s.hostId) return 'Only the host can remove players';
  if (targetId === pid) return 'You cannot remove yourself';
  const t = getPlayer(s, targetId);
  if (!t) return 'Player not found';
  if (s.status === 'lobby') {
    log(s, `${t.name} was removed by the host.`, 'system');
    s.players = s.players.filter((p) => p.id !== targetId);
    return null;
  }
  if (s.status !== 'playing') return 'The game is over';
  if (s.phase === 'auction') return 'Wait for the auction to finish';
  if (t.bankrupt) return 'That player is already out';
  log(s, `${t.name} was removed by the host.`, 'bankrupt', targetId);
  declareBankrupt(s, targetId, null, ctx);
  return null;
}

/* ---------- trading ---------- */

const emptySide = (): TradeSide => ({ cash: 0, props: [], jailCards: 0 });

function normalizeSide(raw: any): TradeSide | null {
  if (!raw || typeof raw !== 'object') return null;
  const cash = Number(raw.cash ?? 0);
  const jail = Number(raw.jailCards ?? 0);
  if (!Number.isInteger(cash) || cash < 0 || !Number.isInteger(jail) || jail < 0) return null;
  if (!Array.isArray(raw.props)) return null;
  const props: number[] = (raw.props as unknown[]).map(Number);
  if (props.some((x: number) => !Number.isInteger(x))) return null;
  return { cash, props: Array.from(new Set(props)), jailCards: jail };
}

function sideError(s: GameState, giverId: string, side: TradeSide, checkCash: boolean): Result {
  const giver = getPlayer(s, giverId);
  if (!giver || giver.bankrupt) return 'Player is out of the game';
  if (checkCash && side.cash > giver.money) return `${giver.name} does not have ${inr(side.cash)}`;
  if (side.jailCards > giver.jailCards.length) return `${giver.name} does not have that many jail cards`;
  for (const id of side.props) {
    const st = s.props[id];
    const sp = BOARD.spaces[id];
    if (!st || !sp) return 'Invalid property in trade';
    if (st.owner !== giverId) return `${giver.name} does not own ${sp.name}`;
    if (sp.kind === 'property' && GROUP_SPACES[sp.groupId!].some((x) => s.props[x].houses > 0)) {
      return `Sell the buildings in ${sp.name}'s colour group before trading it`;
    }
  }
  return null;
}

const sideEmpty = (x: TradeSide) => x.cash === 0 && x.props.length === 0 && x.jailCards === 0;

function tradeError(s: GameState, t: Pick<Trade, 'fromId' | 'toId' | 'offer' | 'request'>, checkCash: boolean): Result {
  if (t.fromId === t.toId) return 'You cannot trade with yourself';
  if (sideEmpty(t.offer) && sideEmpty(t.request)) return 'A trade cannot be empty';
  return sideError(s, t.fromId, t.offer, checkCash) ?? sideError(s, t.toId, t.request, checkCash);
}

function tradeGuard(s: GameState, pid: string): Result {
  const g = manageGuard(s, pid);
  return g;
}

function proposeTrade(s: GameState, pid: string, toId: string, rawOffer: unknown, rawRequest: unknown): Result {
  const g = tradeGuard(s, pid);
  if (g) return g;
  const offer = normalizeSide(rawOffer);
  const request = normalizeSide(rawRequest);
  if (!offer || !request) return 'Invalid trade';
  if (!getPlayer(s, toId)) return 'Player not found';
  if (s.trades.filter((t) => t.fromId === pid || t.toId === pid).length >= 8) return 'Too many open trades. Cancel one first.';
  const t: Trade = {
    id: `t${++s.tradeSeq}`,
    fromId: pid,
    toId,
    offer,
    request,
    agreed: { from: true, to: false },
    lastEditorId: pid,
  };
  const err = tradeError(s, t, true);
  if (err) return err;
  s.trades.push(t);
  log(s, `${getPlayer(s, pid)!.name} proposed a trade to ${getPlayer(s, toId)!.name}.`, 'trade', pid);
  return null;
}

function counterTrade(s: GameState, pid: string, tradeId: string, rawOffer: unknown, rawRequest: unknown): Result {
  const g = tradeGuard(s, pid);
  if (g) return g;
  const t = s.trades.find((x) => x.id === tradeId);
  if (!t || (t.fromId !== pid && t.toId !== pid)) return 'Trade not found';
  const offer = normalizeSide(rawOffer);
  const request = normalizeSide(rawRequest);
  if (!offer || !request) return 'Invalid trade';
  const next = { fromId: t.fromId, toId: t.toId, offer, request };
  const err = tradeError(s, next, true);
  if (err) return err;
  t.offer = offer;
  t.request = request;
  t.agreed = { from: pid === t.fromId, to: pid === t.toId };
  t.lastEditorId = pid;
  log(s, `${getPlayer(s, pid)!.name} sent a counter-offer to ${getPlayer(s, pid === t.fromId ? t.toId : t.fromId)!.name}.`, 'trade', pid);
  return null;
}

function acceptTrade(s: GameState, pid: string): (tradeId: string) => Result {
  return (tradeId) => {
    const g = tradeGuard(s, pid);
    if (g) return g;
    const t = s.trades.find((x) => x.id === tradeId);
    if (!t || (t.fromId !== pid && t.toId !== pid)) return 'Trade not found';
    if (t.lastEditorId === pid) return 'Waiting for the other player to respond';
    const err = tradeError(s, t, true);
    if (err) return err;
    if (pid === t.fromId) t.agreed.from = true;
    else t.agreed.to = true;
    if (t.agreed.from && t.agreed.to) executeTrade(s, t);
    return null;
  };
}

function executeTrade(s: GameState, t: Trade): Result {
  const err = tradeError(s, t, true);
  if (err) return err;
  const a = getPlayer(s, t.fromId)!;
  const b = getPlayer(s, t.toId)!;
  // fees for receiving mortgaged property
  const feeFor = (ids: number[]) => ids.reduce((sum, id) => sum + (s.props[id].mortgaged ? mortgageFee(BOARD.spaces[id]) : 0), 0);
  const aFee = feeFor(t.request.props);
  const bFee = feeFor(t.offer.props);
  const aAfter = a.money - t.offer.cash + t.request.cash;
  const bAfter = b.money - t.request.cash + t.offer.cash;
  if (aAfter < aFee) return `${a.name} cannot afford the mortgage transfer fee`;
  if (bAfter < bFee) return `${b.name} cannot afford the mortgage transfer fee`;
  a.money = aAfter - aFee;
  b.money = bAfter - bFee;
  for (const id of t.offer.props) s.props[id].owner = b.id;
  for (const id of t.request.props) s.props[id].owner = a.id;
  const moveCards = (from: Player, to: Player, n: number) => {
    for (let i = 0; i < n; i++) to.jailCards.push(from.jailCards.pop()!);
  };
  moveCards(a, b, t.offer.jailCards);
  moveCards(b, a, t.request.jailCards);
  s.trades = s.trades.filter((x) => x.id !== t.id);
  const desc = (side: TradeSide) =>
    [side.cash ? inr(side.cash) : '', ...side.props.map((id) => BOARD.spaces[id].name), side.jailCards ? `${side.jailCards} jail card(s)` : ''].filter(Boolean).join(', ') || 'nothing';
  log(s, `Trade completed: ${a.name} gave ${desc(t.offer)}; ${b.name} gave ${desc(t.request)}.`, 'trade');
  return null;
}

function rejectTrade(s: GameState, pid: string, tradeId: string): Result {
  const t = s.trades.find((x) => x.id === tradeId);
  if (!t || (t.fromId !== pid && t.toId !== pid)) return 'Trade not found';
  s.trades = s.trades.filter((x) => x.id !== tradeId);
  const who = getPlayer(s, pid)!.name;
  log(s, `${who} ${pid === t.fromId ? 'cancelled' : 'rejected'} a trade.`, 'trade', pid);
  return null;
}

function pruneTrades(s: GameState) {
  s.trades = s.trades.filter((t) => tradeError(s, t, false) === null);
}

/* ------------------------------------------------------------------ */
/* dispatcher                                                          */
/* ------------------------------------------------------------------ */

export function afterMutation(s: GameState, ctx: Ctx) {
  settleDebtIfPossible(s, ctx);
  pruneTrades(s);
  s.version++;
}

/**
 * The single entry point for every player action. The server never trusts the
 * client: each branch validates turn order, phase, ownership and funds.
 */
export function applyAction(s: GameState, pid: string, a: ClientAction, ctx: Ctx): Result {
  if (!getPlayer(s, pid)) return 'You are not in this game';
  let err: Result;
  switch (a.type) {
    case 'setToken':
      err = setToken(s, pid, String(a.token));
      break;
    case 'setSettings':
      err = setSettings(s, pid, a.settings ?? {});
      break;
    case 'kick':
      err = kick(s, pid, String(a.playerId), ctx);
      break;
    case 'start':
      err = startGame(s, pid, ctx);
      break;
    case 'roll':
      err = rollDice(s, pid, ctx);
      break;
    case 'buy':
      err = buyProperty(s, pid);
      break;
    case 'declineBuy':
      err = declineBuy(s, pid, ctx);
      break;
    case 'endTurn':
      err = endTurn(s, pid);
      break;
    case 'payJail':
      err = payJail(s, pid);
      break;
    case 'useJailCard':
      err = useJailCard(s, pid);
      break;
    case 'build':
      err = build(s, pid, Number(a.spaceId));
      break;
    case 'sellHouse':
      err = sellHouse(s, pid, Number(a.spaceId));
      break;
    case 'mortgage':
      err = mortgage(s, pid, Number(a.spaceId));
      break;
    case 'unmortgage':
      err = unmortgage(s, pid, Number(a.spaceId));
      break;
    case 'bid':
      err = bid(s, pid, Number(a.amount), ctx);
      break;
    case 'passAuction':
      err = passAuction(s, pid, ctx);
      break;
    case 'payDebt':
      err = payDebt(s, pid, ctx);
      break;
    case 'resign':
      err = resign(s, pid, ctx);
      break;
    case 'proposeTrade':
      err = proposeTrade(s, pid, String(a.toId), a.offer, a.request);
      break;
    case 'counterTrade':
      err = counterTrade(s, pid, String(a.tradeId), a.offer, a.request);
      break;
    case 'acceptTrade':
      err = acceptTrade(s, pid)(String(a.tradeId));
      break;
    case 'rejectTrade':
      err = rejectTrade(s, pid, String(a.tradeId));
      break;
    case 'returnToLobby':
      err = returnToLobby(s, pid);
      break;
    case 'playAgain':
      err = playAgain(s, pid, ctx);
      break;
    default:
      err = 'Unknown action';
  }
  if (!err) afterMutation(s, ctx);
  return err;
}

/* ------------------------------------------------------------------ */
/* legal actions (what the UI may offer)                               */
/* ------------------------------------------------------------------ */

export function legalActions(s: GameState, pid: string): Legal {
  const p = getPlayer(s, pid);
  const playing = s.status === 'playing' && !!p && !p.bankrupt;
  const isCur = playing && currentPlayer(s)?.id === pid;
  const props: Record<number, PropertyActions> = {};
  if (playing) {
    for (const id of ownedSpaces(s, pid)) {
      props[id] = {
        build: buildError(s, pid, id) === null,
        sell: sellError(s, pid, id) === null,
        mortgage: mortgageError(s, pid, id) === null,
        unmortgage: unmortgageError(s, pid, id) === null,
      };
    }
  }
  const a = s.auction;
  const sp = p ? BOARD.spaces[p.position] : undefined;
  return {
    canRoll: isCur && s.phase === 'roll',
    canBuy: isCur && s.phase === 'buy' && !!sp?.price && p!.money >= sp.price,
    canDeclineBuy: isCur && s.phase === 'buy',
    canEndTurn: isCur && s.phase === 'end',
    canPayJail: isCur && s.phase === 'roll' && !!p!.inJail && p!.money >= JAIL_FINE,
    canUseJailCard: isCur && s.phase === 'roll' && !!p!.inJail && p!.jailCards.length > 0,
    canPayDebt: playing && s.phase === 'debt' && s.debt?.debtorId === pid && p!.money >= s.debt.amount,
    canResign: playing && s.phase !== 'auction',
    canBid: playing && !!a && a.participants.includes(pid) && !a.passed.includes(pid),
    canPassAuction: playing && !!a && a.participants.includes(pid) && !a.passed.includes(pid) && a.highBidderId !== pid,
    canTrade: playing && s.phase !== 'auction',
    props,
  };
}

export { emptySide };
