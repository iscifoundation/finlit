// Postgres shim providing a MongoDB-compatible `db.collection(name).*` API.
// Every collection is a table with (id TEXT PRIMARY KEY, doc JSONB NOT NULL).
// This lets the existing route.js code work unchanged against Supabase Postgres.

import pg from 'pg';

const KNOWN_COLLECTIONS = [
  'users', 'sessions', 'magic_links', 'otp_sessions',
  'banks', 'regional_offices', 'districts', 'branches', 'villages',
  'teams', 'programs', 'invoices',
  'expenses', 'attendance', 'salary_payments',
  'messages', 'notifications', 'audit_logs', 'settings',
];

let poolPromise = null;
let schemaReadyPromise = null;

function getPool() {
  if (poolPromise) return poolPromise;
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL not set');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
  });
  poolPromise = Promise.resolve(pool);
  return poolPromise;
}

async function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    const pool = await getPool();
    for (const name of KNOWN_COLLECTIONS) {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS "${name}" (
          id TEXT PRIMARY KEY,
          doc JSONB NOT NULL
        )`
      );
      // JSONB GIN index for query speed (covers arbitrary key lookups).
      await pool.query(
        `CREATE INDEX IF NOT EXISTS "${name}_doc_gin" ON "${name}" USING GIN (doc jsonb_path_ops)`
      );
    }
  })();
  return schemaReadyPromise;
}

// ---------- Filter translation ----------
// Convert a Mongo-style filter object to a WHERE clause + params.
function buildWhere(filter, params) {
  if (!filter || Object.keys(filter).length === 0) return { sql: '', params };
  const clauses = [];
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or') {
      const inner = val.map(sub => {
        const b = buildWhere(sub, params);
        return b.sql ? `(${b.sql.replace(/^ WHERE /, '')})` : 'TRUE';
      });
      clauses.push(`(${inner.join(' OR ')})`);
      continue;
    }
    if (key === '$and') {
      const inner = val.map(sub => {
        const b = buildWhere(sub, params);
        return b.sql ? `(${b.sql.replace(/^ WHERE /, '')})` : 'TRUE';
      });
      clauses.push(`(${inner.join(' AND ')})`);
      continue;
    }
    // Path (may contain dots for nested)
    const path = key.split('.');
    const jsonPath = pathToJsonb(path);
    const jsonPathText = pathToJsonbText(path);

    if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).some(k => k.startsWith('$'))) {
      // Operator object
      for (const [op, v] of Object.entries(val)) {
        if (op === '$eq')      { params.push(v); clauses.push(`${jsonPath} = to_jsonb($${params.length}::jsonb)`); }
        else if (op === '$ne') { params.push(v); clauses.push(`(${jsonPath} IS DISTINCT FROM to_jsonb($${params.length}::jsonb))`); }
        else if (op === '$in') {
          if (!Array.isArray(v) || v.length === 0) { clauses.push('FALSE'); continue; }
          const placeholders = v.map(x => { params.push(String(x)); return `$${params.length}`; });
          clauses.push(`${jsonPathText} IN (${placeholders.join(',')})`);
        }
        else if (op === '$nin') {
          if (!Array.isArray(v) || v.length === 0) { clauses.push('TRUE'); continue; }
          const placeholders = v.map(x => { params.push(String(x)); return `$${params.length}`; });
          clauses.push(`(${jsonPathText} NOT IN (${placeholders.join(',')}) OR ${jsonPathText} IS NULL)`);
        }
        else if (op === '$gte') { params.push(coerceComparable(v)); clauses.push(`${jsonPathText} >= $${params.length}`); }
        else if (op === '$lte') { params.push(coerceComparable(v)); clauses.push(`${jsonPathText} <= $${params.length}`); }
        else if (op === '$gt')  { params.push(coerceComparable(v)); clauses.push(`${jsonPathText} > $${params.length}`); }
        else if (op === '$lt')  { params.push(coerceComparable(v)); clauses.push(`${jsonPathText} < $${params.length}`); }
        else if (op === '$exists') {
          clauses.push(v ? `${jsonPath} IS NOT NULL` : `${jsonPath} IS NULL`);
        }
        else if (op === '$type' && v === 'string') { clauses.push(`jsonb_typeof(${jsonPath}) = 'string'`); }
        else {
          console.warn('[db] Unsupported operator:', op);
        }
      }
    } else if (val instanceof RegExp) {
      params.push(val.source);
      const flag = val.flags.includes('i') ? '~*' : '~';
      clauses.push(`${jsonPathText} ${flag} $${params.length}`);
    } else if (val === null) {
      clauses.push(`(${jsonPath} IS NULL OR jsonb_typeof(${jsonPath}) = 'null')`);
    } else {
      // Direct scalar equality — use text compare so numbers/booleans/strings work naturally.
      params.push(String(val));
      clauses.push(`${jsonPathText} = $${params.length}`);
    }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

function pathToJsonb(path) {
  // doc -> 'a' -> 'b' -> 'c' (returns jsonb)
  let s = 'doc';
  for (const p of path) s += `->'${p.replace(/'/g, "''")}'`;
  return s;
}
function pathToJsonbText(path) {
  // doc -> 'a' -> 'b' ->> 'c' (returns text)
  if (path.length === 0) return 'doc::text';
  let s = 'doc';
  for (let i = 0; i < path.length - 1; i++) s += `->'${path[i].replace(/'/g, "''")}'`;
  s += `->>'${path[path.length - 1].replace(/'/g, "''")}'`;
  return s;
}
function coerceComparable(v) {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : String(v);
}

// ---------- Update translation ----------
// Build a SQL expression that transforms current `doc` into a new JSONB value using Mongo-style update ops.
function buildUpdateExpr(update, params) {
  let expr = 'doc';
  const applyOp = (op, ops) => {
    for (const [key, val] of Object.entries(ops)) {
      const path = '{' + key.split('.').map(s => s.replace(/,/g, '\\,')).join(',') + '}';
      if (op === '$set') {
        params.push(JSON.stringify(val ?? null));
        expr = `jsonb_set(${expr}, '${path}', $${params.length}::jsonb, true)`;
      } else if (op === '$unset') {
        // Remove the key: doc - 'key' works only for top level.
        // For deep: use jsonb #- '{path}' operator (Postgres supports)
        expr = `(${expr} #- '${path}')`;
      } else if (op === '$inc') {
        // Add numeric increment. Handles missing key as 0.
        params.push(Number(val) || 0);
        expr = `jsonb_set(${expr}, '${path}', to_jsonb(COALESCE((${expr} #>> '${path}')::numeric, 0) + $${params.length}::numeric), true)`;
      } else if (op === '$push') {
        // { $push: { arr: elem } }  OR  { $push: { arr: { $each: [...] } } }
        let toPush;
        if (val && typeof val === 'object' && Array.isArray(val.$each)) toPush = val.$each;
        else toPush = [val];
        params.push(JSON.stringify(toPush));
        expr = `jsonb_set(${expr}, '${path}', COALESCE((${expr} #> '${path}')::jsonb, '[]'::jsonb) || $${params.length}::jsonb, true)`;
      } else if (op === '$pull') {
        // { $pull: { arr: matcher } }
        // matcher can be a scalar or an object with equality fields to match array elements.
        params.push(JSON.stringify(val));
        expr = `jsonb_set(${expr}, '${path}',
          COALESCE((
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(COALESCE((${expr} #> '${path}')::jsonb, '[]'::jsonb)) elem
            WHERE NOT (elem @> $${params.length}::jsonb)
          ), '[]'::jsonb),
          true)`;
      } else {
        console.warn('[db] Unsupported update op:', op);
      }
    }
  };
  const hasOperators = Object.keys(update).some(k => k.startsWith('$'));
  if (hasOperators) {
    for (const [op, ops] of Object.entries(update)) applyOp(op, ops);
  } else {
    // Whole-document replacement
    params.push(JSON.stringify(update));
    expr = `$${params.length}::jsonb`;
  }
  return expr;
}

// ---------- Collection wrapper ----------
class Collection {
  constructor(name) { this.name = name; }
  _table() { return `"${this.name.replace(/[^a-zA-Z0-9_]/g, '')}"`; }

  async _q(sql, params) {
    await ensureSchema();
    const pool = await getPool();
    return pool.query(sql, params);
  }

  async findOne(filter = {}, projection = null) {
    const cursor = this.find(filter, projection).limit(1);
    const rows = await cursor.toArray();
    return rows[0] || null;
  }

  find(filter = {}, projection = null) {
    // Chainable cursor
    const self = this;
    const state = { sort: null, limit: null, skip: null };
    const cursor = {
      sort(spec) { state.sort = spec; return cursor; },
      limit(n)   { state.limit = n; return cursor; },
      skip(n)    { state.skip = n; return cursor; },
      async toArray() {
        const params = [];
        const where = buildWhere(filter, params);
        let sql = `SELECT doc FROM ${self._table()}${where.sql}`;
        if (state.sort) {
          const parts = [];
          for (const [k, dir] of Object.entries(state.sort)) {
            parts.push(`${pathToJsonbText(k.split('.'))} ${dir >= 0 ? 'ASC' : 'DESC'} NULLS LAST`);
          }
          if (parts.length) sql += ' ORDER BY ' + parts.join(', ');
        }
        if (state.limit != null) sql += ` LIMIT ${Number(state.limit) | 0}`;
        if (state.skip  != null) sql += ` OFFSET ${Number(state.skip)  | 0}`;
        const { rows } = await self._q(sql, params);
        return rows.map(r => r.doc);
      },
    };
    return cursor;
  }

  async countDocuments(filter = {}) {
    const params = [];
    const where = buildWhere(filter, params);
    const { rows } = await this._q(`SELECT COUNT(*)::int AS c FROM ${this._table()}${where.sql}`, params);
    return rows[0].c;
  }

  async insertOne(doc) {
    const id = String(doc.id ?? crypto.randomUUID?.() ?? Date.now());
    const full = { ...doc, id };
    await this._q(`INSERT INTO ${this._table()} (id, doc) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc`, [id, JSON.stringify(full)]);
    return { acknowledged: true, insertedId: id };
  }

  async insertMany(docs) {
    for (const d of docs) await this.insertOne(d);
    return { insertedCount: docs.length };
  }

  async updateOne(filter, update, options = {}) {
    // Step 1: locate the target row using ONLY the filter's params
    const whereParams = [];
    const where = buildWhere(filter, whereParams);
    const findSql = `SELECT id FROM ${this._table()}${where.sql} LIMIT 1`;
    const found = await this._q(findSql, whereParams);
    if (found.rows.length === 0) {
      if (options.upsert) {
        const emptyId = String(filter.id ?? crypto.randomUUID?.() ?? Date.now());
        const start = update.$set ? { ...update.$set } : {};
        return this.insertOne({ id: emptyId, ...filter, ...start });
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }
    const targetId = found.rows[0].id;
    // Step 2: build the UPDATE with fresh params, keyed by row id (safe & concurrent-friendly)
    const upParams = [];
    const expr = buildUpdateExpr(update, upParams);
    upParams.push(targetId);
    const idxParam = upParams.length;
    const upSql = `UPDATE ${this._table()} SET doc = ${expr} WHERE id = $${idxParam}`;
    const r = await this._q(upSql, upParams);
    return { matchedCount: 1, modifiedCount: r.rowCount };
  }

  async updateMany(filter, update) {
    const params = [];
    const expr = buildUpdateExpr(update, params);
    const where = buildWhere(filter, params);
    const sql = `UPDATE ${this._table()} SET doc = ${expr}${where.sql}`;
    const r = await this._q(sql, params);
    return { matchedCount: r.rowCount, modifiedCount: r.rowCount };
  }

  async deleteOne(filter) {
    const params = [];
    const where = buildWhere(filter, params);
    const sub = `SELECT id FROM ${this._table()}${where.sql} LIMIT 1`;
    const r = await this._q(`DELETE FROM ${this._table()} WHERE id IN (${sub}) RETURNING id`, params);
    return { deletedCount: r.rowCount };
  }

  async deleteMany(filter) {
    const params = [];
    const where = buildWhere(filter, params);
    const r = await this._q(`DELETE FROM ${this._table()}${where.sql}`, params);
    return { deletedCount: r.rowCount };
  }
}

class Database {
  collection(name) { return new Collection(name); }
}

let dbInstance = null;
export function getPgDb() {
  if (!dbInstance) dbInstance = new Database();
  return dbInstance;
}
