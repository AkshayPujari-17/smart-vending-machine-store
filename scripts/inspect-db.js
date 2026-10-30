/**
 * Print the current contents of the database.
 *
 *   npm run db:inspect                 # summary + all rows (uses whatever backend .env selects)
 *   npm run db:inspect -- --products   # only the products table
 *   npm run db:inspect -- --txns       # only the transaction history
 *   npm run db:inspect -- --tail 5     # last 5 transactions instead of 20
 *
 * Works identically on SQLite and PostgreSQL/Supabase — the backend is chosen
 * by .env exactly as the server does, so you always see the real data.
 */
import { loadEnv } from '../server/loadEnv.js';
import { openDatabase } from '../server/db.js';

loadEnv();

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : fallback;
};

const wantProducts = has('--products') || (!has('--products') && !has('--txns') && !has('--admin'));
const wantTxns = has('--txns') || (!has('--products') && !has('--txns') && !has('--admin'));
const wantAdmin = has('--admin') || (!has('--products') && !has('--txns') && !has('--admin'));
const txnLimit = valueOf('--tail', 20);

const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
const pad = (s, n) => String(s ?? '').padEnd(n);
const padStart = (s, n) => String(s ?? '').padStart(n);

const db = await openDatabase();
console.log(`\n  Backend : ${db.kind}`);
console.log(`  Location: ${db.location}\n`);

try {
  if (wantProducts) {
    const rows = await db.query('SELECT * FROM products ORDER BY code');
    console.log(`  ── products (${rows.rows.length}) ${'─'.repeat(60)}`);
    console.log(`  ${pad('code', 6)}${pad('name', 26)}${padStart('price', 8)}${padStart('stock', 7)}${padStart('avail', 7)}  image`);
    for (const p of rows.rows) {
      const flag = !p.available ? 'OFF' : p.stock === 0 ? 'OUT' : p.stock <= (p.low_stock_threshold ?? 5) ? 'LOW' : 'yes';
      console.log(
        `  ${pad(p.code, 6)}${pad(p.name, 26)}${padStart(rupees(p.price_paise), 8)}${padStart(p.stock, 7)}${padStart(flag, 7)}  ${p.image}`
      );
    }
    console.log('');
  }

  if (wantTxns) {
    const total = (await db.query('SELECT COUNT(*) AS n FROM transactions')).rows[0].n;
    const rows = await db.query('SELECT * FROM transactions ORDER BY id DESC LIMIT ?', [txnLimit]);
    console.log(`  ── transactions (showing ${rows.rows.length} of ${total}) ${'─'.repeat(30)}`);
    console.log(`  ${pad('txn_id', 24)}${pad('when (UTC)', 21)}${pad('product', 24)}${padStart('price', 8)}${padStart('in', 8)}${padStart('change', 8)}  status`);
    for (const t of rows.rows) {
      console.log(
        `  ${pad(t.txn_id, 24)}${pad(t.created_at, 21)}${pad(t.product_name || '—', 24)}` +
          `${padStart(rupees(t.price_paise), 8)}${padStart(rupees(t.inserted_paise), 8)}${padStart(rupees(t.change_paise), 8)}  ${t.status}`
      );
    }
    if (!rows.rows.length) console.log('  (no transactions yet — buy something on the machine)');
    console.log('');
  }

  if (wantAdmin) {
    const rows = await db.query('SELECT id, username, created_at FROM admin_users ORDER BY id');
    console.log(`  ── admin_users (${rows.rows.length}) ${'─'.repeat(55)}`);
    for (const a of rows.rows) {
      console.log(`  #${a.id}  ${pad(a.username, 20)} created ${a.created_at}  (password hash not shown)`);
    }
    console.log('');
  }
} finally {
  await db.close();
}
