import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientAction, ClientState, JoinedPayload } from '../../shared/types';

const PORT = 4100 + Math.floor(Math.random() * 500);
const URL = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

interface Client {
  socket: Socket;
  state?: ClientState;
  joined?: JoinedPayload;
}

function mk(): Client {
  const socket = connect(URL, { transports: ['websocket'], forceNew: true });
  const c: Client = { socket };
  socket.on('state', (s: ClientState) => (c.state = s));
  return c;
}
const emit = <T,>(c: Client, ev: string, payload?: unknown) =>
  new Promise<Ack<T>>((res) => c.socket.timeout(5000).emit(ev, payload, (err: Error | null, ack: Ack<T>) => res(err ? { ok: false, error: String(err) } : ack)));
const act = (c: Client, a: ClientAction) => emit(c, 'action', a);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timeout waiting for condition');
    await wait(20);
  }
}

beforeAll(async () => {
  server = spawn('npx', ['tsx', 'src/index.ts'], { env: { ...process.env, PORT: String(PORT), DATABASE_URL: '', RATE_PER_SEC: '1000', RATE_BURST: '1000' }, stdio: 'pipe' });
  const start = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${URL}/health`);
      if (r.ok) break;
    } catch {}
    if (Date.now() - start > 20000) throw new Error('server did not start');
    await wait(150);
  }
}, 30000);

afterAll(() => {
  server?.kill('SIGTERM');
});

describe('multiplayer end-to-end', () => {
  it('creates a room, joins, syncs, plays turns authoritatively and reconnects', async () => {
    const a = mk();
    const b = mk();
    const c = mk();

    const created = await emit<JoinedPayload>(a, 'room:create', { name: 'Rahul' });
    expect(created.ok).toBe(true);
    a.joined = (created as any).data;
    expect(a.joined!.roomCode).toMatch(/^INDIA-[A-Z0-9]{4}$/);
    expect(a.joined!.board.spaces.length).toBe(56);

    // joining with bad code / duplicate name
    expect((await emit(b, 'room:join', { code: 'INDIA-ZZZZ', name: 'Amit' })).ok).toBe(false);
    const jb = await emit<JoinedPayload>(b, 'room:join', { code: a.joined!.roomCode, name: 'Amit' });
    expect(jb.ok).toBe(true);
    b.joined = (jb as any).data;
    expect((await emit(c, 'room:join', { code: a.joined!.roomCode.replace('INDIA-', ''), name: 'amit' })).ok).toBe(false);
    const jc = await emit<JoinedPayload>(c, 'room:join', { code: a.joined!.roomCode.toLowerCase(), name: 'Priya' });
    expect(jc.ok).toBe(true);
    c.joined = (jc as any).data;

    await until(() => a.state?.players.length === 3 && c.state?.players.length === 3);

    // non-host cannot start or change settings
    expect((await act(b, { type: 'start' })).ok).toBe(false);
    expect((await act(b, { type: 'setSettings', settings: { startingMoney: 999999 } })).ok).toBe(false);
    expect((await act(a, { type: 'setSettings', settings: { startingMoney: 20000 } })).ok).toBe(true);
    expect((await act(a, { type: 'start' })).ok).toBe(true);

    await until(() => b.state?.status === 'playing');
    const clients = [a, b, c];
    const byId = (id: string) => clients.find((x) => x.joined!.playerId === id)!;
    expect(a.state!.players.every((p) => p.money === 20000)).toBe(true);

    // a non-current player cannot roll
    const cur0 = byId(a.state!.currentPlayerId!);
    const other = clients.find((x) => x !== cur0)!;
    const bad = await act(other, { type: 'roll' });
    expect(bad.ok).toBe(false);

    // cannot forge ownership through a buy on the wrong phase
    expect((await act(cur0, { type: 'buy' })).ok).toBe(false);

    // play a stretch of the game with simple bots (wait for every client to see each new state)
    const synced = () => clients.every((cl) => cl.state!.version === clients[0].state!.version);
    let errors = 0;
    for (let step = 0; step < 120; step++) {
      await until(synced, 3000).catch(() => {});
      const s = a.state!;
      if (s.status !== 'playing') break;
      const cur = byId(s.currentPlayerId!);
      const before = s.version;
      let res: Ack;
      if (s.phase === 'roll') res = await act(cur, { type: 'roll' });
      else if (s.phase === 'buy') res = await act(cur, cur.state!.legal.canBuy ? { type: 'buy' } : { type: 'declineBuy' });
      else if (s.phase === 'end') res = await act(cur, { type: 'endTurn' });
      else if (s.phase === 'auction') {
        res = { ok: true };
        for (const cl of clients) {
          if (cl.state!.legal.canPassAuction) {
            const r = await act(cl, { type: 'passAuction' });
            if (!r.ok) res = r;
          }
        }
      } else if (s.phase === 'debt') res = await act(cur, { type: 'resign' });
      else res = { ok: true };
      if (!res.ok) {
        errors++;
        console.log('ERR', s.phase, (res as any).error);
      }
      await until(() => a.state!.version !== before, 2000).catch(() => {});
    }
    expect(errors).toBe(0);

    // every client sees the identical authoritative state
    await wait(100);
    expect(b.state!.version).toBe(a.state!.version);
    expect(c.state!.props).toEqual(a.state!.props);
    expect(b.state!.players.map((p) => [p.id, p.money, p.position])).toEqual(a.state!.players.map((p) => [p.id, p.money, p.position]));

    // reconnect: drop player b, resume with the session token, state restored
    const snapshot = JSON.stringify(b.state!.players.find((p) => p.id === b.joined!.playerId));
    b.socket.disconnect();
    await until(() => a.state!.players.find((p) => p.id === b.joined!.playerId)?.connected === false);
    const b2 = mk();
    const resumed = await emit<JoinedPayload>(b2, 'room:resume', { code: b.joined!.roomCode, sessionToken: b.joined!.sessionToken });
    expect(resumed.ok).toBe(true);
    await until(() => !!b2.state);
    const after = b2.state!.players.find((p) => p.id === b.joined!.playerId)!;
    const before = JSON.parse(snapshot);
    expect([after.money, after.position, after.bankrupt]).toEqual([before.money, before.position, before.bankrupt]);
    expect(after.connected).toBe(true);

    // forged session token is rejected
    const evil = mk();
    expect((await emit(evil, 'room:resume', { code: b.joined!.roomCode, sessionToken: 'nope' })).ok).toBe(false);

    for (const x of [a, b, b2, c, evil]) x.socket.disconnect();
  }, 60000);
});
