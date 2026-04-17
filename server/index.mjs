import 'dotenv/config';
import express from 'express';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 8788);
const ROW_ID = process.env.ASSET_SCHEDULER_ROW_ID ?? 'asset-scheduler-main';

const ON_RENDER = process.env.RENDER === 'true' || process.env.RENDER === '1';

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  const localDefault = 'postgresql://assets:assets_dev@127.0.0.1:54331/value_scheduler';
  const url = raw || (ON_RENDER ? '' : localDefault);
  if (!url) {
    throw new Error(
      'DATABASE_URL is missing. In Render → Environment, set DATABASE_URL to your Supabase Postgres URI (Database → Connect → Transaction pooler).',
    );
  }
  if (/\[YOUR-|\[PASSWORD\]|YOUR-PASSWORD|password_here/i.test(url)) {
    throw new Error(
      'DATABASE_URL still contains a placeholder (e.g. [YOUR-PASSWORD]). Replace it with your real database password from Supabase → Database settings.',
    );
  }
  try {
    new URL(url.replace(/^postgres(ql)?:/i, 'http:'));
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid connection URI. Paste the full Supabase URI; percent-encode $ → %24 and @ : / in the password if needed; one line, no smart quotes.',
    );
  }
  return url;
}

let connectionString;
let dbIsLocal;
let pool;

try {
  connectionString = resolveDatabaseUrl();
  dbIsLocal =
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('localhost') ||
    connectionString.includes('@host.docker.internal');
  pool = new Pool({
    connectionString,
    ssl: dbIsLocal ? false : { rejectUnauthorized: false },
  });
} catch (e) {
  console.error('[value-scheduler]', e?.message ?? e);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '10mb' }));

/** Create table if missing; add columns older volumes may lack. */
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_scheduler_state (
      id text PRIMARY KEY,
      events jsonb NOT NULL DEFAULT '[]'::jsonb,
      subscriptions jsonb NOT NULL DEFAULT '[]'::jsonb,
      assets jsonb NOT NULL DEFAULT '[]'::jsonb,
      contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
      places jsonb NOT NULL DEFAULT '[]'::jsonb,
      clothing jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS places jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS clothing jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  `);
  await pool.query(
    `INSERT INTO asset_scheduler_state (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [ROW_ID],
  );
}

function asJsonbArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof v === 'object') return [];
  return [];
}

function rowToState(row) {
  return {
    events: asJsonbArray(row.events),
    subscriptions: asJsonbArray(row.subscriptions),
    assets: asJsonbArray(row.assets),
    contacts: asJsonbArray(row.contacts),
    places: asJsonbArray(row.places),
    clothing: asJsonbArray(row.clothing),
  };
}

async function readStateRow() {
  return pool.query(
    'SELECT events, subscriptions, assets, contacts, places, clothing, updated_at FROM asset_scheduler_state WHERE id = $1',
    [ROW_ID],
  );
}

app.get('/api/state', async (_req, res) => {
  try {
    let rows;
    try {
      ;({ rows } = await readStateRow());
    } catch (firstErr) {
      console.error('GET /api/state first attempt failed, repairing schema…', firstErr);
      await ensureSchema();
      ;({ rows } = await readStateRow());
    }
    if (!rows.length) {
      return res.json({ state: null });
    }
    return res.json({ state: rowToState(rows[0]), updated_at: rows[0].updated_at });
  } catch (e) {
    console.error(e);
    return res.status(503).json({
      error: 'db_unavailable',
      detail: String(e?.message ?? e),
      hint: 'Start Postgres (docker compose up / npm run db:up on 54331) and restart: npm run api',
    });
  }
});

app.put('/api/state', async (req, res) => {
  const body = req.body?.state;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'expected { state: { events, subscriptions, assets, contacts } }' });
  }
  const events = Array.isArray(body.events) ? body.events : [];
  const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : [];
  const assets = Array.isArray(body.assets) ? body.assets : [];
  const contacts = Array.isArray(body.contacts) ? body.contacts : [];
  const places = Array.isArray(body.places) ? body.places : [];
  const clothing = Array.isArray(body.clothing) ? body.clothing : [];

  try {
    try {
      await pool.query(
        `INSERT INTO asset_scheduler_state (id, events, subscriptions, assets, contacts, places, clothing, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET
           events = EXCLUDED.events,
           subscriptions = EXCLUDED.subscriptions,
           assets = EXCLUDED.assets,
           contacts = EXCLUDED.contacts,
           places = EXCLUDED.places,
           clothing = EXCLUDED.clothing,
           updated_at = now()`,
        [ROW_ID, JSON.stringify(events), JSON.stringify(subscriptions), JSON.stringify(assets), JSON.stringify(contacts), JSON.stringify(places), JSON.stringify(clothing)],
      );
    } catch (firstErr) {
      console.error('PUT /api/state first attempt failed, repairing schema…', firstErr);
      await ensureSchema();
      await pool.query(
        `INSERT INTO asset_scheduler_state (id, events, subscriptions, assets, contacts, places, clothing, updated_at)
         VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, now())
         ON CONFLICT (id) DO UPDATE SET
           events = EXCLUDED.events,
           subscriptions = EXCLUDED.subscriptions,
           assets = EXCLUDED.assets,
           contacts = EXCLUDED.contacts,
           places = EXCLUDED.places,
           clothing = EXCLUDED.clothing,
           updated_at = now()`,
        [ROW_ID, JSON.stringify(events), JSON.stringify(subscriptions), JSON.stringify(assets), JSON.stringify(contacts), JSON.stringify(places), JSON.stringify(clothing)],
      );
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(503).json({
      error: 'db_write_failed',
      detail: String(e?.message ?? e),
      hint: 'Start Postgres on 54331 and restart: npm run api',
    });
  }
});

async function boot() {
  await ensureSchema();
  app.listen(PORT, () => {
    console.log(`value-scheduler API http://127.0.0.1:${PORT}  db=${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  });
}

boot().catch((err) => {
  if (err?.code === 'ERR_INVALID_URL') {
    console.error(
      'API boot failed: DATABASE_URL cannot be parsed by the Postgres client. Re-paste from Supabase (Transaction pooler); encode $ @ : / in the password; no brackets or placeholders.',
    );
  } else {
    console.error(
      'API boot failed:',
      dbIsLocal ? 'is Postgres up on 54331? (npm run db:up)' : 'check DATABASE_URL, Supabase network access, and credentials.',
      err,
    );
  }
  process.exit(1);
});
