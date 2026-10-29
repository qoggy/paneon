import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync, chmodSync } from 'node:fs';
import { PaneonError } from '../shared/types.js';
import type { StoredPanel, PanelInstance, JsonValue } from '../shared/types.js';
export class Store {
  db: Database.Database;
  constructor(home: string) {
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    this.db = new Database(join(home, 'runtime.sqlite'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const table = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'")
      .get();
    if (table) {
      const row = this.db.prepare('SELECT version FROM schema_meta').get() as { version: number };
      if (row.version !== 1) {
        this.db.close();
        throw new PaneonError(
          'DATABASE_VERSION_UNSUPPORTED',
          'The runtime database has an unsupported schema version.',
        );
      }
    }
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS schema_meta(version INTEGER NOT NULL);INSERT INTO schema_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_meta);CREATE TABLE IF NOT EXISTS panels(id TEXT PRIMARY KEY,definition_id TEXT NOT NULL,entry_path TEXT NOT NULL,cwd TEXT NOT NULL,params_json TEXT NOT NULL,revision TEXT NOT NULL,watch INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,requires_json TEXT NOT NULL,paneon_version TEXT NOT NULL,diagnostic_json TEXT);CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,instance_id TEXT NOT NULL REFERENCES panels(id),revision TEXT NOT NULL,type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);CREATE INDEX IF NOT EXISTS events_instance_id_id ON events(instance_id,id);CREATE TABLE IF NOT EXISTS consumers(instance_id TEXT NOT NULL REFERENCES panels(id),consumer_id TEXT NOT NULL,last_delivered_id INTEGER NOT NULL DEFAULT 0,last_ack_id INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(instance_id,consumer_id));`,
    );
  }
  save(p: StoredPanel) {
    this.db
      .prepare('INSERT OR REPLACE INTO panels VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        p.instanceId,
        p.definitionId,
        p.entryPath,
        p.cwd,
        JSON.stringify(p.params),
        p.revision,
        p.watch ? 1 : 0,
        p.status,
        p.createdAt,
        p.updatedAt,
        JSON.stringify(p.requires),
        p.paneonVersion,
        p.diagnostic ? JSON.stringify(p.diagnostic) : null,
      );
  }
  private decode(r: Record<string, unknown>): StoredPanel {
    return {
      instanceId: r.id as string,
      definitionId: r.definition_id as string,
      entryPath: r.entry_path as string,
      cwd: r.cwd as string,
      params: JSON.parse(r.params_json as string) as JsonValue,
      revision: r.revision as string,
      watch: Boolean(r.watch),
      status: r.status as StoredPanel['status'],
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      requires: JSON.parse(r.requires_json as string) as { paneon: string },
      paneonVersion: r.paneon_version as string,
      ...(r.diagnostic_json
        ? { diagnostic: JSON.parse(r.diagnostic_json as string) as StoredPanel['diagnostic'] }
        : {}),
    };
  }
  all(): StoredPanel[] {
    return (
      this.db.prepare('SELECT * FROM panels ORDER BY created_at,id').all() as Record<
        string,
        unknown
      >[]
    ).map((row) => this.decode(row));
  }
  find(id: string): StoredPanel | undefined {
    const row = this.db.prepare('SELECT * FROM panels WHERE id = ?').get(id) as
      Record<string, unknown> | undefined;
    return row ? this.decode(row) : undefined;
  }
  list(): PanelInstance[] {
    return this.all().map(
      ({ params: _, requires: __, paneonVersion: ___, diagnostic: ____, ...p }) => p,
    );
  }
  listPage(page = 1, pageSize = 20, status?: PanelInstance['status']) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 2147483647 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 1000
    )
      throw new PaneonError('INVALID_ARGUMENT', 'Invalid panel pagination parameters.');
    const where = status === undefined ? '' : ' WHERE status = ?';
    const filters = status === undefined ? [] : [status];
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM panels${where}`)
      .get(...filters) as {
      total: number;
    };
    const rows = this.db
      .prepare(
        `SELECT id AS instanceId, definition_id AS definitionId,
      status, entry_path AS entryPath, cwd, revision, watch,
      created_at AS createdAt, updated_at AS updatedAt
      FROM panels${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      )
      .all(...filters, pageSize, (page - 1) * pageSize) as (Omit<PanelInstance, 'watch'> & {
      watch: number;
    })[];
    return {
      panels: rows.map((row) => ({ ...row, watch: Boolean(row.watch) })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }
  get(id: string) {
    const p = this.find(id);
    if (!p)
      throw new PaneonError('PANEL_NOT_FOUND', 'Panel instance not found.', { instanceId: id });
    return p;
  }
  append(instanceId: string, revision: string, type: string, payload: JsonValue) {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare(
        'INSERT INTO events(instance_id,revision,type,payload_json,created_at) VALUES (?,?,?,?,?)',
      )
      .run(instanceId, revision, type, JSON.stringify(payload), createdAt);
    return { id: Number(result.lastInsertRowid), revision, type, payload, createdAt };
  }
  appendCurrent(instanceId: string, revision: string, type: string, payload: JsonValue) {
    return this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT status, revision FROM panels WHERE id = ?')
        .get(instanceId) as { status: StoredPanel['status']; revision: string } | undefined;
      if (!row) throw new PaneonError('PANEL_NOT_FOUND', 'Panel instance not found.');
      if (row.status !== 'running')
        throw new PaneonError(
          row.status === 'closed' ? 'PANEL_CLOSED' : 'PANEL_UNAVAILABLE',
          'The panel is not running.',
        );
      if (row.revision !== revision)
        throw new PaneonError(
          'PANEL_REVISION_MISMATCH',
          'The panel source changed. Refresh before submitting an event.',
        );
      return this.append(instanceId, revision, type, payload);
    })();
  }
  read(instanceId: string, consumer: string, limit: number) {
    this.get(instanceId);
    return this.db.transaction(() => {
      this.db
        .prepare('INSERT OR IGNORE INTO consumers VALUES (?,?,0,0,?)')
        .run(instanceId, consumer, new Date().toISOString());
      const c = this.db
        .prepare('SELECT * FROM consumers WHERE instance_id=? AND consumer_id=?')
        .get(instanceId, consumer) as { last_ack_id: number; last_delivered_id: number };
      const rows = this.db
        .prepare('SELECT * FROM events WHERE instance_id=? AND id>? ORDER BY id LIMIT ?')
        .all(instanceId, c.last_ack_id, limit + 1) as {
        id: number;
        revision: string;
        type: string;
        payload_json: string;
        created_at: string;
      }[];
      const more = rows.length > limit;
      const events = rows.slice(0, limit).map((r) => ({
        id: r.id,
        type: r.type,
        payload: JSON.parse(r.payload_json) as JsonValue,
        createdAt: r.created_at,
      }));
      const delivered = Math.max(c.last_delivered_id, events.at(-1)?.id ?? 0);
      this.db
        .prepare(
          'UPDATE consumers SET last_delivered_id=?,updated_at=? WHERE instance_id=? AND consumer_id=?',
        )
        .run(delivered, new Date().toISOString(), instanceId, consumer);
      return {
        events,
        lastAckId: c.last_ack_id,
        lastDeliveredId: delivered,
        hasMore: more,
        timedOut: false,
      };
    })();
  }
  ack(instanceId: string, consumer: string, through: number) {
    this.get(instanceId);
    return this.db.transaction(() => {
      const c = this.db
        .prepare('SELECT * FROM consumers WHERE instance_id=? AND consumer_id=?')
        .get(instanceId, consumer) as
        { last_ack_id: number; last_delivered_id: number } | undefined;
      const event = this.db
        .prepare('SELECT id FROM events WHERE instance_id=? AND id=?')
        .get(instanceId, through);
      if (!c || !event || through < c.last_ack_id || through > c.last_delivered_id)
        throw new PaneonError(
          'INVALID_ACK',
          'The acknowledgement is invalid or has not been delivered.',
        );
      this.db
        .prepare(
          'UPDATE consumers SET last_ack_id=?,updated_at=? WHERE instance_id=? AND consumer_id=?',
        )
        .run(through, new Date().toISOString(), instanceId, consumer);
      return { lastAckId: through };
    })();
  }
  close() {
    this.db.close();
  }
}
