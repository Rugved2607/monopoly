import type { GameState } from './engine/engine';

export interface RoomSnapshot {
  state: GameState;
  sessions: [string, string][];
  savedAt: number;
}

export interface RoomStore {
  readonly kind: string;
  init(): Promise<void>;
  save(code: string, snap: RoomSnapshot): Promise<void>;
  remove(code: string): Promise<void>;
  loadAll(maxAgeMs: number): Promise<RoomSnapshot[]>;
  close(): Promise<void>;
}

/** Default: rooms live in process memory only. */
export class MemoryStore implements RoomStore {
  readonly kind = 'memory';
  async init() {}
  async save() {}
  async remove() {}
  async loadAll() {
    return [];
  }
  async close() {}
}

/** PostgreSQL: a JSONB snapshot per room so games survive a server restart. */
export class PgStore implements RoomStore {
  readonly kind = 'postgres';
  private pool: any;
  constructor(private url: string) {}

  async init() {
    const { default: pg } = await import('pg');
    this.pool = new pg.Pool({ connectionString: this.url, max: 5 });
    // free Postgres hosts drop idle connections; without this handler that crashes the process
    this.pool.on('error', (e: Error) => console.error('[persistence] idle client error:', e.message));
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        code text PRIMARY KEY,
        snapshot jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
  }
  async save(code: string, snap: RoomSnapshot) {
    await this.pool.query(
      `INSERT INTO rooms (code, snapshot, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (code) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = now()`,
      [code, JSON.stringify(snap)],
    );
  }
  async remove(code: string) {
    await this.pool.query('DELETE FROM rooms WHERE code = $1', [code]);
  }
  async loadAll(maxAgeMs: number) {
    const res = await this.pool.query(
      `SELECT snapshot FROM rooms WHERE updated_at > now() - ($1::bigint * interval '1 millisecond')`,
      [maxAgeMs],
    );
    return res.rows.map((r: any) => r.snapshot as RoomSnapshot);
  }
  async close() {
    await this.pool?.end();
  }
}

export async function createStore(databaseUrl: string | undefined): Promise<RoomStore> {
  if (!databaseUrl) return new MemoryStore();
  const store = new PgStore(databaseUrl);
  try {
    await store.init();
    return store;
  } catch (err) {
    console.error('[persistence] PostgreSQL unavailable, falling back to in-memory rooms:', (err as Error).message);
    return new MemoryStore();
  }
}
