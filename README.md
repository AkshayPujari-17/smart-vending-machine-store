# Smart Vending Machine Store

An interactive **vending machine simulation** built with **Node.js + Express** and **SQLite or
PostgreSQL/Supabase** on the backend and **vanilla HTML5 / CSS3 / ES modules** on the frontend.
It behaves like a real modern
vending machine: a metallic cabinet with a glass display, one physical-style selection button per
product, a coin insertion system, a digital balance display, a dispensing animation, a collection
tray, change/refund handling, stock management and a protected admin dashboard.

> This is a **software simulation**. It never accepts real coins, notes or card payments — every
> "coin" is a virtual value you click.

---

## 1. Features

**Customer machine**
- Metallic cabinet UI with glass display, LED strip, coin slot, keypad, dispensing flap and tray
- 12 sample drinks (colas, juices, water, energy drinks) in an A/B/C grid with local SVG artwork
- A dedicated selection button for every product (`A1` … `C4`) plus a keypad and keyboard input
- Virtual coin insertion for ₹1, ₹2, ₹5, ₹10, ₹20 and ₹50 with coin-flight animation & sound
- Digital `INSERTED AMOUNT` display, status/instruction screen and live `CHANGE DUE`
- Server-side validation of price, stock and balance before anything is dispensed
- Dispensing animation: processing → flap opens → product flies into the tray
- Change calculation with ₹50/₹20/₹10/₹5/₹2/₹1 breakdown, `RETURN COINS / CANCEL` refund and
  `COLLECT & FINISH` to end the transaction
- Multiple products can be bought in one transaction (balance stays on the server)
- Sound effects (coin, click, dispense, success, refund, error) with a mute toggle
- Fully responsive (desktop / tablet / mobile) and `prefers-reduced-motion` aware

**Admin dashboard** (`/admin`)
- Login with hashed passwords (scrypt) + signed, expiring bearer tokens (HMAC-SHA256)
- Add / edit / delete products: code, name, price, stock, low-stock threshold, availability
- Per-product image upload (stored as a local file) or path/URL
- Live low-stock and sold-out indicators
- Sales, revenue, units sold, stock and refund statistics + top sellers
- Full transaction history (id, datetime, product, price, inserted, change, status)
- Password change form; login rate-limiting

---

## 2. Technology stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | HTML5, CSS3, modern JavaScript (ES modules) — no build step |
| Backend   | Node.js 20+ and Express.js |
| Database  | SQLite via Node's built-in `node:sqlite` (default, zero setup) **or** PostgreSQL / Supabase via `pg` |
| Auth      | scrypt password hashing + HMAC-signed tokens (`node:crypto`) |
| Sounds    | Web Audio API (synthesised, no audio files) |
| Images    | Generated local SVG illustrations (`npm run seed-images`) |

---

## 3. Project structure

```
Smart Vending Machine Store/
├─ package.json
├─ README.md
├─ .env / .env.example           # configuration (database URL, admin login, …)
├─ data/
│  └─ vending.db                 # SQLite database (created on first run)
├─ supabase/
│  └─ schema.sql                 # optional: run in the Supabase SQL editor
├─ scripts/
│  ├─ generate-images.js         # creates local product SVG artwork
│  ├─ reset-db.js                # deletes/resets the database (fresh start)
│  ├─ validate-frontend.js       # static frontend checks
│  └─ test-pg.js                 # runs the API suite against PostgreSQL
├─ server/
│  ├─ index.js                   # Express app + startup
│  ├─ db.js                      # data layer: schema, seed, atomic purchase
│  ├─ pg.js                      # PostgreSQL (Supabase) driver
│  ├─ sqlDialect.js              # SQLite/PostgreSQL SQL differences
│  ├─ http.js                    # async route wrapper (Express 4)
│  ├─ loadEnv.js                 # minimal .env loader
│  ├─ money.js                   # paise helpers + change breakdown
│  ├─ auth.js                    # password hashing + signed tokens
│  ├─ sessions.js                # server-side balance / tray sessions
│  └─ routes/
│     ├─ machine.js              # customer API
│     └─ admin.js                # protected admin API
├─ public/
│  ├─ index.html                  # the vending machine UI
│  ├─ css/machine.css
│  ├─ js/
│  │  ├─ app.js                   # main controller
│  │  ├─ api.js                   # fetch wrapper + money formatting
│  │  ├─ sounds.js                # Web Audio sound effects
│  │  ├─ dispenser.js             # dispensing + refund animations
│  │  ├─ toast.js
│  │  └─ components/              # reusable UI components
│  │     ├─ productGrid.js
│  │     ├─ coinPad.js
│  │     ├─ keypad.js
│  │     ├─ display.js
│  │     └─ tray.js
│  ├─ admin/
│  │  ├─ index.html               # admin dashboard
│  │  ├─ admin.css
│  │  └─ admin.js
│  └─ img/
│     ├─ products/*.svg           # 12 product images
│     └─ favicon.svg
└─ tests/
   └─ api.test.js                 # end-to-end test suite (12 sections)
```

---

## 4. Requirements

- **Node.js 20 or newer** (checked on v24; the SQLite backend uses the built-in `node:sqlite` module)
- npm 9+
- Windows / macOS / Linux — no compiler or MongoDB required
- PostgreSQL is **optional**: only needed if you set `DATABASE_URL` (e.g. Supabase)

Check your versions:

```powershell
node -v
npm -v
```

---

## 5. Installation

```powershell
cd "C:\Users\aksha\OneDrive\Desktop\Smart Vending Machine Store"
npm install
```

Dependencies: `express` (web server) and `pg` (PostgreSQL driver — only used when `DATABASE_URL`
is set). `playwright-core` and the PGlite packages are dev-only, used by the test suites.

---

## 6. Environment variables (all optional)

Configuration lives in the **`.env` file in the project root** (it is loaded automatically — no
dotenv dependency). Copy `.env.example` if you ever delete it. Real environment variables always
override the file.

| Variable             | Default                | Purpose                                             |
|----------------------|------------------------|-----------------------------------------------------|
| `PORT`               | `3000`                 | HTTP port                                           |
| `DATABASE_URL`       | *(unset)*              | **PostgreSQL / Supabase connection string.** When set, it replaces SQLite entirely. |
| `SUPABASE_DB_URL`    | *(unset)*              | Optional alias, used only when `DATABASE_URL` is unset |
| `DB_PATH`            | `./data/vending.db`    | SQLite database file (ignored when `DATABASE_URL` is set) |
| `DB_SSL`             | auto                   | `true` / `false` / `no-verify` — override TLS (auto: SSL for remote hosts, plain for localhost) |
| `DB_POOL_MAX`        | `10`                   | PostgreSQL connection pool size                     |
| `ADMIN_USERNAME`     | `admin`                | Admin login name (created on first run)             |
| `ADMIN_PASSWORD`     | `admin123`             | Admin password — **while this line is set in `.env` it is the source of truth and is re-applied on every start** |
| `SESSION_SECRET`     | random per process     | Secret used to sign admin tokens                    |
| `SESSION_TTL_MS`     | `3600000` (1 h)        | Customer session lifetime                           |
| `ADMIN_TOKEN_TTL_MS` | `28800000` (8 h)       | Admin token lifetime                                |
| `DISPENSE_LOCK_MS`   | `1200`                 | Time the machine refuses duplicate clicks           |

Backend selection is automatic and follows this order:

1. an explicit `dbPath` passed to `createApp()` (the test suite does this),
2. `DB_PATH` → **SQLite**,
3. `DATABASE_URL` / `SUPABASE_DB_URL` → **PostgreSQL**,
4. otherwise `./data/vending.db` → **SQLite**.

### Changing the admin login

```ini
# .env  →  then restart the server (Ctrl + C  →  npm start)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=MyNewSecret123!
```

- A **new `ADMIN_USERNAME`** creates an additional account (the old one stays).
- Setting **`ADMIN_PASSWORD`** updates that account's stored password on every start.
- **Prefer the dashboard?** Leave both lines commented out and change the password under
  **Admin → Settings → Change admin password** instead.
- Never commit the real `.env` file — it is listed in `.gitignore` (`.env.example` is the template).

Example (temporary PowerShell session instead of the file):

```powershell
$env:PORT = "8080"
$env:ADMIN_PASSWORD = "ChangeMe123!"
$env:SESSION_SECRET = "replace-with-a-long-random-string"
npm start
```

To make them permanent for your user:

```powershell
setx PORT "8080"
setx ADMIN_PASSWORD "ChangeMe123!"
```

---

## 7. Database setup

### 7.1 SQLite (default — nothing to install)

SQLite is built into Node 20+. On the first start the app will

1. create `data/vending.db` (plus WAL files),
2. create the `products`, `transactions` and `admin_users` tables,
3. seed the 12 sample drinks from `server/db.js`,
4. create the admin user and print the credentials in the console.

Useful commands:

```powershell
npm run seed-images   # regenerate the local product SVG images
npm run reset-db      # delete the database → next start re-seeds everything
```

### 7.2 PostgreSQL / Supabase

Point the app at Supabase by setting **one** variable in `.env`:

```ini
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Where to find it:** Supabase dashboard → **Project Settings → Database** → *Connection string*
→ *URI*. Use port **6543** for the pooler (recommended) or **5432** for the direct connection.

Then start the app:

```powershell
npm start
```

On startup the app connects, verifies the connection (failing fast with a clear message if the
URL is wrong), and creates the schema and the 12-product catalogue automatically — every DDL
statement is `IF NOT EXISTS` and the seed only runs while the `products` table is empty, so an
existing database is never touched. The startup banner shows which backend is live:

```
  • Database:  PostgreSQL – postgresql://postgres.****@aws-0-….pooler.supabase.com:6543/postgres
```

You can also provision the database yourself by running [`supabase/schema.sql`](supabase/schema.sql)
in the Supabase SQL editor (SQL Editor → New query → paste → Run). It is the same DDL plus the
seed, wrapped in a transaction, and is safe to re-run.

Notes for Supabase specifically:

- **SSL** is enabled automatically for remote hosts. Supabase's certificate chain is not always
  verifiable from Node, so the app connects with `rejectUnauthorized: false`. Force a different
  behaviour with `DB_SSL=true | false | no-verify`.
- The free tier allows ~60 simultaneous connections; the pool defaults to `DB_POOL_MAX=10`.
- Passwords containing `@`, `:` or `/` must be URL-encoded in the connection string.

Switching back is just as easy — comment `DATABASE_URL` out and the app returns to the local
SQLite file (your Supabase data stays untouched).

```powershell
npm run reset-db      # when DATABASE_URL is set: drops and recreates the three tables
```

### 7.3 Checking the data

Four ways to look at what is actually stored — pick whichever suits you:

**1. The admin dashboard (easiest, works on both backends)** — open
<http://localhost:3000/admin>, log in with `admin` / `admin123`, then use the **Products**,
**Sales** and **History** tabs. This reads the same database the machine writes to.

**2. The inspector script (terminal, both backends)** — prints exactly what is in the database,
and follows `.env` so it shows the same backend the server uses:

```powershell
npm run db:inspect                # summary: products, transactions, admin users
npm run db:inspect -- --products  # just the product table
npm run db:inspect -- --txns      # just the transaction history
npm run db:inspect -- --tail 5    # last 5 transactions
npm run db:inspect -- --admin     # admin accounts (password hashes are never printed)
```

**3. Supabase dashboard (when using Supabase)** — the fastest way to browse a live database:

- **Table Editor** → pick `products`, `transactions` or `admin_users` and browse/edit rows in a
  spreadsheet-like grid.
- **SQL Editor** → run ad-hoc queries, e.g.

```sql
select code, name, price_paise / 100.0 as rupees, stock from products order by code;

select txn_id, created_at, product_name, status
from transactions order by id desc limit 20;

-- revenue and unit sales, straight from the transaction log
select count(*)                         as sales,
       sum(price_paise) / 100.0         as revenue_rupees
from transactions where status = 'completed';
```

**4. Ad-hoc Node (no extra tooling)** — useful on this machine, which has no `psql`:

```powershell
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('data/vending.db',{readOnly:true});console.table(db.prepare('SELECT code,name,price_paise,stock FROM products ORDER BY code').all());"
```

> Reading the SQLite file directly is safe with `readOnly: true`. Don't open it read-write while
> the server is running, and never delete `data/vending.db-wal` / `-shm` by hand — the WAL file
> holds recent writes. `npm run reset-db` handles cleanup correctly.

---

## 8. Running the application

```powershell
npm start        # normal start
npm run dev      # auto-restart on file changes (node --watch)
```

Then open:

- Machine: **http://localhost:3000/**
- Admin dashboard: **http://localhost:3000/admin**
- Health check: **http://localhost:3000/api/health**

Stop the app with `Ctrl + C`.

---

## 9. Using the machine

1. **Insert coins** – click a denomination button (₹1 … ₹50). The LED display shows
   `INSERTED AMOUNT: ₹50` and a coin flies into the slot.
2. **Select your drink** – press the physical button under the product, use the keypad
   (`A1` + `OK`), or type the code on your keyboard.
3. **Watch it dispense** – the cell lights up, the flap opens and the drink drops into the tray.
4. **Change** – the `CHANGE DUE` value is always shown. Press **COLLECT & FINISH** to take your
   products and change (the balance resets), or buy another drink.
5. **Cancel** – **RETURN COINS / CANCEL** refunds the entire unspent balance in virtual
   denominations and records the refund in the transaction history.

---

## 10. API reference

### Machine (session cookie based)

| Method | Endpoint                     | Body                | Description |
|--------|------------------------------|---------------------|-------------|
| GET    | `/api/machine/info`          | –                   | Machine info + accepted denominations |
| GET    | `/api/machine/state`         | –                   | Balance, tray, instructions |
| GET    | `/api/machine/products`      | –                   | Product grid (price/stock/availability) |
| POST   | `/api/machine/insert`        | `{ value }` (paise) | Insert a virtual coin |
| POST   | `/api/machine/purchase`      | `{ code }`          | Validate + dispense (atomic) |
| POST   | `/api/machine/collect`       | `{}`                | Finish: return change, clear tray |
| POST   | `/api/machine/cancel`        | `{}`                | Refund the unspent balance |

### Admin (requires `Authorization: Bearer <token>`)

| Method | Endpoint                                | Description |
|--------|-----------------------------------------|-------------|
| POST   | `/api/admin/login`                      | `{ username, password }` → token |
| GET    | `/api/admin/me`                         | Current admin |
| GET    | `/api/admin/products`                   | Full product list |
| POST   | `/api/admin/products`                   | Add a product |
| PUT    | `/api/admin/products/:id`               | Edit name/price/stock/availability/threshold |
| PUT    | `/api/admin/products/:id/image`         | `{ dataUrl }` upload or `{ image }` path |
| DELETE | `/api/admin/products/:id`               | Delete a product |
| GET    | `/api/admin/stats`                      | Sales, revenue, stock, top sellers |
| GET    | `/api/admin/transactions?limit&offset`  | Transaction history |
| POST   | `/api/admin/password`                   | Change the admin password |

All monetary values are **integer paise** (₹1 = 100 paise) so no floating point rounding can occur.

---

## 11. Testing

```powershell
npm test          # API + purchase-flow suite (80 checks) on SQLite
npm run test:pg   # the SAME 80 checks against PostgreSQL (local PGlite, no Docker needed)
npm run validate  # static frontend validation (syntax, imports, assets, DOM ids)
npm run test:ui   # real-browser UI suite (uses your installed Chrome/Edge)
npm run test:all  # run all three
```

### API suite (`npm test`)

The suite starts the real app on an ephemeral port with its own temporary database and verifies:

1. Buying a ₹20 drink with exactly ₹20
2. Buying a ₹40 drink with ₹50 → ₹10 change returned
3. Trying to buy a ₹125 drink with ₹50 → rejected, nothing deducted
4. Sold-out and operator-disabled products
5. Cancel → full refund recorded in history
6. Several products in one transaction with change at the end
7. Stock only decreasing on successful purchases (+ invalid code handling)
8. Responsive UI static checks (viewport, breakpoints, required files)
9. Prices/stock edited in the admin panel showing up on the machine
10. Six simultaneous button presses → exactly **one** purchase
11. Admin authentication (401 without token, 401 on wrong password)
12. Everything persists across a full application restart
13. The inserted balance is unlimited (no ₹1000 cap) — change and refunds still correct at ₹2000

### PostgreSQL suite (`npm run test:pg`)

Runs **the exact same 80 assertions** against a real PostgreSQL server, so the Supabase code path
is covered by the same tests as SQLite: `?` → `$1..$n` placeholder rewriting, `INSERT … RETURNING
id`, transaction commit/rollback, boolean columns, `to_char(…)` UTC timestamps and bigint
casting.

No Docker or local Postgres install is required — the script boots **PGlite** (PostgreSQL compiled
to WASM) and exposes it over the real wire protocol, so the app talks to it through the same `pg`
driver it would use for Supabase:

```powershell
npm run test:pg              # temporary in-process PostgreSQL
TEST_DB_URL=postgres://… npm run test:pg   # …or point it at any real server
```

Manual test checklist for the browser: desktop + mobile widths, mute toggle, coin sounds,
dispensing animation for every product, cancel/refund, and rapid double clicks on a product button.

### Browser UI suite (`npm run test:ui`)

Drives a real Chromium browser (the Chrome/Edge already installed on your machine — nothing is
downloaded) through the complete flow:

1. the machine renders all 12 products with working images and buttons
2. inserting ₹20 + ₹20 updates `INSERTED AMOUNT: ₹40`
3. pressing **A1** runs the dispensing animation and drops Coca-Cola into the tray
4. **COLLECT & FINISH** empties the tray and shows the thank-you message
5. selecting a ₹125 drink with ₹10 shows “Please insert ₹115 more” and deducts nothing
6. **RETURN COINS / CANCEL** refunds the balance
7. six rapid clicks on one button produce exactly **one** purchase
8. the 390 × 844 mobile layout has no horizontal overflow and keeps every button usable
9. the admin dashboard logs in, lists 12 products, edits a price that reaches the machine,
   shows sales stats and the transaction history
10. zero uncaught JavaScript errors on any page

> `test:ui` exits with code 0 and a note if no Chrome/Edge installation is found, so the suite
> never blocks a machine without a browser.

---

## 12. Error handling & security notes

- Prices, stock and balances are **always validated on the server**; the browser never sends a price.
- Purchases run inside a single database transaction (`BEGIN IMMEDIATE` on SQLite, `BEGIN`/`COMMIT`
  on a dedicated pooled connection for PostgreSQL) with a guarded `UPDATE … WHERE stock > 0`, so
  stock can never go negative and a purchase cannot be doubled — the guarded UPDATE is the single
  authority on availability, even under concurrent requests.
- A short dispense lock (`DISPENSE_LOCK_MS`) rejects duplicate clicks while the animation runs.
- Admin passwords are scrypt-hashed with a per-user salt; tokens are HMAC-signed and expire.
- Login attempts are rate-limited; JSON bodies are size-limited; unknown API routes return JSON 404.
- Sessions expire after inactivity; the balance lives on the server, not in the browser.

---

## 13. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot open the SQLite database` | Make sure the folder is writable and no other instance is using `data/vending.db` (or run `npm run reset-db`). |
| `Cannot connect to PostgreSQL at …` | Check `DATABASE_URL` in `.env` — the password must be URL-encoded, and the pooler port is 6543 (not 5432). The startup message prints the exact reason. |
| `password authentication failed` / `SSL` error | Confirm the connection string comes from **Project Settings → Database → Connection string (URI)**. `DB_SSL=no-verify` relaxes certificate checks. |
| App still uses SQLite after setting `DATABASE_URL` | `DB_PATH` takes precedence over it — comment `DB_PATH` out, or restart the shell so the new `.env` is picked up. |
| `node:sqlite` module error | You are on Node < 20 — upgrade Node.js. |
| Port already in use | `$env:PORT = "4100"` then `npm start`. |
| No sound | Click any button first (browsers unlock audio on a user gesture) and check the 🔊 toggle. |
| Images missing | `npm run seed-images` |
| Fresh start | `npm run reset-db` |

---

## 14. Licence

MIT — free to use, modify and extend for learning or demos.
