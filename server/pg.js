/**
 * PostgreSQL driver (Supabase, or any other PostgreSQL server).
 *
 * Wraps a `pg` Pool behind the same tiny interface the SQLite driver exposes:
 *
 *   query(sql, params)        -> { rows, rowCount }
 *   withTransaction(fn)       -> fn(tx) runs on a dedicated connection inside
 *                                BEGIN / COMMIT / ROLLBACK
 *   close()                   -> end the pool
 *
 * Statements arrive with `?` placeholders and `{{tokens}}`; `renderSql()`
 * converts them, so the store functions in db.js stay dialect agnostic.
 */
import pg from 'pg';
import { renderSql } from './sqlDialect.js';

const { Pool } = pg;

/** Never print a password in a log line or error message. */
export function redactConnectionString(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(unparseable connection string)';
  }
}

/**
 * Decide on TLS settings.
 *
 * Supabase (and most managed Postgres) require SSL. Their certificate chain is
 * not always verifiable from Node without extra CA configuration, so we default
 * to `rejectUnauthorized: false` for remote hosts. Local databases stay plain.
 *
 * Override explicitly with DB_SSL=true | false | no-verify
 */
function sslOption(url) {
  const override = String(process.env.DB_SSL || '').toLowerCase();
  if (override === 'false' || override === '0' || override === 'disable') return false;
  if (override === 'true' || override === '1' || override === 'require') return true;
  if (override === 'no-verify' || override === 'noverify') return { rejectUnauthorized: false };

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // unparseable – assume a remote, SSL-requiring server
  }
  const local = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
  return local ? false : { rejectUnauthorized: false };
}

/** @param {string} url */
export async function createPostgresDriver(url) {
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX) || 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: sslOption(url),
    application_name: 'smart-vending-machine',
  });

  // Fail fast (and with a useful hint) if the database is unreachable.
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    await pool.end().catch(() => {});
    throw new Error(
      `Cannot connect to PostgreSQL at ${redactConnectionString(url)}: ${err.message}\n` +
        '  Check DATABASE_URL / SUPABASE_DB_URL in your .env file.\n' +
        '  On Supabase: Project Settings → Database → Connection string (URI).'
    );
  }

  const run = async (querier, sql, params = []) => {
    const res = await querier.query(renderSql('postgres', sql), params);
    return { rows: res.rows, rowCount: res.rowCount };
  };

  return {
    kind: 'PostgreSQL',
    location: redactConnectionString(url),
    dialect: 'postgres',

    query: (sql, params) => run(pool, sql, params),

    /**
     * Run `fn(tx)` inside a real transaction on a single dedicated
     * connection. `tx` has the same `query()` shape as the driver, so the
     * store functions can be used both inside and outside a transaction.
     */
    async withTransaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ dialect: 'postgres', query: (sql, params) => run(client, sql, params) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* connection already broken – nothing to roll back */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    close: () => pool.end(),
  };
}
