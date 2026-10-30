/**
 * Smart Vending Machine Store – application entry point.
 *
 *   node server/index.js
 *
 * Serves the customer machine UI, the admin dashboard and the JSON API.
 * Storage is SQLite by default; set DATABASE_URL to use PostgreSQL/Supabase.
 */
import './loadEnv.js'; // MUST be first – loads .env before any other module
import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openDatabase, ROOT_DIR } from './db.js';
import { createMachineRouter } from './routes/machine.js';
import { createAdminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

/**
 * Build the Express application.
 * @param {{ dbPath?: string, databaseUrl?: string }} [options]
 * @returns {Promise<{ app: import('express').Express, db: any }>}
 */
export async function createApp(options = {}) {
  const db = await openDatabase(options);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '6mb' }));

  // Static assets (public/). Never cached during development so edits show up.
  app.use(
    express.static(PUBLIC_DIR, {
      etag: true,
      maxAge: 0,
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  // API
  app.use('/api/machine', createMachineRouter(db));
  app.use('/api/admin', await createAdminRouter(db));

  app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  // Admin dashboard page
  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));
  app.get('/admin/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));

  // Unknown API route -> JSON 404 (never the HTML page)
  app.use('/api', (req, res) =>
    res.status(404).json({ error: 'NOT_FOUND', message: `Unknown API endpoint ${req.method} ${req.originalUrl}` })
  );

  // Unknown page -> home (SPA style), other methods -> 404
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // JSON error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'BAD_JSON', message: 'Invalid JSON body.' });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' });
    }
    console.error('[server error]', err);
    return res.status(500).json({ error: 'SERVER_ERROR', message: 'Unexpected server error.' });
  });

  return { app, db };
}

async function main() {
  const port = Number(process.env.PORT) || 3000;

  let app;
  let db;
  try {
    ({ app, db } = await createApp());
  } catch (err) {
    console.error('\n✖ Failed to start the Smart Vending Machine Store:');
    console.error(`  ${err.message}`);
    console.error('\n  Tips:');
    console.error('   - SQLite: make sure the project folder is writable (data/vending.db is created there).');
    console.error('   - PostgreSQL/Supabase: check DATABASE_URL in your .env file, then run supabase/schema.sql.');
    console.error('   - Stop any other instance of the app using the same database.');
    console.error(`   - Node.js 20+ is required. You are running ${process.version}.\n`);
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log('');
    console.log('  ┌───────────────────────────────────────────────────────────┐');
    console.log('  │        SMART VENDING MACHINE STORE is now running        │');
    console.log('  └───────────────────────────────────────────────────────────┘');
    console.log(`  • Machine :  http://localhost:${port}/`);
    console.log(`  • Admin   :  http://localhost:${port}/admin`);
    console.log(`  • Health  :  http://localhost:${port}/api/health`);
    console.log(`  • Database:  ${db.kind} – ${db.location}`);
    console.log('');
  });

  const shutdown = () => {
    console.log('\nShutting down…');
    server.close(async () => {
      try {
        await db.close();
      } catch {
        /* already closed */
      }
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run only when executed directly (not when imported by tests).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
