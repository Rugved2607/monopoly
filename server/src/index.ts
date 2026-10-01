import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientAction, JoinedPayload } from '../../shared/types';
import { BOARD } from './engine/boardData';
import { applyAction, cleanName } from './engine/engine';
import { TOKENS } from './engine/tokens';
import { toClientState } from './engine/view';
import { createStore } from './persistence';
import { RoomManager, normalizeCode, secureCtx, type Room } from './rooms';

const PORT = Number(process.env.PORT ?? 3001);
const RATE_PER_SEC = Number(process.env.RATE_PER_SEC ?? 20);
const RATE_BURST = Number(process.env.RATE_BURST ?? 40);
const corsList = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const store = await createStore(process.env.DATABASE_URL);
const manager = new RoomManager(store);
const restored = await manager.restore();

const app = express();
app.disable('x-powered-by');
const http = createServer(app);
const io = new Server(http, {
  maxHttpBufferSize: 50_000,
  cors: { origin: corsList.length ? corsList : process.env.NODE_ENV === 'production' ? false : true },
  pingInterval: 10_000,
  pingTimeout: 12_000,
});

app.get('/health', (_req, res) => res.json({ ok: true, rooms: manager.rooms.size, store: store.kind }));
app.get('/api/rooms/:code', (req, res) => {
  const room = manager.rooms.get(normalizeCode(req.params.code));
  if (!room) return res.status(404).json({ exists: false });
  res.json({ exists: true, status: room.state.status, players: room.state.players.length });
});

const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: 'index.html' }));
  app.get('*', (_req, res) => res.sendFile(clientDist + '/index.html'));
}

/* ---------- broadcasting ---------- */

function broadcast(room: Room) {
  const now = Date.now();
  for (const [socketId, playerId] of room.sockets) {
    io.to(socketId).emit('state', toClientState(room.state, playerId, now));
  }
}
manager.onChange = broadcast;

function joinedPayload(room: Room, playerId: string, token: string): JoinedPayload {
  return {
    roomCode: room.code,
    playerId,
    sessionToken: token,
    board: BOARD,
    tokens: TOKENS.map((t) => ({ ...t })),
  };
}

function bindSocket(socket: Socket, room: Room, playerId: string) {
  manager.attach(room, socket.id, playerId);
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
}

/* ---------- socket protocol ---------- */

io.on('connection', (socket) => {
  // token bucket: RATE_PER_SEC sustained, RATE_BURST burst; refills continuously
  let tokens = RATE_BURST;
  let last = Date.now();
  const limited = (ack?: (a: Ack) => void) => {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - last) / 1000) * RATE_PER_SEC);
    last = now;
    if (tokens < 1) {
      ack?.({ ok: false, error: 'Slow down a little.' });
      return true;
    }
    tokens -= 1;
    return false;
  };
  const reply = (ack: unknown, payload: Ack<any>) => typeof ack === 'function' && (ack as (a: Ack) => void)(payload);

  function leaveCurrent() {
    const code = socket.data.roomCode as string | undefined;
    if (!code) return;
    const room = manager.rooms.get(code);
    socket.leave(code);
    socket.data.roomCode = undefined;
    if (room) {
      const gone = manager.detach(room, socket.id);
      if (gone) {
        manager.touch(room);
        broadcast(room);
      }
    }
  }

  socket.on('room:create', (payload: { name?: string }, ack) => {
    if (limited(ack)) return;
    leaveCurrent();
    const res = manager.create(cleanName(payload?.name));
    if ('error' in res) return reply(ack, { ok: false, error: res.error });
    bindSocket(socket, res.room, res.playerId);
    reply(ack, { ok: true, data: joinedPayload(res.room, res.playerId, res.token) });
    manager.touch(res.room);
    broadcast(res.room);
  });

  socket.on('room:join', (payload: { code?: string; name?: string }, ack) => {
    if (limited(ack)) return;
    leaveCurrent();
    const res = manager.join(String(payload?.code ?? ''), cleanName(payload?.name));
    if ('error' in res) return reply(ack, { ok: false, error: res.error });
    bindSocket(socket, res.room, res.playerId);
    reply(ack, { ok: true, data: joinedPayload(res.room, res.playerId, res.token) });
    manager.touch(res.room);
    broadcast(res.room);
  });

  socket.on('room:resume', (payload: { code?: string; sessionToken?: string }, ack) => {
    if (limited(ack)) return;
    const res = manager.resume(String(payload?.code ?? ''), String(payload?.sessionToken ?? ''));
    if ('error' in res) return reply(ack, { ok: false, error: res.error });
    leaveCurrent();
    bindSocket(socket, res.room, res.playerId);
    reply(ack, { ok: true, data: joinedPayload(res.room, res.playerId, String(payload?.sessionToken)) });
    manager.touch(res.room);
    broadcast(res.room);
  });

  socket.on('room:leave', (_payload, ack) => {
    const code = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    const room = code ? manager.rooms.get(code) : undefined;
    if (room && playerId && room.state.status === 'lobby') {
      manager.leaveLobby(room, playerId);
      socket.leave(room.code);
      socket.data.roomCode = undefined;
      if (manager.rooms.has(room.code)) {
        manager.touch(room);
        broadcast(room);
      }
    } else {
      leaveCurrent();
    }
    reply(ack, { ok: true });
  });

  socket.on('action', (action: ClientAction, ack) => {
    if (limited(ack)) return;
    const room = manager.rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId as string | undefined;
    if (!room || !playerId || room.sockets.get(socket.id) !== playerId) return reply(ack, { ok: false, error: 'You are not in a room.' });
    if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string') return reply(ack, { ok: false, error: 'Invalid action.' });

    const err = applyAction(room.state, playerId, action, secureCtx());
    if (err) return reply(ack, { ok: false, error: err });

    // a kicked player's sockets lose their seat
    for (const [sid, pid] of [...room.sockets]) {
      if (!room.state.players.some((p) => p.id === pid)) {
        io.to(sid).emit('kicked', { reason: 'You were removed from the room by the host.' });
        room.sockets.delete(sid);
        io.sockets.sockets.get(sid)?.leave(room.code);
      }
    }
    manager.touch(room);
    broadcast(room);
    reply(ack, { ok: true });
  });

  socket.on('disconnect', () => {
    leaveCurrent();
  });
});

setInterval(() => manager.sweep(), 30_000).unref();

http.listen(PORT, () => {
  console.log(`India Property Tycoon server listening on :${PORT} (store: ${store.kind}, restored rooms: ${restored})`);
});

async function shutdown() {
  console.log('Shutting down…');
  await store.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
