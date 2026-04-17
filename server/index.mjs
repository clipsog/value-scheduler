import 'dotenv/config';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

// Render often has no usable IPv6 route; Supabase `db.*.supabase.co` may resolve AAAA first → ENETUNREACH.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

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

function poolerHostnameFromEnv() {
  const raw = process.env.SUPABASE_POOLER_HOST?.trim();
  if (raw) return raw.replace(/^https?:\/\//i, '').split('/')[0];
  const region = process.env.SUPABASE_POOLER_REGION?.trim();
  if (region) return `${region}.pooler.supabase.com`;
  return '';
}

/**
 * Render often cannot use Supabase direct `db.*:5432` (AAAA / no A). Transaction pooler :6543 works.
 * Set SUPABASE_POOLER_HOST (e.g. aws-1-us-west-2.pooler.supabase.com) or SUPABASE_POOLER_REGION (e.g. aws-1-us-west-2).
 */
function applySupabasePoolerRewrite(connectionString) {
  const poolerHost = poolerHostnameFromEnv();
  if (!poolerHost) return connectionString;
  const httpish = connectionString.replace(/^postgres(ql)?:/i, 'http:');
  let u;
  try {
    u = new URL(httpish);
  } catch {
    return connectionString;
  }
  const host = u.hostname;
  const port = u.port || '5432';
  const ref = host.match(/^db\.([^.]+)\.supabase\.co$/i)?.[1];
  if (!ref || port !== '5432') return connectionString;
  const user = (u.username || '').toLowerCase();
  if (user !== 'postgres') return connectionString;
  const nu = new URL('http://127.0.0.1');
  nu.hostname = poolerHost;
  nu.port = '6543';
  nu.username = `postgres.${ref}`;
  nu.password = u.password;
  nu.pathname = u.pathname && u.pathname !== '/' ? u.pathname : '/postgres';
  const out = nu.toString().replace(/^http:/i, 'postgresql:');
  console.log(`[value-scheduler] pooler ${poolerHost}:6543 user=postgres.${ref} (Render / IPv6-safe)`);
  return out;
}

/** Supabase direct `db.*.supabase.co:5432` — try A record / IPv4-only lookup when not using pooler. */
async function resolveSupabaseDirectHostnameToIpv4(connectionString) {
  const httpish = connectionString.replace(/^postgres(ql)?:/i, 'http:');
  let u;
  try {
    u = new URL(httpish);
  } catch {
    return connectionString;
  }
  const host = u.hostname;
  const port = u.port || '5432';
  if (!/^db\.[^.]+\.supabase\.co$/i.test(host) || port !== '5432') {
    return connectionString;
  }
  try {
    const list = await dns.promises.resolve4(host);
    if (list?.length) {
      u.hostname = list[0];
      const out = u.toString().replace(/^http:/i, 'postgresql:');
      console.log(`[value-scheduler] resolved ${host} → ${list[0]} (A record)`);
      return out;
    }
  } catch {
    /* no A records */
  }
  try {
    const all = await dns.promises.lookup(host, { all: true, verbatim: false });
    const v4 = all.find((x) => x.family === 4);
    if (v4) {
      u.hostname = v4.address;
      const out = u.toString().replace(/^http:/i, 'postgresql:');
      console.log(`[value-scheduler] resolved ${host} → ${v4.address} (lookup)`);
      return out;
    }
  } catch {
    /* fall through */
  }
  try {
    const { address } = await dns.promises.lookup(host, { family: 4 });
    u.hostname = address;
    const out = u.toString().replace(/^http:/i, 'postgresql:');
    console.log(`[value-scheduler] resolved ${host} → ${address} (IPv4)`);
    return out;
  } catch (e) {
    console.warn('[value-scheduler] no IPv4 for', host, '- set SUPABASE_POOLER_REGION or SUPABASE_POOLER_HOST:', e?.message ?? e);
    return connectionString;
  }
}

let connectionString;
let dbIsLocal;
let pool;

try {
  connectionString = resolveDatabaseUrl();
  let connStr = applySupabasePoolerRewrite(connectionString);
  if (connStr === connectionString) {
    connStr = await resolveSupabaseDirectHostnameToIpv4(connectionString);
  }
  dbIsLocal =
    connStr.includes('127.0.0.1') ||
    connStr.includes('localhost') ||
    connStr.includes('@host.docker.internal');
  pool = new Pool({
    connectionString: connStr,
    ssl: dbIsLocal ? false : { rejectUnauthorized: false },
  });
  connectionString = connStr;
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

if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'), (err) => (err ? next(err) : undefined));
  });
}

async function boot() {
  await ensureSchema();
  app.listen(PORT, () => {
    const staticHint = fs.existsSync(path.join(distDir, 'index.html')) ? ' + static dist' : '';
    console.log(
      `value-scheduler http://127.0.0.1:${PORT}${staticHint}  db=${connectionString.replace(/:[^:@]+@/, ':****@')}`,
    );
  });
}

boot().catch((err) => {
  if (err?.code === 'ERR_INVALID_URL') {
    console.error(
      'API boot failed: DATABASE_URL cannot be parsed by the Postgres client. Re-paste from Supabase (Transaction pooler); encode $ @ : / in the password; no brackets or placeholders.',
    );
  } else if (err?.code === 'ENETUNREACH' || err?.errno === -101) {
    console.error(
      'API boot failed: Postgres unreachable (often Supabase direct db host = IPv6 only on Render). Set SUPABASE_POOLER_REGION=aws-1-us-west-2 (from Supabase → Connect → pooler host, without .pooler.supabase.com) or SUPABASE_POOLER_HOST=aws-1-us-west-2.pooler.supabase.com — keep DATABASE_URL as the direct db URI; the server rewrites to pooler.',
    );
    console.error(err);
  } else {
    console.error(
      'API boot failed:',
      dbIsLocal ? 'is Postgres up on 54331? (npm run db:up)' : 'check DATABASE_URL, Supabase network access, and credentials.',
      err,
    );
  }
  process.exit(1);
});
