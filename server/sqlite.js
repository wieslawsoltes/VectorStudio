/** D1-compatible prepared statement adapter for Node's built-in SQLite. */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDatabase(path, migrations) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("PRAGMA journal_mode=WAL");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _vellum_migrations(name TEXT PRIMARY KEY)",
  );
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      sqlite
        .prepare("SELECT name FROM _vellum_migrations WHERE name=?")
        .get(file)
    )
      continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(migrations + "/" + file, "utf8"));
      sqlite
        .prepare("INSERT INTO _vellum_migrations(name) VALUES(?)")
        .run(file);
      sqlite.exec("COMMIT");
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  }
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) || null;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...this.args) };
    }
    async run() {
      const r = sqlite.prepare(this.sql).run(...this.args);
      return {
        success: true,
        meta: {
          changes: Number(r.changes),
          last_row_id: Number(r.lastInsertRowid),
        },
      };
    }
  }
  return {
    prepare: (sql) => new Statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const s of statements) {
          const r = sqlite.prepare(s.sql).run(...s.args);
          results.push({ success: true, meta: { changes: Number(r.changes) } });
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => sqlite.close(),
    sqlite,
  };
}
