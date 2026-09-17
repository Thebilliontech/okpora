import { readFile } from 'node:fs/promises';
import { query, tx, close } from '../server/db';
export async function migrate() {
  await query('CREATE SCHEMA IF NOT EXISTS okpora');
  await query(
    'CREATE TABLE IF NOT EXISTS okpora.schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await tx(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(98745211)');
    if (!(await db.query("SELECT 1 FROM okpora.schema_migrations WHERE version='001'")).rows.length) {
      await db.query(await readFile(new URL('../database/001_initial.sql', import.meta.url), 'utf8'));
      await db.query("INSERT INTO okpora.schema_migrations(version) VALUES('001')");
    }
  });
}
if (process.argv[1]?.endsWith('migrate.ts')) {
  await migrate();
  console.log('Database migration complete.');
  await close();
}
