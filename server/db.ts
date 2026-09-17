import pg from 'pg';
import { config } from './config/index';
export type DB = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
let pool: pg.Pool | undefined;
let override: (DB & { connect: () => Promise<DB & { release: () => void }> }) | undefined;
export function useTestDatabase(db: typeof override) {
  override = db;
}
export function database() {
  if (override) return override;
  if (!config.databaseUrl) throw new Error('CONFIGURATION_DATABASE');
  if (!pool) {
    const url = new URL(config.databaseUrl);
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    // Do not allow URL parameters to silently override TLS certificate verification.
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].forEach((k) => url.searchParams.delete(k));
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: 3,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 10000,
      ssl: local
        ? false
        : {
            rejectUnauthorized: true,
            ...(config.databaseCa ? { ca: config.databaseCa.replace(/\\n/g, '\n') } : {}),
          },
      options: '-c search_path=okpora,public -c statement_timeout=15000',
    });
  }
  return pool;
}
export const query = (text: string, values: any[] = []) => database().query(text, values);
export async function tx<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await database().connect();
  try {
    await db.query('BEGIN');
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
}
export async function close() {
  await pool?.end();
}
