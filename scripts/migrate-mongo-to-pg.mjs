#!/usr/bin/env node
/**
 * One-time data migration: MongoDB (finlit360) -> Supabase Postgres (JSONB shim).
 *
 * Behaviour:
 *   - Reads every doc from each Mongo collection listed in COLLECTIONS.
 *   - Strips `_id`, uses `id` (uuid) as the Postgres primary key.
 *   - Writes rows into the matching Postgres table with `(id, doc JSONB)`.
 *   - Uses ON CONFLICT (id) DO UPDATE so the script is IDEMPOTENT — safe to re-run.
 *   - Ensures target tables exist first (delegates to pgdb.js's ensureSchema).
 *   - Prints per-collection counts and final totals.
 *
 * Env required:
 *   MONGO_URL      (source)   e.g. mongodb://.../finlit360
 *   DB_NAME        (optional) default: finlit360
 *   POSTGRES_URL   (target)   Supabase session-pooler URL (port 5432)
 *
 * Usage (from /app):
 *   node scripts/migrate-mongo-to-pg.mjs
 *
 * Safety:
 *   - The primary admin (username=Admin) auto-created by the seed on the Postgres side
 *     will be OVERWRITTEN if a Mongo user has the same `id` — otherwise both records
 *     co-exist. To avoid duplicate admins, ensure only ONE `users` row has role=admin
 *     after the migration finishes.
 *   - Sessions and magic_links are usually short-lived; you can skip them if you like
 *     by removing them from COLLECTIONS.
 */

import { MongoClient } from 'mongodb';
import pg from 'pg';
import { readFileSync } from 'fs';

// Minimal .env loader (no external dep)
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch (e) { /* .env optional */ }

const COLLECTIONS = [
  'users', 'sessions', 'magic_links', 'otp_sessions',
  'banks', 'regional_offices', 'districts', 'branches', 'villages',
  'teams', 'programs', 'invoices',
  'expenses', 'attendance', 'salary_payments',
  'messages', 'notifications', 'audit_logs', 'settings',
];

function log(...args) { console.log('[migrate]', ...args); }
function err(...args) { console.error('[migrate][error]', ...args); }

async function main() {
  if (!process.env.MONGO_URL)    throw new Error('MONGO_URL is not set');
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is not set');

  const mongoUrl = process.env.MONGO_URL;
  const dbName   = (process.env.DB_NAME && process.env.DB_NAME !== 'your_database_name') ? process.env.DB_NAME : 'finlit360';

  log('Source Mongo:', mongoUrl.replace(/\/\/[^@]+@/, '//***@'));
  log('Source DB   :', dbName);
  log('Target PG   :', process.env.POSTGRES_URL.replace(/:[^@]*@/, ':***@'));

  const mongo = new MongoClient(mongoUrl);
  await mongo.connect();
  const mdb = mongo.db(dbName);

  const pool = new pg.Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  // Sanity ping
  await pool.query('SELECT 1');
  log('Postgres connection OK.');

  // Ensure schema (idempotent)
  for (const name of COLLECTIONS) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${name}" (
        id TEXT PRIMARY KEY,
        doc JSONB NOT NULL
      )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "${name}_doc_gin" ON "${name}" USING GIN (doc jsonb_path_ops)`);
  }
  log('Schema ready for', COLLECTIONS.length, 'collections.');

  const summary = {};
  let grandTotal = 0;

  for (const name of COLLECTIONS) {
    const srcCount = await mdb.collection(name).estimatedDocumentCount();
    if (srcCount === 0) { summary[name] = { source: 0, migrated: 0, skipped: 0 }; continue; }
    log(`→ ${name}: ${srcCount} docs to process...`);
    const cursor = mdb.collection(name).find({});
    let migrated = 0, skipped = 0;
    for await (const raw of cursor) {
      // Strip Mongo's internal _id and derive a stable primary key.
      const { _id, ...doc } = raw;
      // Preferred key: explicit `id`. Fallback to natural keys used by some collections.
      let pk = doc.id || doc.token || doc.key;
      if (!pk) {
        // Last resort: use Mongo's _id string so the migration is deterministic on rerun
        pk = _id ? String(_id) : null;
      }
      if (!pk) { skipped++; continue; }
      // Ensure the doc carries an `id` for the shim's semantics
      if (!doc.id) doc.id = String(pk);
      try {
        await pool.query(
          `INSERT INTO "${name}" (id, doc) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc`,
          [String(doc.id), JSON.stringify(doc)]
        );
        migrated++;
      } catch (e) {
        err(`insert failed for ${name}/${doc.id}:`, e.message);
        skipped++;
      }
    }
    const dstCount = (await pool.query(`SELECT COUNT(*)::int AS c FROM "${name}"`)).rows[0].c;
    summary[name] = { source: srcCount, migrated, skipped, target: dstCount };
    grandTotal += migrated;
    log(`   ${name}: migrated ${migrated}, skipped ${skipped}, target has ${dstCount} rows`);
  }

  log('---- SUMMARY ----');
  console.table(summary);
  log(`Grand total inserted/updated: ${grandTotal}`);

  await mongo.close();
  await pool.end();
  log('Done.');
}

main().catch(e => {
  err(e.stack || e.message);
  process.exit(1);
});
