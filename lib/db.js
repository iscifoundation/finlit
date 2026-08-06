// Database abstraction — selects Postgres (via /lib/pgdb.js) or MongoDB.
// When DB_ENGINE=postgres, we return a Mongo-compatible shim over Supabase Postgres.
// Otherwise fall back to the original MongoDB driver.

import { MongoClient } from 'mongodb';
import { getPgDb } from './pgdb.js';

let clientPromise;

export function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGO_URL);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb() {
  if (String(process.env.DB_ENGINE || '').toLowerCase() === 'postgres') {
    return getPgDb();
  }
  const client = await getClient();
  return client.db(process.env.DB_NAME && process.env.DB_NAME !== 'your_database_name' ? process.env.DB_NAME : 'finlit360');
}
