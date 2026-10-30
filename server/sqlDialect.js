/**
 * SQL dialect helpers.
 *
 * The data layer writes each statement exactly ONCE. Two tiny things do still
 * differ between SQLite and PostgreSQL, and they are isolated here:
 *
 *   1. Dialect tokens – `{{now}}`, `{{now24h}}`, `{{returningId}}` are replaced
 *      with the correct SQL for the target engine.
 *   2. Placeholders – SQLite uses `?`, PostgreSQL uses `$1..$n`. Statements are
 *      authored with `?` (they read naturally and the admin router builds
 *      dynamic SET lists with them) and rewritten for PostgreSQL on the fly.
 *
 * Timestamps are stored as TEXT in BOTH engines, formatted as
 * `YYYY-MM-DD HH:MM:SS` in UTC. That keeps the API payload identical
 * (the admin dashboard appends " UTC" to the value) and makes the
 * "last 24 hours" filter a plain string comparison.
 */

const TOKENS = {
  sqlite: {
    now: "datetime('now')",
    now24h: "datetime('now','-24 hours')",
    returningId: '',
  },
  postgres: {
    now: "to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')",
    now24h: "to_char(now() - interval '24 hours','YYYY-MM-DD HH24:MI:SS')",
    returningId: 'RETURNING id',
  },
};

/**
 * Turn a `?`/`{{token}}` statement into engine-ready SQL.
 * @param {'sqlite'|'postgres'} dialect
 * @param {string} sql
 */
export function renderSql(dialect, sql) {
  const tokens = TOKENS[dialect] || TOKENS.sqlite;
  let text = sql.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in tokens ? tokens[key] : match));

  if (dialect === 'postgres') {
    let i = 0;
    text = text.replace(/\?/g, () => `$${++i}`);
  }
  return text;
}

/** Coerce an aggregate / count value (PostgreSQL returns bigints as strings). */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
