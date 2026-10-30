/**
 * Run the full API test suite against a real PostgreSQL server.
 *
 *   npm run test:pg
 *
 * There is no Docker/psql requirement: PGlite is an in-process PostgreSQL
 * (WASM) and `@electric-sql/pglite-socket` exposes it over the wire protocol,
 * so the app talks to it through the exact same `pg` driver it would use for
 * Supabase. Every one of the 74 assertions therefore also covers the
 * Supabase code path: placeholder rewriting (`?` → `$n`), `RETURNING id`,
 * transactions, boolean columns, `to_char` timestamps and bigint casting.
 *
 * Point TEST_DB_URL at a real server to run the suite there instead:
 *   TEST_DB_URL=postgres://… npm run test:pg
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function main() {
  let url = process.env.TEST_DB_URL;
  let server = null;

  if (!url) {
    const [{ PGlite }, { PGLiteSocketServer }] = await Promise.all([
      import('@electric-sql/pglite'),
      import('@electric-sql/pglite-socket'),
    ]);

    const db = await PGlite.create();
    server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 16 });
    await server.start();
    // getServerConn() returns "host:port".
    url = `postgresql://postgres@${server.getServerConn()}/postgres`;
    console.log(`  ▸ Local PostgreSQL (PGlite) listening on ${server.getServerConn()}\n`);
  }

  try {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'tests', 'api.test.js')], {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, TEST_DB_URL: url },
      });
      child.on('exit', (c) => resolve(c ?? 1));
      child.on('error', () => resolve(1));
    });
    process.exitCode = code;
  } finally {
    if (server) await server.stop().catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n  Could not start the PostgreSQL test server:', err.message);
  process.exit(1);
});
