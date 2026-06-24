import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AuthoritativeStreamState,
  JsonObject,
  StreamStateStore,
} from '../../modules/StreamState/index.js';

type StreamStateRow = {
  stream_key: string;
  version: number;
  state_json: string;
  updated_at: string;
};

export class SqliteStreamStateStore implements StreamStateStore {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys = ON;');
    this.database.exec('PRAGMA busy_timeout = 5000;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS stream_states (
        stream_key TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  public async getAuthoritativeState(streamKey: string): Promise<AuthoritativeStreamState | null> {
    const row = this.database
      .prepare('SELECT stream_key,version,state_json,updated_at FROM stream_states WHERE stream_key=?')
      .get(streamKey) as StreamStateRow | undefined;

    if (!row) return null;
    return {
      streamKey: row.stream_key,
      version: row.version,
      state: JSON.parse(row.state_json) as JsonObject,
      updatedAt: row.updated_at,
    };
  }

  public async saveAuthoritativeState(state: AuthoritativeStreamState): Promise<void> {
    const updatedAt = state.updatedAt ?? new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO stream_states (stream_key,version,state_json,updated_at)
        VALUES (?,?,?,?)
        ON CONFLICT(stream_key) DO UPDATE SET
          version=excluded.version,
          state_json=excluded.state_json,
          updated_at=excluded.updated_at
      `)
      .run(state.streamKey, state.version, JSON.stringify(state.state), updatedAt);
  }

  public async ensureInitialState(input: {
    readonly streamKey: string;
    readonly state: JsonObject;
    readonly version?: number;
    readonly updatedAt?: string;
  }): Promise<AuthoritativeStreamState> {
    const version = input.version ?? 1;
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.database
      .prepare(`
        INSERT OR IGNORE INTO stream_states (stream_key,version,state_json,updated_at)
        VALUES (?,?,?,?)
      `)
      .run(input.streamKey, version, JSON.stringify(input.state), updatedAt);

    const authoritativeState = await this.getAuthoritativeState(input.streamKey);
    if (!authoritativeState) {
      throw new Error(`Failed to initialize authoritative StreamState ${input.streamKey}.`);
    }
    return authoritativeState;
  }

  public close(): void {
    this.database.close();
  }
}
