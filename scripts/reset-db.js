/**
 * Reset the database so the demo starts fresh.
 *
 *   npm run reset-db
 *
 * SQLite (default):   deletes data/vending.db (recreated + re-seeded on start)
 * PostgreSQL:         when DATABASE_URL / SUPABASE_DB_URL is set, drops and
 *                     recreates the three tables instead of touching any file.
 */
import { loadEnv } from '../server/loadEnv.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (url) {
  const { createPostgresDriver } = await import('../server/pg.js');
  const { SEED_PRODUCTS } = await import('../server/db.js');

  const db = await createPostgresDriver(url);
  try {
    // Drop everything and rebuild the schema + seed in one go.
    await db.query('DROP TABLE IF EXISTS transactions CASCADE');
    await db.query('DROP TABLE IF EXISTS products CASCADE');
    await db.query('DROP TABLE IF EXISTS admin_users CASCADE');
    console.log('✔ Dropped transactions, products and admin_users');

    const { openDatabase } = await import('../server/db.js');
    await openDatabase({ databaseUrl: url });
    console.log(`✔ Recreated the schema and seeded ${SEED_PRODUCTS.length} products`);
    console.log('  The admin account is recreated on the next start.');
  } finally {
    await db.close();
  }
  console.log('\nDatabase reset.');
  process.exit(0);
}

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'vending.db');

let removed = 0;
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    removed += 1;
    console.log(`✔ Deleted ${path.basename(file)}`);
  }
}

if (!removed) console.log('  (no SQLite database file to delete)');

console.log('Database reset. It will be recreated with the default catalogue on the next start.');
