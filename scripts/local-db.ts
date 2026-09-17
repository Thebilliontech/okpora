import { PGlite } from '@electric-sql/pglite';
import { useTestDatabase } from '../server/db';
export async function localDatabase(directory?: string) {
  const db = new PGlite(directory);
  await db.waitReady;
  await db.exec('SET search_path TO okpora, public');
  let tail = Promise.resolve();
  const run = async (text: string, values?: any[]) => {
    if (!values?.length && text.includes(';')) {
      const results = await db.exec(text);
      const last = results[results.length - 1];
      return { rows: last?.rows || [], rowCount: last?.affectedRows || 0 };
    }
    const r = await db.query(text, values);
    return { rows: r.rows as any[], rowCount: r.affectedRows };
  };
  const acquire = async () => {
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    const previous = tail;
    tail = next;
    await previous;
    return release;
  };
  useTestDatabase({
    query: async (text, values) => {
      const release = await acquire();
      try {
        return await run(text, values);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await acquire();
      return { query: run, release };
    },
  });
  return db;
}
