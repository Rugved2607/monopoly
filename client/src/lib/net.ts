import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Ack, BoardDef, ClientAction, ClientState, JoinedPayload } from '../../../shared/types';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info';
}

export interface NetSnapshot {
  state: ClientState | null;
  board: BoardDef | null;
  tokens: JoinedPayload['tokens'];
  connection: 'connecting' | 'online' | 'offline';
  resuming: boolean;
  toasts: Toast[];
  /** offset between this browser's clock and the server clock (ms) */
  clockOffset: number;
}

const SESSION_KEY = 'ipt.session.v1';
interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

class NetStore {
  private snap: NetSnapshot = {
    state: null,
    board: null,
    tokens: [],
    connection: 'connecting',
    resuming: !!loadSession(),
    toasts: [],
    clockOffset: 0,
  };
  private listeners = new Set<() => void>();
  private socket: Socket;
  private session: Session | null = loadSession();
  private toastId = 0;

  constructor() {
    this.socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000 });
    this.socket.on('connect', () => {
      this.set({ connection: 'online' });
      if (this.session) void this.resume();
      else this.set({ resuming: false });
    });
    this.socket.on('disconnect', () => this.set({ connection: 'offline' }));
    this.socket.io.on('reconnect_attempt', () => this.set({ connection: 'connecting' }));
    this.socket.on('state', (state: ClientState) => {
      const offset = state.auction ? Date.now() - state.auction.serverNow : this.snap.clockOffset;
      this.set({ state, clockOffset: offset });
    });
    this.socket.on('kicked', (p: { reason: string }) => {
      this.clearRoom();
      this.toast(p.reason, 'error');
    });
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<NetSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  toast(text: string, tone: Toast['tone'] = 'error') {
    const id = ++this.toastId;
    this.set({ toasts: [...this.snap.toasts.slice(-3), { id, text, tone }] });
    setTimeout(() => this.set({ toasts: this.snap.toasts.filter((t) => t.id !== id) }), 4200);
  }

  private request<T>(event: string, payload?: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      this.socket.timeout(8000).emit(event, payload, (err: Error | null, ack: Ack<T>) => {
        resolve(err ? { ok: false, error: 'The server did not respond. Check your connection.' } : ack);
      });
    });
  }

  private adopt(joined: JoinedPayload) {
    this.session = { code: joined.roomCode, token: joined.sessionToken };
    saveSession(this.session);
    this.set({ board: joined.board, tokens: joined.tokens, resuming: false });
  }

  async create(name: string): Promise<string | null> {
    const res = await this.request<JoinedPayload>('room:create', { name });
    if (!res.ok) return res.error;
    this.adopt(res.data!);
    return null;
  }

  async join(code: string, name: string): Promise<string | null> {
    const res = await this.request<JoinedPayload>('room:join', { code, name });
    if (!res.ok) return res.error;
    this.adopt(res.data!);
    return null;
  }

  private async resume() {
    if (!this.session) return;
    const res = await this.request<JoinedPayload>('room:resume', { code: this.session.code, sessionToken: this.session.token });
    if (res.ok) {
      this.adopt(res.data!);
    } else {
      this.clearRoom();
      if (!/expired|exists/.test(res.error)) this.toast(res.error);
      else this.toast('Your previous game is no longer available.', 'info');
    }
  }

  private clearRoom() {
    this.session = null;
    saveSession(null);
    this.set({ state: null, resuming: false });
  }

  async leave() {
    await this.request('room:leave');
    this.clearRoom();
  }

  async act(action: ClientAction): Promise<boolean> {
    const res = await this.request('action', action);
    if (!res.ok) {
      this.toast(res.error);
      return false;
    }
    return true;
  }
}

export const net = new NetStore();
export const useNet = () => useSyncExternalStore(net.subscribe, net.getSnapshot);
