import mongoose from 'mongoose';
import { validateEnv, env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';

validateEnv();
await connectDatabase();
try {
  const db = mongoose.connection.db;
  console.log('DB NAME:', db.databaseName);

  const cols = await db.listCollections().toArray();
  console.log('COLLECTIONS:', cols.map((c) => `${c.name} (${c.type})`).join(', ') || '(none)');

  for (const { name } of cols) {
    if (name.startsWith('system.')) continue;
    const count = await db.collection(name).countDocuments();
    console.log(`- ${name}: ${count} docs`);
  }

  const admin = await db.collection('users').findOne(
    { email: 'admin@example.com' },
    { projection: { _id: 1, name: 1, email: 1, role: 1, isActive: 1, createdAt: 1 } },
  );
  console.log('ADMIN USER:', JSON.stringify(admin));

  // Which databases exist (needs privileges; may fail on limited roles)?
  try {
    const dbs = await db.admin().listDatabases();
    console.log('DATABASES:', dbs.databases.map((d) => d.name).join(', '));
  } catch (e) {
    console.log('listDatabases not permitted for this user:', e.message);
  }
} finally {
  await disconnectDatabase();
}
