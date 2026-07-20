import { MongoClient } from 'mongodb';

let clientPromise;

export function getClient() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGO_URL);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.DB_NAME && process.env.DB_NAME !== 'your_database_name' ? process.env.DB_NAME : 'finlit360');
}
