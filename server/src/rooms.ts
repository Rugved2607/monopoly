import { randomBytes, randomInt } from 'node:crypto';
import { createGame, addPlayer, removePlayer, getPlayer, tickAuction, type Ctx, type GameState } from './engine/engine';
import type { RoomSnapshot, RoomStore } from './persistence';

export interface Room {
  code: string;
  state: GameState;
  /** sessionToken -> playerId */
  sessions: Map<string, string>;
  /** socketId -> playerId */
  sockets: Map<string, string>;
  disconnectedAt: Map<string, number>;
  lastActive: number;
  auctionTimer?: NodeJS.Timeout;
  saveTimer?: NodeJS.Timeout;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_PREFIX = 'INDIA-';
const LOBBY_GRACE_MS = 90_000;
const IDLE_ROOM_MS = 6 * 60 * 60 * 1000;
export const MAX_ROOMS = 2000;

export function secureCtx(): Ctx {
  return {
    now: Date.now(),
    rng: () => randomBytes(4).readUInt32BE(0) / 2 ** 32,
  };
}

export function normalizeCode(input: unknown): string {
  let c = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .trim();
  if (!c.startsWith(ROOM_PREFIX)) c = ROOM_PREFIX + c.replace(/^INDIA-?/, '');
  return c.slice(0, 16);
}

export class RoomManager {
  rooms = new Map<string, Room>();
  onChange: (room: Room) => void = () => {};

  constructor(private store: RoomStore) {}

  async restore() {
    const snaps = await this.store.loadAll(24 * 60 * 60 * 1000);
    for (const snap of snaps) {
      const state = snap.state;
      for (const p of state.players) p.connected = false;
      const room: Room = {
        code: state.roomCode,
        state,
        sessions: new Map(snap.sessions),
        sockets: new Map(),
        disconnectedAt: new Map(state.players.map((p) => [p.id, Date.now()])),
        lastActive: Date.now(),
      };
      this.rooms.set(room.code, room);
      this.syncAuctionTimer(room);
    }
    return snaps.length;
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let suffix = '';
      for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      const code = ROOM_PREFIX + suffix;
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a room code');
  }

  create(hostName: string): { room: Room; playerId: string; token: string } | { error: string } {
    if (this.rooms.size >= MAX_ROOMS) return { error: 'The server is busy. Try again in a minute.' };
    const code = this.newCode();
    const playerId = randomBytes(8).toString('hex');
    const state = createGame(code, playerId);
    const err = addPlayer(state, playerId, hostName);
    if (err) return { error: err };
    const token = randomBytes(24).toString('hex');
    const room: Room = {
      code,
      state,
      sessions: new Map([[token, playerId]]),
      sockets: new Map(),
      disconnectedAt: new Map(),
      lastActive: Date.now(),
    };
    this.rooms.set(code, room);
    this.persist(room);
    return { room, playerId, token };
  }

  join(code: string, name: string): { room: Room; playerId: string; token: string } | { error: string } {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) return { error: 'Room not found. Check the code and try again.' };
    const playerId = randomBytes(8).toString('hex');
    const err = addPlayer(room.state, playerId, name);
    if (err) return { error: err };
    const token = randomBytes(24).toString('hex');
    room.sessions.set(token, playerId);
    room.state.version++;
    room.lastActive = Date.now();
    this.persist(room);
    return { room, playerId, token };
  }

  resume(code: string, token: string): { room: Room; playerId: string } | { error: string } {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) return { error: 'This room no longer exists.' };
    const playerId = room.sessions.get(String(token));
    if (!playerId || !getPlayer(room.state, playerId)) return { error: 'Your session has expired.' };
    return { room, playerId };
  }

  attach(room: Room, socketId: string, playerId: string) {
    room.sockets.set(socketId, playerId);
    room.disconnectedAt.delete(playerId);
    const p = getPlayer(room.state, playerId);
    if (p && !p.connected) {
      p.connected = true;
      room.state.version++;
    }
    room.lastActive = Date.now();
  }

  /** returns true when the player's last socket just went away */
  detach(room: Room, socketId: string): string | null {
    const playerId = room.sockets.get(socketId);
    if (!playerId) return null;
    room.sockets.delete(socketId);
    if ([...room.sockets.values()].includes(playerId)) return null;
    const p = getPlayer(room.state, playerId);
    if (p) {
      p.connected = false;
      room.state.version++;
    }
    room.disconnectedAt.set(playerId, Date.now());
    return playerId;
  }

  leaveLobby(room: Room, playerId: string): string | null {
    const err = removePlayer(room.state, playerId);
    if (err) return err;
    for (const [tok, pid] of room.sessions) if (pid === playerId) room.sessions.delete(tok);
    for (const [sid, pid] of room.sockets) if (pid === playerId) room.sockets.delete(sid);
    room.state.version++;
    if (room.state.players.length === 0) this.destroy(room);
    return null;
  }

  destroy(room: Room) {
    clearTimeout(room.auctionTimer);
    clearTimeout(room.saveTimer);
    this.rooms.delete(room.code);
    void this.store.remove(room.code).catch(() => {});
  }

  /** Persist (debounced) + reschedule the auction clock. Call after every mutation. */
  touch(room: Room) {
    room.lastActive = Date.now();
    this.syncAuctionTimer(room);
    this.persist(room);
  }

  persist(room: Room) {
    clearTimeout(room.saveTimer);
    room.saveTimer = setTimeout(() => {
      const snap: RoomSnapshot = { state: room.state, sessions: [...room.sessions], savedAt: Date.now() };
      void this.store.save(room.code, snap).catch((e) => console.error('[persistence] save failed:', e.message));
    }, 400);
  }

  syncAuctionTimer(room: Room) {
    clearTimeout(room.auctionTimer);
    const a = room.state.auction;
    if (!a) return;
    const delay = Math.max(50, a.endsAt - Date.now() + 30);
    room.auctionTimer = setTimeout(() => {
      const changed = tickAuction(room.state, secureCtx());
      if (changed) {
        this.onChange(room);
        this.persist(room);
      }
      this.syncAuctionTimer(room);
    }, delay);
  }

  /** housekeeping: drop idle rooms and long-disconnected lobby players */
  sweep() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.state.status === 'lobby') {
        for (const [pid, at] of room.disconnectedAt) {
          if (now - at > LOBBY_GRACE_MS && room.sockets.size >= 0) {
            this.leaveLobby(room, pid);
            room.disconnectedAt.delete(pid);
            if (this.rooms.has(room.code)) this.onChange(room);
          }
        }
      }
      if (this.rooms.has(room.code) && room.sockets.size === 0 && now - room.lastActive > IDLE_ROOM_MS) this.destroy(room);
    }
  }
}
