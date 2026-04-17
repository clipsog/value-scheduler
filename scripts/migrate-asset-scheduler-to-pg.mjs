#!/usr/bin/env node
/**
 * Provision `asset_scheduler_state` on TARGET Postgres (new Supabase) and copy rows if available.
 *
 * Priority:
 *   1) SOURCE_STATE_BASE_URL — GET {base}/api/state (e.g. http://127.0.0.1:5190 while Vite + API are running)
 *   2) SOURCE_DATABASE_URL — pg SELECT * FROM asset_scheduler_state (e.g. local Docker on 54331)
 *   3) Else REST from SOURCE_SUPABASE_URL + SOURCE_SUPABASE_ANON_KEY (legacy cloud; table may be missing)
 *
 * Always: create table + columns + seed id on TARGET.
 *
 * Usage (encode each $ in pooler password as %24):
 *   TARGET_DATABASE_URL='postgresql://...' node scripts/migrate-asset-scheduler-to-pg.mjs
 *
 * Optional:
 *   SOURCE_STATE_BASE_URL='http://127.0.0.1:5190'
 *   SOURCE_DATABASE_URL='postgresql://assets:assets_dev@127.0.0.1:54331/value_scheduler'
 *
 * Loads `.env` from the project root when present (same as the API server).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const TARGET = process.env.TARGET_DATABASE_URL?.trim();
const SOURCE_STATE_BASE = process.env.SOURCE_STATE_BASE_URL?.trim();
const SOURCE_PG = process.env.SOURCE_DATABASE_URL?.trim();
const SOURCE_REST =
  process.env.SOURCE_SUPABASE_URL || 'https://coverhakfcoehzcqnadu.supabase.co';
const SOURCE_ANON =
  process.env.SOURCE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdmVyaGFrZmNvZWh6Y3FuYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTE1MzcsImV4cCI6MjA5MDYyNzUzN30.Uy_E-MQi3nJ4jteh6LHx6n8nt04srAdW-ouMjy-ErOU';

const ROW_ID = process.env.ASSET_SCHEDULER_ROW_ID || 'asset-scheduler-main';

function looksLikePlaceholderUri(s) {
  if (!s) return true;
  // Doc examples use "@...pooler..." or "://..." — real Supabase URIs do not.
  if (/@\.\.\.|:\/\/\.\.\./.test(s)) return true;
  if (/YOUR_PROJECT|ENCODED_PASSWORD|password_here/i.test(s)) return true;
  return false;
}

/** Quick sanity check before pg parses the string (same rules as node-postgres connection-string). */
function assertTargetUriParsable(s) {
  if (!s) {
    console.error('Missing TARGET_DATABASE_URL.');
    process.exit(1);
  }
  if (looksLikePlaceholderUri(s)) {
    console.error(
      'TARGET_DATABASE_URL looks like a documentation placeholder (e.g. ...pooler...).\n' +
        'Copy the real "Transaction pooler" URI from Supabase → Project Settings → Database → Connect.\n' +
        'In the shell wrap the whole URI in single quotes: export TARGET_DATABASE_URL=\'<paste here>\'',
    );
    process.exit(1);
  }
  try {
    const asHttp = s.replace(/^postgres(ql)?:/i, 'http:');
    new URL(asHttp);
  } catch {
    console.error(
      'TARGET_DATABASE_URL is not a valid connection URI (could not parse as URL).\n' +
        'Fixes that usually work:\n' +
        '  • Paste the full URI from Supabase Connect (Transaction pooler), not a shortened example.\n' +
        '  • Percent-encode characters in the password: $ → %24, @ → %40, : → %3A, / → %2F\n' +
        '  • Wrap the whole value in single quotes in zsh/bash; no smart quotes or line breaks.\n',
    );
    process.exit(1);
  }
}

if (!TARGET) {
  console.error(
    'Missing TARGET_DATABASE_URL.\nEncode each $ in the DB password as %24 in the URI.',
  );
  process.exit(1);
}

assertTargetUriParsable(TARGET);

const targetPool = new pg.Pool({
  connectionString: TARGET,
  ssl: { rejectUnauthorized: false },
});

async function applyInitSqlFiles() {
  const dir = path.join(root, 'db', 'init');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log('Applying', f);
    await targetPool.query(sql);
  }
}

/** Same shape as server/index.mjs ensureSchema (covers DBs created before clothing existed). */
async function ensureApiSchema() {
  await targetPool.query(`
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
  await targetPool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS places jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  await targetPool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS clothing jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
  await targetPool.query(`
    ALTER TABLE asset_scheduler_state
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  `);
  await targetPool.query(
    `INSERT INTO asset_scheduler_state (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [ROW_ID],
  );
}

/** Live dev stack: Vite (5190) proxies /api → API (8788) reading local Postgres. */
async function fetchSourceRowsFromDevApi() {
  const base = String(SOURCE_STATE_BASE || '').replace(/\/$/, '');
  const res = await fetch(`${base}/api/state`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET ${base}/api/state → ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = await res.json();
  if (!data.state) {
    console.warn('[migrate] Local API returned state: null (empty DB row).');
    return [];
  }
  const row = {
    id: ROW_ID,
    events: data.state.events,
    subscriptions: data.state.subscriptions,
    assets: data.state.assets,
    contacts: data.state.contacts,
    places: data.state.places ?? [],
    clothing: data.state.clothing ?? [],
    updated_at: data.updated_at || new Date().toISOString(),
  };
  return [row];
}

async function fetchSourceRowsFromPg() {
  const local =
    SOURCE_PG.includes('127.0.0.1') ||
    SOURCE_PG.includes('localhost') ||
    SOURCE_PG.includes('@host.docker.internal');
  const sourcePool = new pg.Pool({
    connectionString: SOURCE_PG,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  try {
    const { rows } = await sourcePool.query('SELECT * FROM asset_scheduler_state');
    return rows;
  } finally {
    await sourcePool.end();
  }
}

async function fetchSourceRowsFromRest() {
  const url = `${SOURCE_REST.replace(/\/$/, '')}/rest/v1/asset_scheduler_state?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SOURCE_ANON,
      Authorization: `Bearer ${SOURCE_ANON}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Source REST ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function upsertRows(rows) {
  for (const row of rows) {
    const id = String(row.id);
    const events = JSON.stringify(row.events ?? []);
    const subscriptions = JSON.stringify(row.subscriptions ?? []);
    const assets = JSON.stringify(row.assets ?? []);
    const contacts = JSON.stringify(row.contacts ?? []);
    const places = JSON.stringify(row.places ?? []);
    const clothing = JSON.stringify(row.clothing ?? []);
    const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString();

    await targetPool.query(
      `INSERT INTO asset_scheduler_state (id, events, subscriptions, assets, contacts, places, clothing, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         events = EXCLUDED.events,
         subscriptions = EXCLUDED.subscriptions,
         assets = EXCLUDED.assets,
         contacts = EXCLUDED.contacts,
         places = EXCLUDED.places,
         clothing = EXCLUDED.clothing,
         updated_at = EXCLUDED.updated_at`,
      [id, events, subscriptions, assets, contacts, places, clothing, updatedAt],
    );
    console.log('Upserted row:', id);
  }
}

try {
  let rows = [];

  if (SOURCE_STATE_BASE) {
    console.log('Reading source from SOURCE_STATE_BASE_URL /api/state…');
    rows = await fetchSourceRowsFromDevApi();
    console.log('Rows from dev API:', rows.length);
  } else if (SOURCE_PG) {
    console.log('Reading source from SOURCE_DATABASE_URL (Postgres)…');
    rows = await fetchSourceRowsFromPg();
    console.log('Source rows:', rows.length);
  } else {
    try {
      console.log('Trying legacy Supabase REST for asset_scheduler_state…');
      rows = await fetchSourceRowsFromRest();
      console.log('REST rows:', rows.length);
    } catch (e) {
      if (e.status === 404 || String(e.message).includes('PGRST205')) {
        console.warn(
          '[migrate] No asset_scheduler_state in legacy REST (table never created there). ' +
            'Provisioning TARGET only. Set SOURCE_STATE_BASE_URL (e.g. http://127.0.0.1:5190) or SOURCE_DATABASE_URL.',
        );
        rows = [];
      } else {
        throw e;
      }
    }
  }

  await applyInitSqlFiles();
  await ensureApiSchema();

  if (rows.length) {
    await upsertRows(rows);
  }

  console.log('Done. New DB is ready. Create Supabase REST policies (see supabase-schema.sql) and point the app at the new project URL + anon key.');
} catch (e) {
  if (e?.code === 'ERR_INVALID_URL') {
    console.error(
      'Connection string parse error (ERR_INVALID_URL). Your TARGET_DATABASE_URL is malformed.\n' +
        'Most common: copied the example with "..." instead of the real host, or an unencoded @ : / in the password.\n' +
        'Use the URI from Supabase Connect and encode special password characters (see script header).',
    );
  }
  console.error(e);
  process.exit(1);
} finally {
  await targetPool.end();
}
